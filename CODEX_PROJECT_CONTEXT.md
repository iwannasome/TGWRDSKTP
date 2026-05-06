# TGWR Project Context for Codex

This document is a working map of the project for future Codex sessions. It is intentionally practical: read this first, then open only the files related to the current task.

## Product Summary

TGWR, or Telegram Wrapped, is a local desktop app that imports a Telegram Desktop export and creates a visual yearly or all-time statistics report. The app is privacy-oriented: Telegram data is processed locally by a Python worker, with no server backend.

Main user flow:

1. User exports Telegram Desktop data, preferably as machine-readable JSON.
2. User opens TGWR and selects the Telegram export folder.
3. Electron starts a Python worker and sends an import command.
4. Worker scans/parses chats, writes a local SQLite database, computes metrics, and writes `report.json`.
5. React renderer loads the report and displays a slide-based Wrapped experience.
6. User can switch period/theme, inspect details tables, and export slides as PNG or PDF.

The README says the current app targets personal/private chats and skips group chats for personal stats.

## Tech Stack

- Desktop shell: Electron.
- Build/dev runner: electron-vite.
- Renderer: React 18, TypeScript, TailwindCSS, Framer Motion.
- Export rendering: `html-to-image` for PNG capture, `pdf-lib` for PDF assembly.
- Worker/backend: Python 3 standard library, SQLite3, JSONL over stdin/stdout.
- Packaging: electron-builder.

## Important Commands

- `npm run dev`: start Electron/Vite development app.
- `npm run build`: build main/preload/renderer bundles.
- `npm run typecheck`: run TypeScript checks for app and node configs.
- `npm run test:synthetic`: build, generate a synthetic Telegram export, run worker import/report, validate report, and exercise screenshot/export paths.
- `npm run verify`: typecheck, synthetic smoke test, and package directory build.
- `npm run pack`: build and run `electron-builder --dir`.
- `npm run dist:win`, `npm run dist:mac`, `npm run dist:linux`, `npm run dist:current`: platform packaging commands.

The synthetic smoke test writes under a temp directory by default, unless `TGWR_SMOKE_WORKDIR` is set.

## Repository Layout

Root files:

- `package.json`: project metadata, npm scripts, dependencies, electron-builder config.
- `package-lock.json`: npm dependency lockfile.
- `electron.vite.config.ts`: Electron/Vite build config.
- `tailwind.config.ts`, `postcss.config.cjs`: Tailwind/PostCSS config.
- `tsconfig.json`, `tsconfig.node.json`: TypeScript config.
- `Readme.md`: user-facing Russian README.
- `CODEX_PROJECT_CONTEXT.md`: this file.
- `worker/`: Python processing backend.
- `src/main/`: Electron main process.
- `src/preload/`: safe bridge exposed to renderer.
- `src/renderer/`: React UI.
- `scripts/`: repo scripts, currently synthetic smoke test.
- `dist/`, `release/`: generated build/package outputs.
- `test-electron-ipc.js`, `test-ipc.js`, `test-ipc.mjs`: older/manual IPC test helpers.

Generated or build directories should not be treated as source of truth unless the task is specifically about packaging artifacts.

## Runtime Architecture

The app has three runtime layers:

1. Electron main process:
   - Creates the browser window.
   - Starts and supervises the Python worker.
   - Owns native dialogs and filesystem writes that the renderer should not perform directly.
   - Forwards renderer commands to the worker.

2. Preload bridge:
   - Exposes `window.tgwr` through `contextBridge`.
   - Keeps `contextIsolation` enabled and `nodeIntegration` disabled.
   - Normalizes IPC responses for the renderer.

3. React renderer:
   - Shows setup/import state, slides view, and details view.
   - Sends worker commands through `window.tgwr.sendWorker`.
   - Receives worker/main events through `window.tgwr.onWorkerEvent`.
   - Exports slide DOM to PNG/PDF using renderer libraries and asks main to write files.

Python worker:

- Runs as a child process spawned by Electron.
- Reads JSON commands from stdin, one object per line.
- Writes JSON events to stdout, one object per line.
- Uses stderr for diagnostic text that main forwards as worker stderr events.
- Stores data in SQLite and writes `report.json` next to the selected database path.

