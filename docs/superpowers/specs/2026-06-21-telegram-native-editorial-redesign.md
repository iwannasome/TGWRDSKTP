# Telegram-Native Editorial Redesign Spec

## Goal

Turn TGWR from a neon/cyber analytics prototype into a polished Telegram-native editorial desktop product: it should feel like Telegram itself generated a private Wrapped recap locally.

## Product Direction

The product should no longer read as "cyber dashboard with slides". It should read as:

> Telegram Premium made a personal yearly recap that never leaves the computer.

The UI keeps the existing local-first privacy promise, report pipeline, export features, and analytics depth. The redesign changes visual language, information hierarchy, and emotional pacing.

## Visual Language

Use Telegram Desktop / Telegram Premium cues:

- Deep Telegram dark surfaces: `#0f1720`, `#111b21`, `#17212b`.
- Telegram blue as the primary accent, supported by cyan and violet premium gradients.
- Message bubbles, profile surfaces, story-like slides, media grids, collectible badge cards.
- Softer shadows and fewer decorative glows.
- No scanline/cyber HUD styling.
- No repeated `IW$` slide kicker.
- Lower border radius than the current 30-44px range: mostly 12-24px, with larger radii only for story posters or profile media.
- Fewer nested glass cards; use full slide layouts and clear content regions instead.

## Tone And Copy

Copy should be personal, confident, and lightly playful, but not meme-first.

Replace rough or cheap-feeling lines with Telegram-native product copy:

- "Парни она мне написала!" becomes a calmer reply-speed insight.
- "Я что у тебя не один?" becomes an ignored-reply insight without jealousy framing.
- "Покидай своих фоток" becomes a media-sharing insight.
- `IW$` becomes either absent or a small TGWR/Local mark.

Russian remains the primary user-facing language.

## App Shell

The setup screen becomes a clean 3-step onboarding workspace:

1. Select Telegram export.
2. Analyze locally.
3. Open Wrapped.

Technical data moves down in priority:

- Worker status becomes a compact health chip.
- Export/report/db paths move into a collapsible or secondary "technical details" zone.
- Import and report progress are shown as one guided process, not two unrelated admin cards.
- Existing report prompt should feel like a Telegram modal/sheet, not a generic dark dialog.

## Slide Deck

Slides should become an editorial sequence with distinct composition types:

1. Cover story.
2. Hero number.
3. Sent vs received chat bubble comparison.
4. Activity calendar or month panel.
5. Hour rhythm chart.
6. Night activity story.
7. Top person profile card.
8. Mutuality / conversation balance.
9. Fast reply / slow reply insights.
10. Word poster.
11. Emoji / sticker board.
12. Media gallery summary.
13. Longest message as a chat transcript.
14. Streak timeline.
15. Silence gap timeline.
16. Day person profile.
17. Night person profile.
18. Premium-style achievements.
19. Export/share ending.
20. Credits.

The exact slide count can remain 21 for compatibility, but the repeated "big card inside big card" pattern should be reduced.

## Explore Mode

People and Details become an "Explore" mode that feels like Telegram Desktop analytics:

- Left side behaves like a chat list.
- Right side behaves like a profile/statistics panel.
- Tables use restrained surfaces, row separators, and denser typography.
- The mode is allowed to be utilitarian; it should not copy slide poster styling.

## Constraints

- Do not change the Python report schema unless required.
- Do not remove existing export PNG/PDF behavior.
- Preserve screenshot/synthetic smoke hooks: `data-tgwr-view`, `data-tgwr-slide-index`, `data-tgwr-active-slide`.
- Keep local-only guarantee visible.
- Keep type checking strict.
- Keep the app functional without Chrome installed; screenshot smoke may remain skipped in this environment.

## Acceptance Criteria

- Setup screen reads as a consumer onboarding flow, not a developer dashboard.
- The deck no longer looks like the same card template repeated 21 times.
- At least the cover, total messages, sent/received, top person, word cloud, media, achievements, and ending slides visibly follow Telegram-native editorial styling.
- People/Details are visually calmer and more useful as Explore mode.
- `npm run verify` passes.
- `PYTHONWARNINGS=error::DeprecationWarning npm run test:synthetic` passes.
- `npm audit --omit=dev` reports 0 vulnerabilities.
