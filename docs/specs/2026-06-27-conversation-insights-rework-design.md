# Conversation Insights Rework Design

## Goal

Rework TGWR into `TGWR by IWS`: a people-first Telegram Wrapped that explains a user's communication patterns clearly, locally, and beautifully.

The first wave should add deep non-ML conversation analysis without turning the product into a dry analytics dashboard. The deck should create the "this is about me" moment; Explore should prove that the insight is real.

## Product Direction

TGWR remains the product name. IWS becomes the visible author/studio brand.

- In-app product mark: `TGWR by IWS`.
- Exported cards: subtle `IWS` watermark.
- Final/credits slides: `Made with IWS`.
- Future direction: IWS can become the umbrella brand for more products.

The product tone is premium and clear by default, with restrained human warmth in share cards. It should not become aggressively meme-like or pretend to know the user's private life.

## Non-Negotiable Principles

- All processing stays local.
- No ML, no cloud processing, no telemetry, no external data upload.
- Do not present weak text heuristics as emotional or psychological truth.
- Every new insight must have an explicit confidence level.
- Every new insight must work for both `year` and `all_time`.
- `year` stays the default Wrapped/share period.
- `all_time` must be a first-class mode, not a degraded fallback.
- Small chats must not win major insights such as comeback, growth, fading, stability, or rhythm.
- Russian remains the primary user-facing language.

## Confidence Levels

Each new insight receives one of three labels:

- `точно посчитано`: direct facts from the export, such as counts, dates, gaps, media, reply links, active days.
- `поведенческий вывод`: a reliable interpretation of observed behavior, such as stability, comeback, growth, fading, night rhythm, initiative.
- `легкая эвристика`: weaker deterministic signals, such as punctuation-based or short-message patterns.

The first wave should mostly use `точно посчитано` and `поведенческий вывод`. `Легкая эвристика` must not drive the main deck.

## Period Model

Conversation insights must be computed for:

- `year`: the currently selected Wrapped year.
- `all_time`: the full imported Telegram history.

Copy must adapt to the period:

- `Главный человек года` / `Главный человек за все время`
- `Камбэк года` / `Камбэк за все время`
- `Самый стабильный диалог года` / `Самый стабильный диалог за все время`

The same insight may have different winners per period.

## Quality Gates

Every insight must define eligibility before scoring. This prevents noisy winners from tiny chats.

General candidate gates:

- Exclude service messages.
- Exclude Saved Messages and configured banned peers.
- Require a valid personal peer where the insight is person-based.
- Require minimum total messages for people-based insights.
- Require minimum active days or active months for stability and rhythm insights.
- Require minimum samples for reply-time and initiative insights.
- Prefer "no winner" over showing a misleading winner.

Comeback-specific gates:

- The chat must have meaningful activity before the silence.
- The silence gap must exceed a period-aware threshold.
- The post-gap activity must be sustained across multiple messages and active days.
- A case like "2 messages in 2022, then 4 messages in 2024" must not qualify.
- The result should explain the evidence: gap length, before activity, after activity, active days after return.

Growth/fading gates:

- Require enough activity in both comparison windows.
- Use period-aware windows:
  - for `year`: first half vs second half, or quarter/month trend where data supports it;
  - for `all_time`: split by meaningful time windows, not arbitrary tiny fragments.
- Penalize tiny baselines that create huge but meaningless multipliers.

Reply/initiative gates:

- Require enough reply samples before labeling rhythm.
- Require enough initiated days before labeling who starts contact.
- Use neutral language. Avoid accusatory "ignored you" framing.

Media gates:

- Require enough media events before naming a media bond.
- Name the observed media type, not the relationship meaning.

## Insight Set

The first wave contains 14 conversation insights.

### People Of The Period

1. **Главный человек периода**
   Composite score based on message volume, active days/months, stability, and balance. This is not just "most messages".
   Confidence: `поведенческий вывод`.

2. **Самый стабильный диалог**
   A person with steady communication across the period and no major unsupported gaps.
   Confidence: `поведенческий вывод`.

3. **Камбэк периода**
   A meaningful revival after a long silence, gated by before-gap and after-gap volume.
   Confidence: `поведенческий вывод`.

4. **Диалог, который стал ближе**
   A person whose communication increased meaningfully over the period.
   Confidence: `поведенческий вывод`.

5. **Диалог, который затих**
   A person whose communication decreased meaningfully after having real prior activity.
   Confidence: `поведенческий вывод`.

### Communication Rhythm

6. **Ночной собеседник**
   A person strongly associated with post-midnight communication.
   Confidence: `точно посчитано` for counts, `поведенческий вывод` for label.

7. **Дневной якорь**
   A person strongly associated with daytime communication.
   Confidence: `поведенческий вывод`.

8. **Самый живой диалог**
   A dialogue with high message density in short active sessions.
   Confidence: `поведенческий вывод`.