## Electron Main Process

Main file: `src/main/index.ts`.

Important constants:

- `tgwr:worker-event`: main/preload event channel from worker/main to renderer.
- `tgwr:worker-send`: renderer sends worker commands.
- `tgwr:pick-export-dir`: native folder picker for Telegram export input.
- `tgwr:pick-output-dir`: native folder picker for slide/PDF output.
- `tgwr:write-output-file`: renderer sends bytes to main for writing exported PNG/PDF.
- `tgwr:load-report`: load `report.json`.
- `tgwr:delete-report`: delete existing `report.json`.

Worker startup:

- Development worker path: `worker/tgwr_worker.py` from `process.cwd()`.
- Packaged worker path: `process.resourcesPath/worker/tgwr_worker.py`.
- Windows Python candidates: `py -3 -u`, then `python -u`.
- Non-Windows candidates: `python -u`, then `python3 -u`.
- Main sends an initial `{ cmd: "ping" }` after spawn.

Renderer event buffering:

- `pendingEvents` holds events until the BrowserWindow has loaded.
- `lastKnownStatus` is replayed after `did-finish-load`.
- `emitToRenderer` sends immediately if safe, otherwise buffers.

Database path selection:

- In development, DB path is `app.getPath("userData")/tgwr.db`.
- In packaged mode, main tries to place `tgwr.db` next to the executable if that directory is writable.
- If executable directory is not writable, main falls back to `app.getPath("userData")/tgwr.db`.
- `report.json` is always resolved as `dirname(db_path)/report.json`.

Native/file IPC:

- `pickExportDir` opens an input folder dialog.
- `pickOutputDir` opens an output folder dialog with create-directory enabled.
- `writeOutputFile` validates filename safety, creates output directory, and writes bytes.
- `loadReport` accepts an optional db path and returns parsed report JSON.
- `deleteReport` deletes the report file but does not delete the SQLite DB.

Import forwarding:

- Renderer sends `{ cmd: "import_export", mode, export_dir }`.
- Main validates `export_dir` and `mode`, computes `db_path`, logs a host event, and forwards `{ ...cmdObj, db_path }` to the worker.

## Preload Bridge

Main file: `src/preload/index.ts`.

Exposed API: `window.tgwr`.

Methods:

- `onWorkerEvent(cb)`: subscribe to worker/main events; returns unsubscribe.
- `sendWorker(cmdObj)`: send command object to main/worker.
- `pickExportDir()`: returns selected path or null.
- `pickOutputDir()`: returns selected output path or null.
- `writeOutputFile(dirPath, filename, bytes)`: writes PNG/PDF bytes through main.
- `loadReport(dbPath?)`: loads report JSON through main.
- `deleteReport(dbPath?)`: deletes `report.json` through main.

Types are declared in `src/preload/index.ts` and consumed globally through `src/renderer/src/global.d.ts`.

## Renderer App

Entry points:

- `src/renderer/index.html`: HTML shell.
- `src/renderer/src/main.tsx`: React mount.
- `src/renderer/src/App.tsx`: top-level app state, import/report flow, and view switching.
- `src/renderer/src/styles.css`: global Tailwind and theme styling.

Top-level app state in `App.tsx`:

- Theme: `neon`, `cyber`, or `midnight`, persisted in `localStorage` as `tgwr_theme`.
- Period: `year` or `all_time`.
- View: `setup`, `slides`, or `details`.
- Worker status and last worker event.
- Import progress/summary/error.
- Report build progress/error.
- DB/report paths and parsed report object.
- Existing report prompt state.

Important renderer behavior:

- On startup, the app checks for existing `report.json` unless screenshot mode is active.
- Screenshot mode is enabled by URL query `tgwr_screenshot=1`.
- `loadReport` tolerates worker/main returning `report` either as an object or as a JSON string.
- When report loading succeeds, view switches to `slides`.

## Wrapped Renderer Modules

Directory: `src/renderer/src/wrapped/`.

Core files:

