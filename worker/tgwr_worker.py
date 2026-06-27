
import json
import os
import re
import sqlite3
import statistics
import sys
import threading
from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from html import unescape
from html.parser import HTMLParser
from typing import Any, Dict, Iterable, List, Optional, Tuple

VERSION = "0.1.0"

_STDOUT_LOCK = threading.Lock()
_CANCEL_EVENT = threading.Event()
_STATE_LOCK = threading.Lock()
_IMPORT_LOCK = threading.Lock()
_IMPORT_THREAD: Optional[threading.Thread] = None
_IMPORT_BUSY = False

_REPORT_LOCK = threading.Lock()
_REPORT_THREAD: Optional[threading.Thread] = None
_REPORT_BUSY = False


class CancelledError(Exception):
    pass


def write_json(obj: Dict[str, Any]) -> None:
    line = json.dumps(obj, ensure_ascii=False)
    with _STDOUT_LOCK:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def mark_import_idle() -> None:
    global _IMPORT_BUSY
    with _STATE_LOCK:
        _IMPORT_BUSY = False


def mark_report_idle() -> None:
    global _REPORT_BUSY
    with _STATE_LOCK:
        _REPORT_BUSY = False


def progress(stage: str, percent: int, current_chat: str = "", current_file: str = "") -> None:
    p = max(0, min(100, int(percent)))
    write_json(
        {
            "type": "progress",
            "stage": stage,
            "percent": p,
            "current_chat": current_chat,
            "current_file": current_file,
        }
    )


def _moscow_tzinfo() -> Any:
    try:
        from zoneinfo import ZoneInfo  # type: ignore

        return ZoneInfo("Europe/Moscow")
    except Exception:
        return timezone(timedelta(hours=3))


def parse_date_to_unix_seconds(date_value: Any) -> int:
    """
    Telegram JSON export 'date' is ISO string (often without timezone).
    We always interpret naive datetimes as MSK (Europe/Moscow).
    """
    if not isinstance(date_value, str) or not date_value:
        return 0

    s = date_value.strip()
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        # Fallback common formats
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
            try:
                dt = datetime.strptime(s, fmt)
                break
            except Exception:
                dt = None  # type: ignore
        if dt is None:
            return 0

    msk = _moscow_tzinfo()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=msk)
        return int(dt.timestamp())

    try:
        return int(dt.astimezone(msk).timestamp())
    except Exception:
        return int(dt.timestamp())


def parse_message_timestamp(msg: Dict[str, Any]) -> int:
    """
    Prefer Telegram's numeric date_unixtime when present.
    The human-readable date field can be shifted by export locale/timezone quirks.
    """
    du = msg.get("date_unixtime")
    if isinstance(du, int):
        return int(du)
    if isinstance(du, str):
        s = du.strip()
        if s.isdigit():
            try:
                return int(s)
            except Exception:
                pass
    return parse_date_to_unix_seconds(msg.get("date"))


def parse_html_title_datetime_to_unix_seconds(title_value: Optional[str]) -> int:
    """
    Telegram HTML export date usually stored in:
      <div class="pull_right date details" title="15.04.2022 17:12:34 UTC+03:00">...</div>
    We interpret it as MSK (Europe/Moscow) regardless.
    """
    if not title_value:
        return 0
    s = title_value.strip()
    s = re.sub(r"\s*UTC[+-]\d{1,2}:\d{2}\s*$", "", s)
    s = re.sub(r"\s*UTC[+-]\d{1,2}\s*$", "", s)
    s = s.strip()

    msk = _moscow_tzinfo()

    for fmt in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            dt = datetime.strptime(s, fmt)
            dt = dt.replace(tzinfo=msk)
            return int(dt.timestamp())
        except Exception:
            continue

    try:
        dt2 = datetime.fromisoformat(s)
        if dt2.tzinfo is None:
            dt2 = dt2.replace(tzinfo=msk)
        else:
            dt2 = dt2.astimezone(msk)
        return int(dt2.timestamp())
    except Exception:
        return 0


def flatten_text(text_value: Any) -> str:
    if text_value is None:
        return ""
    if isinstance(text_value, str):
        return text_value
    if isinstance(text_value, list):
        parts: List[str] = []
        for item in text_value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                t = item.get("text")
                if isinstance(t, str):
                    parts.append(t)
                elif isinstance(t, list):
                    parts.append(flatten_text(t))
        return "".join(parts)
    if isinstance(text_value, dict):
        t = text_value.get("text")
        if isinstance(t, str):
            return t
        if isinstance(t, list):
            return flatten_text(t)
    return ""


def normalize_from_id(from_id_value: Any) -> Optional[str]:
    if from_id_value is None:
        return None
    if isinstance(from_id_value, bool):
        return None
    if isinstance(from_id_value, int):
        return str(from_id_value)
    if isinstance(from_id_value, float):
        if from_id_value.is_integer():
            return str(int(from_id_value))
        return str(from_id_value)
    if isinstance(from_id_value, str):
        return from_id_value
    return str(from_id_value)


def extract_numeric_id(from_id_text: Optional[str]) -> Optional[int]:
    if not from_id_text:
        return None
    s = from_id_text.strip()
    if s.isdigit():
        try:
            return int(s)
        except Exception:
            return None
    if s.startswith("user") and s[4:].isdigit():
        try:
            return int(s[4:])
        except Exception:
            return None
    if s.startswith("-") and s[1:].isdigit():
        try:
            return int(s)
        except Exception:
            return None
    return None


def is_chat_export_json(obj: Any) -> bool:
    return isinstance(obj, dict) and "name" in obj and "type" in obj and "messages" in obj


def derive_export_chat_id(chat_obj: Dict[str, Any], file_path: str, export_dir: str) -> str:
    cid = chat_obj.get("id")
    if cid is not None:
        return str(cid)

    try:
        rel_dir = os.path.relpath(os.path.dirname(file_path), export_dir)
    except Exception:
        rel_dir = os.path.dirname(file_path)

    if rel_dir in (".", ""):
        try:
            return os.path.relpath(file_path, export_dir)
        except Exception:
            return file_path
    return rel_dir


def ensure_removed(path: str) -> None:
    try:
        os.remove(path)
    except FileNotFoundError:
        return
    except Exception:
        return


def recreate_db(db_path: str) -> sqlite3.Connection:
    parent = os.path.dirname(db_path)
    if parent:
        os.makedirs(parent, exist_ok=True)

    ensure_removed(db_path)
    ensure_removed(db_path + "-wal")
    ensure_removed(db_path + "-shm")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA temp_store=MEMORY;")
    conn.execute("PRAGMA cache_size=-64000;")
    conn.execute("PRAGMA foreign_keys=OFF;")

    conn.execute(
        """
        CREATE TABLE chats (
          chat_pk INTEGER PRIMARY KEY AUTOINCREMENT,
          export_chat_id TEXT,
          name TEXT,
          type TEXT,
          peer_from_id TEXT NULL
        );
        """
    )

    conn.execute(
        """
        CREATE TABLE meta (
          key TEXT PRIMARY KEY,
          value TEXT
        );
        """
    )

    conn.execute(
        """
        CREATE TABLE messages (
          msg_pk INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_pk INTEGER,
          msg_id TEXT,
          date_ts INTEGER,
          from_id TEXT,
          from_name TEXT,
          text TEXT,
          media_type TEXT NULL,
          sticker_emoji TEXT NULL,
          is_out INTEGER DEFAULT 0,
          is_edited INTEGER DEFAULT 0,
          is_service INTEGER DEFAULT 0,
          reply_to_msg_id TEXT NULL
        );
        """
    )

    ensure_messages_unique_index(conn)
    return conn


def create_indexes(conn: sqlite3.Connection) -> None:
    conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_chat_date ON messages(chat_pk, date_ts);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_from_date ON messages(from_id, date_ts);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_chat_out_date ON messages(chat_pk, is_out, date_ts);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_chats_peer ON chats(peer_from_id);")
    ensure_messages_unique_index(conn)

def ensure_messages_unique_index(conn: sqlite3.Connection) -> None:

    try:
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS ux_messages_chat_msg_id
            ON messages(chat_pk, msg_id)
            WHERE msg_id IS NOT NULL AND TRIM(msg_id) != '';
            """
        )
    except Exception:
        # On legacy DBs with duplicates this may fail until cleanup runs.
        pass


def dedupe_existing_messages_by_msg_id(conn: sqlite3.Connection) -> int:

    try:
        cur = conn.execute(
            """
            DELETE FROM messages
            WHERE msg_pk IN (
                SELECT m.msg_pk
                FROM messages m
                WHERE m.msg_id IS NOT NULL
                  AND TRIM(m.msg_id) != ''
                  AND m.msg_pk NOT IN (
                      SELECT MIN(msg_pk)
                      FROM messages
                      WHERE msg_id IS NOT NULL
                        AND TRIM(msg_id) != ''
                      GROUP BY chat_pk, msg_id
                  )
            );
            """
        )
        try:
            return int(cur.rowcount or 0)
        except Exception:
            return 0
    except Exception:
        return 0


MSK_OFFSET_SECONDS = 3 * 60 * 60
BANNED_PEER_IDS = {'user1098898489', 'user6686969898'}
MAX_INFERRED_REPLY_SECONDS = 7 * 24 * 60 * 60
PERSON_ANALYTICS_LIMIT = 50


def banned_peer_ids() -> Tuple[str, ...]:
    return tuple(sorted(BANNED_PEER_IDS))


def sql_placeholders(values: Tuple[Any, ...]) -> str:
    if not values:
        return "NULL"
    return ",".join("?" for _ in values)


def _get_table_columns(conn: sqlite3.Connection, table: str) -> List[str]:
    try:
        rows = conn.execute(f"PRAGMA table_info({table});").fetchall()
        cols: List[str] = []
        for r in rows:
            # PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
            name = None
            try:
                name = r[1]  # works for tuples and sqlite3.Row
            except Exception:
                try:
                    name = r["name"]
                except Exception:
                    name = None
            if isinstance(name, str):
                cols.append(name)
        return cols
    except Exception:
        return []


def ensure_schema(conn: sqlite3.Connection) -> None:
    """Best-effort schema migration for older DBs."""

    # meta table
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS meta (
              key TEXT PRIMARY KEY,
              value TEXT
            );
            """
        )
    except Exception:
        pass

    # chats.peer_from_id
    chat_cols = set(_get_table_columns(conn, "chats"))
    if "peer_from_id" not in chat_cols:
        try:
            conn.execute("ALTER TABLE chats ADD COLUMN peer_from_id TEXT NULL;")
        except Exception:
            pass

    # messages.is_out + sticker_emoji
    msg_cols = set(_get_table_columns(conn, "messages"))
    if "is_out" not in msg_cols:
        try:
            conn.execute("ALTER TABLE messages ADD COLUMN is_out INTEGER DEFAULT 0;")
        except Exception:
            pass
    if "sticker_emoji" not in msg_cols:
        try:
            conn.execute("ALTER TABLE messages ADD COLUMN sticker_emoji TEXT NULL;")
        except Exception:
            pass


def meta_get(conn: sqlite3.Connection, key: str) -> Optional[str]:
    try:
        row = conn.execute("SELECT value FROM meta WHERE key = ?;", (key,)).fetchone()
        if row is None:
            return None
        val = row[0]
        return val if isinstance(val, str) else (str(val) if val is not None else None)
    except Exception:
        return None


def meta_set(conn: sqlite3.Connection, key: str, value: str) -> None:
    try:
        conn.execute(
            """
            INSERT INTO meta(key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value;
            """,
            (key, value),
        )
    except Exception:
        # Older SQLite versions might not support upsert; fallback.
        try:
            conn.execute("DELETE FROM meta WHERE key = ?;", (key,))
            conn.execute("INSERT INTO meta(key, value) VALUES (?, ?);", (key, value))
        except Exception:
            pass


def compute_self_from_id(conn: sqlite3.Connection) -> Optional[str]:
    """Pick from_id that appears in the largest number of unique chats."""
    try:
        row = conn.execute(
            """
            SELECT from_id,
                   COUNT(DISTINCT chat_pk) AS chat_cnt,
                   COUNT(*) AS msg_cnt
            FROM messages
            WHERE from_id IS NOT NULL AND TRIM(from_id) != ''
            GROUP BY from_id
            ORDER BY chat_cnt DESC, msg_cnt DESC
            LIMIT 1;
            """
        ).fetchone()
        if row is None:
            return None
        fid = row[0]
        return fid if isinstance(fid, str) and fid.strip() else (str(fid) if fid is not None else None)
    except Exception:
        return None


def canonical_self_from_id(value: Any) -> Optional[str]:
    fid = normalize_from_id(value)
    if not fid:
        return None
    s = fid.strip()
    if not s:
        return None
    if s == "__self__":
        return s
    if s.isdigit():
        return f"user{s}"
    if s.startswith("user") and s[4:].isdigit():
        return s
    return s


def self_from_id_candidates(self_from_id: Optional[str], include_html_self: bool = True) -> List[str]:
    out: List[str] = []

    def add(value: Optional[str]) -> None:
        if value and value not in out:
            out.append(value)

    canonical = canonical_self_from_id(self_from_id)
    add(canonical)
    numeric = extract_numeric_id(canonical)
    if numeric is not None:
        add(str(numeric))
        add(f"user{numeric}")
    if include_html_self and canonical:
        add("__self__")
    return out


def _count_messages_from_self_candidates(conn: sqlite3.Connection, self_from_id: Optional[str]) -> int:
    candidates = self_from_id_candidates(self_from_id)
    if not candidates:
        return 0
    placeholders = ",".join("?" for _ in candidates)
    row = conn.execute(
        f"SELECT COUNT(*) FROM messages WHERE from_id IN ({placeholders});",
        tuple(candidates),
    ).fetchone()
    return int(row[0] or 0) if row else 0


def resolve_self_from_id(conn: sqlite3.Connection, preferred_self_from_id: Optional[str]) -> Optional[str]:
    preferred = canonical_self_from_id(preferred_self_from_id)
    if preferred and _count_messages_from_self_candidates(conn, preferred) > 0:
        return preferred
    return canonical_self_from_id(compute_self_from_id(conn))


def extract_self_from_export(result_json_files: List[str]) -> Optional[str]:
    for result_path in sorted(result_json_files, key=lambda p: (len(p), p)):
        if _CANCEL_EVENT.is_set():
            raise CancelledError()
        data = load_json_safely(result_path)
        if not isinstance(data, dict):
            continue
        personal = data.get("personal_information")
        if not isinstance(personal, dict):
            continue
        for key in ("user_id", "id"):
            candidate = canonical_self_from_id(personal.get(key))
            if candidate:
                return candidate
    return None


def apply_direction_updates(conn: sqlite3.Connection, self_from_id: Optional[str]) -> None:
    """Fill messages.is_out and chats.peer_from_id. Best-effort."""
    ensure_schema(conn)
    try:
        conn.execute("BEGIN;")
    except Exception:
        pass

    try:
        self_candidates = self_from_id_candidates(self_from_id)

        if not self_candidates:
            conn.execute("UPDATE messages SET is_out = 0;")
            conn.execute("UPDATE chats SET peer_from_id = NULL;")
            meta_set(conn, "self_from_id", "")
        else:
            canonical_self = canonical_self_from_id(self_from_id) or self_candidates[0]
            placeholders = ",".join("?" for _ in self_candidates)
            meta_set(conn, "self_from_id", canonical_self)
            conn.execute(
                f"UPDATE messages SET is_out = CASE WHEN from_id IN ({placeholders}) THEN 1 ELSE 0 END;",
                tuple(self_candidates),
            )
            conn.execute(
                f"""
                UPDATE chats
                SET peer_from_id = (
                  SELECT m.from_id
                  FROM messages m
                  WHERE m.chat_pk = chats.chat_pk
                    AND m.from_id IS NOT NULL
                    AND TRIM(m.from_id) != ''
                    AND m.from_id NOT IN ({placeholders})
                  GROUP BY m.from_id
                  ORDER BY COUNT(*) DESC
                  LIMIT 1
                );
                """,
                tuple(self_candidates),
            )

        try:
            conn.execute("COMMIT;")
        except Exception:
            conn.commit()
    except CancelledError:
        try:
            conn.execute("ROLLBACK;")
        except Exception:
            pass
        raise
    except Exception:
        try:
            conn.execute("ROLLBACK;")
        except Exception:
            pass


def compute_db_total_size_bytes(db_path: str) -> int:
    total = 0
    for p in (db_path, db_path + "-wal", db_path + "-shm"):
        try:
            if os.path.exists(p):
                total += os.path.getsize(p)
        except Exception:
            continue
    return total


