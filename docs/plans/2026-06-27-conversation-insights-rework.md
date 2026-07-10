# Implementation Plan: Conversation Insights Rework

## Overview

Implement the first wave of `TGWR by IWS`: period-aware, people-first conversation insights with quality gates, confidence labels, Explore proof, selected deck moments, and simple `Export this insight` cards.

The work must stay incremental. The worker/report contract lands first, then renderer normalization, then Explore, deck, share export, and final packaging verification.

Approved spec: `docs/specs/2026-06-27-conversation-insights-rework-design.md`

## Requirements

- Add 14 conversation insight slots for both `year` and `all_time`.
- Give each insight a confidence level and no-winner state.
- Prevent tiny chats from winning major insights.
- Make comeback, growth, fading, stability, rhythm, reply, initiative, and media insights eligible only after quality gates pass.
- Keep existing reports loadable.
- Keep all processing local.
- Brand the app as `TGWR by IWS`.
- Put subtle `IWS` watermark on exported insight cards.
- Show the strongest 5-7 insights in the deck.
- Show all 14 insights with evidence in Explore/People.
- Add simple `Export this insight` behavior, not a full Share Lab.
- Keep `npm run verify`, synthetic smoke, packaging, and runtime audit green.

## Architecture Changes

- `worker/tgwr_worker.py`: compute and emit `conversation_insights` per period.
- `scripts/synthetic-smoke.mjs`: generate fixture cases and assert insight invariants.
- `src/renderer/src/wrapped/report.ts`: normalize typed insight data defensively.
- `src/renderer/src/wrapped/format.ts`: add copy/format helpers for confidence, periods, evidence, and insight labels.
- `src/renderer/src/wrapped/PeopleView.tsx`: add full insight explorer.
- `src/renderer/src/wrapped/DetailsView.tsx`: expose compact insight summary tables.
- `src/renderer/src/wrapped/SlidesView.tsx`: route selected insight slides and export insight cards.
- `src/renderer/src/wrapped/export.ts`: share PNG capture and output-file helpers between deck export and insight export.
- `src/renderer/src/wrapped/SlideFrame.tsx`: support `TGWR by IWS`/`IWS` branding treatment.
- `src/renderer/src/wrapped/slides/*`: replace or add selected deck insight slides.
- `src/renderer/src/styles.css`: add reusable insight card, confidence badge, and watermark styling.
- `src/renderer/src/App.tsx`: update visible brand copy to `TGWR by IWS`.

## Report Contract

Each period object should include:

```json
{
  "conversation_insights": {
    "main_person": {
      "kind": "main_person",
      "title": "Главный человек года",
      "confidence": "behavioral",
      "winner": {
        "peer_from_id": "user...",
        "display_name": "..."
      },
      "score": 0,
      "evidence": {},
      "candidates": [],
      "no_winner_reason": null
    }
  }
}
```

Required insight keys:

- `main_person`
- `stable_dialog`
- `comeback`
- `closer_dialog`
- `faded_dialog`
- `night_companion`
- `day_anchor`
- `alive_dialog`
- `longest_live_session`
- `reply_rhythm`
- `mutual_dialog`
- `contact_initiator`
- `silence_restarter`
- `media_bond`

Allowed confidence values:

- `exact`
- `behavioral`
- `heuristic`

## Implementation Steps

### Phase 1: Contract And Failing Tests — Minimum Viable

1. **Add synthetic conversation scenarios** (File: `scripts/synthetic-smoke.mjs`)
   - Action: Expand the fixture to include at least one stable large chat, one real comeback chat, one tiny false comeback chat, one growth chat, one fading chat, one media-heavy chat, and one all-time-only chat.
   - Why: Insight quality gates need fixtures that can fail before worker implementation.
   - Dependencies: None
   - Risk: Medium

2. **Add report contract assertions** (File: `scripts/synthetic-smoke.mjs`)
   - Action: Assert that `year.conversation_insights` and `all_time.conversation_insights` contain all 14 keys, allowed confidence values, no-winner support, winner shape, evidence shape, and candidates arrays.
   - Why: Locks the schema before UI work.
   - Dependencies: Step 1
   - Risk: Low

3. **Add quality-gate regression assertions** (File: `scripts/synthetic-smoke.mjs`)
   - Action: Assert that the tiny false comeback chat cannot win comeback and that large eligible chats can win relevant insights.
   - Why: Protects the core accuracy promise.
   - Dependencies: Step 1
   - Risk: Medium