- `SlidesView.tsx`: slide navigator, keyboard/wheel navigation, export PNG/PDF.
- `DetailsView.tsx`: details tables for top people metrics.
- `SlideFrame.tsx`: shared slide frame/layout wrapper.
- `AnimatedNumber.tsx`: animated numeric display component.
- `report.ts`: safe report selectors and normalization helpers.
- `safe.ts`: generic safe unknown-data access helpers.
- `format.ts`: formatting helpers for numbers, percentages, durations, clamps.
- `slideTypes.ts`: shared slide/theme prop types.

Slide components:

- `slides/Slide01Cover.tsx`
- `slides/Slide02TotalMessages.tsx`
- `slides/Slide03SentVsReceived.tsx`
- `slides/Slide04MostActiveMonth.tsx`
- `slides/Slide05MostActiveHour.tsx`
- `slides/Slide06NightRatio.tsx`
- `slides/Slide07TopPersonMessages.tsx`
- `slides/Slide08TopPersonMutuality.tsx`
- `slides/Slide09FastestReplyPerson.tsx`
- `slides/Slide10IgnoredMostPerson.tsx`
- `slides/Slide11WordCloud.tsx`
- `slides/Slide12EmojiTop.tsx`
- `slides/Slide13MediaCounts.tsx`
- `slides/Slide14LongestMessage.tsx`
- `slides/Slide15LongestStreak.tsx`
- `slides/Slide16LongestSilence.tsx`
- `slides/Slide17DayPerson.tsx`
- `slides/Slide18NightPerson.tsx`
- `slides/Slide19Achievements.tsx`
- `slides/Slide20End.tsx`
- `slides/Slide21Credits.tsx`

Slides are registered in the `slides` array inside `SlidesView.tsx`. To add/remove/reorder slides, update that array and check export behavior.

Slide canvas:

- Design target is `1920 x 1080`.
- `SlidesView` scales the slide stage to fit the window.
- Export capture uses an offscreen/current export stage at fixed `1920 x 1080`.
- PNG filenames are `slide_01.png`, `slide_02.png`, etc.
- PDF output filename is `tgwr_wrapped.pdf`.

Navigation:

- Next: ArrowDown, ArrowRight, PageDown, Space, wheel down.
- Previous: ArrowUp, ArrowLeft, PageUp, wheel up.
- Home/End jump to first/last slide.
- URL query `tgwr_slide=N` sets initial slide index.

## Python Worker

Main file: `worker/tgwr_worker.py`.

The worker is intentionally self-contained and mostly standard-library based. It handles import, persistence, metric computation, and report writing.

Global synchronization:

- `_STDOUT_LOCK`: serializes JSONL writes.
- `_CANCEL_EVENT`: shared cancellation flag.
- `_IMPORT_LOCK` and `_IMPORT_THREAD`: prevent overlapping imports.
- `_REPORT_LOCK` and `_REPORT_THREAD`: prevent overlapping report builds.

Worker command entrypoints:

- `main()`: stdin loop.
- `handle_command(cmd_obj)`: command dispatch.
- `start_import_thread(export_dir, mode, db_path)`: async import start.
- `start_report_thread(db_path)`: async report build start.
- `do_import(export_dir, mode, db_path)`: scan, parse, write DB.
- `do_build_report(db_path)`: compute report and write JSON.

Expected command types:

- `{ "cmd": "ping" }`: worker should respond with `pong`.
- `{ "cmd": "import_export", "mode": "...", "export_dir": "...", "db_path": "..." }`: import Telegram export into SQLite.
- `{ "cmd": "build_report", "db_path": "..." }`: compute metrics and write `report.json`.
- Cancel command support exists through the global cancel event; inspect `handle_command` before changing cancel behavior.

Common event types:

- `pong`
- `progress`
- `import_done`
- `import_error`
- `report_done`
- `report_error`
- Worker status and host events are emitted by Electron main, not the Python worker.

Database schema:

- `chats`: imported chat metadata.
- `meta`: key/value metadata.
- `messages`: imported Telegram messages. Inspect `recreate_db` and `ensure_schema` for the authoritative schema and migrations.

Database helpers:

- `recreate_db`: creates a new DB and base tables.
- `create_indexes`: creates performance indexes.
- `ensure_messages_unique_index`: adds uniqueness for imported messages.
- `dedupe_existing_messages_by_msg_id`: cleans duplicates before unique index.
- `ensure_schema`: migrates/ensures expected columns for existing DBs.
- `meta_get`, `meta_set`: metadata access.

