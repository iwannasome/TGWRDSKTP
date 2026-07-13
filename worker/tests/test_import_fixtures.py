import contextlib
import io
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime


WORKER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
if WORKER_DIR not in sys.path:
    sys.path.insert(0, WORKER_DIR)

from tgwr_worker import (  # noqa: E402
    available_report_years,
    build_candidates,
    dedupe_candidates,
    do_build_report,
    _effective_bounded_period_end,
    _moscow_tzinfo,
    _quietest_month_candidates,
    do_import,
    html_looks_like_group_chat,
    recommend_report_year,
    scan_export_dir,
)


class ImportFixtureTests(unittest.TestCase):
    def candidates_for(self, fixture_name):
        export_dir = os.path.join(FIXTURES_DIR, fixture_name)
        json_files, result_files, html_files = scan_export_dir(export_dir)
        candidates, candidate_reasons = build_candidates(export_dir, json_files, result_files, html_files)
        accepted, dedupe_reasons = dedupe_candidates(candidates)
        reasons = dict(candidate_reasons)
        for reason, count in dedupe_reasons.items():
            reasons[reason] = reasons.get(reason, 0) + count
        return accepted, reasons

    def test_split_json_parts_are_one_chat(self):
        accepted, reasons = self.candidates_for("split_json")
        self.assertEqual(len(accepted), 1)
        self.assertEqual(accepted[0].approx_msgs, 2)
        self.assertEqual(len(accepted[0].json_files), 2)
        self.assertEqual(reasons, {})

    def test_result_keeps_distinct_ids_with_same_name(self):
        accepted, reasons = self.candidates_for("result_mixed")
        accepted_ids = {candidate.export_chat_id for candidate in accepted}
        self.assertIn("result:104", accepted_ids)
        self.assertIn("result:105", accepted_ids)
        self.assertEqual(reasons.get("non_personal_chat"), 1)
        self.assertEqual(reasons.get("empty_chat"), 1)
        self.assertEqual(reasons.get("duplicate_by_id"), 1)

    def test_html_group_is_detected_but_personal_chat_is_kept(self):
        group_file = os.path.join(FIXTURES_DIR, "html_group", "messages.html")
        personal_file = os.path.join(FIXTURES_DIR, "html_personal", "messages.html")
        self.assertTrue(html_looks_like_group_chat([group_file]))
        self.assertFalse(html_looks_like_group_chat([personal_file]))

        accepted, reasons = self.candidates_for("html_group")
        self.assertEqual(accepted, [])
        self.assertEqual(reasons.get("html_group_detected"), 1)

    def test_year_recommendation_ignores_tiny_latest_tail(self):
        years = [
            {"year": 2026, "messages": 15},
            {"year": 2025, "messages": 5000},
            {"year": 2024, "messages": 900},
        ]
        self.assertEqual(recommend_report_year(years), 2025)

    def test_current_calendar_window_stops_at_present_but_past_year_stays_complete(self):
        msk = _moscow_tzinfo()
        current_start = int(datetime(2026, 1, 1, tzinfo=msk).timestamp())
        current_end = int(datetime(2027, 1, 1, tzinfo=msk).timestamp())
        current_now = int(datetime(2026, 7, 13, 12, 0, tzinfo=msk).timestamp())
        self.assertEqual(_effective_bounded_period_end(current_start, current_end, current_now), current_now)

        past_start = int(datetime(2025, 1, 1, tzinfo=msk).timestamp())
        past_end = int(datetime(2026, 1, 1, tzinfo=msk).timestamp())
        self.assertEqual(_effective_bounded_period_end(past_start, past_end, current_now), past_end)

        months = [
            {"value": "2026-01", "count": 200},
            {"value": "2026-02", "count": 100},
            {"value": "2026-07", "count": 1},
        ]
        quietest_candidates = _quietest_month_candidates(months, current_start, current_end, current_now)
        self.assertEqual([item["value"] for item in quietest_candidates], ["2026-01", "2026-02"])

    def test_fixture_import_builds_schema_v2_for_requested_year(self):
        export_dir = os.path.join(FIXTURES_DIR, "result_mixed")
        with tempfile.TemporaryDirectory(prefix="tgwr-fixture-") as temp_dir:
            db_path = os.path.join(temp_dir, "tgwr.db")
            import_output = io.StringIO()
            with contextlib.redirect_stdout(import_output):
                do_import(export_dir, "desktop", db_path)

            import_events = [json.loads(line) for line in import_output.getvalue().splitlines() if line.strip()]
            import_done = next(event for event in import_events if event.get("type") == "import_done")
            reason_counts = {item["reason"]: item["count"] for item in import_done.get("skip_reasons", [])}
            self.assertEqual(reason_counts.get("non_personal_chat"), 1)
            self.assertEqual(reason_counts.get("empty_chat"), 1)
            self.assertEqual(reason_counts.get("duplicate_by_id"), 1)
            self.assertEqual(import_done.get("import_quality", {}).get("direction_source"), "export_metadata")
            self.assertEqual(import_done.get("import_quality", {}).get("direction_confidence"), "high")

            conn = sqlite3.connect(db_path)
            try:
                years = available_report_years(conn)
            finally:
                conn.close()
            self.assertEqual([item["year"] for item in years], [2025, 2024])

            with contextlib.redirect_stdout(io.StringIO()):
                do_build_report(db_path, requested_year=2024)
            with open(os.path.join(temp_dir, "report.json"), "r", encoding="utf-8") as report_file:
                report = json.load(report_file)

            self.assertEqual(report.get("schema_version"), 2)
            self.assertEqual(report.get("meta", {}).get("msk_year_used"), 2024)
            self.assertEqual(report.get("meta", {}).get("report_cache_revision"), 2)
            self.assertNotIn("deleted_messages_count", report.get("periods", {}).get("year", {}))

            cache_path_2024 = os.path.join(temp_dir, "report-cache", "v2", "report-2024.json")
            self.assertTrue(os.path.isfile(cache_path_2024))

            os.remove(os.path.join(temp_dir, "report.json"))
            cached_output = io.StringIO()
            with contextlib.redirect_stdout(cached_output):
                do_build_report(db_path, requested_year=2024)
            cached_events = [json.loads(line) for line in cached_output.getvalue().splitlines() if line.strip()]
            cached_done = next(event for event in cached_events if event.get("type") == "report_done")
            self.assertEqual(cached_done.get("source"), "cache")
            self.assertTrue(os.path.isfile(os.path.join(temp_dir, "report.json")))

            with contextlib.redirect_stdout(io.StringIO()):
                do_build_report(db_path, requested_year=2025, cache_only=True)
            cache_path_2025 = os.path.join(temp_dir, "report-cache", "v2", "report-2025.json")
            self.assertTrue(os.path.isfile(cache_path_2025))
            with open(os.path.join(temp_dir, "report.json"), "r", encoding="utf-8") as active_report_file:
                active_report = json.load(active_report_file)
            self.assertEqual(active_report.get("meta", {}).get("msk_year_used"), 2024)


if __name__ == "__main__":
    unittest.main()