def normalize_name(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def counts_similar(a: int, b: int) -> bool:
    if a <= 0 or b <= 0:
        return a == b
    m = max(a, b)
    tol = max(50, int(0.20 * m))
    return abs(a - b) <= tol


@dataclass
class ChatCandidate:
    source: str  # json | result | html
    priority: int
    export_chat_id: str
    name: str
    type: str
    approx_msgs: int
    json_files: List[str] = field(default_factory=list)
    json_file_msg_counts: Dict[str, int] = field(default_factory=dict)
    result_origin_file: Optional[str] = None
    result_chat_obj: Optional[Dict[str, Any]] = None
    html_files: List[str] = field(default_factory=list)
    html_file_msg_counts: Dict[str, int] = field(default_factory=dict)
    chat_pk: Optional[int] = None


@dataclass
class Unit:
    kind: str  # json_file | result_chat | html_file
    file_path: str
    chat: ChatCandidate
    est_msgs: int


def scan_export_dir(export_dir: str) -> Tuple[List[str], List[str], List[str]]:
    """
    Returns (json_files_excluding_result, result_json_files, html_message_files)
    """
    json_files: List[str] = []
    result_files: List[str] = []
    html_files: List[str] = []

    for root, _dirs, files in os.walk(export_dir):
        if _CANCEL_EVENT.is_set():
            raise CancelledError()
        for fn in files:
            lower = fn.lower()
            p = os.path.join(root, fn)
            if lower.endswith(".json"):
                if lower == "result.json":
                    result_files.append(p)
                else:
                    json_files.append(p)
            elif lower.endswith(".html") and lower.startswith("messages"):
                html_files.append(p)

    json_files.sort()
    result_files.sort()
    html_files.sort()
    return json_files, result_files, html_files


def load_json_safely(path: str) -> Optional[Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def strip_tags_simple(html_fragment: str) -> str:
    s = re.sub(r"<br\s*/?>", "\n", html_fragment, flags=re.IGNORECASE)
    s = re.sub(r"<[^>]+>", "", s)
    return unescape(s).strip()


def extract_html_chat_title(file_path: str) -> str:
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            chunk = f.read(262144)
    except Exception:
        return ""

    idx = chunk.find('<div class="message')
    header = chunk if idx < 0 else chunk[:idx]

    m = re.search(r'<div class="text bold"\s*>\s*(.*?)\s*</div>', header, flags=re.DOTALL | re.IGNORECASE)
    if m:
        return strip_tags_simple(m.group(1))

    m2 = re.search(r"<title>\s*(.*?)\s*</title>", header, flags=re.DOTALL | re.IGNORECASE)
    if m2:
        return strip_tags_simple(m2.group(1))

    return ""


def count_html_messages(file_path: str) -> int:
    cnt = 0
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if _CANCEL_EVENT.is_set():
                    raise CancelledError()
                cnt += line.count('<div class="message')
    except CancelledError:
        raise
    except Exception:
        return 0
    return cnt


class TgHtmlMsgParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.msg_id: Optional[str] = None
        self.date_title: Optional[str] = None
        self.date_ts: Optional[int] = None
        self.from_name: str = ""
        self.text: str = ""
        self.body_details_text: str = ""
        self.is_service: int = 0
        self.is_edited: int = 0
        self.is_out: int = 0
        self.reply_to_msg_id: Optional[str] = None
        self.media_type: Optional[str] = None

        self._div_stack: List[str] = []
        self._from_depth = 0
        self._text_depth = 0
        self._reply_depth = 0
        self._body_details_depth = 0
        self._captured_main_text = False

        self._media_pri = 0

    def _set_media(self, media: str, pri: int) -> None:
        if pri > self._media_pri:
            self.media_type = media
            self._media_pri = pri

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        attrs_dict: Dict[str, str] = {}
        for k, v in attrs:
            if v is None:
                continue
            attrs_dict[k] = v

        cls_any = attrs_dict.get("class", "")
        class_any = cls_any.split()
        if "photo_wrap" in class_any or "photo" in class_any:
            self._set_media("photo", 2)
        elif "video_wrap" in class_any or "video_file" in class_any:
            self._set_media("video", 2)
        elif "voice_wrap" in class_any:
            self._set_media("voice", 2)
        elif "sticker_wrap" in class_any or "sticker" in class_any:
            self._set_media("sticker", 2)
        elif "gif_wrap" in class_any:
            self._set_media("gif", 2)
        elif "document_wrap" in class_any or "file_wrap" in class_any:
            self._set_media("file", 2)
        elif "media_wrap" in class_any:
            self._set_media("other", 1)

        if tag == "div":
            cls = attrs_dict.get("class", "")
            class_list = cls.split()
            marker = ""

            if "message" in class_list and self.msg_id is None:
                mid = attrs_dict.get("id", "")
                if mid.startswith("message"):
                    self.msg_id = mid[len("message") :]
                if "service" in class_list:
                    self.is_service = 1
                if "out" in class_list:
                    self.is_out = 1

            if "pull_right" in class_list and "date" in class_list and "details" in class_list:
                t = attrs_dict.get("title")
                if t:
                    self.date_title = t
                ts = attrs_dict.get("data-timestamp")
                if ts and ts.isdigit():
                    try:
                        self.date_ts = int(ts)
                    except Exception:
                        self.date_ts = None

            if "reply_to" in class_list and "details" in class_list:
                marker = "reply_to"
                self._reply_depth += 1

            if "from_name" in class_list:
                marker = "from_name"
                self._from_depth += 1

            if "body" in class_list and "details" in class_list:
                marker = "body_details"
                self._body_details_depth += 1

            if "text" in class_list:
                if self._reply_depth == 0 and not self._captured_main_text:
                    marker = "main_text"
                    self._text_depth += 1

            self._div_stack.append(marker)

        elif tag == "a":
            href = attrs_dict.get("href", "")
            if href:
                m = re.search(r"go_to_message(\d+)", href)
                if m:
                    self.reply_to_msg_id = m.group(1)

        elif tag == "span":
            cls = attrs_dict.get("class", "")
            if "edited" in cls.split():
                self.is_edited = 1

        elif tag == "br":
            if self._text_depth > 0:
                self.text += "\n"
            elif self._body_details_depth > 0:
                self.body_details_text += "\n"
            elif self._from_depth > 0:
                self.from_name += "\n"

    def handle_endtag(self, tag: str) -> None:
        if tag == "div":
            if self._div_stack:
                marker = self._div_stack.pop()
                if marker == "from_name":
                    self._from_depth = max(0, self._from_depth - 1)
                elif marker == "main_text":
                    self._text_depth = max(0, self._text_depth - 1)
                    if self._text_depth == 0:
                        self._captured_main_text = True
                elif marker == "reply_to":
                    self._reply_depth = max(0, self._reply_depth - 1)
                elif marker == "body_details":
                    self._body_details_depth = max(0, self._body_details_depth - 1)

    def handle_data(self, data: str) -> None:
        if not data:
            return
        if self._from_depth > 0:
            self.from_name += data
        if self._text_depth > 0:
            self.text += data
        if self._body_details_depth > 0:
            self.body_details_text += data


def iter_html_message_blocks(file_path: str) -> Iterable[str]:
    start_marker = '<div class="message'
    buf: Optional[List[str]] = None
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if _CANCEL_EVENT.is_set():
                    raise CancelledError()
                if start_marker in line:
                    if buf is not None:
                        yield "".join(buf)
                    buf = [line]
                else:
                    if buf is not None:
                        buf.append(line)
    except CancelledError:
        raise
    except Exception:
        return

    if buf is not None:
        yield "".join(buf)


def parse_html_message_block(block_html: str) -> Optional[Dict[str, Any]]:
    p = TgHtmlMsgParser()
    try:
        p.feed(block_html)
        p.close()
    except Exception:
        return None

    from_name = re.sub(r"\s+", " ", p.from_name).strip()
    text = p.text.strip()
    if p.is_service and not text:
        text = re.sub(r"\s+", " ", p.body_details_text).strip()

    date_ts = p.date_ts if p.date_ts is not None else parse_html_title_datetime_to_unix_seconds(p.date_title)

    if date_ts <= 0:
        return None

    from_id: Optional[str]
    if p.is_out:
        from_id = "__self__"
    else:
        from_id = f"name:{from_name}" if from_name else None

    return {
        "msg_id": p.msg_id,
        "date_ts": int(date_ts),
        "from_id": from_id,
        "from_name": from_name,
        "is_out": int(p.is_out),
        "text": text,
        "media_type": p.media_type,
        "is_edited": int(p.is_edited),
        "is_service": int(p.is_service),
        "reply_to_msg_id": p.reply_to_msg_id,
    }


def html_looks_like_group_chat(files: List[str], sample_limit: int = 300) -> bool:
    incoming_from_ids = set()
    sampled = 0

    for fp in files:
        if _CANCEL_EVENT.is_set():
            raise CancelledError()
        for block in iter_html_message_blocks(fp):
            if _CANCEL_EVENT.is_set():
                raise CancelledError()
            msg = parse_html_message_block(block)
            if msg is None:
                continue
            sampled += 1
            if int(msg.get("is_service", 0) or 0) == 0:
                fid = msg.get("from_id")
                if isinstance(fid, str) and fid.strip() and fid != "__self__":
                    incoming_from_ids.add(fid.strip())
                    if len(incoming_from_ids) > 1:
                        return True
            if sampled >= sample_limit:
                return False

    return False


def build_candidates(
    export_dir: str, json_files: List[str], result_json_files: List[str], html_files: List[str]
) -> Tuple[List[ChatCandidate], int]:
    candidates: List[ChatCandidate] = []
    skipped = 0

    json_groups: Dict[str, ChatCandidate] = {}

    for path in json_files:
        if _CANCEL_EVENT.is_set():
            raise CancelledError()

        data = load_json_safely(path)
        if not is_chat_export_json(data):
            continue

        assert isinstance(data, dict)
        name_val = data.get("name")
        type_val = data.get("type")
        msgs_val = data.get("messages")

        name = name_val if isinstance(name_val, str) else (str(name_val) if name_val is not None else "")
        ctype = type_val if isinstance(type_val, str) else (str(type_val) if type_val is not None else "")
        if not isinstance(msgs_val, list):
            continue

        if ctype != "personal_chat":
            skipped += 1
            continue

        export_chat_id = derive_export_chat_id(data, path, export_dir)
        msg_count = len(msgs_val)

        if export_chat_id not in json_groups:
            json_groups[export_chat_id] = ChatCandidate(
                source="json",
                priority=3,
                export_chat_id=f"json:{export_chat_id}",
                name=name,
                type=ctype,
                approx_msgs=0,
            )

        grp = json_groups[export_chat_id]
        if not grp.name and name:
            grp.name = name
        grp.json_files.append(path)
        grp.json_file_msg_counts[path] = msg_count
        grp.approx_msgs += msg_count

    for grp in json_groups.values():
        grp.json_files.sort()
        if grp.approx_msgs <= 0:
            skipped += 1
            continue
        candidates.append(grp)

    if result_json_files:
        result_json_files_sorted = sorted(result_json_files, key=lambda p: (len(p), p))
        result_path = result_json_files_sorted[0]

        data = load_json_safely(result_path)
        if isinstance(data, dict):
            chats = data.get("chats")
            chats_list = None
            if isinstance(chats, dict):
                cl = chats.get("list")
                if isinstance(cl, list):
                    chats_list = cl

            if chats_list is not None:
                for idx, chat_obj in enumerate(chats_list):
                    if _CANCEL_EVENT.is_set():
                        raise CancelledError()
                    if not is_chat_export_json(chat_obj):
                        continue
                    assert isinstance(chat_obj, dict)

                    name_val = chat_obj.get("name")
                    type_val = chat_obj.get("type")
                    msgs_val = chat_obj.get("messages")

                    name = name_val if isinstance(name_val, str) else (str(name_val) if name_val is not None else "")
                    ctype = type_val if isinstance(type_val, str) else (str(type_val) if type_val is not None else "")
                    if not isinstance(msgs_val, list):
                        continue

                    if ctype != "personal_chat":
                        skipped += 1
                        continue

                    cid = chat_obj.get("id")
                    export_id = str(cid) if cid is not None else f"idx{idx}"
                    msg_count = len(msgs_val)

                    if msg_count <= 0:
                        skipped += 1
                        continue

                    candidates.append(
                        ChatCandidate(
                            source="result",
                            priority=2,
                            export_chat_id=f"result:{export_id}",
                            name=name,
                            type=ctype,
                            approx_msgs=msg_count,
                            result_origin_file=result_path,
                            result_chat_obj=chat_obj,
                        )
                    )

    html_by_dir: Dict[str, List[str]] = {}
    for pth in html_files:
        if _CANCEL_EVENT.is_set():
            raise CancelledError()
        d = os.path.dirname(pth)
        html_by_dir.setdefault(d, []).append(pth)

    for chat_dir, files in html_by_dir.items():
        if _CANCEL_EVENT.is_set():
            raise CancelledError()
        files.sort()
        title = extract_html_chat_title(files[0]) if files else ""
        if not title:
            title = os.path.basename(chat_dir) or "HTML chat"

        file_counts: Dict[str, int] = {}
        total = 0
        for fp in files:
            c = count_html_messages(fp)
            file_counts[fp] = c
            total += c

        if total <= 0:
            skipped += 1
            continue

        if html_looks_like_group_chat(files):
            skipped += 1
            continue

        try:
            rel_dir = os.path.relpath(chat_dir, export_dir)
        except Exception:
            rel_dir = chat_dir

        candidates.append(
            ChatCandidate(
                source="html",
                priority=1,
                export_chat_id=f"html:{rel_dir}",
                name=title,
                type="unknown_html",
                approx_msgs=total,
                html_files=files,
                html_file_msg_counts=file_counts,
            )
        )

    return candidates, skipped


def _candidate_identity_key(cand: ChatCandidate) -> Optional[str]:
    if cand.source not in ("json", "result"):
        return None
    prefix = f"{cand.source}:"
    if not cand.export_chat_id.startswith(prefix):
        return None
    raw_id = cand.export_chat_id[len(prefix) :].strip()
    if not raw_id or raw_id.startswith("idx"):
        return None
    if raw_id.lstrip("-").isdigit():
        return f"telegram_chat_id:{raw_id}"
    return None


def dedupe_candidates(candidates: List[ChatCandidate]) -> Tuple[List[ChatCandidate], int]:
    candidates_sorted = sorted(candidates, key=lambda c: (-c.priority, normalize_name(c.name), c.export_chat_id))
    accepted: List[ChatCandidate] = []
    accepted_by_key: Dict[Tuple[str, str], List[ChatCandidate]] = {}
    accepted_by_identity: Dict[str, ChatCandidate] = {}
    skipped_dupes = 0

    for cand in candidates_sorted:
        if _CANCEL_EVENT.is_set():
            raise CancelledError()

        identity_key = _candidate_identity_key(cand)
        if identity_key and identity_key in accepted_by_identity:
            skipped_dupes += 1
            continue

        nname = normalize_name(cand.name)
        canonical_type = "personal_chat" if cand.type == "unknown_html" else cand.type
        key = (nname, canonical_type)

        dup_found: Optional[ChatCandidate] = None
        for ex in accepted_by_key.get(key, []):
            if counts_similar(cand.approx_msgs, ex.approx_msgs):
                dup_found = ex
                break

        if dup_found is None:
            accepted.append(cand)
            accepted_by_key.setdefault(key, []).append(cand)
            if identity_key:
                accepted_by_identity[identity_key] = cand
            continue

        keep = dup_found
        drop = cand

        if cand.priority > dup_found.priority:
            keep = cand
            drop = dup_found
        elif cand.priority == dup_found.priority:
            if cand.approx_msgs > dup_found.approx_msgs:
                keep = cand
                drop = dup_found

        if keep is dup_found:
            skipped_dupes += 1
            continue

        skipped_dupes += 1
        try:
            accepted.remove(drop)
        except ValueError:
            pass
        lst = accepted_by_key.get(key, [])
        if drop in lst:
            lst.remove(drop)
        drop_identity_key = _candidate_identity_key(drop)
        if drop_identity_key and accepted_by_identity.get(drop_identity_key) is drop:
            accepted_by_identity.pop(drop_identity_key, None)
        accepted.append(keep)
        accepted_by_key.setdefault(key, []).append(keep)
        keep_identity_key = _candidate_identity_key(keep)
        if keep_identity_key:
            accepted_by_identity[keep_identity_key] = keep

    return accepted, skipped_dupes


def calc_percent_units(unit_index: int, total_units: int, unit_fraction: float, start: int = 5, end: int = 90) -> int:
    if total_units <= 0:
        return start
    f = max(0.0, min(1.0, float(unit_fraction)))
    overall = (float(unit_index) + f) / float(total_units)
    return int(start + overall * float(end - start))


INSERT_SQL = """
  INSERT OR IGNORE INTO messages (
    chat_pk, msg_id, date_ts, from_id, from_name, text,
    media_type, sticker_emoji, is_edited, is_service, reply_to_msg_id
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
"""


def _safe_relpath(path: str, base: str) -> str:
    try:
        return os.path.relpath(path, base)
    except Exception:
        return path


def insert_json_messages_from_file(
    conn: sqlite3.Connection,
    chat_pk: int,
    chat_name: str,
    export_dir: str,
    file_path: str,
    unit_index: int,
    total_units: int,
    est_msgs: int,
) -> int:
    if _CANCEL_EVENT.is_set():
        raise CancelledError()

    rel_file = _safe_relpath(file_path, export_dir)
    progress("parse_chat", calc_percent_units(unit_index, total_units, 0.0), chat_name, rel_file)

    data = load_json_safely(file_path)
    if not is_chat_export_json(data):
        return 0
    assert isinstance(data, dict)

    ctype = data.get("type")
    if not isinstance(ctype, str) or ctype != "personal_chat":
        return 0

    msgs_val = data.get("messages")
    if not isinstance(msgs_val, list) or not msgs_val:
        return 0

    total_msgs = len(msgs_val)

    batch_size = 2000
    inserted = 0
    batch: List[Tuple[Any, ...]] = []

    conn.execute("BEGIN;")
    try:
        for j, msg in enumerate(msgs_val):
            if _CANCEL_EVENT.is_set():
                raise CancelledError()
            if not isinstance(msg, dict):
                continue

            msg_id_value = msg.get("id")
            msg_id = str(msg_id_value) if msg_id_value is not None else None

            date_ts = parse_message_timestamp(msg)

            from_id = normalize_from_id(msg.get("from_id"))
            _ = extract_numeric_id(from_id)

            from_name_value = msg.get("from")
            if from_name_value is None:
                from_name_value = msg.get("from_name")
            from_name = from_name_value if isinstance(from_name_value, str) else (
                str(from_name_value) if from_name_value is not None else ""
            )

            text = flatten_text(msg.get("text"))

            media_type_value = msg.get("media_type")
            media_type: Optional[str] = media_type_value if isinstance(media_type_value, str) else None
            if media_type is None:
                if msg.get("photo") is not None:
                    media_type = "photo"
                elif msg.get("sticker_emoji") is not None:
                    media_type = "sticker"
                elif msg.get("file") is not None:
                    mime = msg.get("mime_type")
                    if isinstance(mime, str) and mime.startswith("video/"):
                        media_type = "video"
                    elif isinstance(mime, str) and mime.startswith("audio/"):
                        media_type = "voice"
                    else:
                        media_type = "file"

            sticker_emoji_value = msg.get("sticker_emoji")
            sticker_emoji: Optional[str] = (
                sticker_emoji_value if isinstance(sticker_emoji_value, str) else None
            )

            is_edited = 1 if msg.get("edited") else 0
            is_service = 1 if msg.get("type") == "service" else 0

            reply_to = msg.get("reply_to_message_id")
            if reply_to is None:
                reply_to = msg.get("reply_to_msg_id")
            reply_to_msg_id = str(reply_to) if reply_to is not None else None

            batch.append(
                (
                    chat_pk,
                    msg_id,
                    int(date_ts),
                    from_id,
                    from_name,
                    text,
                    media_type,
                    sticker_emoji,
                    int(is_edited),
                    int(is_service),
                    reply_to_msg_id,
                )
            )

            if len(batch) >= batch_size:
                before_changes = conn.total_changes
                conn.executemany(INSERT_SQL, batch)
                inserted += int(conn.total_changes - before_changes)
                batch.clear()

            if (j + 1) % 500 == 0:
                frac = float(j + 1) / float(total_msgs) if total_msgs > 0 else 1.0
                progress("insert_db", calc_percent_units(unit_index, total_units, frac), chat_name, rel_file)

        if batch:
            before_changes = conn.total_changes
            conn.executemany(INSERT_SQL, batch)
            inserted += int(conn.total_changes - before_changes)
            batch.clear()

        conn.execute("COMMIT;")
    except CancelledError:
        try:
            conn.execute("ROLLBACK;")
        except Exception:
            pass
        raise
    except Exception:
        try:
            conn.execute("ROLLBACK;")
        except Exception:
            pass
        write_json({"type": "warning", "message": f"Failed to insert JSON file: {rel_file}"})
        return inserted

    progress("insert_db", calc_percent_units(unit_index, total_units, 1.0), chat_name, rel_file)
    return inserted


def insert_result_chat_messages(
    conn: sqlite3.Connection,
    chat_pk: int,
    chat_name: str,
    export_dir: str,
    origin_file: str,
    chat_obj: Dict[str, Any],
    unit_index: int,
    total_units: int,
    est_msgs: int,
) -> int:
    if _CANCEL_EVENT.is_set():
        raise CancelledError()

    rel_file = _safe_relpath(origin_file, export_dir)
    progress("parse_chat", calc_percent_units(unit_index, total_units, 0.0), chat_name, rel_file)

    msgs_val = chat_obj.get("messages")
    if not isinstance(msgs_val, list) or not msgs_val:
        return 0

    total_msgs = len(msgs_val)

    batch_size = 2000
    inserted = 0
    batch: List[Tuple[Any, ...]] = []

    conn.execute("BEGIN;")
    try:
        for j, msg in enumerate(msgs_val):
            if _CANCEL_EVENT.is_set():
                raise CancelledError()
            if not isinstance(msg, dict):
                continue

            msg_id_value = msg.get("id")
            msg_id = str(msg_id_value) if msg_id_value is not None else None

            date_ts = parse_message_timestamp(msg)

            from_id = normalize_from_id(msg.get("from_id"))
            _ = extract_numeric_id(from_id)

            from_name_value = msg.get("from")
            if from_name_value is None:
                from_name_value = msg.get("from_name")
            from_name = from_name_value if isinstance(from_name_value, str) else (
                str(from_name_value) if from_name_value is not None else ""
            )

            text = flatten_text(msg.get("text"))

            media_type_value = msg.get("media_type")
            media_type: Optional[str] = media_type_value if isinstance(media_type_value, str) else None
            if media_type is None:
                if msg.get("photo") is not None:
                    media_type = "photo"
                elif msg.get("sticker_emoji") is not None:
                    media_type = "sticker"
                elif msg.get("file") is not None:
                    mime = msg.get("mime_type")
                    if isinstance(mime, str) and mime.startswith("video/"):
                        media_type = "video"
                    elif isinstance(mime, str) and mime.startswith("audio/"):
                        media_type = "voice"
                    else:
                        media_type = "file"

            sticker_emoji_value = msg.get("sticker_emoji")
            sticker_emoji: Optional[str] = (
                sticker_emoji_value if isinstance(sticker_emoji_value, str) else None
            )

            is_edited = 1 if msg.get("edited") else 0
            is_service = 1 if msg.get("type") == "service" else 0

            reply_to = msg.get("reply_to_message_id")
            if reply_to is None:
                reply_to = msg.get("reply_to_msg_id")
            reply_to_msg_id = str(reply_to) if reply_to is not None else None

            batch.append(
                (
                    chat_pk,
                    msg_id,
                    int(date_ts),
                    from_id,
                    from_name,
                    text,
                    media_type,
                    sticker_emoji,
                    int(is_edited),
                    int(is_service),
                    reply_to_msg_id,
                )
            )

            if len(batch) >= batch_size:
                before_changes = conn.total_changes
                conn.executemany(INSERT_SQL, batch)
                inserted += int(conn.total_changes - before_changes)
                batch.clear()

            if (j + 1) % 500 == 0:
                frac = float(j + 1) / float(total_msgs) if total_msgs > 0 else 1.0
                progress("insert_db", calc_percent_units(unit_index, total_units, frac), chat_name, rel_file)

        if batch:
            before_changes = conn.total_changes
            conn.executemany(INSERT_SQL, batch)
            inserted += int(conn.total_changes - before_changes)
            batch.clear()

        conn.execute("COMMIT;")
    except CancelledError:
        try:
            conn.execute("ROLLBACK;")
        except Exception:
            pass
        raise
    except Exception:
        try:
            conn.execute("ROLLBACK;")
        except Exception:
            pass
        write_json({"type": "warning", "message": f"Failed to insert result.json chat: {chat_name}"})
        return inserted

    progress("insert_db", calc_percent_units(unit_index, total_units, 1.0), chat_name, rel_file)
    return inserted


def insert_html_messages_from_file(
    conn: sqlite3.Connection,
    chat_pk: int,
    chat_name: str,
    export_dir: str,
    file_path: str,
    unit_index: int,
    total_units: int,
    est_msgs: int,
) -> int:
    if _CANCEL_EVENT.is_set():
        raise CancelledError()

    rel_file = _safe_relpath(file_path, export_dir)
    progress("parse_chat", calc_percent_units(unit_index, total_units, 0.0), chat_name, rel_file)

    batch_size = 2000
    inserted = 0
    batch: List[Tuple[Any, ...]] = []

    seen = 0
    total_est = est_msgs if est_msgs > 0 else 1

    conn.execute("BEGIN;")
    try:
        for block in iter_html_message_blocks(file_path):
            if _CANCEL_EVENT.is_set():
                raise CancelledError()

            seen += 1
            msg = parse_html_message_block(block)
            if msg is None:
                continue

            msg_id = msg.get("msg_id")
            date_ts = msg.get("date_ts", 0)
            from_name = msg.get("from_name", "")
            text = msg.get("text", "")
            media_type = msg.get("media_type")
            is_edited = msg.get("is_edited", 0)
            is_service = msg.get("is_service", 0)
            reply_to_msg_id = msg.get("reply_to_msg_id")
            from_id_val = msg.get("from_id")
            from_id: Optional[str] = (
                from_id_val.strip() if isinstance(from_id_val, str) and from_id_val.strip() else None
            )
            sticker_emoji: Optional[str] = None

            batch.append(
                (
                    chat_pk,
                    msg_id,
                    int(date_ts),
                    from_id,
                    from_name,
                    text,
                    media_type,
                    sticker_emoji,
                    int(is_edited),
                    int(is_service),
                    reply_to_msg_id,
                )
            )

            if len(batch) >= batch_size:
                before_changes = conn.total_changes
                conn.executemany(INSERT_SQL, batch)
                inserted += int(conn.total_changes - before_changes)
                batch.clear()

            if seen % 300 == 0:
                frac = min(1.0, float(seen) / float(total_est))
                progress("insert_db", calc_percent_units(unit_index, total_units, frac), chat_name, rel_file)

        if batch:
            before_changes = conn.total_changes
            conn.executemany(INSERT_SQL, batch)
            inserted += int(conn.total_changes - before_changes)
            batch.clear()

        conn.execute("COMMIT;")
    except CancelledError:
        try:
            conn.execute("ROLLBACK;")
        except Exception:
            pass
        raise
    except Exception:
        try:
            conn.execute("ROLLBACK;")
        except Exception:
            pass
        write_json({"type": "warning", "message": f"Failed to parse/insert HTML file: {rel_file}"})
        return inserted

    progress("insert_db", calc_percent_units(unit_index, total_units, 1.0), chat_name, rel_file)
    return inserted


def do_import(export_dir: str, mode: str, db_path: str) -> None:
    _ = mode

    progress("scan_files", 0, "", "")

    json_files, result_files, html_files = scan_export_dir(export_dir)

    progress("scan_files", 3, "", "")
    preferred_self_from_id = extract_self_from_export(result_files)
    candidates, skipped_chats = build_candidates(export_dir, json_files, result_files, html_files)
    progress("scan_files", 5, "", "")

    if not candidates:
        raise RuntimeError("Не найдено данных для импорта: нет chat JSON, result.json chats.list, или messages*.html.")

    accepted, skipped_dupes = dedupe_candidates(candidates)

    if not accepted:
        raise RuntimeError("После фильтрации и дедупликации не осталось чатов для импорта.")

    skipped_total = int(skipped_chats + skipped_dupes)

    json_chats = sum(1 for c in accepted if c.source in ("json", "result"))
    html_chats = sum(1 for c in accepted if c.source == "html")
    unknown_html_chats = sum(1 for c in accepted if c.type == "unknown_html")

    conn: Optional[sqlite3.Connection] = None
    inserted_messages = 0

    try:
        if _CANCEL_EVENT.is_set():
            raise CancelledError()

        conn = recreate_db(db_path)

        for c in accepted:
            if _CANCEL_EVENT.is_set():
                raise CancelledError()
            cur = conn.execute(
                "INSERT INTO chats(export_chat_id, name, type) VALUES (?, ?, ?);",
                (c.export_chat_id, c.name, c.type),
            )
            c.chat_pk = int(cur.lastrowid)

        try:
            conn.commit()
        except Exception:
            pass

        units: List[Unit] = []
        accepted_sorted = sorted(accepted, key=lambda c: (-c.priority, normalize_name(c.name), c.export_chat_id))
        for c in accepted_sorted:
            if c.source == "json":
                for fp in c.json_files:
                    units.append(Unit(kind="json_file", file_path=fp, chat=c, est_msgs=c.json_file_msg_counts.get(fp, 0)))
            elif c.source == "result":
                origin = c.result_origin_file or "result.json"
                units.append(Unit(kind="result_chat", file_path=origin, chat=c, est_msgs=c.approx_msgs))
            elif c.source == "html":
                for fp in c.html_files:
                    units.append(Unit(kind="html_file", file_path=fp, chat=c, est_msgs=c.html_file_msg_counts.get(fp, 0)))

        total_units = len(units)
        if total_units <= 0:
            raise RuntimeError("No processing units after scan.")

        for ui, unit in enumerate(units):
            if _CANCEL_EVENT.is_set():
                raise CancelledError()
            if unit.chat.chat_pk is None:
                continue
            chat_pk = int(unit.chat.chat_pk)
            chat_name = unit.chat.name

            if unit.kind == "json_file":
                inserted_messages += insert_json_messages_from_file(
                    conn=conn,
                    chat_pk=chat_pk,
                    chat_name=chat_name,
                    export_dir=export_dir,
                    file_path=unit.file_path,
                    unit_index=ui,
                    total_units=total_units,
                    est_msgs=unit.est_msgs,
                )
            elif unit.kind == "result_chat":
                if unit.chat.result_chat_obj is None:
                    continue
                inserted_messages += insert_result_chat_messages(
                    conn=conn,
                    chat_pk=chat_pk,
                    chat_name=chat_name,
                    export_dir=export_dir,
                    origin_file=unit.file_path,
                    chat_obj=unit.chat.result_chat_obj,
                    unit_index=ui,
                    total_units=total_units,
                    est_msgs=unit.est_msgs,
                )
            elif unit.kind == "html_file":
                inserted_messages += insert_html_messages_from_file(
                    conn=conn,
                    chat_pk=chat_pk,
                    chat_name=chat_name,
                    export_dir=export_dir,
                    file_path=unit.file_path,
                    unit_index=ui,
                    total_units=total_units,
                    est_msgs=unit.est_msgs,
                )

        if _CANCEL_EVENT.is_set():
            raise CancelledError()

        progress("index_db", 90, "", "")
        try:
            ensure_schema(conn)
            self_from_id = resolve_self_from_id(conn, preferred_self_from_id)
            apply_direction_updates(conn, self_from_id)
        except CancelledError:
            raise
        except Exception as e:
            write_json({"type": "warning", "message": f"Failed to compute direction: {str(e)}"})

        progress("index_db", 92, "", "")
        create_indexes(conn)

        try:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        except Exception:
            pass

        conn.close()
        conn = None

        db_size = compute_db_total_size_bytes(db_path)

        mark_import_idle()
        progress("done", 100, "", "")
        write_json(
            {
                "type": "import_done",
                "chats": len(accepted),
                "messages": int(inserted_messages),
                "db_path": db_path,
                "db_size_bytes": int(db_size),
                "json_chats": int(json_chats),
                "html_chats": int(html_chats),
                "skipped_chats": int(skipped_total),
                "unknown_html_chats": int(unknown_html_chats),
            }
        )

    except CancelledError:
        if conn is not None:
            try:
                conn.execute("ROLLBACK;")
            except Exception:
                pass
            try:
                conn.close()
            except Exception:
                pass
            conn = None

        ensure_removed(db_path)
        ensure_removed(db_path + "-wal")
        ensure_removed(db_path + "-shm")

        mark_import_idle()
        write_json({"type": "import_error", "message": "Import cancelled"})
        return

    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def start_import_thread(export_dir: str, mode: str, db_path: str) -> None:
    global _IMPORT_BUSY, _IMPORT_THREAD

    def _runner() -> None:
        try:
            do_import(export_dir, mode, db_path)
        except Exception as e:
            mark_import_idle()
            write_json({"type": "import_error", "message": str(e)})

    with _IMPORT_LOCK:
        with _STATE_LOCK:
            if _REPORT_BUSY:
                write_json({"type": "import_error", "message": "Report generation already running"})
                return
            if _IMPORT_BUSY:
                write_json({"type": "import_error", "message": "Import already running"})
                return
            _IMPORT_BUSY = True

        _CANCEL_EVENT.clear()
        t = threading.Thread(target=_runner, name="tgwr_import", daemon=True)
        _IMPORT_THREAD = t
        t.start()


_STOPWORDS_RU_EN = set(
    """
и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был была было были буду будешь будет будем будете будут будут будут бывая бывал бывала бывали
него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем
сам сама сами само самих самими самому самого самой самом самому
чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас
куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между

это эта эти этот этому этим этой этого этого-то такое такой такая такие такие-то
тот та те то тому тем того т.е теми тех туда сюда отсюда оттуда здесь там тут
когда пока почему зачем где куда откуда
который которая которое которые которых которому которым которую которыми
весь вся все всем всему всех всеми всего всей
свой своя свое свои своих своим своими своему своего своей
себя себе собой собою

я ты он она оно мы вы они меня мне мною мной тебя тебе тобой тобою его ему им ею ей ее еею ею их ими ими
наш наша наше наши вашего ваша ваши твой твоя твое твои мой моя мое мои

или либо да нет ага угу ок okay ok дада
ну вот короче типа типо просто вообще реально кстати ладно
пж плиз плз pls plz
спс спасибо пожалуйста
привет здравствуйте здрасьте пока
добрый утро день вечер ночь
ха хаха ахах аха лол кек омг wtf
мм ммм эм эээ ээээ
ща щас сейчас сегодня завтра вчера

the a an and or but if then else to of in on at for from with without is are was were be been being it this that these those
i you he she we they me my mine your yours his her hers their theirs our ours us them
as not no yes do does did done have has had will would can could should may might must also just so very
than too into about over under up down out off again further here there when where why how
all any both each few more most other some such only own same
""".split()
)


_URL_RE = re.compile(
    r"(?i)\b(?:https?://\S+|www\.[^\s]+|t\.me/\S+|telegram\.me/\S+|tg://\S+|\w[\w\-]*\.(?:ru|com|net|org|io|me|app|dev|gg|co|info|biz|рф)(?:/\S*)?)"
)

_WORD_RE = re.compile(r"[A-Za-zА-Яа-яЁё]{2,}", flags=re.UNICODE)

_EMOJI_RE = re.compile(
    "["
    "\U0001F1E0-\U0001F1FF"
    "\U0001F300-\U0001F5FF"
    "\U0001F600-\U0001F64F"
    "\U0001F680-\U0001F6FF"
    "\U0001F700-\U0001F77F"
    "\U0001F780-\U0001F7FF"
    "\U0001F800-\U0001F8FF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FAFF"
    "\u2600-\u26FF"
    "\u2700-\u27BF"
    "]"
)


def _strip_urls(text: str) -> str:
    if not text:
        return ""
    return _URL_RE.sub(" ", text)


def clean_text_for_stats(text: str) -> str:
    s = _strip_urls(text)
    s = s.replace("\u00a0", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def tokenize_words(text: str) -> List[str]:
    s = clean_text_for_stats(text).lower()
    s = s.replace("ё", "е")
    out: List[str] = []
    for w in _WORD_RE.findall(s):
        ww = w.lower().replace("ё", "е")
        if ww in _STOPWORDS_RU_EN:
            continue
        out.append(ww)
    return out


def extract_emojis(text: str) -> List[str]:
    if not text:
        return []
    s = _strip_urls(text)
    return _EMOJI_RE.findall(s)


def _median_int(values: List[int]) -> int:
    if not values:
        return 0
    try:
        return int(statistics.median(values))
    except Exception:
        values_sorted = sorted(values)
        mid = len(values_sorted) // 2
        if len(values_sorted) % 2 == 1:
            return int(values_sorted[mid])
        return int((values_sorted[mid - 1] + values_sorted[mid]) / 2)


def _safe_div(n: float, d: float) -> float:
    if d == 0:
        return 0.0
    return float(n) / float(d)


def _normalize_media_bucket(media_type: Optional[str]) -> Optional[str]:
    if not media_type:
        return None
    s = media_type.strip().lower()
    if not s:
        return None
    if "photo" in s or s == "image":
        return "photo"
    if "video" in s:
        return "video"
    if "voice" in s or "audio" in s:
        return "voice"
    if "sticker" in s:
        return "sticker"
    if "gif" in s:
        return "gif"
    if "file" in s or "document" in s:
        return "file"
    return "other"


def _period_where_clause(start_ts: int, end_ts: int) -> Tuple[str, Tuple[Any, ...]]:
    return "date_ts >= ? AND date_ts < ?", (int(start_ts), int(end_ts))


def infer_report_year(conn: sqlite3.Connection) -> Optional[int]:
    try:
        row = conn.execute(
            f"SELECT CAST(strftime('%Y', (date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) AS y, COUNT(*) AS cnt "
            "FROM messages "
            "WHERE is_service = 0 AND date_ts > 0 "
            "GROUP BY y "
            "ORDER BY y DESC "
            "LIMIT 1;"
        ).fetchone()
        if row is None or row[0] is None:
            return None
        return int(row[0])
    except Exception:
        return None


def _count_messages(conn: sqlite3.Connection, start_ts: int, end_ts: int, where_extra: str = "", params_extra: Tuple[Any, ...] = ()) -> int:
    base, p = _period_where_clause(start_ts, end_ts)
    sql = f"SELECT COUNT(*) FROM messages WHERE {base} {where_extra};"
    row = conn.execute(sql, p + params_extra).fetchone()
    return int(row[0]) if row and row[0] is not None else 0


def _most_active_group(conn: sqlite3.Connection, start_ts: int, end_ts: int, group_expr: str, label: str) -> Dict[str, Any]:
    base, p = _period_where_clause(start_ts, end_ts)
    sql = (
        f"SELECT {group_expr} AS k, COUNT(*) AS cnt "
        f"FROM messages WHERE is_service = 0 AND {base} "
        f"GROUP BY k ORDER BY cnt DESC LIMIT 1;"
    )
    row = conn.execute(sql, p).fetchone()
    if not row:
        return {"value": None, "count": 0}
    return {"value": row[0], "count": int(row[1] or 0)}


def _distinct_days_count(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> int:
    base, p = _period_where_clause(start_ts, end_ts)
    row = conn.execute(
        f"SELECT COUNT(DISTINCT date((date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch')) "
        f"FROM messages WHERE is_service = 0 AND {base};",
        p,
    ).fetchone()
    return int(row[0] or 0) if row else 0


def _active_chats_count(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> int:
    base, p = _period_where_clause(start_ts, end_ts)
    row = conn.execute(
        f"SELECT COUNT(DISTINCT chat_pk) FROM messages WHERE is_service = 0 AND {base};",
        p,
    ).fetchone()
    return int(row[0] or 0) if row else 0



def _period_hours(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> int:
    """
    Number of real hours in the reporting period.

    - bounded periods (for example calendar year) use the whole window width
    - all_time uses the span from first non-service message hour to last one
    """
    if start_ts > 0 and end_ts > start_ts and end_ts < 2**61:
        return max(1, int((int(end_ts) - int(start_ts)) // 3600))

    base, p = _period_where_clause(start_ts, end_ts)
    row = conn.execute(
        f"SELECT MIN(date_ts), MAX(date_ts) FROM messages WHERE is_service = 0 AND {base};",
        p,
    ).fetchone()
    if not row:
        return 0

    min_ts = int(row[0] or 0)
    max_ts = int(row[1] or 0)
    if min_ts <= 0 or max_ts <= 0 or max_ts < min_ts:
        return 0

    first_hour = min_ts // 3600
    last_hour = max_ts // 3600
    return max(1, int(last_hour - first_hour + 1))


def _daily_activity(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> List[Dict[str, Any]]:
    """
    Returns per-day activity in MSK as:
    [
      {"date": "2025-01-01", "count": 123},
      ...
    ]

    For bounded windows (like a single calendar year), it fills missing dates with 0
    so the renderer can build an honest day-by-day heatmap. For unbounded/all-time
    windows, it returns only dates that have messages.
    """
    base, p = _period_where_clause(start_ts, end_ts)
    q = (
        f"SELECT date((date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS d, COUNT(*) AS cnt "
        f"FROM messages "
        f"WHERE is_service = 0 AND {base} "
        f"GROUP BY d "
        f"ORDER BY d;"
    )

    counts: Dict[str, int] = {}
    for row in conn.execute(q, p):
        d = row[0]
        cnt = int(row[1] or 0)
        if isinstance(d, str):
            counts[d] = cnt

    # Only materialize full calendar ranges for sane bounded periods.
    # For all_time (start_ts=0, end_ts=2**62), returning every day would be meaningless.
    if start_ts > 0 and end_ts > start_ts and (end_ts - start_ts) <= 370 * 86400 * 2:
        try:
            msk = _moscow_tzinfo()
            start_date = datetime.fromtimestamp(start_ts, tz=msk).date()
            end_date_exclusive = datetime.fromtimestamp(max(start_ts, end_ts - 1), tz=msk).date()
            out: List[Dict[str, Any]] = []
            cur = start_date
            while cur <= end_date_exclusive:
                key = cur.strftime('%Y-%m-%d')
                out.append({"date": key, "count": int(counts.get(key, 0))})
                cur += timedelta(days=1)
            return out
        except Exception:
            pass

    return [{"date": d, "count": int(cnt)} for d, cnt in sorted(counts.items())]



def _hourly_activity(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> List[Dict[str, Any]]:
    """
    Returns 24-hour distribution in MSK as:
    [
      {"hour": 0, "count": 23551},
      {"hour": 1, "count": 20684},
      ...
      {"hour": 23, "count": 19225}
    ]
    """
    base, p = _period_where_clause(start_ts, end_ts)
    q = (
        f"SELECT CAST(strftime('%H', (date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) AS h, COUNT(*) AS cnt "
        f"FROM messages "
        f"WHERE is_service = 0 AND {base} "
        f"GROUP BY h "
        f"ORDER BY h;"
    )

    counts = [0] * 24
    for row in conn.execute(q, p):
        try:
            h = int(row[0])
            cnt = int(row[1] or 0)
            if 0 <= h <= 23:
                counts[h] = cnt
        except Exception:
            continue

    return [{"hour": h, "count": int(counts[h])} for h in range(24)]


def _ts_to_msk_date(ts: Optional[int]) -> Optional[str]:
    if not ts or int(ts) <= 0:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=_moscow_tzinfo()).strftime("%Y-%m-%d")
    except Exception:
        return None


def _ts_to_msk_datetime(ts: Optional[int]) -> Optional[str]:
    if not ts or int(ts) <= 0:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=_moscow_tzinfo()).strftime("%Y-%m-%d %H:%M")
    except Exception:
        return None


def _period_span(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> Dict[str, Any]:
    base, p = _period_where_clause(start_ts, end_ts)
    row = conn.execute(
        f"SELECT MIN(date_ts), MAX(date_ts) FROM messages WHERE is_service = 0 AND {base};",
        p,
    ).fetchone()
    first_ts = int(row[0] or 0) if row else 0
    last_ts = int(row[1] or 0) if row else 0
    first_date = _ts_to_msk_date(first_ts)
    last_date = _ts_to_msk_date(last_ts)
    days = 0
    if first_date and last_date:
        try:
            days = (datetime.strptime(last_date, "%Y-%m-%d") - datetime.strptime(first_date, "%Y-%m-%d")).days + 1
        except Exception:
            days = 0
    return {
        "first_ts": first_ts or None,
        "last_ts": last_ts or None,
        "first_date": first_date,
        "last_date": last_date,
        "span_days": int(max(0, days)),
    }


def _bounded_month_keys(start_ts: int, end_ts: int) -> List[str]:
    if start_ts <= 0 or end_ts <= start_ts or (end_ts - start_ts) > 370 * 86400 * 2:
        return []
    try:
        msk = _moscow_tzinfo()
        cur = datetime.fromtimestamp(start_ts, tz=msk).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last = datetime.fromtimestamp(max(start_ts, end_ts - 1), tz=msk).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        keys: List[str] = []
        while cur <= last:
            keys.append(cur.strftime("%Y-%m"))
            if cur.month == 12:
                cur = cur.replace(year=cur.year + 1, month=1)
            else:
                cur = cur.replace(month=cur.month + 1)
        return keys
    except Exception:
        return []


def _month_activity_extremes(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> Dict[str, Any]:
    base, p = _period_where_clause(start_ts, end_ts)
    rows = list(
        conn.execute(
            f"SELECT strftime('%Y-%m', (date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS m, COUNT(*) AS cnt "
            f"FROM messages WHERE is_service = 0 AND {base} GROUP BY m ORDER BY m;",
            p,
        )
    )
    counts = {r[0]: int(r[1] or 0) for r in rows if isinstance(r[0], str)}
    bounded_keys = _bounded_month_keys(start_ts, end_ts)
    if bounded_keys:
        months = [{"value": key, "count": int(counts.get(key, 0))} for key in bounded_keys]
    else:
        months = [{"value": key, "count": int(cnt)} for key, cnt in sorted(counts.items())]
    quietest = min(months, key=lambda x: (int(x["count"]), str(x["value"]))) if months else None
    return {"months": months, "quietest_month": quietest}


def _daily_direction_extremes(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> Dict[str, Any]:
    base, p = _period_where_clause(start_ts, end_ts)
    q = (
        f"SELECT date((date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS d, "
        f"       SUM(CASE WHEN is_out = 1 THEN 1 ELSE 0 END) AS sent, "
        f"       SUM(CASE WHEN is_out = 0 THEN 1 ELSE 0 END) AS received "
        f"FROM messages WHERE is_service = 0 AND {base} GROUP BY d;"
    )
    rows: List[Dict[str, Any]] = []
    for r in conn.execute(q, p):
        if not isinstance(r[0], str):
            continue
        sent = int(r[1] or 0)
        recv = int(r[2] or 0)
        total = sent + recv
        if total <= 0:
            continue
        rows.append({"date": r[0], "sent": sent, "received": recv, "abs_diff": abs(sent - recv), "total": total})
    if not rows:
        return {"most_balanced_day": None, "most_one_sided_day": None}
    balanced = min(rows, key=lambda x: (int(x["abs_diff"]), -int(x["total"]), str(x["date"])))
    one_sided = max(rows, key=lambda x: (int(x["abs_diff"]), int(x["total"]), str(x["date"])))
    return {"most_balanced_day": balanced, "most_one_sided_day": one_sided}


def _night_insights(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> Dict[str, Any]:
    base, p = _period_where_clause(start_ts, end_ts)
    night_hours = {0, 1, 2, 3, 4, 5}
    hourly = _hourly_activity(conn, start_ts, end_ts)
    night_hour_rows = [h for h in hourly if int(h.get("hour", -1)) in night_hours]
    peak = max(night_hour_rows, key=lambda x: int(x.get("count", 0))) if night_hour_rows else None

    row = conn.execute(
        f"SELECT date((date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS d, COUNT(*) AS cnt "
        f"FROM messages WHERE is_service = 0 AND {base} "
        f"  AND CAST(strftime('%H', (date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) BETWEEN 0 AND 5 "
        f"GROUP BY d ORDER BY cnt DESC LIMIT 1;",
        p,
    ).fetchone()
    peak_date = {"date": row[0], "count": int(row[1] or 0)} if row and isinstance(row[0], str) else None

    # Last active hour before the usual night drop: choose the latest hour in 18..23
    # that still has at least half of the average evening activity.
    evening = [int(h.get("count", 0)) for h in hourly if 18 <= int(h.get("hour", -1)) <= 23]
    avg_evening = _safe_div(sum(evening), len(evening)) if evening else 0
    boundary = None
    for h in reversed(hourly):
        hour = int(h.get("hour", -1))
        count = int(h.get("count", 0))
        if 18 <= hour <= 23 and count >= avg_evening * 0.5:
            boundary = {"hour": hour, "count": count}
            break

    post_midnight = sum(int(h.get("count", 0)) for h in night_hour_rows)
    return {
        "night_peak_hour": {"hour": int(peak.get("hour", 0)), "count": int(peak.get("count", 0))} if peak else None,
        "post_midnight_messages": int(post_midnight),
        "most_night_date": peak_date,
        "sleep_boundary_hour": boundary,
    }


def _people_stats(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> Dict[str, Dict[str, Any]]:
    base, p = _period_where_clause(start_ts, end_ts)
    banned_params = banned_peer_ids()
    banned_placeholders = sql_placeholders(banned_params)
    sql = (
        "SELECT c.peer_from_id AS peer_from_id, "
        "       MAX(c.name) AS display_name, "
        "       COUNT(*) AS total_messages, "
        "       SUM(CASE WHEN m.is_out = 1 THEN 1 ELSE 0 END) AS sent_messages, "
        "       SUM(CASE WHEN m.is_out = 0 THEN 1 ELSE 0 END) AS received_messages, "
        "       MIN(m.date_ts) AS first_ts, "
        "       MAX(m.date_ts) AS last_ts, "
        f"       COUNT(DISTINCT date((m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch')) AS active_days, "
        f"       SUM(CASE WHEN CAST(strftime('%H', (m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) BETWEEN 0 AND 5 THEN 1 ELSE 0 END) AS night_messages, "
        f"       SUM(CASE WHEN CAST(strftime('%H', (m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) BETWEEN 6 AND 17 THEN 1 ELSE 0 END) AS day_messages "
        "FROM messages m JOIN chats c ON m.chat_pk = c.chat_pk "
        f"WHERE m.is_service = 0 AND c.peer_from_id IS NOT NULL AND TRIM(c.peer_from_id) != '' "
        f"  AND c.peer_from_id NOT IN ({banned_placeholders}) "
        f"  AND (c.name IS NULL OR (c.name NOT LIKE '%Saved Messages%' AND c.name NOT LIKE '%Избранное%')) "
        f"  AND {base} "
        "GROUP BY c.peer_from_id;"
    )
    out: Dict[str, Dict[str, Any]] = {}
    for row in conn.execute(sql, banned_params + p):
        peer = row[0]
        if not isinstance(peer, str) or not peer.strip():
            continue
        display_name = row[1] if isinstance(row[1], str) else ""
        total = int(row[2] or 0)
        sent = int(row[3] or 0)
        recv = int(row[4] or 0)
        first_ts = int(row[5] or 0)
        last_ts = int(row[6] or 0)
        active_days = int(row[7] or 0)
        night_msgs = int(row[8] or 0)
        day_msgs = int(row[9] or 0)
        time_span_seconds = max(0, last_ts - first_ts) if first_ts and last_ts else 0
        time_span_days = 0
        if first_ts > 0 and last_ts > 0 and last_ts >= first_ts:
            try:
                msk = _moscow_tzinfo()
                first_date = datetime.fromtimestamp(first_ts, tz=msk).date()
                last_date = datetime.fromtimestamp(last_ts, tz=msk).date()
                time_span_days = max(1, (last_date - first_date).days + 1)
            except Exception:
                time_span_days = max(0, int(time_span_seconds // 86400))
        out[peer] = {
            "peer_from_id": peer,
            "display_name": display_name,
            "total_messages": total,
            "sent_messages": sent,
            "received_messages": recv,
            "first_ts": first_ts,
            "last_ts": last_ts,
            "time_span_seconds": int(time_span_seconds),
            "time_span_days": int(time_span_days),
            "active_days": active_days,
            "night_messages": night_msgs,
            "day_messages": day_msgs,
            "mutuality_abs_diff": abs(sent - recv),
        }
    return out

def _compute_reply_times(conn: sqlite3.Connection, year_start_ts: int, year_end_ts: int) -> Dict[str, Any]:
    q = (
        "SELECT m.msg_pk, m.chat_pk, m.msg_id, m.date_ts, m.is_out, m.reply_to_msg_id, c.peer_from_id "
        "FROM messages m JOIN chats c ON m.chat_pk = c.chat_pk "
        "WHERE m.is_service = 0 AND c.peer_from_id IS NOT NULL "
        "ORDER BY m.chat_pk, m.date_ts, m.msg_pk;"
    )
    global_all: List[int] = []
    global_year: List[int] = []
    per_peer_all: Dict[str, List[int]] = defaultdict(list)
    per_peer_year: Dict[str, List[int]] = defaultdict(list)

    last_chat_pk: Optional[int] = None
    last_in_all: Optional[int] = None
    messages_by_id: Dict[str, Tuple[int, int]] = {}

    def add_reply_delta(peer_id: str, ts: int, delta: int) -> None:
        if delta <= 0:
            return
        global_all.append(delta)
        per_peer_all[peer_id].append(delta)
        if year_start_ts <= ts < year_end_ts:
            global_year.append(delta)
            per_peer_year[peer_id].append(delta)

    for row in conn.execute(q):
        if _CANCEL_EVENT.is_set():
            raise CancelledError()

        chat_pk = int(row[1])
        msg_id = row[2]
        ts = int(row[3] or 0)
        is_out = int(row[4] or 0)
        reply_to_msg_id = row[5]
        peer = row[6]
        peer_id = peer if isinstance(peer, str) else None

        if last_chat_pk is None or chat_pk != last_chat_pk:
            last_chat_pk = chat_pk
            last_in_all = None
            messages_by_id.clear()

        if ts <= 0 or not peer_id:
            continue
        if peer_id in BANNED_PEER_IDS:
            if msg_id is not None and ts > 0:
                messages_by_id[str(msg_id)] = (ts, is_out)
            continue

        if is_out == 0:
            last_in_all = ts
            if msg_id is not None:
                messages_by_id[str(msg_id)] = (ts, is_out)
            continue

        explicit_reply_used = False
        if reply_to_msg_id is not None:
            reply_target = messages_by_id.get(str(reply_to_msg_id))
            if reply_target is not None:
                replied_ts, replied_is_out = reply_target
                if replied_ts > 0 and replied_is_out == 0 and ts > replied_ts:
                    add_reply_delta(peer_id, ts, int(ts - replied_ts))
                    explicit_reply_used = True
                    last_in_all = None

        if not explicit_reply_used and last_in_all is not None and ts > last_in_all:
            d = ts - last_in_all
            if d <= MAX_INFERRED_REPLY_SECONDS:
                add_reply_delta(peer_id, ts, int(d))
            last_in_all = None

        if msg_id is not None:
            messages_by_id[str(msg_id)] = (ts, is_out)

    per_peer_all_med: Dict[str, int] = {k: _median_int(v) for k, v in per_peer_all.items() if v}
    per_peer_year_med: Dict[str, int] = {k: _median_int(v) for k, v in per_peer_year.items() if v}

    return {
        "global_median_all_time_seconds": _median_int(global_all),
        "global_median_year_seconds": _median_int(global_year),
        "per_peer_median_all_time_seconds": per_peer_all_med,
        "per_peer_median_year_seconds": per_peer_year_med,
        "per_peer_samples_all_time": {k: len(v) for k, v in per_peer_all.items()},
        "per_peer_samples_year": {k: len(v) for k, v in per_peer_year.items()},
        "global_samples_all_time": len(global_all),
        "global_samples_year": len(global_year),
    }


def _longest_silence_gap(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> Dict[str, Any]:
    base, p = _period_where_clause(start_ts, end_ts)

    banned_pks = set()
    banned_params = banned_peer_ids()
    banned_placeholders = sql_placeholders(banned_params)
    ban_q = """
        SELECT chat_pk FROM chats
        WHERE peer_from_id IN ({banned_placeholders})
           OR name LIKE '%Saved Messages%'
           OR name LIKE '%Избранное%'
    """.format(banned_placeholders=banned_placeholders)
    for r in conn.execute(ban_q, banned_params):
        banned_pks.add(r[0])

    q = f"SELECT chat_pk, date_ts FROM messages WHERE is_service = 0 AND {base} ORDER BY chat_pk, date_ts;"
    max_gap = 0
    max_chat_pk: Optional[int] = None
    max_prev_ts: Optional[int] = None
    max_cur_ts: Optional[int] = None
    gaps: List[int] = []

    last_chat: Optional[int] = None
    prev_ts: Optional[int] = None

    for row in conn.execute(q, p):
        if _CANCEL_EVENT.is_set():
            raise CancelledError()
        chat_pk = int(row[0])
        if chat_pk in banned_pks:
            continue
        ts = int(row[1] or 0)
        if ts <= 0:
            continue
        if last_chat is None or chat_pk != last_chat:
            last_chat = chat_pk
            prev_ts = ts
            continue
        if prev_ts is not None and ts > prev_ts:
            gap = ts - prev_ts
            gaps.append(int(gap))
            if gap > max_gap:
                max_gap = gap
                max_chat_pk = chat_pk
                max_prev_ts = prev_ts
                max_cur_ts = ts
        prev_ts = ts

    chat_name = None
    peer_id = None
    if max_chat_pk is not None:
        try:
            r = conn.execute("SELECT name, peer_from_id FROM chats WHERE chat_pk = ?;", (max_chat_pk,)).fetchone()
            if r:
                chat_name = r[0] if isinstance(r[0], str) else None
                peer_id = r[1] if isinstance(r[1], str) else None
        except Exception:
            pass

    return {
        "gap_seconds": int(max_gap),
        "chat_pk": max_chat_pk,
        "chat_name": chat_name,
        "peer_from_id": peer_id,
        "from_ts": max_prev_ts,
        "to_ts": max_cur_ts,
        "from_datetime": _ts_to_msk_datetime(max_prev_ts),
        "to_datetime": _ts_to_msk_datetime(max_cur_ts),
        "calendar_days": int(max(0, (max_gap + 86399) // 86400)) if max_gap else 0,
        "median_gap_seconds": _median_int(gaps),
        "gap_vs_median_ratio": float(_safe_div(max_gap, _median_int(gaps))) if gaps else 0.0,
    }

def _longest_streak_days(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> Dict[str, Any]:
    base, p = _period_where_clause(start_ts, end_ts)
    q = (
        f"SELECT DISTINCT date((date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS d "
        f"FROM messages WHERE is_service = 0 AND {base} ORDER BY d;"
    )
    dates: List[str] = [r[0] for r in conn.execute(q, p) if r and isinstance(r[0], str)]
    if not dates:
        return {"length_days": 0, "start_date": None, "end_date": None}

    def _parse(d: str) -> datetime:
        return datetime.strptime(d, "%Y-%m-%d")

    best_len = 1
    best_start = dates[0]
    best_end = dates[0]
    streaks: List[Dict[str, Any]] = []

    cur_len = 1
    cur_start = dates[0]
    prev = _parse(dates[0])

    def _push_streak(length: int, start: str, end: str) -> None:
        streaks.append({"length_days": int(length), "start_date": start, "end_date": end})

    for d in dates[1:]:
        cur = _parse(d)
        if (cur - prev).days == 1:
            cur_len += 1
        else:
            _push_streak(cur_len, cur_start, prev.strftime("%Y-%m-%d"))
            if cur_len > best_len:
                best_len = cur_len
                best_start = cur_start
                best_end = prev.strftime("%Y-%m-%d")
            cur_len = 1
            cur_start = d
        prev = cur

    if cur_len > best_len:
        best_len = cur_len
        best_start = cur_start
        best_end = prev.strftime("%Y-%m-%d")
    _push_streak(cur_len, cur_start, prev.strftime("%Y-%m-%d"))

    streaks.sort(key=lambda x: int(x.get("length_days", 0) or 0), reverse=True)
    runner_up = streaks[1] if len(streaks) > 1 else None
    return {
        "length_days": int(best_len),
        "start_date": best_start,
        "end_date": best_end,
        "runner_up": runner_up,
    }


def _longest_person_streak(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> Optional[Dict[str, Any]]:
    base, p = _period_where_clause(start_ts, end_ts)

    self_from_id = meta_get(conn, "self_from_id") or "UNKNOWN_SELF"
    banned_params = banned_peer_ids()
    banned_placeholders = sql_placeholders(banned_params)

    q = (
        f"SELECT c.peer_from_id, "
        f"       MAX(c.name) AS display_name, "
        f"       date((m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS d "
        f"FROM messages m JOIN chats c ON m.chat_pk = c.chat_pk "
        f"WHERE m.is_service = 0 "
        f"  AND c.peer_from_id IS NOT NULL "
        f"  AND TRIM(c.peer_from_id) != '' "
        f"  AND c.peer_from_id != ? "
        f"  AND c.peer_from_id NOT IN ({banned_placeholders}) "
        f"  AND (c.name IS NULL OR (c.name NOT LIKE '%Saved Messages%' AND c.name NOT LIKE '%Избранное%')) "
        f"  AND {base} "
        f"GROUP BY c.peer_from_id, d "
        f"ORDER BY c.peer_from_id, d;"
    )

    params = (self_from_id,) + banned_params + p

    best_len = 0
    best_start = None
    best_end = None
    best_peer = None
    best_name = None

    current_peer = None
    current_name = None
    current_len = 0
    current_start = None
    prev_date_obj = None

    def _parse(d_str: str) -> datetime:
        return datetime.strptime(d_str, "%Y-%m-%d")

    for row in conn.execute(q, params):
        if _CANCEL_EVENT.is_set():
            raise CancelledError()

        peer_id = row[0]
        display_name = row[1] if isinstance(row[1], str) else ""
        d_str = row[2]

        if not isinstance(d_str, str):
            continue

        d_obj = _parse(d_str)

        if peer_id != current_peer:
            if current_len > best_len:
                best_len = current_len
                best_start = current_start
                best_end = prev_date_obj.strftime("%Y-%m-%d") if prev_date_obj else current_start
                best_peer = current_peer
                best_name = current_name

            current_peer = peer_id
            current_name = display_name
            current_len = 1
            current_start = d_str
            prev_date_obj = d_obj
        else:
            if prev_date_obj and (d_obj - prev_date_obj).days == 1:
                current_len += 1
            else:
                if current_len > best_len:
                    best_len = current_len
                    best_start = current_start
                    best_end = prev_date_obj.strftime("%Y-%m-%d")
                    best_peer = current_peer
                    best_name = current_name

                current_len = 1
                current_start = d_str

            prev_date_obj = d_obj

    if current_len > best_len:
        best_len = current_len
        best_start = current_start
        best_end = prev_date_obj.strftime("%Y-%m-%d") if prev_date_obj else current_start
        best_peer = current_peer
        best_name = current_name

    if best_len <= 0 or not best_peer:
        return None

    return {
        "length_days": int(best_len),
        "start_date": best_start,
        "end_date": best_end,
        "peer_from_id": best_peer,
        "display_name": best_name,
    }

def _text_metrics_sent(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> Dict[str, Any]:
    base, p = _period_where_clause(start_ts, end_ts)
    q = (
        "SELECT m.text, m.sticker_emoji, m.msg_id, m.date_ts, c.name, c.peer_from_id "
        "FROM messages m JOIN chats c ON m.chat_pk = c.chat_pk "
        f"WHERE m.is_service = 0 AND m.is_out = 1 AND {base} "
        "ORDER BY m.date_ts;"
    )

    total_len = 0
    count_len = 0

    longest_len = 0
    longest: Dict[str, Any] = {
        "length_chars": 0,
        "snippet": "",
        "peer_from_id": None,
        "display_name": None,
        "msg_id": None,
        "date_ts": None,
    }
    top_longest: List[Dict[str, Any]] = []

    def _push_top_longest(item: Dict[str, Any]) -> None:
        top_longest.append(item)
        top_longest.sort(
            key=lambda x: (
                int(x.get("length_chars", 0) or 0),
                int(x.get("date_ts", 0) or 0),
            ),
            reverse=True,
        )
        if len(top_longest) > 5:
            del top_longest[5:]

    word_counter: Counter[str] = Counter()
    emoji_counter: Counter[str] = Counter()
    total_words = 0
    messages_with_emoji = 0
    emoji_streak = 0
    current_emoji_streak = 0

    fetch = conn.execute(q, p)
    while True:
        if _CANCEL_EVENT.is_set():
            raise CancelledError()
        rows = fetch.fetchmany(2000)
        if not rows:
            break
        for row in rows:
            if _CANCEL_EVENT.is_set():
                raise CancelledError()
            text = row[0] if isinstance(row[0], str) else ""
            sticker_emoji = row[1] if isinstance(row[1], str) else None
            msg_id = row[2] if row[2] is not None else None
            date_ts = int(row[3] or 0)
            chat_name = row[4] if isinstance(row[4], str) else None
            peer_id = row[5] if isinstance(row[5], str) else None

            cleaned = clean_text_for_stats(text)
            had_emoji = False

            if cleaned:
                l = len(cleaned)
                total_len += l
                count_len += 1

                msg_item = {
                    "length_chars": int(l),
                    "snippet": (cleaned[:320] + "…") if len(cleaned) > 320 else cleaned,
                    "peer_from_id": peer_id,
                    "display_name": chat_name,
                    "msg_id": str(msg_id) if msg_id is not None else None,
                    "date_ts": date_ts if date_ts > 0 else None,
                }

                if l > longest_len:
                    longest_len = l
                    longest = dict(msg_item)

                _push_top_longest(msg_item)

                toks = tokenize_words(cleaned)
                if toks:
                    word_counter.update(toks)
                    total_words += len(toks)

                emojis = extract_emojis(cleaned)
                if emojis:
                    emoji_counter.update(emojis)
                    had_emoji = True

            if sticker_emoji:
                emoji_counter.update([sticker_emoji])
                had_emoji = True

            if had_emoji:
                messages_with_emoji += 1
                current_emoji_streak += 1
                emoji_streak = max(emoji_streak, current_emoji_streak)
            else:
                current_emoji_streak = 0

    top_words = [{"word": w, "count": int(c)} for w, c in word_counter.most_common(50)]
    word_cloud = {w: int(c) for w, c in word_counter.most_common(200)}
    top_emojis = [{"emoji": e, "count": int(c)} for e, c in emoji_counter.most_common(50)]

    avg_len = int(round(total_len / count_len)) if count_len > 0 else 0

    return {
        "average_msg_length_sent_chars": int(avg_len),
        "average_msg_length_sent_samples": int(count_len),
        "longest_message_sent": longest,
        "top_longest_messages_sent": top_longest,
        "top_words": top_words,
        "word_cloud": word_cloud,
        "top_emojis": top_emojis,
        "total_words_sent": int(total_words),
        "unique_words_sent": int(len(word_counter)),
        "total_emojis_sent": int(sum(emoji_counter.values())),
        "messages_with_emoji_count": int(messages_with_emoji),
        "emoji_streak_max_messages": int(emoji_streak),
    }

def _media_counts(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> Dict[str, int]:
    base, p = _period_where_clause(start_ts, end_ts)
    q = f"SELECT media_type, COUNT(*) FROM messages WHERE is_service = 0 AND media_type IS NOT NULL AND TRIM(media_type) != '' AND {base} GROUP BY media_type;"
    buckets = {"photo": 0, "video": 0, "voice": 0, "sticker": 0, "gif": 0, "file": 0, "other": 0}
    for row in conn.execute(q, p):
        mt = row[0] if isinstance(row[0], str) else None
        cnt = int(row[1] or 0)
        b = _normalize_media_bucket(mt)
        if b is None:
            continue
        buckets[b] = int(buckets.get(b, 0) + cnt)
    return buckets


def _media_insights(conn: sqlite3.Connection, start_ts: int, end_ts: int, media: Dict[str, int], total_messages: int) -> Dict[str, Any]:
    base, p = _period_where_clause(start_ts, end_ts)
    media_total = int(sum(int(v or 0) for v in media.values()))
    top_key = None
    top_count = 0
    for key, value in media.items():
        iv = int(value or 0)
        if iv > top_count:
            top_key = key
            top_count = iv

    row = conn.execute(
        f"SELECT strftime('%Y-%m', (date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS m, COUNT(*) AS cnt "
        f"FROM messages WHERE is_service = 0 AND media_type IS NOT NULL AND TRIM(media_type) != '' AND {base} "
        f"GROUP BY m ORDER BY cnt DESC LIMIT 1;",
        p,
    ).fetchone()

    media_only = conn.execute(
        f"SELECT COUNT(*) FROM messages WHERE is_service = 0 "
        f"AND media_type IS NOT NULL AND TRIM(media_type) != '' "
        f"AND (text IS NULL OR TRIM(text) = '') AND {base};",
        p,
    ).fetchone()

    sticker_count = int(media.get("sticker", 0) or 0)
    return {
        "media_total": int(media_total),
        "media_per_100_messages": float(_safe_div(media_total * 100, total_messages)),
        "top_media_type": {"type": top_key, "count": int(top_count)} if top_key else None,
        "most_media_month": {"value": row[0], "count": int(row[1] or 0)} if row and isinstance(row[0], str) else None,
        "sticker_ratio": float(_safe_div(sticker_count, media_total)),
        "media_only_messages": int(media_only[0] or 0) if media_only else 0,
    }


def _deleted_messages_count(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> int:
    base, p = _period_where_clause(start_ts, end_ts)
    patterns = [
        "%deleted%",
        "%удал%",
        "%сообщение удал%",
        "%message was deleted%",
    ]
    cond = " OR ".join(["LOWER(text) LIKE ?" for _ in patterns])
    sql = f"SELECT COUNT(*) FROM messages WHERE is_service = 1 AND text IS NOT NULL AND ({cond}) AND {base};"
    row = conn.execute(sql, tuple(x.lower() for x in patterns) + p).fetchone()
    return int(row[0] or 0) if row else 0


def _pick_person_by_metric(people: Dict[str, Dict[str, Any]], key: str, reverse: bool = True) -> Optional[Dict[str, Any]]:
    if not people:
        return None
    lst = sorted(people.values(), key=lambda x: (int(x.get(key, 0) or 0), int(x.get("total_messages", 0) or 0)), reverse=reverse)
    return lst[0] if lst else None


def _pick_person_by_time_profile(people: Dict[str, Dict[str, Any]], count_key: str) -> Optional[Dict[str, Any]]:
    candidates: List[Tuple[float, int, int, Dict[str, Any]]] = []
    for person in people.values():
        total = int(person.get("total_messages", 0) or 0)
        count = int(person.get(count_key, 0) or 0)
        if total < 20 or count <= 0:
            continue
        ratio = float(_safe_div(count, total))
        score = float(count) * ratio
        enriched = dict(person)
        enriched["selection_ratio"] = ratio
        enriched["selection_score"] = score
        candidates.append((score, count, total, enriched))

    if not candidates:
        return _pick_person_by_metric(people, count_key, reverse=True)

    candidates.sort(key=lambda x: (x[0], x[1], x[2]), reverse=True)
    return candidates[0][3]


def _peer_activity_insights(conn: sqlite3.Connection, start_ts: int, end_ts: int, peer_id: Optional[str]) -> Dict[str, Any]:
    if not peer_id:
        return {}
    base, p = _period_where_clause(start_ts, end_ts)
    params = (peer_id,) + p

    peak_day = conn.execute(
        f"SELECT date((m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS d, COUNT(*) AS cnt "
        f"FROM messages m JOIN chats c ON m.chat_pk = c.chat_pk "
        f"WHERE c.peer_from_id = ? AND m.is_service = 0 AND {base} "
        f"GROUP BY d ORDER BY cnt DESC LIMIT 1;",
        params,
    ).fetchone()
    peak_month = conn.execute(
        f"SELECT strftime('%Y-%m', (m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS mth, COUNT(*) AS cnt "
        f"FROM messages m JOIN chats c ON m.chat_pk = c.chat_pk "
        f"WHERE c.peer_from_id = ? AND m.is_service = 0 AND {base} "
        f"GROUP BY mth ORDER BY cnt DESC LIMIT 1;",
        params,
    ).fetchone()
    peak_hour = conn.execute(
        f"SELECT CAST(strftime('%H', (m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) AS h, COUNT(*) AS cnt "
        f"FROM messages m JOIN chats c ON m.chat_pk = c.chat_pk "
        f"WHERE c.peer_from_id = ? AND m.is_service = 0 AND {base} "
        f"GROUP BY h ORDER BY cnt DESC LIMIT 1;",
        params,
    ).fetchone()

    day_peak_hour = conn.execute(
        f"SELECT CAST(strftime('%H', (m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) AS h, COUNT(*) AS cnt "
        f"FROM messages m JOIN chats c ON m.chat_pk = c.chat_pk "
        f"WHERE c.peer_from_id = ? AND m.is_service = 0 AND {base} "
        f"  AND CAST(strftime('%H', (m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) BETWEEN 6 AND 17 "
        f"GROUP BY h ORDER BY cnt DESC LIMIT 1;",
        params,
    ).fetchone()
    night_peak_hour = conn.execute(
        f"SELECT CAST(strftime('%H', (m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) AS h, COUNT(*) AS cnt "
        f"FROM messages m JOIN chats c ON m.chat_pk = c.chat_pk "
        f"WHERE c.peer_from_id = ? AND m.is_service = 0 AND {base} "
        f"  AND CAST(strftime('%H', (m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) BETWEEN 0 AND 5 "
        f"GROUP BY h ORDER BY cnt DESC LIMIT 1;",
        params,
    ).fetchone()

    day_peak_date = conn.execute(
        f"SELECT date((m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS d, COUNT(*) AS cnt "
        f"FROM messages m JOIN chats c ON m.chat_pk = c.chat_pk "
        f"WHERE c.peer_from_id = ? AND m.is_service = 0 AND {base} "
        f"  AND CAST(strftime('%H', (m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) BETWEEN 6 AND 17 "
        f"GROUP BY d ORDER BY cnt DESC LIMIT 1;",
        params,
    ).fetchone()
    night_peak_date = conn.execute(
        f"SELECT date((m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS d, COUNT(*) AS cnt "
        f"FROM messages m JOIN chats c ON m.chat_pk = c.chat_pk "
        f"WHERE c.peer_from_id = ? AND m.is_service = 0 AND {base} "
        f"  AND CAST(strftime('%H', (m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) BETWEEN 0 AND 5 "
        f"GROUP BY d ORDER BY cnt DESC LIMIT 1;",
        params,
    ).fetchone()

    day_week = conn.execute(
        f"SELECT "
        f"SUM(CASE WHEN CAST(strftime('%w', (m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) BETWEEN 1 AND 5 THEN 1 ELSE 0 END), "
        f"SUM(CASE WHEN CAST(strftime('%w', (m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) IN (0, 6) THEN 1 ELSE 0 END) "
        f"FROM messages m JOIN chats c ON m.chat_pk = c.chat_pk "
        f"WHERE c.peer_from_id = ? AND m.is_service = 0 AND {base} "
        f"  AND CAST(strftime('%H', (m.date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) BETWEEN 6 AND 17;",
        params,
    ).fetchone()

    def point(row: Any, key: str) -> Optional[Dict[str, Any]]:
        if not row:
            return None
        return {key: row[0], "count": int(row[1] or 0)}

    return {
        "peak_day": point(peak_day, "date"),
        "peak_month": point(peak_month, "value"),
        "peak_hour": point(peak_hour, "hour"),
        "day_peak_hour": point(day_peak_hour, "hour"),
        "night_peak_hour": point(night_peak_hour, "hour"),
        "day_peak_date": point(day_peak_date, "date"),
        "night_peak_date": point(night_peak_date, "date"),
        "day_weekday_messages": int(day_week[0] or 0) if day_week else 0,
        "day_weekend_messages": int(day_week[1] or 0) if day_week else 0,
    }


def _person_period_analytics(
    conn: sqlite3.Connection,
    start_ts: int,
    end_ts: int,
    peer_id: str,
    base_stats: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if not base_stats:
        return None

    total = int(base_stats.get("total_messages", 0) or 0)
    if total <= 0:
        return None

    sent = int(base_stats.get("sent_messages", 0) or 0)
    received = int(base_stats.get("received_messages", 0) or 0)
    night_messages = int(base_stats.get("night_messages", 0) or 0)
    day_messages = int(base_stats.get("day_messages", 0) or 0)

    base, p = _period_where_clause(start_ts, end_ts)
    q = (
        "SELECT m.chat_pk, m.date_ts, m.is_out, m.text, m.sticker_emoji, m.media_type, m.msg_id, m.reply_to_msg_id, c.name "
        "FROM messages m JOIN chats c ON m.chat_pk = c.chat_pk "
        f"WHERE c.peer_from_id = ? AND m.is_service = 0 AND {base} "
        "ORDER BY m.chat_pk, m.date_ts, m.msg_pk;"
    )

    month_counter: Counter[str] = Counter()
    hourly_counts = [0] * 24
    media_counts: Dict[str, int] = {
        "photo": 0,
        "video": 0,
        "voice": 0,
        "sticker": 0,
        "gif": 0,
        "file": 0,
        "other": 0,
    }
    word_counter: Counter[str] = Counter()
    emoji_counter: Counter[str] = Counter()
    top_longest: List[Dict[str, Any]] = []
    first_by_day: Dict[str, Tuple[int, int]] = {}
    your_reply_seconds: List[int] = []
    their_reply_seconds: List[int] = []

    total_words = 0
    messages_with_emoji = 0
    display_name = str(base_stats.get("display_name") or "")
    last_chat_pk: Optional[int] = None
    last_ts: Optional[int] = None
    last_is_out: Optional[int] = None
    messages_by_id: Dict[Tuple[int, str], Tuple[int, int]] = {}
    msk = _moscow_tzinfo()

    def push_longest(item: Dict[str, Any]) -> None:
        top_longest.append(item)
        top_longest.sort(
            key=lambda x: (
                int(x.get("length_chars", 0) or 0),
                int(x.get("date_ts", 0) or 0),
            ),
            reverse=True,
        )
        if len(top_longest) > 3:
            del top_longest[3:]

    fetch = conn.execute(q, (peer_id,) + p)
    while True:
        if _CANCEL_EVENT.is_set():
            raise CancelledError()
        rows = fetch.fetchmany(2000)
        if not rows:
            break

        for row in rows:
            if _CANCEL_EVENT.is_set():
                raise CancelledError()

            chat_pk = int(row[0])
            ts = int(row[1] or 0)
            is_out = int(row[2] or 0)
            text = row[3] if isinstance(row[3], str) else ""
            sticker_emoji = row[4] if isinstance(row[4], str) else None
            media_type = row[5] if isinstance(row[5], str) else None
            msg_id = row[6] if row[6] is not None else None
            reply_to_msg_id = row[7] if row[7] is not None else None
            chat_name = row[8] if isinstance(row[8], str) else None

            if chat_name and not display_name:
                display_name = chat_name

            if ts > 0:
                try:
                    dt = datetime.fromtimestamp(ts, tz=msk)
                    month_counter[dt.strftime("%Y-%m")] += 1
                    if 0 <= dt.hour <= 23:
                        hourly_counts[dt.hour] += 1
                    day_key = dt.strftime("%Y-%m-%d")
                    prev_first = first_by_day.get(day_key)
                    if prev_first is None or ts < prev_first[0]:
                        first_by_day[day_key] = (ts, is_out)
                except Exception:
                    pass

            explicit_reply_used = False
            if last_chat_pk is None or chat_pk != last_chat_pk:
                last_chat_pk = chat_pk
                last_ts = None
                last_is_out = None
                messages_by_id.clear()
            else:
                reply_key = (chat_pk, str(reply_to_msg_id)) if reply_to_msg_id is not None else None
                reply_target = messages_by_id.get(reply_key) if reply_key is not None else None
                if reply_target is not None:
                    target_ts, target_is_out = reply_target
                    if target_ts > 0 and ts > target_ts and target_is_out != is_out:
                        delta = int(ts - target_ts)
                        if target_is_out == 0 and is_out == 1:
                            your_reply_seconds.append(delta)
                        elif target_is_out == 1 and is_out == 0:
                            their_reply_seconds.append(delta)
                        explicit_reply_used = True

                if (
                    not explicit_reply_used
                    and last_ts is not None
                    and ts > last_ts
                    and last_is_out is not None
                    and is_out != last_is_out
                ):
                    delta = int(ts - last_ts)
                    if delta <= MAX_INFERRED_REPLY_SECONDS:
                        if last_is_out == 0 and is_out == 1:
                            your_reply_seconds.append(delta)
                        elif last_is_out == 1 and is_out == 0:
                            their_reply_seconds.append(delta)

            if msg_id is not None and ts > 0:
                messages_by_id[(chat_pk, str(msg_id))] = (ts, is_out)
            last_ts = ts if ts > 0 else last_ts
            last_is_out = is_out

            bucket = _normalize_media_bucket(media_type)
            if bucket:
                media_counts[bucket] = int(media_counts.get(bucket, 0) or 0) + 1

            cleaned = clean_text_for_stats(text)
            had_emoji = False
            if cleaned:
                length = len(cleaned)
                if length > 0:
                    push_longest(
                        {
                            "length_chars": int(length),
                            "snippet": (cleaned[:220] + "…") if len(cleaned) > 220 else cleaned,
                            "direction": "out" if is_out == 1 else "in",
                            "msg_id": str(msg_id) if msg_id is not None else None,
                            "date_ts": ts if ts > 0 else None,
                        }
                    )

                tokens = tokenize_words(cleaned)
                if tokens:
                    word_counter.update(tokens)
                    total_words += len(tokens)

                emojis = extract_emojis(cleaned)
                if emojis:
                    emoji_counter.update(emojis)
                    had_emoji = True

            if sticker_emoji:
                emoji_counter.update([sticker_emoji])
                had_emoji = True

            if had_emoji:
                messages_with_emoji += 1

    month_activity = [{"value": k, "count": int(v)} for k, v in sorted(month_counter.items())]
    peak_month = max(month_activity, key=lambda x: (int(x["count"]), str(x["value"]))) if month_activity else None
    hourly_activity = [{"hour": h, "count": int(hourly_counts[h])} for h in range(24)]
    peak_hour = max(hourly_activity, key=lambda x: (int(x["count"]), -int(x["hour"]))) if hourly_activity else None

    days_started_by_you = sum(1 for _, is_out in first_by_day.values() if int(is_out) == 1)
    days_started_by_them = sum(1 for _, is_out in first_by_day.values() if int(is_out) == 0)
    initiated_days = days_started_by_you + days_started_by_them

    return {
        "peer_from_id": peer_id,
        "display_name": display_name,
        "total_messages": total,
        "sent_messages": sent,
        "received_messages": received,
        "sent_ratio": float(_safe_div(sent, total)),
        "received_ratio": float(_safe_div(received, total)),
        "mutuality_abs_diff": int(abs(sent - received)),
        "mutuality_imbalance_ratio": float(_safe_div(abs(sent - received), total)),
        "first_ts": int(base_stats.get("first_ts", 0) or 0) or None,
        "last_ts": int(base_stats.get("last_ts", 0) or 0) or None,
        "first_date": _ts_to_msk_date(int(base_stats.get("first_ts", 0) or 0)),
        "last_date": _ts_to_msk_date(int(base_stats.get("last_ts", 0) or 0)),
        "time_span_days": int(base_stats.get("time_span_days", 0) or 0),
        "active_days": int(base_stats.get("active_days", 0) or 0),
        "messages_per_active_day": float(_safe_div(total, int(base_stats.get("active_days", 0) or 0))),
        "night_messages": night_messages,
        "day_messages": day_messages,
        "night_ratio": float(_safe_div(night_messages, total)),
        "day_ratio": float(_safe_div(day_messages, total)),
        "month_activity": month_activity,
        "peak_month": peak_month,
        "hourly_activity": hourly_activity,
        "peak_hour": peak_hour,
        "media_counts": media_counts,
        "media_total": int(sum(media_counts.values())),
        "top_words": [{"word": w, "count": int(c)} for w, c in word_counter.most_common(20)],
        "top_emojis": [{"emoji": e, "count": int(c)} for e, c in emoji_counter.most_common(20)],
        "total_words": int(total_words),
        "unique_words": int(len(word_counter)),
        "total_emojis": int(sum(emoji_counter.values())),
        "messages_with_emoji_count": int(messages_with_emoji),
        "top_longest_messages": top_longest,
        "longest_message": top_longest[0] if top_longest else None,
        "days_started_by_you": int(days_started_by_you),
        "days_started_by_them": int(days_started_by_them),
        "initiated_days": int(initiated_days),
        "you_initiated_ratio": float(_safe_div(days_started_by_you, initiated_days)),
        "your_median_reply_seconds": int(_median_int(your_reply_seconds)),
        "their_median_reply_seconds": int(_median_int(their_reply_seconds)),
        "your_reply_samples": int(len(your_reply_seconds)),
        "their_reply_samples": int(len(their_reply_seconds)),
        "median_reply_time_to_others_seconds": int(base_stats.get("median_reply_time_to_others_seconds", 0) or 0),
        "reply_samples": int(base_stats.get("reply_samples", 0) or 0),
    }


def _people_analytics(
    conn: sqlite3.Connection,
    people_all: Dict[str, Dict[str, Any]],
    people_year: Dict[str, Dict[str, Any]],
    year_start_ts: int,
    year_end_ts: int,
) -> List[Dict[str, Any]]:
    peers = sorted(
        set(people_all.keys()) | set(people_year.keys()),
        key=lambda peer: (
            int((people_all.get(peer) or {}).get("total_messages", 0) or 0),
            int((people_year.get(peer) or {}).get("total_messages", 0) or 0),
            str((people_all.get(peer) or people_year.get(peer) or {}).get("display_name") or peer),
        ),
        reverse=True,
    )[:PERSON_ANALYTICS_LIMIT]

    out: List[Dict[str, Any]] = []
    for peer_id in peers:
        if _CANCEL_EVENT.is_set():
            raise CancelledError()
        if peer_id in BANNED_PEER_IDS:
            continue

        pa = people_all.get(peer_id)
        py = people_year.get(peer_id)
        display_name = str((py or pa or {}).get("display_name") or peer_id)
        periods = {
            "all_time": _person_period_analytics(conn, 0, 2**62, peer_id, pa),
            "year": _person_period_analytics(conn, year_start_ts, year_end_ts, peer_id, py),
        }
        out.append(
            {
                "peer_from_id": peer_id,
                "display_name": display_name,
                "periods": periods,
            }
        )

    return out


def _top_10_people_by_messages(people: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    items: List[Tuple[int, Dict[str, Any]]] = []

    for it in people.values():
        total = int(it.get("total_messages", 0) or 0)
        if total <= 0:
            continue
        items.append((total, it))

    items.sort(key=lambda x: x[0], reverse=True)

    out: List[Dict[str, Any]] = []
    top_total = items[0][0] if items else 0
    second_total = items[1][0] if len(items) > 1 else 0
    for idx, (total, it) in enumerate(items[:10]):
        active_days = int(it.get("active_days", 0) or 0)
        out.append(
            {
                "peer_from_id": it.get("peer_from_id"),
                "display_name": it.get("display_name"),
                "total_messages": total,
                "sent_messages": int(it.get("sent_messages", 0) or 0),
                "received_messages": int(it.get("received_messages", 0) or 0),
                "active_days": active_days,
                "messages_per_active_day": float(_safe_div(total, active_days)),
                "first_ts": it.get("first_ts"),
                "last_ts": it.get("last_ts"),
                "rank": idx + 1,
                "lead_over_next_messages": int(max(0, top_total - second_total)) if idx == 0 else 0,
            }
        )

    return out


def _top_10_people_by_time_span(people: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    lst = sorted(
        people.values(),
        key=lambda x: (
            int(x.get("time_span_days", 0) or 0),
            int(x.get("time_span_seconds", 0) or 0),
            int(x.get("total_messages", 0) or 0),
        ),
        reverse=True,
    )
    out: List[Dict[str, Any]] = []
    for it in lst[:10]:
        out.append(
            {
                "peer_from_id": it.get("peer_from_id"),
                "display_name": it.get("display_name"),
                "time_span_seconds": int(it.get("time_span_seconds", 0) or 0),
                "span_days": int(it.get("time_span_days", 0) or 0),
                "time_span_days": int(it.get("time_span_days", 0) or 0),
                "first_ts": it.get("first_ts"),
                "last_ts": it.get("last_ts"),
                "total_messages": int(it.get("total_messages", 0) or 0),
            }
        )
    return out


def _top_10_people_by_mutuality(people: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Mutuality = minimal imbalance |sent-recv| / total,
    BUT only for very large conversations: total_messages >= 5000.
    """
    rows: List[Dict[str, Any]] = []

    for it in people.values():
        if not isinstance(it, dict):
            continue

        sent = int(it.get("sent_messages") or 0)
        recv = int(it.get("received_messages") or 0)
        total = int(it.get("total_messages") or (sent + recv) or 0)

        if total < MUTUALITY_MIN_MESSAGES:
            continue

        abs_diff = abs(sent - recv)
        ratio = _safe_div(abs_diff, total)

        peer_id = it.get("peer_from_id")
        peer_key = str(peer_id) if peer_id is not None else ""

        rows.append(
            {
                "peer_from_id": peer_key,
                "display_name": it.get("display_name"),
                "sent_messages": sent,
                "received_messages": recv,
                "total_messages": total,
                "abs_diff": abs_diff,
                "imbalance_ratio": float(ratio),
                "symmetry_percent": float(max(0.0, 1.0 - ratio) * 100.0),
                "active_days": int(it.get("active_days", 0) or 0),
                "minimum_messages_required": MUTUALITY_MIN_MESSAGES,
            }
        )

    rows.sort(key=lambda r: (r["imbalance_ratio"], -r["total_messages"], r["peer_from_id"]))
    return rows[:10]


CONVERSATION_INSIGHT_KEYS: Tuple[str, ...] = (
    "main_person",
    "stable_dialog",
    "comeback",
    "closer_dialog",
    "faded_dialog",
    "night_companion",
    "day_anchor",
    "alive_dialog",
    "longest_live_session",
    "reply_rhythm",
    "mutual_dialog",
    "contact_initiator",
    "silence_restarter",
    "media_bond",
)

CONFIDENCE_EXACT = "exact"
CONFIDENCE_BEHAVIORAL = "behavioral"
CONFIDENCE_HEURISTIC = "heuristic"

SESSION_GAP_SECONDS = 3 * 60 * 60
SILENCE_RESTART_SECONDS = 7 * 24 * 60 * 60
MUTUALITY_MIN_MESSAGES = 5000


def _conversation_thresholds(label: str) -> Dict[str, int]:
    if label == "year":
        return {
            "min_person_total": 180,
            "min_major_total": 400,
            "min_stable_total": 420,
            "min_stable_months": 6,
            "min_active_days": 10,
            "comeback_gap_days": 60,
            "comeback_before_messages": 300,
            "comeback_after_messages": 500,
            "comeback_after_active_days": 10,
            "trend_baseline_messages": 60,
            "trend_delta_messages": 240,
            "reply_samples": 3,
            "initiative_days": 6,
            "media_events": 120,
            "session_messages": 60,
            "mutual_min_total": MUTUALITY_MIN_MESSAGES,
        }
    return {
        "min_person_total": 260,
        "min_major_total": 500,
        "min_stable_total": 520,
        "min_stable_months": 5,
        "min_active_days": 12,
        "comeback_gap_days": 90,
        "comeback_before_messages": 300,
        "comeback_after_messages": 550,
        "comeback_after_active_days": 12,
        "trend_baseline_messages": 80,
        "trend_delta_messages": 300,
        "reply_samples": 3,
        "initiative_days": 8,
        "media_events": 140,
        "session_messages": 70,
        "mutual_min_total": MUTUALITY_MIN_MESSAGES,
    }


def _insight_title(kind: str, label: str) -> str:
    period = "года" if label == "year" else "за все время"
    titles = {
        "main_person": f"Главный человек {period}",
        "stable_dialog": f"Самый стабильный диалог {period}",
        "comeback": f"Камбэк {period}",
        "closer_dialog": "Диалог, который стал ближе",
        "faded_dialog": "Диалог, который затих",
        "night_companion": "Ночной собеседник",
        "day_anchor": "Дневной якорь",
        "alive_dialog": "Самый живой диалог",
        "longest_live_session": "Самая длинная живая сессия",
        "reply_rhythm": "Ритм ответов",
        "mutual_dialog": "Самый взаимный диалог",
        "contact_initiator": "Кто чаще начинал контакт",
        "silence_restarter": "Кто возвращал разговор после тишины",
        "media_bond": "Медиа-связь",
    }
    return titles.get(kind, kind)


def _empty_insight(kind: str, label: str, confidence: str, reason: str, evidence: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {
        "kind": kind,
        "title": _insight_title(kind, label),
        "confidence": confidence,
        "winner": None,
        "score": 0.0,
        "evidence": evidence or {},
        "candidates": [],
        "no_winner_reason": reason,
    }


def _candidate_from_profile(profile: Dict[str, Any], score: float, evidence: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "peer_from_id": str(profile.get("peer_from_id") or ""),
        "display_name": str(profile.get("display_name") or profile.get("peer_from_id") or ""),
        "score": float(round(float(score), 4)),
        "total_messages": int(profile.get("total_messages", 0) or 0),
        "evidence": evidence,
    }


def _make_insight(kind: str, label: str, confidence: str, candidate: Optional[Dict[str, Any]], candidates: List[Dict[str, Any]], reason: str) -> Dict[str, Any]:
    if candidate is None:
        return _empty_insight(kind, label, confidence, reason)

    winner = {
        "peer_from_id": str(candidate.get("peer_from_id") or ""),
        "display_name": str(candidate.get("display_name") or candidate.get("peer_from_id") or ""),
        "total_messages": int(candidate.get("total_messages", 0) or 0),
    }
    return {
        "kind": kind,
        "title": _insight_title(kind, label),
        "confidence": confidence,
        "winner": winner,
        "score": float(candidate.get("score", 0.0) or 0.0),
        "evidence": candidate.get("evidence") if isinstance(candidate.get("evidence"), dict) else {},
        "candidates": candidates[:5],
        "no_winner_reason": None,
    }


def _period_personal_message_rows(conn: sqlite3.Connection, start_ts: int, end_ts: int) -> Iterable[sqlite3.Row]:
    base, p = _period_where_clause(start_ts, end_ts)
    banned_params = banned_peer_ids()
    banned_placeholders = sql_placeholders(banned_params)
    sql = (
        "SELECT c.peer_from_id, c.name, m.date_ts, m.is_out, m.media_type "
        "FROM messages m JOIN chats c ON m.chat_pk = c.chat_pk "
        f"WHERE m.is_service = 0 "
        f"  AND c.peer_from_id IS NOT NULL "
        f"  AND TRIM(c.peer_from_id) != '' "
        f"  AND c.peer_from_id NOT IN ({banned_placeholders}) "
        f"  AND (c.name IS NULL OR (c.name NOT LIKE '%Saved Messages%' AND c.name NOT LIKE '%Избранное%')) "
        f"  AND {base} "
        "ORDER BY c.peer_from_id, m.date_ts, m.msg_pk;"
    )
    return conn.execute(sql, banned_params + p)


def _finish_profile_session(profile: Dict[str, Any]) -> None:
    session = profile.get("_session")
    if not isinstance(session, dict):
        return
    count = int(session.get("count", 0) or 0)
    if count <= 0:
        profile["_session"] = None
        return
    start_ts = int(session.get("start_ts", 0) or 0)
    end_ts = int(session.get("end_ts", start_ts) or start_ts)
    duration = max(0, end_ts - start_ts)
    profile.setdefault("sessions", []).append(
        {
            "start_ts": start_ts,
            "end_ts": end_ts,
            "duration_seconds": int(duration),
            "message_count": int(count),
            "sent_messages": int(session.get("sent_messages", 0) or 0),
            "received_messages": int(session.get("received_messages", 0) or 0),
            "density_per_hour": float(_safe_div(count * 3600, max(3600, duration))),
        }
    )
    profile["_session"] = None


def _count_between(values: List[int], start_ts: int, end_ts: int) -> int:
    left = bisect_left(values, int(start_ts))
    right = bisect_right(values, int(end_ts))
    return max(0, right - left)


def _active_days_between(values: List[int], start_ts: int, end_ts: int) -> int:
    left = bisect_left(values, int(start_ts))
    right = bisect_right(values, int(end_ts))
    if right <= left:
        return 0
    msk = _moscow_tzinfo()
    days = set()
    for ts in values[left:right]:
        try:
            days.add(datetime.fromtimestamp(int(ts), tz=msk).strftime("%Y-%m-%d"))
        except Exception:
            continue
    return len(days)


def _build_conversation_profiles(
    conn: sqlite3.Connection,
    start_ts: int,
    end_ts: int,
    people: Dict[str, Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    profiles: Dict[str, Dict[str, Any]] = {}
    msk = _moscow_tzinfo()

    for peer_id, stats in people.items():
        if peer_id in BANNED_PEER_IDS:
            continue
        profiles[peer_id] = {
            "peer_from_id": peer_id,
            "display_name": str((stats or {}).get("display_name") or peer_id),
            "total_messages": int((stats or {}).get("total_messages", 0) or 0),
            "sent_messages": int((stats or {}).get("sent_messages", 0) or 0),
            "received_messages": int((stats or {}).get("received_messages", 0) or 0),
            "median_reply_seconds": int((stats or {}).get("median_reply_time_to_others_seconds", 0) or 0),
            "reply_samples": int((stats or {}).get("reply_samples", 0) or 0),
            "timestamps": [],
            "is_out_by_ts": [],
            "active_days_set": set(),
            "active_months_set": set(),
            "month_counts": Counter(),
            "hour_counts": Counter(),
            "media_counts": Counter(),
            "first_by_day": {},
            "days_started_by_you": 0,
            "days_started_by_them": 0,
            "restart_by_you": 0,
            "restart_by_them": 0,
            "sessions": [],
            "_session": None,
            "_last_ts": None,
        }

    for row in _period_personal_message_rows(conn, start_ts, end_ts):
        if _CANCEL_EVENT.is_set():
            raise CancelledError()
        peer_id = row[0] if isinstance(row[0], str) else ""
        if not peer_id:
            continue
        profile = profiles.get(peer_id)
        if profile is None:
            profile = {
                "peer_from_id": peer_id,
                "display_name": row[1] if isinstance(row[1], str) else peer_id,
                "total_messages": 0,
                "sent_messages": 0,
                "received_messages": 0,
                "median_reply_seconds": 0,
                "reply_samples": 0,
                "timestamps": [],
                "is_out_by_ts": [],
                "active_days_set": set(),
                "active_months_set": set(),
                "month_counts": Counter(),
                "hour_counts": Counter(),
                "media_counts": Counter(),
                "first_by_day": {},
                "days_started_by_you": 0,
                "days_started_by_them": 0,
                "restart_by_you": 0,
                "restart_by_them": 0,
                "sessions": [],
                "_session": None,
                "_last_ts": None,
            }
            profiles[peer_id] = profile

        ts = int(row[2] or 0)
        if ts <= 0:
            continue
        is_out = int(row[3] or 0)
        media_type = row[4] if isinstance(row[4], str) else None

        profile["timestamps"].append(ts)
        profile["is_out_by_ts"].append(is_out)
        try:
            dt = datetime.fromtimestamp(ts, tz=msk)
            day_key = dt.strftime("%Y-%m-%d")
            month_key = dt.strftime("%Y-%m")
            profile["active_days_set"].add(day_key)
            profile["active_months_set"].add(month_key)
            profile["month_counts"][month_key] += 1
            profile["hour_counts"][int(dt.hour)] += 1
            if day_key not in profile["first_by_day"]:
                profile["first_by_day"][day_key] = is_out
        except Exception:
            pass

        bucket = _normalize_media_bucket(media_type)
        if bucket:
            profile["media_counts"][bucket] += 1

        last_ts = profile.get("_last_ts")
        if isinstance(last_ts, int) and ts > last_ts and ts - last_ts >= SILENCE_RESTART_SECONDS:
            if is_out == 1:
                profile["restart_by_you"] = int(profile.get("restart_by_you", 0) or 0) + 1
            else:
                profile["restart_by_them"] = int(profile.get("restart_by_them", 0) or 0) + 1

        session = profile.get("_session")
        if not isinstance(session, dict) or not isinstance(last_ts, int) or ts - last_ts > SESSION_GAP_SECONDS:
            _finish_profile_session(profile)
            session = {"start_ts": ts, "end_ts": ts, "count": 0, "sent_messages": 0, "received_messages": 0}
            profile["_session"] = session
        session["end_ts"] = ts
        session["count"] = int(session.get("count", 0) or 0) + 1
        if is_out == 1:
            session["sent_messages"] = int(session.get("sent_messages", 0) or 0) + 1
        else:
            session["received_messages"] = int(session.get("received_messages", 0) or 0) + 1

        profile["_last_ts"] = ts

    for profile in profiles.values():
        _finish_profile_session(profile)
        first_by_day = profile.get("first_by_day") if isinstance(profile.get("first_by_day"), dict) else {}
        profile["days_started_by_you"] = sum(1 for value in first_by_day.values() if int(value) == 1)
        profile["days_started_by_them"] = sum(1 for value in first_by_day.values() if int(value) == 0)
        profile["active_days"] = len(profile.get("active_days_set") or [])
        profile["active_months"] = len(profile.get("active_months_set") or [])
        profile["media_total"] = int(sum((profile.get("media_counts") or Counter()).values()))
        profile["first_ts"] = int(profile["timestamps"][0]) if profile["timestamps"] else 0
        profile["last_ts"] = int(profile["timestamps"][-1]) if profile["timestamps"] else 0
        profile["night_messages"] = int(sum(c for h, c in (profile.get("hour_counts") or Counter()).items() if 0 <= int(h) <= 5))
        profile["day_messages"] = int(sum(c for h, c in (profile.get("hour_counts") or Counter()).items() if 6 <= int(h) <= 17))
        month_counts = profile.get("month_counts") if isinstance(profile.get("month_counts"), Counter) else Counter()
        sorted_months = sorted(month_counts)
        if sorted_months:
            if start_ts > 0 and end_ts > start_ts and (end_ts - start_ts) <= 370 * 86400 * 2:
                first_window = [m for m in sorted_months if int(m[5:7]) <= 6]
                second_window = [m for m in sorted_months if int(m[5:7]) >= 7]
            else:
                split = max(1, len(sorted_months) // 2)
                first_window = sorted_months[:split]
                second_window = sorted_months[split:]
            profile["early_messages"] = int(sum(month_counts[m] for m in first_window))
            profile["late_messages"] = int(sum(month_counts[m] for m in second_window))
        else:
            profile["early_messages"] = 0
            profile["late_messages"] = 0

    return profiles


def _best_candidates(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(candidates, key=lambda x: (float(x.get("score", 0.0) or 0.0), int(x.get("total_messages", 0) or 0)), reverse=True)


def _conversation_main_person(label: str, profiles: Dict[str, Dict[str, Any]], th: Dict[str, int]) -> Dict[str, Any]:
    candidates = []
    for profile in profiles.values():
        total = int(profile.get("total_messages", 0) or 0)
        if total < th["min_major_total"]:
            continue
        active_days = int(profile.get("active_days", 0) or 0)
        active_months = int(profile.get("active_months", 0) or 0)
        sent = int(profile.get("sent_messages", 0) or 0)
        recv = int(profile.get("received_messages", 0) or 0)
        balance = 1.0 - min(1.0, _safe_div(abs(sent - recv), max(1, total)))
        score = min(45.0, _safe_div(total, 80)) + min(25.0, active_days * 1.3) + min(20.0, active_months * 2.2) + balance * 10.0
        evidence = {
            "total_messages": total,
            "active_days": active_days,
            "active_months": active_months,
            "balance_ratio": float(round(balance, 4)),
        }
        candidates.append(_candidate_from_profile(profile, score, evidence))
    ordered = _best_candidates(candidates)
    return _make_insight("main_person", label, CONFIDENCE_BEHAVIORAL, ordered[0] if ordered else None, ordered, "not_enough_large_dialogs")


def _conversation_stable_dialog(label: str, profiles: Dict[str, Dict[str, Any]], th: Dict[str, int]) -> Dict[str, Any]:
    candidates = []
    for profile in profiles.values():
        total = int(profile.get("total_messages", 0) or 0)
        active_months = int(profile.get("active_months", 0) or 0)
        active_days = int(profile.get("active_days", 0) or 0)
        if total < th["min_stable_total"] or active_months < th["min_stable_months"]:
            continue
        month_counts = profile.get("month_counts") if isinstance(profile.get("month_counts"), Counter) else Counter()
        counts = [int(v) for v in month_counts.values() if int(v) > 0]
        avg = _safe_div(sum(counts), len(counts)) if counts else 0.0
        variance = _safe_div(sum(abs(c - avg) for c in counts), max(1, len(counts) * avg)) if avg else 1.0
        stability = max(0.0, 1.0 - min(1.0, variance))
        score = active_months * 12.0 + min(40.0, active_days) + stability * 30.0
        evidence = {
            "total_messages": total,
            "active_months": active_months,
            "active_days": active_days,
            "stability_ratio": float(round(stability, 4)),
        }
        candidates.append(_candidate_from_profile(profile, score, evidence))
    ordered = _best_candidates(candidates)
    return _make_insight("stable_dialog", label, CONFIDENCE_BEHAVIORAL, ordered[0] if ordered else None, ordered, "not_enough_stable_dialogs")


def _comeback_candidates(profiles: Dict[str, Dict[str, Any]], th: Dict[str, int]) -> List[Dict[str, Any]]:
    out = []
    gap_threshold = th["comeback_gap_days"] * 86400
    before_window = 45 * 86400
    after_window = 45 * 86400
    for profile in profiles.values():
        total = int(profile.get("total_messages", 0) or 0)
        if total < th["min_major_total"]:
            continue
        timestamps = profile.get("timestamps") if isinstance(profile.get("timestamps"), list) else []
        if len(timestamps) < th["comeback_before_messages"] + th["comeback_after_messages"]:
            continue
        best = None
        for idx in range(1, len(timestamps)):
            prev_ts = int(timestamps[idx - 1])
            cur_ts = int(timestamps[idx])
            gap = cur_ts - prev_ts
            if gap < gap_threshold:
                continue
            before_count = _count_between(timestamps, prev_ts - before_window, prev_ts)
            after_count = _count_between(timestamps, cur_ts, cur_ts + after_window)
            after_days = _active_days_between(timestamps, cur_ts, cur_ts + after_window)
            if before_count < th["comeback_before_messages"] or after_count < th["comeback_after_messages"] or after_days < th["comeback_after_active_days"]:
                continue
            gap_days = int(gap // 86400)
            reactivation_delta = int(after_count - before_count)
            reactivation_ratio = _safe_div(after_count, max(1, before_count))
            score = (
                min(900.0, after_count * 0.35)
                + min(800.0, max(0, reactivation_delta) * 0.45)
                + min(700.0, reactivation_ratio * 120.0)
                + after_days * 25.0
                + min(160.0, gap_days * 1.2)
                + min(120.0, before_count * 0.08)
            )
            evidence = {
                "gap_days": gap_days,
                "before_messages": int(before_count),
                "after_messages": int(after_count),
                "after_active_days": int(after_days),
                "reactivation_delta": reactivation_delta,
                "reactivation_ratio": float(round(reactivation_ratio, 4)),
                "from_datetime": _ts_to_msk_datetime(prev_ts),
                "to_datetime": _ts_to_msk_datetime(cur_ts),
            }
            candidate = _candidate_from_profile(profile, score, evidence)
            if best is None or float(candidate["score"]) > float(best["score"]):
                best = candidate
        if best is not None:
            out.append(best)
    return _best_candidates(out)


def _conversation_comeback(label: str, profiles: Dict[str, Dict[str, Any]], th: Dict[str, int]) -> Dict[str, Any]:
    ordered = _comeback_candidates(profiles, th)
    return _make_insight("comeback", label, CONFIDENCE_BEHAVIORAL, ordered[0] if ordered else None, ordered, "no_sustained_comeback_after_quality_gates")


def _conversation_trend(label: str, profiles: Dict[str, Dict[str, Any]], th: Dict[str, int], kind: str) -> Dict[str, Any]:
    candidates = []
    for profile in profiles.values():
        total = int(profile.get("total_messages", 0) or 0)
        early = int(profile.get("early_messages", 0) or 0)
        late = int(profile.get("late_messages", 0) or 0)
        if total < th["min_major_total"]:
            continue
        if kind == "closer_dialog":
            if early < th["trend_baseline_messages"] or late - early < th["trend_delta_messages"] or _safe_div(late, max(1, early)) < 2.4:
                continue
            ratio = _safe_div(late, max(1, early))
            score = (late - early) + ratio * 40.0
        else:
            if late < th["trend_baseline_messages"] or early - late < th["trend_delta_messages"] or _safe_div(early, max(1, late)) < 2.4:
                continue
            ratio = _safe_div(early, max(1, late))
            score = (early - late) + ratio * 40.0
        evidence = {
            "early_messages": early,
            "late_messages": late,
            "change_messages": int(late - early),
            "change_ratio": float(round(_safe_div(late, max(1, early)), 4)),
        }
        candidates.append(_candidate_from_profile(profile, score, evidence))
    ordered = _best_candidates(candidates)
    reason = "no_meaningful_growth_after_quality_gates" if kind == "closer_dialog" else "no_meaningful_fade_after_quality_gates"
    return _make_insight(kind, label, CONFIDENCE_BEHAVIORAL, ordered[0] if ordered else None, ordered, reason)


def _conversation_time_person(label: str, profiles: Dict[str, Dict[str, Any]], th: Dict[str, int], kind: str) -> Dict[str, Any]:
    candidates = []
    field = "night_messages" if kind == "night_companion" else "day_messages"
    for profile in profiles.values():
        total = int(profile.get("total_messages", 0) or 0)
        value = int(profile.get(field, 0) or 0)
        if total < th["min_person_total"] or value < max(30, th["min_person_total"] // 3):
            continue
        ratio = _safe_div(value, total)
        score = value + ratio * 120.0
        evidence = {"messages": value, "total_messages": total, "ratio": float(round(ratio, 4))}
        candidates.append(_candidate_from_profile(profile, score, evidence))
    ordered = _best_candidates(candidates)
    return _make_insight(kind, label, CONFIDENCE_BEHAVIORAL, ordered[0] if ordered else None, ordered, "not_enough_time_profile_activity")


def _conversation_sessions(label: str, profiles: Dict[str, Dict[str, Any]], th: Dict[str, int], kind: str) -> Dict[str, Any]:
    candidates = []
    for profile in profiles.values():
        best_session = None
        for session in profile.get("sessions", []):
            if not isinstance(session, dict):
                continue
            count = int(session.get("message_count", 0) or 0)
            if count < th["session_messages"]:
                continue
            duration = int(session.get("duration_seconds", 0) or 0)
            density = float(session.get("density_per_hour", 0.0) or 0.0)
            score = count + density * 8.0 if kind == "alive_dialog" else count + _safe_div(duration, 3600) * 3.0
            evidence = {
                "message_count": count,
                "duration_seconds": duration,
                "density_per_hour": float(round(density, 4)),
                "start_datetime": _ts_to_msk_datetime(int(session.get("start_ts", 0) or 0)),
                "end_datetime": _ts_to_msk_datetime(int(session.get("end_ts", 0) or 0)),
            }
            candidate = _candidate_from_profile(profile, score, evidence)
            if best_session is None or float(candidate["score"]) > float(best_session["score"]):
                best_session = candidate
        if best_session is not None:
            candidates.append(best_session)
    ordered = _best_candidates(candidates)
    confidence = CONFIDENCE_EXACT if kind == "longest_live_session" else CONFIDENCE_BEHAVIORAL
    return _make_insight(kind, label, confidence, ordered[0] if ordered else None, ordered, "not_enough_live_sessions")


def _conversation_reply_rhythm(label: str, profiles: Dict[str, Dict[str, Any]], th: Dict[str, int]) -> Dict[str, Any]:
    candidates = []
    for profile in profiles.values():
        samples = int(profile.get("reply_samples", 0) or 0)
        median = int(profile.get("median_reply_seconds", 0) or 0)
        total = int(profile.get("total_messages", 0) or 0)
        if total < th["min_major_total"] or samples < th["reply_samples"] or median <= 0:
            continue
        if median <= 10 * 60:
            rhythm = "fast"
            score = 100000 - median + samples * 10
        elif median <= 6 * 60 * 60:
            rhythm = "measured"
            score = 50000 - abs(median - 60 * 60) + samples * 10
        else:
            rhythm = "slow"
            score = median + samples * 10
        evidence = {"median_reply_seconds": median, "reply_samples": samples, "rhythm": rhythm}
        candidates.append(_candidate_from_profile(profile, score, evidence))
    ordered = _best_candidates(candidates)
    return _make_insight("reply_rhythm", label, CONFIDENCE_BEHAVIORAL, ordered[0] if ordered else None, ordered, "not_enough_reply_samples")


def _conversation_mutual_dialog(label: str, profiles: Dict[str, Dict[str, Any]], th: Dict[str, int]) -> Dict[str, Any]:
    candidates = []
    minimum_total = int(th.get("mutual_min_total", MUTUALITY_MIN_MESSAGES) or MUTUALITY_MIN_MESSAGES)
    for profile in profiles.values():
        total = int(profile.get("total_messages", 0) or 0)
        if total < minimum_total:
            continue
        sent = int(profile.get("sent_messages", 0) or 0)
        recv = int(profile.get("received_messages", 0) or 0)
        imbalance = _safe_div(abs(sent - recv), total)
        score = (1.0 - min(1.0, imbalance)) * 1000.0 + min(200.0, _safe_div(total, 20))
        evidence = {
            "sent_messages": sent,
            "received_messages": recv,
            "imbalance_ratio": float(round(imbalance, 4)),
            "minimum_messages_required": minimum_total,
        }
        candidates.append(_candidate_from_profile(profile, score, evidence))
    ordered = _best_candidates(candidates)
    return _make_insight("mutual_dialog", label, CONFIDENCE_EXACT, ordered[0] if ordered else None, ordered, "not_enough_mutual_dialogs")


def _conversation_initiative(label: str, profiles: Dict[str, Dict[str, Any]], th: Dict[str, int], kind: str) -> Dict[str, Any]:
    candidates = []
    for profile in profiles.values():
        total = int(profile.get("total_messages", 0) or 0)
        if total < th["min_person_total"]:
            continue
        if kind == "contact_initiator":
            them = int(profile.get("days_started_by_them", 0) or 0)
            you = int(profile.get("days_started_by_you", 0) or 0)
            initiated = them + you
            if initiated < th["initiative_days"]:
                continue
            ratio = _safe_div(them, initiated)
            score = them * 10.0 + ratio * 100.0
            evidence = {"days_started_by_them": them, "days_started_by_you": you, "initiated_days": initiated, "them_ratio": float(round(ratio, 4))}
        else:
            them = int(profile.get("restart_by_them", 0) or 0)
            you = int(profile.get("restart_by_you", 0) or 0)
            if them + you <= 0 or them <= 0:
                continue
            ratio = _safe_div(them, them + you)
            score = them * 30.0 + ratio * 100.0
            evidence = {"restarts_by_them": them, "restarts_by_you": you, "them_ratio": float(round(ratio, 4))}
        candidates.append(_candidate_from_profile(profile, score, evidence))
    ordered = _best_candidates(candidates)
    reason = "not_enough_initiated_days" if kind == "contact_initiator" else "not_enough_silence_restarts"
    return _make_insight(kind, label, CONFIDENCE_BEHAVIORAL, ordered[0] if ordered else None, ordered, reason)


def _conversation_media_bond(label: str, profiles: Dict[str, Dict[str, Any]], th: Dict[str, int]) -> Dict[str, Any]:
    candidates = []
    for profile in profiles.values():
        total = int(profile.get("total_messages", 0) or 0)
        media_counts = profile.get("media_counts") if isinstance(profile.get("media_counts"), Counter) else Counter()
        media_total = int(sum(media_counts.values()))
        if total < th["min_person_total"] or media_total < th["media_events"]:
            continue
        top_media_type, top_count = media_counts.most_common(1)[0] if media_counts else ("", 0)
        ratio = _safe_div(media_total, total)
        score = media_total + ratio * 200.0
        evidence = {
            "media_total": media_total,
            "top_media_type": top_media_type,
            "top_media_count": int(top_count),
            "media_ratio": float(round(ratio, 4)),
        }
        candidates.append(_candidate_from_profile(profile, score, evidence))
    ordered = _best_candidates(candidates)
    return _make_insight("media_bond", label, CONFIDENCE_EXACT, ordered[0] if ordered else None, ordered, "not_enough_media_events")


def _conversation_insights(
    conn: sqlite3.Connection,
    label: str,
    start_ts: int,
    end_ts: int,
    people: Dict[str, Dict[str, Any]],
    reply_stats: Dict[str, Any],
) -> Dict[str, Any]:
    del reply_stats
    thresholds = _conversation_thresholds(label)
    profiles = _build_conversation_profiles(conn, start_ts, end_ts, people)
    insights: Dict[str, Any] = {
        "main_person": _conversation_main_person(label, profiles, thresholds),
        "stable_dialog": _conversation_stable_dialog(label, profiles, thresholds),
        "comeback": _conversation_comeback(label, profiles, thresholds),
        "closer_dialog": _conversation_trend(label, profiles, thresholds, "closer_dialog"),
        "faded_dialog": _conversation_trend(label, profiles, thresholds, "faded_dialog"),
        "night_companion": _conversation_time_person(label, profiles, thresholds, "night_companion"),
        "day_anchor": _conversation_time_person(label, profiles, thresholds, "day_anchor"),
        "alive_dialog": _conversation_sessions(label, profiles, thresholds, "alive_dialog"),
        "longest_live_session": _conversation_sessions(label, profiles, thresholds, "longest_live_session"),
        "reply_rhythm": _conversation_reply_rhythm(label, profiles, thresholds),
        "mutual_dialog": _conversation_mutual_dialog(label, profiles, thresholds),
        "contact_initiator": _conversation_initiative(label, profiles, thresholds, "contact_initiator"),
        "silence_restarter": _conversation_initiative(label, profiles, thresholds, "silence_restarter"),
        "media_bond": _conversation_media_bond(label, profiles, thresholds),
    }
    for key in CONVERSATION_INSIGHT_KEYS:
        if key not in insights:
            insights[key] = _empty_insight(key, label, CONFIDENCE_BEHAVIORAL, "not_computed")
    return insights


def _achievements(all_time: Dict[str, Any]) -> List[Dict[str, Any]]:
    total_msgs = int(all_time.get("total_messages", 0) or 0)
    night_ratio = float(all_time.get("night_messages_ratio", 0.0) or 0.0)
    median_reply = int(all_time.get("median_reply_time_to_others_seconds", 0) or 0)
    stickers = int(all_time.get("media_counts", {}).get("sticker", 0) if isinstance(all_time.get("media_counts"), dict) else 0)
    emojis_total = int(all_time.get("total_emojis_sent", 0) or 0)
    longest_len = 0
    lm = all_time.get("longest_message_sent")
    if isinstance(lm, dict):
        longest_len = int(lm.get("length_chars", 0) or 0)
    streak = 0
    st = all_time.get("longest_streak_days")
    if isinstance(st, dict):
        streak = int(st.get("length_days", 0) or 0)
    chats_total = int(all_time.get("total_chats_personal", 0) or 0)
    edited = int(all_time.get("edited_messages_count", 0) or 0)
    media_total = 0
    mc = all_time.get("media_counts")
    if isinstance(mc, dict):
        media_total = int(sum(int(v or 0) for v in mc.values()))

    def ach(id_: str, title: str, desc: str, earned: bool, score: int) -> Dict[str, Any]:
        return {
            "id": id_,
            "title": title,
            "description": desc,
            "earned": bool(earned),
            "score": int(max(0, min(100, score))),
            "badge_image_path": f"assets/badges/{id_}.png",
        }

    out: List[Dict[str, Any]] = []
    out.append(ach("night_chatter", "Ночной червь", "Пишешь ночью чаще многих.", night_ratio >= 0.25, int(min(100, night_ratio * 400))))
    out.append(ach("early_bird", "Ранняя пташка", "Утро начинается с сообщений.", int(all_time.get("messages_06_08", 0) or 0) >= 50, int(min(100, _safe_div(int(all_time.get("messages_06_08", 0) or 0), 50) * 100))))
    out.append(ach("speed_responder", "Быстрый гонзалес", "Отвечаешь очень быстро.", 0 < median_reply <= 300, 100 if 0 < median_reply <= 300 else int(max(0, 100 - _safe_div(median_reply, 3600) * 25))))
    out.append(ach("ignorer", "Игнорщик", "Иногда ответы могут подождать.", median_reply >= 2 * 24 * 3600, int(min(100, _safe_div(median_reply, 2 * 24 * 3600) * 100))))
    out.append(ach("sticker_boss", "Стикерчел", "Стикеры — твой язык.", stickers >= 100, int(min(100, _safe_div(stickers, 100) * 100))))
    out.append(ach("emoji_master", "Эмодзичел", "Эмодзи в каждом втором сообщении.", emojis_total >= 300, int(min(100, _safe_div(emojis_total, 300) * 100))))
    out.append(ach("longreader", "Лонгрид", "Любишь длинные сообщения.", int(all_time.get("average_msg_length_sent_chars", 0) or 0) >= 120, int(min(100, _safe_div(int(all_time.get("average_msg_length_sent_chars", 0) or 0), 120) * 100))))
    out.append(ach("wall_of_text", "Стены текста", "Однажды ты написал целую стену текста.", longest_len >= 1000, int(min(100, _safe_div(longest_len, 1000) * 100))))
    out.append(ach("media_magnet", "Медиа магнат", "Медиа-контент летит рекой.", media_total >= 500, int(min(100, _safe_div(media_total, 500) * 100))))
    out.append(ach("social_butterfly", "Общительная бабочка", "Общение со многими людьми.", chats_total >= 120, int(min(100, _safe_div(chats_total, 120) * 100))))
    out.append(ach("marathoner", "Марафонец", "Писал(а) каждый день без пропусков.", streak >= 30, int(min(100, _safe_div(streak, 30) * 100))))
    out.append(ach("writer", "Писатель", "Много текста за всё время.", int(all_time.get("total_words_sent", 0) or 0) >= 50000, int(min(100, _safe_div(int(all_time.get("total_words_sent", 0) or 0), 50000) * 100))))
    out.append(ach("ultra_active", "Ultra Active", "Очень много сообщений.", total_msgs >= 20000, int(min(100, _safe_div(total_msgs, 20000) * 100))))
    out.append(ach("consistent", "Постоялец", "Стабильная активность по дням.", int(all_time.get("active_days_count", 0) or 0) >= 200, int(min(100, _safe_div(int(all_time.get("active_days_count", 0) or 0), 200) * 100))))

    if len(out) < 15:
        out.append(ach("placeholder", "Achievement", "(placeholder)", False, 0))
    return out


def _slides_data(report: Dict[str, Any]) -> Dict[str, Any]:
    periods = report.get("periods") if isinstance(report.get("periods"), dict) else {}
    all_time = periods.get("all_time") if isinstance(periods.get("all_time"), dict) else {}
    year = periods.get("year") if isinstance(periods.get("year"), dict) else {}
    top_people = report.get("top_people") if isinstance(report.get("top_people"), list) else []

    slides = [
        {"id": "s1_overview", "title": "Overview", "data": {"all_time": all_time, "year": year}},
        {"id": "s2_sent_vs_received", "title": "Sent vs Received", "data": {"all_time": {"sent": all_time.get("sent_messages"), "received": all_time.get("received_messages")}, "year": {"sent": year.get("sent_messages"), "received": year.get("received_messages")}}},
        {"id": "s3_activity_day", "title": "Most active day", "data": {"all_time": all_time.get("most_active_day"), "year": year.get("most_active_day")}},
        {"id": "s4_activity_month", "title": "Most active month", "data": {"all_time": all_time.get("most_active_month"), "year": year.get("most_active_month")}},
        {"id": "s5_activity_hour", "title": "Most active hour", "data": {"all_time": all_time.get("most_active_hour"), "year": year.get("most_active_hour")}},
        {"id": "s6_night", "title": "Night activity", "data": {"all_time": {"count": all_time.get("night_messages_count"), "ratio": all_time.get("night_messages_ratio")}, "year": {"count": year.get("night_messages_count"), "ratio": year.get("night_messages_ratio")}}},
        {"id": "s7_streak", "title": "Longest streak", "data": {"all_time": all_time.get("longest_streak_days"), "year": year.get("longest_streak_days")}},
        {"id": "s8_silence", "title": "Longest silence", "data": {"all_time": all_time.get("longest_silence_gap"), "year": year.get("longest_silence_gap")}},
        {"id": "s9_top_people", "title": "Top people", "data": {"top_people": top_people[:10]}},
        {"id": "s9b_conversation_insights", "title": "Conversation insights", "data": {"all_time": all_time.get("conversation_insights"), "year": year.get("conversation_insights")}},
        {"id": "s10_reply_times", "title": "Reply times", "data": {"all_time": {"median": all_time.get("median_reply_time_to_others_seconds"), "fastest": all_time.get("who_you_reply_fastest"), "slowest": all_time.get("who_you_ignore_most")}, "year": {"median": year.get("median_reply_time_to_others_seconds"), "fastest": year.get("who_you_reply_fastest"), "slowest": year.get("who_you_ignore_most")}}},
        {"id": "s11_words", "title": "Top words", "data": {"all_time": all_time.get("top_words"), "year": year.get("top_words")}},
        {"id": "s12_word_cloud", "title": "Word cloud", "data": {"all_time": all_time.get("word_cloud"), "year": year.get("word_cloud")}},
        {"id": "s13_emojis", "title": "Top emojis", "data": {"all_time": all_time.get("top_emojis"), "year": year.get("top_emojis")}},
        {"id": "s14_media", "title": "Media", "data": {"all_time": all_time.get("media_counts"), "year": year.get("media_counts")}},
        {"id": "s15_edits", "title": "Edits", "data": {"all_time": all_time.get("edited_messages_count"), "year": year.get("edited_messages_count")}},
        {"id": "s16_deleted", "title": "Deletions", "data": {"all_time": all_time.get("deleted_messages_count"), "year": year.get("deleted_messages_count")}},
        {"id": "s17_day_person", "title": "Day person", "data": {"all_time": all_time.get("day_person"), "year": year.get("day_person")}},
        {"id": "s18_night_person", "title": "Night person", "data": {"all_time": all_time.get("night_person"), "year": year.get("night_person")}},
        {"id": "s19_achievements", "title": "Achievements", "data": {"achievements": report.get("achievements")}},
        {"id": "s20_meta", "title": "Meta", "data": report.get("meta")},
    ]

    return {"version": 1, "slides": slides}


def _compute_period_metrics(
    conn: sqlite3.Connection,
    label: str,
    start_ts: int,
    end_ts: int,
    people: Dict[str, Dict[str, Any]],
    reply_stats: Dict[str, Any],
) -> Dict[str, Any]:
    if _CANCEL_EVENT.is_set():
        raise CancelledError()

    total = _count_messages(conn, start_ts, end_ts, "AND is_service = 0")
    sent = _count_messages(conn, start_ts, end_ts, "AND is_service = 0 AND is_out = 1")
    recv = _count_messages(conn, start_ts, end_ts, "AND is_service = 0 AND is_out = 0")
    service_total = _count_messages(conn, start_ts, end_ts, "AND is_service = 1")
    edited = _count_messages(conn, start_ts, end_ts, "AND is_service = 0 AND is_edited = 1")
    deleted = _deleted_messages_count(conn, start_ts, end_ts)

    most_day = _most_active_group(conn, start_ts, end_ts, f"date((date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch')", "day")
    most_month = _most_active_group(conn, start_ts, end_ts, f"strftime('%Y-%m', (date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch')", "month")
    most_hour = _most_active_group(conn, start_ts, end_ts, f"strftime('%H', (date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch')", "hour")
    period_span = _period_span(conn, start_ts, end_ts)
    month_extremes = _month_activity_extremes(conn, start_ts, end_ts)
    direction_extremes = _daily_direction_extremes(conn, start_ts, end_ts)
    night_extra = _night_insights(conn, start_ts, end_ts)

    night_count = conn.execute(
        f"SELECT COUNT(*) FROM messages WHERE is_service = 0 AND date_ts >= ? AND date_ts < ? AND CAST(strftime('%H', (date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) BETWEEN 0 AND 5;",
        (start_ts, end_ts),
    ).fetchone()
    night_messages = int(night_count[0] or 0) if night_count else 0
    night_ratio = _safe_div(night_messages, total)

    active_days_count = _distinct_days_count(conn, start_ts, end_ts)
    active_chats_count = _active_chats_count(conn, start_ts, end_ts)
    avg_msgs_per_day = _safe_div(total, active_days_count) if active_days_count else 0.0

    daily_activity = _daily_activity(conn, start_ts, end_ts)
    hourly_activity = _hourly_activity(conn, start_ts, end_ts)

    period_hours = _period_hours(conn, start_ts, end_ts)
    average_messages_per_hour = _safe_div(total, period_hours) if period_hours > 0 else 0.0

    silence = _longest_silence_gap(conn, start_ts, end_ts)
    streak = _longest_streak_days(conn, start_ts, end_ts)
    person_streak = _longest_person_streak(conn, start_ts, end_ts)

    textm = _text_metrics_sent(conn, start_ts, end_ts)
    media = _media_counts(conn, start_ts, end_ts)
    media_extra = _media_insights(conn, start_ts, end_ts, media, total)

    if label == "year":
        median_reply = int(reply_stats.get("global_median_year_seconds", 0) or 0)
        per_peer_median = reply_stats.get("per_peer_median_year_seconds", {})
        per_peer_samples = reply_stats.get("per_peer_samples_year", {})
    else:
        median_reply = int(reply_stats.get("global_median_all_time_seconds", 0) or 0)
        per_peer_median = reply_stats.get("per_peer_median_all_time_seconds", {})
        per_peer_samples = reply_stats.get("per_peer_samples_all_time", {})

    fastest: Optional[Dict[str, Any]] = None
    slowest: Optional[Dict[str, Any]] = None
    med_items_fast = []
    med_items_slow = []
    qualified_medians_3000: List[int] = []
    if isinstance(per_peer_median, dict) and isinstance(per_peer_samples, dict):
        for peer_id, med in per_peer_median.items():
            try:
                if peer_id in BANNED_PEER_IDS:
                    continue
                samples = int(per_peer_samples.get(peer_id, 0) or 0)
                total_messages_for_peer = int((people.get(peer_id, {}) or {}).get("total_messages", 0) or 0)
                if samples < 3:
                    continue
                med_value = int(med or 0)
                if total_messages_for_peer >= 2500:
                    med_items_fast.append((med_value, -samples, peer_id))
                if total_messages_for_peer >= 3000:
                    med_items_slow.append((med_value, -samples, peer_id))
                    qualified_medians_3000.append(med_value)
            except Exception:
                continue
    med_items_fast.sort()
    med_items_slow.sort()
    qualified_median_3000 = _median_int(qualified_medians_3000)
    if med_items_fast:
        fastest_peer = med_items_fast[0][2]
        fastest_med = int(per_peer_median.get(fastest_peer, 0) or 0) if isinstance(per_peer_median, dict) else 0
        fastest_samples = int(per_peer_samples.get(fastest_peer, 0) or 0) if isinstance(per_peer_samples, dict) else 0
        fastest_total = int((people.get(fastest_peer, {}) or {}).get("total_messages", 0) or 0)
        fastest = {
            "peer_from_id": fastest_peer,
            "display_name": (people.get(fastest_peer, {}) or {}).get("display_name"),
            "median_reply_seconds": fastest_med,
            "reply_samples": fastest_samples,
            "total_messages": fastest_total,
            "minimum_messages_required": 2500,
            "delta_vs_global_seconds": int(median_reply - fastest_med),
        }
    if med_items_slow:
        slowest_peer = med_items_slow[-1][2]
        slowest_med = int(per_peer_median.get(slowest_peer, 0) or 0) if isinstance(per_peer_median, dict) else 0
        slowest_samples = int(per_peer_samples.get(slowest_peer, 0) or 0) if isinstance(per_peer_samples, dict) else 0
        slowest_total = int((people.get(slowest_peer, {}) or {}).get("total_messages", 0) or 0)
        slowest = {
            "peer_from_id": slowest_peer,
            "display_name": (people.get(slowest_peer, {}) or {}).get("display_name"),
            "median_reply_seconds": slowest_med,
            "reply_samples": slowest_samples,
            "total_messages": slowest_total,
            "minimum_messages_required": 3000,
            "delta_vs_qualified_median_seconds": int(slowest_med - qualified_median_3000),
        }

    day_person = _pick_person_by_time_profile(people, "day_messages")
    night_person = _pick_person_by_time_profile(people, "night_messages")

    row_0608 = conn.execute(
        f"SELECT COUNT(*) FROM messages WHERE is_service = 0 AND date_ts >= ? AND date_ts < ? AND CAST(strftime('%H', (date_ts + {MSK_OFFSET_SECONDS}), 'unixepoch') AS INTEGER) BETWEEN 6 AND 8;",
        (start_ts, end_ts),
    ).fetchone()
    messages_0608 = int(row_0608[0] or 0) if row_0608 else 0

    top_messages = _top_10_people_by_messages(people)
    for item in top_messages[:1]:
        item.update(_peer_activity_insights(conn, start_ts, end_ts, item.get("peer_from_id") if isinstance(item.get("peer_from_id"), str) else None))

    mutuality = _top_10_people_by_mutuality(people)

    if isinstance(day_person, dict):
        day_person.update(_peer_activity_insights(conn, start_ts, end_ts, day_person.get("peer_from_id") if isinstance(day_person.get("peer_from_id"), str) else None))
    if isinstance(night_person, dict):
        night_person.update(_peer_activity_insights(conn, start_ts, end_ts, night_person.get("peer_from_id") if isinstance(night_person.get("peer_from_id"), str) else None))

    conversation_insights = _conversation_insights(conn, label, start_ts, end_ts, people, reply_stats)

    metrics: Dict[str, Any] = {
        "total_messages": int(total),
        "sent_messages": int(sent),
        "received_messages": int(recv),
        "service_messages_count": int(service_total),
        "total_chats_personal": int(conn.execute("SELECT COUNT(*) FROM chats;").fetchone()[0] or 0),
        "active_chats_count": int(active_chats_count),
        "most_active_day": most_day,
        "most_active_month": most_month,
        "most_active_hour": most_hour,
        "period_span": period_span,
        "quietest_month": month_extremes.get("quietest_month"),
        "most_balanced_day": direction_extremes.get("most_balanced_day"),
        "most_one_sided_day": direction_extremes.get("most_one_sided_day"),
        "daily_activity": daily_activity,
        "hourly_activity": hourly_activity,
        "period_hours": int(period_hours),
        "average_messages_per_hour": float(average_messages_per_hour),
        "night_messages_count": int(night_messages),
        "night_messages_ratio": float(night_ratio),
        **night_extra,
        "media_counts": media,
        **media_extra,
        "edited_messages_count": int(edited),
        "deleted_messages_count": int(deleted),
        "median_reply_time_to_others_seconds": int(median_reply),
        "qualified_median_reply_3000_seconds": int(qualified_median_3000),
        "who_you_reply_fastest": fastest,
        "who_you_ignore_most": slowest,
        "day_person": {
            "peer_from_id": day_person.get("peer_from_id") if isinstance(day_person, dict) else None,
            "display_name": day_person.get("display_name") if isinstance(day_person, dict) else None,
            "messages": int(day_person.get("day_messages", 0) or 0) if isinstance(day_person, dict) else 0,
            "total_messages": int(day_person.get("total_messages", 0) or 0) if isinstance(day_person, dict) else 0,
            "day_ratio": float(_safe_div(int(day_person.get("day_messages", 0) or 0), int(day_person.get("total_messages", 0) or 0))) if isinstance(day_person, dict) else 0.0,
            "day_peak_hour": day_person.get("day_peak_hour") if isinstance(day_person, dict) else None,
            "day_peak_date": day_person.get("day_peak_date") if isinstance(day_person, dict) else None,
            "day_weekday_messages": int(day_person.get("day_weekday_messages", 0) or 0) if isinstance(day_person, dict) else 0,
            "day_weekend_messages": int(day_person.get("day_weekend_messages", 0) or 0) if isinstance(day_person, dict) else 0,
            "day_bond_score": int(min(100, _safe_div(int(day_person.get("day_messages", 0) or 0) * 100, max(1, int(total))))) if isinstance(day_person, dict) else 0,
        } if isinstance(day_person, dict) else None,
        "night_person": {
            "peer_from_id": night_person.get("peer_from_id") if isinstance(night_person, dict) else None,
            "display_name": night_person.get("display_name") if isinstance(night_person, dict) else None,
            "messages": int(night_person.get("night_messages", 0) or 0) if isinstance(night_person, dict) else 0,
            "total_messages": int(night_person.get("total_messages", 0) or 0) if isinstance(night_person, dict) else 0,
            "night_ratio": float(_safe_div(int(night_person.get("night_messages", 0) or 0), int(night_person.get("total_messages", 0) or 0))) if isinstance(night_person, dict) else 0.0,
            "night_peak_hour": night_person.get("night_peak_hour") if isinstance(night_person, dict) else None,
            "night_peak_date": night_person.get("night_peak_date") if isinstance(night_person, dict) else None,
            "post_midnight_messages": int(night_person.get("night_messages", 0) or 0) if isinstance(night_person, dict) else 0,
            "night_bond_score": int(min(100, _safe_div(int(night_person.get("night_messages", 0) or 0) * 100, max(1, int(total))))) if isinstance(night_person, dict) else 0,
        } if isinstance(night_person, dict) else None,
        "longest_silence_gap": silence,
        "longest_streak_days": streak,
        "longest_person_streak": person_streak,
        "top_10_people_by_messages": top_messages,
        "top_10_people_by_time_span": _top_10_people_by_time_span(people),
        "top_10_people_by_mutuality": mutuality,
        "conversation_insights": conversation_insights,
        "active_days_count": int(active_days_count),
        "avg_messages_per_active_day": float(avg_msgs_per_day),
        "messages_06_08": int(messages_0608),
    }

    metrics.update(textm)
    return metrics

def do_build_report(db_path: str) -> None:
    if _CANCEL_EVENT.is_set():
        raise CancelledError()

    if not os.path.isfile(db_path):
        raise RuntimeError("DB file not found")

    report_path = os.path.join(os.path.dirname(db_path), "report.json")

    progress("compute_metrics", 0, "", "")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        ensure_schema(conn)

        removed_dupes = dedupe_existing_messages_by_msg_id(conn)
        if removed_dupes > 0:
            try:
                conn.commit()
            except Exception:
                pass
            write_json(
                {
                    "type": "warning",
                    "message": f"Removed {removed_dupes} duplicate messages by (chat_pk, msg_id)"
                }
            )

        ensure_messages_unique_index(conn)
        create_indexes(conn)

        self_from_id = meta_get(conn, "self_from_id")
        if isinstance(self_from_id, str):
            self_from_id = self_from_id.strip() or None
        else:
            self_from_id = None

        progress("compute_metrics", 3, "direction", "")
        self_from_id = resolve_self_from_id(conn, self_from_id)
        apply_direction_updates(conn, self_from_id)

        progress("compute_metrics", 6, "period_bounds", "")
        msk = _moscow_tzinfo()
        inferred_year = infer_report_year(conn)
        if inferred_year is None:
            now_msk = datetime.now(msk)
            year_used = int(now_msk.year - 1)
        else:
            year_used = int(inferred_year)
        year_start = datetime(year_used, 1, 1, tzinfo=msk)
        year_end = datetime(year_used + 1, 1, 1, tzinfo=msk)
        year_start_ts = int(year_start.timestamp())
        year_end_ts = int(year_end.timestamp())

        progress("compute_metrics", 12, "reply_times", "")
        reply_stats = _compute_reply_times(conn, year_start_ts, year_end_ts)

        progress("compute_metrics", 22, "people_stats", "")
        people_all = _people_stats(conn, 0, 2**62)
        people_year = _people_stats(conn, year_start_ts, year_end_ts)

        per_all = reply_stats.get("per_peer_median_all_time_seconds", {})
        per_year = reply_stats.get("per_peer_median_year_seconds", {})
        samples_all = reply_stats.get("per_peer_samples_all_time", {})
        samples_year = reply_stats.get("per_peer_samples_year", {})
        if isinstance(per_all, dict) and isinstance(samples_all, dict):
            for peer_id, st in people_all.items():
                if not isinstance(st, dict):
                    continue
                st["median_reply_time_to_others_seconds"] = int(per_all.get(peer_id, 0) or 0)
                st["reply_samples"] = int(samples_all.get(peer_id, 0) or 0)
        if isinstance(per_year, dict) and isinstance(samples_year, dict):
            for peer_id, st in people_year.items():
                if not isinstance(st, dict):
                    continue
                st["median_reply_time_to_others_seconds"] = int(per_year.get(peer_id, 0) or 0)
                st["reply_samples"] = int(samples_year.get(peer_id, 0) or 0)

        progress("compute_metrics", 35, "metrics_all_time", "")
        metrics_all = _compute_period_metrics(conn, "all_time", 0, 2**62, people_all, reply_stats)

        progress("compute_metrics", 55, "metrics_year", "")
        metrics_year = _compute_period_metrics(conn, "year", year_start_ts, year_end_ts, people_year, reply_stats)

        progress("compute_metrics", 70, "top_people", "")
        all_peers = set(people_all.keys()) | set(people_year.keys())
        top_people_list: List[Dict[str, Any]] = []
        for peer_id in all_peers:
            pa = people_all.get(peer_id)
            py = people_year.get(peer_id)
            display_name = (py or pa or {}).get("display_name")
            top_people_list.append(
                {
                    "peer_from_id": peer_id,
                    "display_name": display_name,
                    "periods": {
                        "all_time": pa,
                        "year": py,
                    },
                }
            )
        top_people_list.sort(
            key=lambda x: int(((x.get("periods") or {}).get("all_time") or {}).get("total_messages", 0) or 0), reverse=True
        )

        progress("compute_metrics", 82, "people_analytics", "")
        people_analytics = _people_analytics(conn, people_all, people_year, year_start_ts, year_end_ts)

        progress("compute_metrics", 88, "achievements", "")
        achievements = _achievements(metrics_all)

        report: Dict[str, Any] = {
            "meta": {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "msk_year_used": int(year_used),
                "self_from_id": self_from_id,
            },
            "periods": {
                "all_time": metrics_all,
                "year": metrics_year,
            },
            "top_people": top_people_list,
            "people_analytics": people_analytics,
            "achievements": achievements,
        }

        progress("compute_metrics", 92, "slides_data", "")
        report["slides_data"] = _slides_data(report)

        progress("compute_metrics", 96, "write_report", "")
        try:
            with open(report_path, "w", encoding="utf-8") as f:
                json.dump(report, f, ensure_ascii=False, indent=2)
        except Exception as e:
            raise RuntimeError(f"Failed to write report.json: {str(e)}")

        progress("compute_metrics", 100, "", "")
        mark_report_idle()
        write_json(
            {
                "type": "report_done",
                "db_path": db_path,
                "report_path": report_path,
                "msk_year_used": int(year_used),
                "preview": {
                    "total_messages_all_time": int(metrics_all.get("total_messages", 0) or 0),
                    "total_messages_year": int(metrics_year.get("total_messages", 0) or 0),
                    "sent_messages_all_time": int(metrics_all.get("sent_messages", 0) or 0),
                    "received_messages_all_time": int(metrics_all.get("received_messages", 0) or 0),
                    "most_active_day_all_time": metrics_all.get("most_active_day"),
                    "top_person_all_time": (metrics_all.get("top_10_people_by_messages") or [None])[0],
                },
            }
        )

    except CancelledError:
        mark_report_idle()
        write_json({"type": "report_error", "message": "Report generation cancelled"})
    finally:
        try:
            conn.close()
        except Exception:
            pass


def start_report_thread(db_path: str) -> None:
    global _REPORT_BUSY, _REPORT_THREAD

    def _runner() -> None:
        try:
            do_build_report(db_path)
        except CancelledError:
            mark_report_idle()
            return
        except Exception as e:
            mark_report_idle()
            write_json({"type": "report_error", "message": str(e)})

    with _REPORT_LOCK:
        with _STATE_LOCK:
            if _IMPORT_BUSY:
                write_json({"type": "report_error", "message": "Import is running"})
                return
            if _REPORT_BUSY:
                write_json({"type": "report_error", "message": "Report generation already running"})
                return
            _REPORT_BUSY = True

        _CANCEL_EVENT.clear()
        t = threading.Thread(target=_runner, name="tgwr_report", daemon=True)
        _REPORT_THREAD = t
        t.start()


def handle_command(cmd_obj: Any) -> None:
    if not isinstance(cmd_obj, dict):
        write_json({"type": "error", "message": "Command must be a JSON object"})
        return

    cmd = cmd_obj.get("cmd")

    if cmd == "ping":
        write_json({"type": "pong", "version": VERSION})
        return

    if cmd == "cancel":
        _CANCEL_EVENT.set()
        return

    if cmd == "import_export":
        export_dir = cmd_obj.get("export_dir")
        mode = cmd_obj.get("mode")
        db_path = cmd_obj.get("db_path")

        if not isinstance(export_dir, str) or not export_dir:
            write_json({"type": "import_error", "message": "import_export: export_dir must be a non-empty string"})
            return
        if not isinstance(mode, str) or not mode:
            write_json({"type": "import_error", "message": "import_export: mode must be a non-empty string"})
            return
        if not isinstance(db_path, str) or not db_path:
            write_json({"type": "import_error", "message": "import_export: db_path must be a non-empty string"})
            return
        if not os.path.isdir(export_dir):
            write_json({"type": "import_error", "message": "Export directory does not exist or is not a directory"})
            return

        start_import_thread(export_dir=export_dir, mode=mode, db_path=db_path)
        return

    if cmd == "build_report":
        db_path = cmd_obj.get("db_path")
        if not isinstance(db_path, str) or not db_path:
            write_json({"type": "report_error", "message": "build_report: db_path must be a non-empty string"})
            return
        if not os.path.isfile(db_path):
            write_json({"type": "report_error", "message": "DB path does not exist"})
            return
        start_report_thread(db_path=db_path)
        return

    write_json({"type": "error", "message": f"unknown_cmd: {cmd}"})


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            cmd_obj = json.loads(line)
        except Exception as e:
            write_json({"type": "error", "message": f"invalid_json: {str(e)}"})
            continue

        try:
            handle_command(cmd_obj)
        except Exception as e:
            write_json({"type": "error", "message": f"exception: {str(e)}"})


if __name__ == "__main__":
    main()