4. **Add empty-report compatibility assertions** (File: `scripts/synthetic-smoke.mjs`)
   - Action: Ensure synthetic empty/extreme reports can omit `conversation_insights` or include empty no-winner objects without renderer smoke failures.
   - Why: Existing user reports must still open.
   - Dependencies: Step 2
   - Risk: Low

5. **Run red verification** (File: `scripts/synthetic-smoke.mjs`)
   - Action: Run `npm run test:synthetic` and confirm it fails specifically on missing `conversation_insights`.
   - Why: TDD gate for the worker contract.
   - Dependencies: Steps 1-4
   - Risk: Low

### Phase 2: Worker Data Foundation

1. **Introduce insight constants and helpers** (File: `worker/tgwr_worker.py`)
   - Action: Add insight key constants, confidence constants, no-winner builder, winner builder, evidence helpers, and clamp/score helpers near existing metric helpers.
   - Why: Keeps all 14 insights structurally consistent.
   - Dependencies: Phase 1
   - Risk: Low

2. **Add reusable personal-chat query helper** (File: `worker/tgwr_worker.py`)
   - Action: Add a helper that returns period-bounded non-service messages joined with valid personal chats and banned-peer filters.
   - Why: Avoids duplicated SQL and accidental mismatch between insights.
   - Dependencies: Phase 2 Step 1
   - Risk: Medium

3. **Add per-peer activity profile builder** (File: `worker/tgwr_worker.py`)
   - Action: Build profiles with total, sent/received, active days, active months, first/last timestamps, monthly counts, day/hour buckets, media counts, initiated days, and reply samples.
   - Why: Most insights should score from one shared profile map.
   - Dependencies: Phase 2 Step 2
   - Risk: High

4. **Add session extraction** (File: `worker/tgwr_worker.py`)
   - Action: Compute per-peer bounded sessions using a fixed inactivity gap, with session duration, message count, density, first/last timestamp, and directions.
   - Why: Powers `alive_dialog` and `longest_live_session`.
   - Dependencies: Phase 2 Step 2
   - Risk: Medium

5. **Add silence segment extraction** (File: `worker/tgwr_worker.py`)
   - Action: Compute meaningful per-peer gaps with before-window and after-window message/activity counts.
   - Why: Powers comeback and silence restarter without tiny-chat false positives.
   - Dependencies: Phase 2 Step 3
   - Risk: High

6. **Add period-aware thresholds** (File: `worker/tgwr_worker.py`)
   - Action: Define minimum totals, active days, active months, reply samples, media events, gap days, before/after messages, and after-gap active days for `year` vs `all_time`.
   - Why: All-time and year need different gates.
   - Dependencies: Phase 2 Steps 3-5
   - Risk: Medium

7. **Add worker unit-style self checks through synthetic smoke only** (File: `scripts/synthetic-smoke.mjs`)
   - Action: Extend assertions to check profiles indirectly through insight evidence values.
   - Why: Current project has smoke tests, not a separate Python unit harness.
   - Dependencies: Phase 2 Steps 3-6
   - Risk: Low

### Phase 3: Worker Insight Scoring

1. **Implement `main_person` scoring** (File: `worker/tgwr_worker.py`)
   - Action: Score eligible people from volume, active days/months, stability, and balance; emit evidence and candidates.
   - Why: Replaces simplistic "top by messages" framing.
   - Dependencies: Phase 2
   - Risk: Medium

2. **Implement `stable_dialog` scoring** (File: `worker/tgwr_worker.py`)
   - Action: Score steady month coverage, active-day spread, low variance, and gap penalties.
   - Why: Adds a high-trust people-first metric.
   - Dependencies: Phase 2
   - Risk: Medium

3. **Implement `comeback` scoring** (File: `worker/tgwr_worker.py`)
   - Action: Use silence segments with before/after gates, sustained revival checks, and low-volume penalties.
   - Why: Directly addresses the false comeback risk.
   - Dependencies: Phase 2 Steps 5-6
   - Risk: High

4. **Implement `closer_dialog` and `faded_dialog`** (File: `worker/tgwr_worker.py`)
   - Action: Compare period-aware windows with baseline floors and tiny-baseline penalties.
   - Why: Growth/fading must be meaningful, not arithmetic noise.
   - Dependencies: Phase 2 Steps 3 and 6
   - Risk: High