Import pipeline:

1. `scan_export_dir(export_dir)` finds candidate JSON/HTML paths.
2. JSON helpers identify Telegram export shapes:
   - `is_chat_export_json`
   - `load_json_safely`
   - `flatten_text`
   - `derive_export_chat_id`
3. HTML helpers parse Telegram HTML export:
   - `extract_html_chat_title`
   - `count_html_messages`
   - `iter_html_message_blocks`
   - `parse_html_message_block`
   - `TgHtmlMsgParser`
4. Candidate logic:
   - `ChatCandidate`
   - `Unit`
   - `build_candidates`
   - `dedupe_candidates`
5. Insert logic:
   - `insert_json_messages_from_file`
   - `insert_result_chat_messages`
   - `insert_html_messages_from_file`
6. Direction logic:
   - `compute_self_from_id`
   - `apply_direction_updates`

Date/time assumptions:

- Telegram JSON ISO dates without timezone are interpreted as Europe/Moscow.
- HTML title dates are also normalized as Europe/Moscow.
- `_moscow_tzinfo()` uses `zoneinfo.ZoneInfo("Europe/Moscow")` when available and falls back to UTC+03:00.

Metric/report pipeline:

- Period windows use `_period_where_clause`.
- Core counters: `_count_messages`, `_distinct_days_count`, `_period_hours`.
- Activity series: `_daily_activity`, `_hourly_activity`.
- Period span and extremes: `_period_span`, `_month_activity_extremes`, `_daily_direction_extremes`.
- Night stats: `_night_insights`.
- People stats: `_people_stats`, `_peer_activity_insights`.
- Reply metrics: `_compute_reply_times`.
- Streak/silence: `_longest_streak_days`, `_longest_person_streak`, `_longest_silence_gap`.
- Text/emoji: `_text_metrics_sent`, `clean_text_for_stats`, `tokenize_words`, `extract_emojis`.
- Media: `_normalize_media_bucket`, `_media_counts`, `_media_insights`.
- Rankings: `_top_10_people_by_messages`, `_top_10_people_by_time_span`, `_top_10_people_by_mutuality`.
- Achievements: `_achievements`.
- Slide-specific derived payload: `_slides_data`.
- Period aggregation: `_compute_period_metrics`.

## Report Shape

The renderer treats report data as `unknown` and reads it through safe selectors in `report.ts`. This is deliberate: worker output may evolve, and the UI should degrade gracefully instead of crashing on missing fields.

High-level report shape:

```json
{
  "meta": {
    "msk_year_used": 2025
  },
  "periods": {
    "all_time": {},
    "year": {}
  },
  "achievements": [],
  "top_people": [],
  "slides_data": {}
}
```

Common period fields consumed by UI:

- `total_messages`
- `sent_messages`
- `received_messages`
- `total_chats_personal`
- `most_active_day`
- `most_active_month`
- `most_active_hour`
- `daily_activity`
- `hourly_activity`
- `active_days_count`
- `night_messages_count`
- `night_messages_ratio`
- `top_10_people_by_messages`
- `top_10_people_by_time_span`
- `top_10_people_by_mutuality`
- `who_you_reply_fastest`
- `who_you_ignore_most`
- `word_cloud`
- `top_words`
- `top_emojis`
- `media_counts`
- `longest_message_sent`
- `top_longest_messages_sent`
- `longest_streak_days`
- `longest_person_streak`
- `longest_silence_gap`
- `day_person`
- `night_person`

When adding a worker metric:

1. Add it to worker report generation.
2. Add a safe selector in `src/renderer/src/wrapped/report.ts` if multiple components will use it.
3. Use defensive fallbacks in slides/details.
4. Extend `scripts/synthetic-smoke.mjs` assertions if the metric is important.

## Synthetic Smoke Test

Main file: `scripts/synthetic-smoke.mjs`.

What it does:

