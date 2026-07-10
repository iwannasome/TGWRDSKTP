# Metric quality hardening

Date: 2026-07-10

Branch: `fix/full-project-stabilization`

Follow-up: friend-ready distribution, dynamic deck and schema v2 are documented in `docs/2026-07-10-friend-ready-v0.2.md`.

## Goal

Prevent small, sparse, or structurally misleading chats from winning prominent TGWR metrics. The changes remain deterministic, local-only, and explainable through evidence in `report.json`.

No real Telegram exports were used for the regression suite. All new cases are synthetic.

## Problems addressed

### Longest silence

Previously, any chat with two messages could win if those messages were far apart. The global comparison median also mixed unrelated chats.

Current rules:

- require at least `3000` non-service messages in the selected period;
- compare gaps only between eligible chats;
- compute the median gap inside the winning chat;
- expose the chat volume, minimum requirement, and eligible-chat count;
- show message volume on the slide instead of a subjective pause label.

### Live sessions

Previously, a session ended only after a three-hour gap. A synthetic chat with one message every 37 minutes therefore became a single 133-day “live session”.

Current rules:

- maximum adjacent-message gap: `30 minutes`;
- maximum session duration: `12 hours`;
- minimum density: `4 messages/hour`;
- minimum participation: `8 messages` from each side;
- minimum session size: `30` messages for `year`, `40` for `all_time`;
- rank `alive_dialog` primarily by density and `longest_live_session` primarily by bounded duration.

### Stability

Previously, months with no messages were omitted from the stability calculation. Six equally active months separated by a six-month hole could look perfectly stable.

Current rules:

| Rule | `year` | `all_time` |
|---|---:|---:|
| Minimum messages | 420 | 520 |
| Minimum active months | 6 | 5 |
| Minimum calendar coverage | 65% | 60% |
| Minimum stability score | 45% | 40% |

The calculation now includes zero-message months. A bounded year uses the globally observed part of that period so future months in a partial export do not become artificial zeros. `all_time` uses the span from a person's first to last message.

### Growth and fading

Previously, a large multiplier on a small baseline could qualify too easily, and all-time windows were split by active months rather than equal calendar windows.

Current rules:

| Rule | `year` | `all_time` |
|---|---:|---:|
| Minimum total messages | 1000 | 1200 |
| Minimum messages in each comparison window | 200 | 250 |
| Minimum absolute change | 400 | 500 |
| Minimum normalized rate change | 2x | 2x |
| Minimum active days | 20 | 24 |

The score uses absolute change, normalized monthly-rate change, total volume, and active days.

### Reply rhythm and initiative

Reply rhythm previously ranked fast, measured, and slow categories with incompatible score scales and accepted as few as three samples.

Current minimum reply samples:

- `year`: `20`;
- `all_time`: `30`.

The winner is now selected by evidence strength; the median only labels the observed rhythm.

Contact initiation now means the first message after at least `12 hours` without contact, rather than the first message of a calendar day. It requires `10` events for `year`, `12` for `all_time`, and at least a `60%` dominance share.

A silence restart requires a gap of at least `7 days`, at least `3` qualifying events for `year` or `4` for `all_time`, and the same `60%` dominance share. Either the user or the other participant can be the dominant side.

### Comeback

The prior implementation blocked obvious tiny false positives but still gave too much influence to a high growth multiplier.

Current rules:

| Rule | `year` | `all_time` |
|---|---:|---:|
| Minimum dialogue messages | 2500 | 2500 |
| Minimum silence | 60 days | 90 days |
| Minimum messages before silence | 300 | 300 |
| Minimum messages after return | 1000 | 1200 |
| Minimum active days after return | 14 | 16 |
| Minimum total active days | 20 | 22 |

Scoring prioritizes post-return volume, absolute growth, total chat volume, and active days. The growth-ratio contribution is capped.

The regression fixture contains two eligible candidates:

- `2600` messages with `7.125x` growth;
- `4000` messages with `4x` growth and a larger sustained return.

The `4000`-message dialogue must win while the smaller high-ratio dialogue remains visible as a candidate.

## Regression coverage

The synthetic suite now covers:

- a `2 + 4` message archival chat that must not win longest silence;
- a continuously active history that must not become a multi-month live session;
- equal active months separated by a large calendar hole;
- attractive growth on an insufficient message base;
- two valid comeback candidates with conflicting volume and ratio signals;
- year and all-time thresholds for reply samples, contact starts, and silence restarts;
- a dedicated screenshot of the comeback slide.

## Verification

Fresh verification command:

```bash
CHROME_BIN="$PWD/.cache/chrome/chrome/linux-150.0.7871.24/chrome-linux64/chrome" \
PYTHONWARNINGS=error::DeprecationWarning \
npm run verify
```

Result:

- TypeScript checks passed;
- Python worker generated both report periods without warnings;
- report invariants and adversarial metric assertions passed;
- navigation stress passed;
- People View and insight export rendering passed;
- desktop, mobile, empty, and extreme screenshots passed;
- `electron-builder --dir` produced `release/linux-unpacked`.

## Compatibility and remaining limits at the time of this change

- Renderer normalization remains compatible with reports created before schema v2.
- Renderer normalization remains defensive for older reports.
- These rules are deterministic heuristics, not psychological truth.
- Thresholds still need validation against several real exports with different activity levels before a public release.
- No ML, network upload, telemetry, or remote processing was added.