9. **Самая длинная живая сессия**
   The strongest bounded session by duration and message volume.
   Confidence: `точно посчитано`.

10. **Ритм ответов**
    A neutral summary of reply behavior: fast, measured, or rare, only when enough samples exist.
    Confidence: `поведенческий вывод`.

### Balance And Initiative

11. **Самый взаимный диалог**
    A dialogue with strong sent/received balance and enough total volume.
    Confidence: `точно посчитано`.

12. **Кто чаще начинал контакт**
    Based on first messages of active days.
    Confidence: `поведенческий вывод`.

13. **Кто возвращал разговор после тишины**
    Based on first messages after meaningful pauses.
    Confidence: `поведенческий вывод`.

### Style Of Communication

14. **Медиа-связь**
    A person with meaningful photo/video/voice/sticker/file exchange.
    Confidence: `точно посчитано`.

## Text Analysis Boundaries

The first wave should avoid confident semantic analysis of message meaning.

Allowed deterministic text-adjacent signals:

- message length;
- word and emoji frequency already present in TGWR;
- media type;
- reply links;
- active sessions;
- punctuation as a weak optional detail only.

Avoid as main insights:

- mood;
- care;
- conflict;
- seriousness;
- relationship psychology;
- "question" analysis based only on punctuation.

If punctuation or short-message heuristics are used later, they must be labeled `легкая эвристика` and shown as secondary context only.

## UX Architecture

### Deck Layer

The deck shows the best 5-7 conversation insights as an emotional story. It should not show all 14.

Recommended deck candidates:

- main person of the period;
- comeback;
- dialogue that became closer;
- night/day rhythm;
- most mutual dialogue;
- most alive session;
- people map / summary ending.

Deck copy must be self-explaining:

- headline: the insight;
- supporting sentence: what happened;
- evidence: 1-3 key numbers;
- subtle confidence/locality marker.

### Explore Layer

Explore/People shows all 14 insights with proof.

Each insight detail should include:

- winner;
- confidence label;
- period selector;
- explanation of why it won;
- key evidence numbers;
- candidate list where useful;
- empty state when no candidate passes quality gates.

Explore should feel calm, inspectable, and trustworthy. It can be denser than the deck.

## Share Layer

The first wave adds simple insight export, not a full Share Lab.

Feature: `Export this insight`.

Required behavior:

- story format `9:16`;
- subtle `IWS` watermark;
- optional anonymization of person name;
- headline, evidence numbers, short explanation;
- local/confidence footer;
- exported card must be visually polished enough to post.

Out of scope for first wave:

- full template editor;
- square/post formats;
- batch export;
- advanced style picker;
- custom watermark controls.

These can grow later into Share Lab.

## Data Shape

The worker should expose conversation insights in a structured report field per period.

Suggested shape:

```json
{
  "conversation_insights": {
    "main_person": {
      "kind": "main_person",
      "confidence": "behavioral",
      "winner": {},
      "score": 0,
      "evidence": {},
      "candidates": []
    }
  }
}
```

Renderer normalization must remain defensive. Missing insights should not break existing reports.

The implementation plan may refine field names, but the report contract must support:

- period-specific insights;
- confidence;
- no-winner states;
- evidence values;
- candidate lists;
- share-card rendering.

## Existing Metric Compatibility

Do not remove existing slides or report fields in the first wave.

Existing metrics can be reused:

- sent/received totals;
- active days;
- active chats;
- hourly and daily activity;
- night person and day person;
- reply time samples;
- top people by messages and mutuality;
- longest silence;
- longest streak;
- words, emojis, media counts.

New insights should build on these where possible instead of duplicating unrelated logic.

## Packaging And Quality

The product should remain release-ready across desktop targets:

- DMG;
- EXE/NSIS;
- RPM;
- DEB;
- AppImage where applicable.

The first implementation plan must preserve:

- `npm run verify`;
- synthetic smoke coverage;
- report invariant checks for new insights;
- packaging scripts;
- local-first privacy rules.

## Acceptance Criteria

- TGWR branding reads as `TGWR by IWS` in the app.
- Exported insight cards include a subtle `IWS` watermark.
- Report generation produces 14 conversation insight slots for `year` and `all_time`.
- Each insight has a confidence label.
- Each insight has quality gates that prevent tiny-chat false winners.
- Comeback cannot be won by trivial low-volume gaps.
- Deck shows only the strongest 5-7 insights.
- Explore/People shows all 14 insights with evidence.
- `year` remains the default period.
- `all_time` is fully supported and copy adapts to the period.
- Existing reports without conversation insights still load.
- No ML, cloud processing, telemetry, or external upload is introduced.
- Verification must include worker synthetic tests and report invariant checks.

## Out Of Scope

- Full Share Lab editor.
- Psychological interpretation of text.
- LLM/ML summaries.
- Remote accounts, sync, or telemetry.
- Removing old metrics or old export behavior.