- Creates a fake Telegram export under temp.
- Includes multiple personal chats and one group chat that should be skipped.
- Starts `python3 worker/tgwr_worker.py` directly.
- Sends `ping`, `import_export`, and `build_report`.
- Validates the resulting `report.json`.
- Contains checks for major metric groups: top people, longest messages, word cloud, achievements, period span, quietest month, direction extremes, night insights, reply thresholds, emoji metrics, media insights, and day/night person details.

Use this test when changing:

- Worker import/parsing.
- Worker metrics/report shape.
- Renderer assumptions about report fields.
- Export/screenshot behavior.

## Recent Codex Session Notes, 2026-05-06

This section records the main work done during the long animation/release-readiness session so future Codex runs do not rediscover it from scratch.

### Generated App Icon

Generated Electron app icon assets under `build/`:

- `build/icon.png`
- `build/icon.ico`
- `build/icon.icns`

If packaging config or installer branding is changed later, verify these files are still referenced by `package.json` / electron-builder config before regenerating assets.

### Wrapped Slide Animation Pass

The current animation strategy is intentionally mixed:

- Framer Motion is still used for large slide/card entrances where the element count is small.
- Repeated grids/lists/words/emoji/media elements were moved toward CSS or native SVG animation to avoid slide-open lag.
- Hover reveals and simple visual feedback should prefer CSS classes in `src/renderer/src/styles.css` instead of React state.
- Export/screenshot mode must render a stable final state and should avoid infinite or delayed animation when possible.

Global CSS helpers added in `src/renderer/src/styles.css`:

- `tgwr-info-card`: lightweight card fade/hover styling, with optional `data-tip` tooltip.
- `tgwr-word-token`: CSS-only word-cloud token entrance, hover scale/glow, and tooltip.
- `tgwr-pop-icon`: small icon hover lift inside info cards.
- `tgwr-heat-cell`, `tgwr-heat-cell-animate`: optimized heatmap cell animation for slide 4.
- `tgwr-month-total-bar`, `tgwr-month-total-bar-animate`: CSS scaleX animation for month totals.
- `tgwr-hour-bar-*`: hour chart hover, cap, and label styling for slide 5.

When adding new slide animations, avoid animating hundreds of individual nodes with Framer Motion. Prefer CSS keyframes, `transform`, `opacity`, native SVG `<animate>`, and memoized geometry.

### Slide 4, Most Active Month

File: `src/renderer/src/wrapped/slides/Slide04MostActiveMonth.tsx`.

Optimization done:

- Replaced many heatmap `motion.div` cells with normal `<div>` elements using `tgwr-heat-cell` / `tgwr-heat-cell-animate`.
- Replaced month total progress animation with CSS `scaleX` via `tgwr-month-total-bar`.
- Goal was to keep visual motion while avoiding lag when opening slide 4.

Important note: slide 4 previously had large repeated animated DOM counts. If lag comes back, inspect per-cell animations first.

### Slide 5, Most Active Hour

File: `src/renderer/src/wrapped/slides/Slide05MostActiveHour.tsx`.

This slide was iterated several times and has a few important lessons:

- The hour skyline must be wide. A narrow/tall SVG `viewBox` such as `620 x 760` makes the chart appear as a thin vertical cluster inside the right panel.
- The current chart geometry uses a wide `viewBox` (`1180 x 680`) and 24 memoized `HourBar` objects.
- Bar geometry is computed in `useMemo`; do not move hover behavior into React state.
- Bars use native SVG `<animate>` for `y` and `height`, not Framer Motion. This avoids the earlier issue where SVG bars looked inverted or animated incorrectly.
- Peak highlight, top caps, average line, and hover labels are SVG/CSS based.
- The activity curve over the bar tops uses a normalized path animation:
  - `pathLength="1"`
  - `strokeDasharray="1"`
  - `strokeDashoffset` animates from `1` to `0`
- Do not revert this to `strokeDasharray={chart.chartWidth + ...}`. That can cause the top curve to appear torn or segmented when switching away from the slide and back.
- The displayed bar scaling intentionally uses a compressed local scale when hourly values have low variance, so a nearly-flat dataset does not look like a featureless fence. Tooltip/count values still use the real counts.
- The average line should be based on the 24 hourly buckets used by this chart, not the period-wide `average_messages_per_hour`.