5. **Implement rhythm insights** (File: `worker/tgwr_worker.py`)
   - Action: Emit `night_companion`, `day_anchor`, `alive_dialog`, `longest_live_session`, and `reply_rhythm`.
   - Why: These create the deck-friendly communication rhythm layer.
   - Dependencies: Phase 2 Steps 3-6
   - Risk: Medium

6. **Implement balance and initiative insights** (File: `worker/tgwr_worker.py`)
   - Action: Emit `mutual_dialog`, `contact_initiator`, and `silence_restarter` using volume, initiated-day, and pause gates.
   - Why: Adds "who keeps the dialogue alive" without accusatory copy.
   - Dependencies: Phase 2 Steps 3-6
   - Risk: Medium

7. **Implement `media_bond`** (File: `worker/tgwr_worker.py`)
   - Action: Pick eligible media-heavy person with top media type and evidence counts.
   - Why: Gives a precise style-of-communication insight.
   - Dependencies: Phase 2 Step 3
   - Risk: Low

8. **Attach insights to period metrics** (File: `worker/tgwr_worker.py`)
   - Action: Add `_conversation_insights(conn, label, start_ts, end_ts, people, reply_stats)` and set `metrics["conversation_insights"]`.
   - Why: Keeps period data colocated with existing metrics.
   - Dependencies: Phase 3 Steps 1-7
   - Risk: Medium

9. **Update slides data payload** (File: `worker/tgwr_worker.py`)
   - Action: Include selected conversation insight references in `slides_data` without removing existing slide data.
   - Why: Future deck rendering can use a stable payload.
   - Dependencies: Phase 3 Step 8
   - Risk: Low

10. **Run green worker verification** (File: `scripts/synthetic-smoke.mjs`)
    - Action: Run `PYTHONWARNINGS=error::DeprecationWarning npm run test:synthetic` and fix worker/report failures.
    - Why: Confirms schema and quality gates.
    - Dependencies: Phase 3 Steps 1-9
    - Risk: Low

### Phase 4: Renderer Normalization And Copy

1. **Add TypeScript insight types** (File: `src/renderer/src/wrapped/report.ts`)
   - Action: Define `ConversationInsightKind`, `ConversationInsightConfidence`, `ConversationInsightWinner`, `ConversationInsight`, and `ConversationInsights`.
   - Why: UI should not inspect raw report objects everywhere.
   - Dependencies: Phase 3
   - Risk: Low

2. **Add defensive insight normalizers** (File: `src/renderer/src/wrapped/report.ts`)
   - Action: Implement `getConversationInsights(report, period)`, `getConversationInsight(...)`, and candidate/evidence normalization.
   - Why: Existing reports must keep loading.
   - Dependencies: Phase 4 Step 1
   - Risk: Medium

3. **Add period-aware copy helpers** (File: `src/renderer/src/wrapped/format.ts`)
   - Action: Add labels for insight titles, confidence labels, period wording, no-winner reasons, and evidence formatting.
   - Why: Keeps Russian copy consistent and non-cringe.
   - Dependencies: Phase 4 Step 1
   - Risk: Low

4. **Add insight selection helper** (File: `src/renderer/src/wrapped/report.ts`)
   - Action: Implement helper that returns best deck-worthy insights from the 14 with no-winner filtering.
   - Why: Deck should show 5-7 strongest insights, not every slot.
   - Dependencies: Phase 4 Step 2
   - Risk: Medium

5. **Update brand copy** (File: `src/renderer/src/App.tsx`)
   - Action: Change visible product marks to `TGWR by IWS` while keeping local privacy copy.
   - Why: Starts the brand transition.
   - Dependencies: None
   - Risk: Low

6. **Update frame/footer brand copy** (File: `src/renderer/src/wrapped/SlideFrame.tsx`)
   - Action: Support subtle `TGWR by IWS` or `IWS` mark in slide frame/footer.
   - Why: Keeps deck and export brand consistent.
   - Dependencies: Phase 4 Step 5
   - Risk: Low

7. **Run renderer typecheck** (File: `src/renderer/src/wrapped/report.ts`)
   - Action: Run `npm run typecheck` and fix normalization/copy type issues.
   - Why: Locks the renderer contract before UI work.
   - Dependencies: Phase 4 Steps 1-6
   - Risk: Low

### Phase 5: Explore/People Insight Proof