Visual validation matters for this slide. `npm run test:synthetic` does not screenshot slide 5 by default. Use `TGWR_SMOKE_ALL_SLIDES=1 npm run test:synthetic` to generate `base-slide-05.png`, then inspect it manually. Also compare against real app viewport screenshots if the user reports layout issues, because the harness viewport can make the whole 1920x1080 stage look small.

### Slide 14, Longest Messages

File: `src/renderer/src/wrapped/slides/Slide14LongestMessage.tsx`.

Implemented hover accordion behavior:

- Long message cards expand on hover (`hover:flex-[...]`) to reveal more of the message body.
- Message panel reveal is CSS-only using max-height/opacity/margin transitions.
- Export mode renders a static readable snippet instead of relying on hover.

Keep this interaction CSS-only unless there is a strong reason to add state.

### Other Slide Animation Updates

Many slide cards received `tgwr-info-card` to provide subtle hover feedback and consistent visual motion.

Specific notable conversions:

- `Slide11WordCloud.tsx`: word tokens are normal spans with `tgwr-word-token`; Framer Motion removed for mass tokens.
- `Slide12EmojiTop.tsx`: emoji cards converted away from mass Framer Motion usage; hover uses CSS and `tgwr-pop-icon`.
- `Slide13MediaCounts.tsx`: media cards converted similarly.
- `Slide21Credits.tsx`: repeated thanks items converted to CSS-hover cards.

### Release Readiness Findings

Checks that passed repeatedly during this session:

- `npm run typecheck`
- `npm run build`
- `npm run test:synthetic`
- `TGWR_SMOKE_ALL_SLIDES=1 npm run test:synthetic`

Known packaging blocker discovered:

- `npm run pack` / electron-builder directory packaging fails because electron-builder's npm dependency collector receives no JSON from an npm command.
- The issue was reproducible around `spawn('npm', args, { shell: true })` producing empty stdout in this environment.
- Treat this as a release blocker until packaging is debugged. Do not assume the app is fully releasable just because typecheck/build/synthetic pass.

### Working With Current Dirty Tree

At the end of this session many slide files and `styles.css` were modified, plus generated icon assets exist under `build/`. Do not casually revert these changes. If future work needs to isolate a smaller patch, inspect `git diff` first and preserve unrelated user/session changes.

## Data Privacy Boundary

The design expectation is that user Telegram data never leaves the local machine.

Be careful with changes that:

- Add network requests.
- Add telemetry.
- Upload logs, report data, DB files, screenshots, or exports.
- Include real user paths or message text in persistent logs.

The app can still use npm dependencies during development/build, but runtime data processing should remain local.

## Development Notes for Future Codex Sessions

Start with these reads depending on task:

- Product flow or user-facing docs: `Readme.md`, then this file.
- Electron/IPC issue: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/global.d.ts`.
- Import/parsing/metrics issue: `worker/tgwr_worker.py`, then `scripts/synthetic-smoke.mjs`.
- Report UI issue: `src/renderer/src/App.tsx`, `src/renderer/src/wrapped/report.ts`, affected slide file.
- Export issue: `src/renderer/src/wrapped/SlidesView.tsx`, `src/main/index.ts`.
- Styling/theme issue: `src/renderer/src/styles.css`, affected component.

Rules of thumb:

- Treat `worker/tgwr_worker.py` as the backend source of truth for schema and metrics.
- Treat `report.ts` as the renderer contract layer between unknown report JSON and typed-ish UI data.
- Keep IPC payloads plain JSON-serializable objects.
- Keep renderer filesystem access behind preload/main APIs.
- Avoid direct Node usage in renderer.
- Do not make slide components assume fields exist; use report selectors and fallbacks.
- When changing worker output, update synthetic smoke assertions for important behavior.
- When changing slide registration, check both interactive navigation and export.
- Avoid editing generated `dist/` or `release/` unless the task is explicitly about generated artifacts.

## Current Git State When This File Was Added

At the time this document was created, the branch was `master` tracking `origin/master`, with several untracked files/directories already present:

- `.codex`
- `.gitignore`
- `scripts/`
- `src/renderer/src/wrapped/AnimatedNumber.tsx`

Do not assume these are disposable. Inspect before modifying or deleting.