1. **Add insight overview panel** (File: `src/renderer/src/wrapped/PeopleView.tsx`)
   - Action: Add a top-level period-aware panel listing all 14 insight slots with winner, confidence, and no-winner state.
   - Why: Explore must prove all insights, not just deck highlights.
   - Dependencies: Phase 4
   - Risk: Medium

2. **Add insight detail panel** (File: `src/renderer/src/wrapped/PeopleView.tsx`)
   - Action: Show selected insight explanation, evidence values, candidates, and quality gate/no-winner reason.
   - Why: Lets users trust the metric.
   - Dependencies: Phase 5 Step 1
   - Risk: Medium

3. **Connect person selection to insights** (File: `src/renderer/src/wrapped/PeopleView.tsx`)
   - Action: When a selected person is an insight winner/candidate, show related insight badges in their profile.
   - Why: People-first analysis should feel connected.
   - Dependencies: Phase 5 Step 2
   - Risk: Medium

4. **Add compact details summary** (File: `src/renderer/src/wrapped/DetailsView.tsx`)
   - Action: Add a table/card block with insight winners, confidence, and evidence summary.
   - Why: Details mode should remain useful for scanning.
   - Dependencies: Phase 4
   - Risk: Low

5. **Add reusable insight UI styles** (File: `src/renderer/src/styles.css`)
   - Action: Add classes for insight cards, confidence badges, evidence rows, no-winner states, and IWS watermark.
   - Why: Avoid one-off styling in every component.
   - Dependencies: Phase 5 Steps 1-4
   - Risk: Low

6. **Run typecheck and synthetic renderer smoke** (File: `scripts/synthetic-smoke.mjs`)
   - Action: Run `npm run typecheck` and `npm run test:synthetic`; inspect Chrome-skip behavior if Chrome is still absent.
   - Why: Protects existing People/Details harnesses.
   - Dependencies: Phase 5 Steps 1-5
   - Risk: Low

### Phase 6: Deck Highlights

1. **Create generic insight slide component** (File: `src/renderer/src/wrapped/slides/InsightStorySlide.tsx`)
   - Action: Add a reusable slide for headline, winner, evidence, confidence, and `IWS` mark.
   - Why: Avoid copying 5-7 one-off slide layouts.
   - Dependencies: Phase 4
   - Risk: Medium

2. **Add selected deck insight slides** (File: `src/renderer/src/wrapped/SlidesView.tsx`)
   - Action: Insert 5-7 insight slides or replace weaker existing people/reply slides while preserving total export behavior.
   - Why: Deck becomes people-first without showing all 14.
   - Dependencies: Phase 6 Step 1
   - Risk: Medium

3. **Update existing people/reply slide copy** (File: `src/renderer/src/wrapped/slides/Slide07TopPersonMessages.tsx`)
   - Action: Reframe as main-person insight when available; fall back to old top-person data.
   - Why: Preserve old reports and upgrade new ones.
   - Dependencies: Phase 4
   - Risk: Medium

4. **Update mutuality slide** (File: `src/renderer/src/wrapped/slides/Slide08TopPersonMutuality.tsx`)
   - Action: Use `mutual_dialog` when available; fall back to `top_10_people_by_mutuality`.
   - Why: Aligns old metric with new insight language.
   - Dependencies: Phase 4
   - Risk: Low

5. **Update reply slides to neutral rhythm copy** (File: `src/renderer/src/wrapped/slides/Slide09FastestReplyPerson.tsx`)
   - Action: Use `reply_rhythm` when available and avoid "ignored" framing.
   - Why: Keeps copy accurate and less toxic.
   - Dependencies: Phase 4
   - Risk: Medium

6. **Retire or soften ignored slide** (File: `src/renderer/src/wrapped/slides/Slide10IgnoredMostPerson.tsx`)
   - Action: Replace with comeback/silence-restarter insight or neutral slow-rhythm copy.
   - Why: Product tone should not accuse the user or contacts.
   - Dependencies: Phase 4
   - Risk: Medium

7. **Add deck empty states** (File: `src/renderer/src/wrapped/slides/InsightStorySlide.tsx`)
   - Action: Render calm fallback when an insight has no winner.
   - Why: Small exports should still look intentional.
   - Dependencies: Phase 6 Step 1
   - Risk: Low

8. **Run deck smoke** (File: `scripts/synthetic-smoke.mjs`)
   - Action: Run `npm run test:synthetic`; if Chrome becomes available, ensure screenshots catch no overlapping text.
   - Why: Deck layout is the most share-visible surface.
   - Dependencies: Phase 6 Steps 1-7
   - Risk: Low

### Phase 7: Simple Insight Export

1. **Add insight card component** (File: `src/renderer/src/wrapped/InsightExportCard.tsx`)
   - Action: Render a 9:16 card with headline, winner, evidence, explanation, confidence/local footer, optional anonymized name, and subtle `IWS` watermark.
   - Why: This is the first viral/share primitive.
   - Dependencies: Phase 4
   - Risk: Medium

2. **Extract shared PNG export helper** (File: `src/renderer/src/wrapped/export.ts`)
   - Action: Move the current `capturePngBytes` behavior into `capturePngBytes(node, options)` and add a `writePngWithPickedDirectory(filename, bytes)` helper that uses existing `window.tgwr.pickOutputDir` and `window.tgwr.writeOutputFile`.
   - Why: People/Explore and Slides need the same export path without duplicating capture code.
   - Dependencies: Phase 7 Step 1
   - Risk: Medium

3. **Update deck export to use shared helper** (File: `src/renderer/src/wrapped/SlidesView.tsx`)
   - Action: Replace the local `capturePngBytes` implementation with the shared helper while preserving PNG/PDF deck export behavior.
   - Why: Keeps one tested capture path.
   - Dependencies: Phase 7 Step 2
   - Risk: Medium

4. **Add `Export this insight` action in Explore** (File: `src/renderer/src/wrapped/PeopleView.tsx`)
   - Action: Add button on insight detail cards that renders a hidden `InsightExportCard`, captures it through `capturePngBytes`, and saves it through `writePngWithPickedDirectory`.
   - Why: Users should export the exact insight they are inspecting.
   - Dependencies: Phase 7 Steps 1-3
   - Risk: Medium

5. **Add anonymization toggle** (File: `src/renderer/src/wrapped/PeopleView.tsx`)
   - Action: Add a simple checkbox/toggle for hiding person names in exported insight cards.
   - Why: Supports share without exposing private contacts.
   - Dependencies: Phase 7 Step 4
   - Risk: Low

6. **Keep renderer API types aligned** (File: `src/renderer/src/global.d.ts`)
   - Action: Confirm `pickOutputDir` and `writeOutputFile` global types cover the shared export helper and update the type declarations if the helper needs stricter result typing.
   - Why: Keep the renderer compile-safe without adding new IPC.
   - Dependencies: Phase 7 Step 2
   - Risk: Low

7. **Harden main-process write path** (File: `src/main/index.ts`)
   - Action: Add filename/path validation to the existing write-output handler: reject path separators in `filename`, allow only `.png` and `.pdf`, and keep writes inside the selected output directory.
   - Why: Preserve local security posture.
   - Dependencies: Phase 7 Step 6
   - Risk: Medium

8. **Run export verification** (File: `scripts/synthetic-smoke.mjs`)
   - Action: Add smoke assertion for insight card render/capture when Chrome is available; otherwise keep graceful skip.
   - Why: Export regressions are user-visible.
   - Dependencies: Phase 7 Steps 1-7
   - Risk: Low

### Phase 8: Packaging, Docs, And Release Quality

1. **Update README branding and workflow** (File: `Readme.md`)
   - Action: Document `TGWR by IWS`, local-first promise, insight export, supported package targets, and Telegram export flow.
   - Why: Product positioning should match the app.
   - Dependencies: Phases 1-7
   - Risk: Low

2. **Update Docker docs** (File: `dockstation.md`)
   - Action: Keep Docker/noVNC instructions aligned with `docker-compose.yml`.
   - Why: Docker path was previously fragile.
   - Dependencies: None
   - Risk: Low

3. **Run full verification** (File: `package.json`)
   - Action: Run `npm run verify`.
   - Why: Required baseline gate.
   - Dependencies: Phases 1-7
   - Risk: Low

4. **Run strict worker smoke** (File: `scripts/synthetic-smoke.mjs`)
   - Action: Run `PYTHONWARNINGS=error::DeprecationWarning npm run test:synthetic`.
   - Why: Prevent Python deprecation regressions.
   - Dependencies: Phases 1-7
   - Risk: Low

5. **Run runtime audit** (File: `package-lock.json`)
   - Action: Run `npm audit --omit=dev`.
   - Why: Runtime security gate.
   - Dependencies: Phases 1-7
   - Risk: Low

6. **Run Linux packaging** (File: `package.json`)
   - Action: Run `npm run dist:linux`.
   - Why: AppImage packaging already had icon issues; keep it covered.
   - Dependencies: Phases 1-7
   - Risk: Medium

7. **Run Docker compose config** (File: `docker-compose.yml`)
   - Action: Run `docker compose config`.
   - Why: Confirms compose file remains parseable.
   - Dependencies: Phase 8 Step 2
   - Risk: Low

8. **Check generated/debris files** (File: `.gitignore`)
   - Action: Run `git status --short`, remove accidental logs/temp files, and keep generated artifacts ignored.
   - Why: Preserve clean branch state.
   - Dependencies: Phase 8 Steps 3-7
   - Risk: Low

## Testing Strategy

### Phase 1

- Unit: none; project has no JS unit test harness.
- Integration: `scripts/synthetic-smoke.mjs` report assertions fail red on missing insight contract.
- E2E: existing renderer smoke still runs after synthetic build, with Chrome skips allowed if Chrome is absent.

### Phase 2

- Unit: exercise worker helper behavior through synthetic fixture evidence.
- Integration: worker report generation over synthetic export.
- E2E: none beyond existing smoke.

### Phase 3

- Unit: synthetic assertions for all 14 keys, confidence values, no-winner states, candidate arrays, and comeback false-positive prevention.
- Integration: `PYTHONWARNINGS=error::DeprecationWarning npm run test:synthetic`.
- E2E: renderer smoke with new report shape.

### Phase 4

- Unit: TypeScript compile validates exported types and helper call sites.
- Integration: empty/extreme report renderer smoke must not crash without insights.
- E2E: existing screenshot/navigation/people smoke if Chrome exists.

### Phase 5

- Unit: TypeScript compile for People/Details components.
- Integration: synthetic report renders Explore/People with all 14 insights.
- E2E: people-view smoke when Chrome is available.

### Phase 6

- Unit: TypeScript compile for new insight slide component.
- Integration: synthetic deck renders insight slides and old-report fallbacks.
- E2E: screenshot smoke when Chrome is available.

### Phase 7

- Unit: TypeScript compile for export card props and anonymization path.
- Integration: insight card PNG path uses existing file output API.
- E2E: Chrome capture smoke when Chrome is available; graceful skip otherwise.

### Phase 8

- Build: `npm run verify`.
- Worker: `PYTHONWARNINGS=error::DeprecationWarning npm run test:synthetic`.
- Security: `npm audit --omit=dev`.
- Packaging: `npm run dist:linux`.
- Infra: `docker compose config`.

## Success Criteria

- [ ] Synthetic smoke fixture includes real and false-positive insight cases.
- [ ] `conversation_insights` exists for `year` and `all_time`.
- [ ] All 14 insight keys exist per period.
- [ ] Every insight has a confidence value from `exact`, `behavioral`, `heuristic`.
- [ ] Every insight supports no-winner state.
- [ ] Tiny false comeback chat cannot win.
- [ ] Growth/fading ignore tiny baselines.
- [ ] Reply rhythm requires enough samples.
- [ ] Initiative requires enough initiated days.
- [ ] Media bond requires enough media events.
- [ ] Existing reports without insights still load.
- [ ] App branding reads `TGWR by IWS`.
- [ ] Explore/People shows all 14 insights with evidence.
- [ ] Deck shows only selected strongest insights.
- [ ] Insight cards export as 9:16 with subtle `IWS` watermark.
- [ ] Optional anonymization hides person names on exported insight cards.
- [ ] No ML/cloud/telemetry/external upload is added.
- [ ] `npm run verify` passes.
- [ ] `PYTHONWARNINGS=error::DeprecationWarning npm run test:synthetic` passes.
- [ ] `npm audit --omit=dev` reports zero vulnerabilities.
- [ ] `npm run dist:linux` passes.
- [ ] `docker compose config` passes.

## Implementation Notes

- Use TDD: write/extend synthetic assertions first, confirm red, implement worker/renderer, then confirm green.
- Keep schema additions additive. Do not remove existing report fields or slides in this wave.
- Prefer no-winner output over misleading winners.
- Keep all user-facing copy in Russian unless it is a brand mark.
- Avoid emotional or psychological claims; describe observable communication patterns.
- Do not add a full Share Lab in this wave.
