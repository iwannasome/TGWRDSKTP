# Telegram-Native Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework TGWR into a Telegram-native editorial product while preserving the existing local report pipeline and verification suite.

**Architecture:** Keep Electron, preload IPC, Python worker, and report schema intact. Redesign the renderer in layers: visual tokens, reusable Telegram-style primitives, setup onboarding, slide frame, key slide compositions, then Explore mode.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Framer Motion, electron-vite, html-to-image, pdf-lib, Python worker, SQLite.

---

## File Map

- Modify `src/renderer/src/styles.css`: global Telegram palette, reduced glow/noise, shared utility classes.
- Modify `src/renderer/src/App.tsx`: setup/onboarding and existing-report modal.
- Modify `src/renderer/src/wrapped/SlideFrame.tsx`: remove cyber scanline frame, introduce Telegram story frame.
- Modify `src/renderer/src/wrapped/SlidesView.tsx`: controls rail, theme handling, Telegram-native export/status controls.
- Modify `src/renderer/src/wrapped/slides/Slide01Cover.tsx`: Telegram story cover.
- Modify `src/renderer/src/wrapped/slides/Slide02TotalMessages.tsx`: hero-number story.
- Modify `src/renderer/src/wrapped/slides/Slide03SentVsReceived.tsx`: chat bubble comparison.
- Modify `src/renderer/src/wrapped/slides/Slide07TopPersonMessages.tsx`: contact profile card.
- Modify `src/renderer/src/wrapped/slides/Slide11WordCloud.tsx`: typographic poster.
- Modify `src/renderer/src/wrapped/slides/Slide13MediaCounts.tsx`: Telegram media gallery summary.
- Modify `src/renderer/src/wrapped/slides/Slide19Achievements.tsx`: Premium collectible badge board.
- Modify `src/renderer/src/wrapped/slides/Slide20End.tsx` and `Slide21Credits.tsx`: share/export ending and calmer credits.
- Modify `src/renderer/src/wrapped/PeopleView.tsx`: Explore chat-list/profile layout styling.
- Modify `src/renderer/src/wrapped/DetailsView.tsx`: Explore table styling.

## Task 1: Baseline And Visual Tokens

- [ ] Run `npm run verify` before renderer edits. Expected: exit 0.
- [ ] Edit `src/renderer/src/styles.css` to make Telegram-native variables the default:

```css
:root {
  color-scheme: dark;
  --tgwr-bg-0: #0b1118;
  --tgwr-bg-1: #0f1720;
  --tgwr-bg-2: #111b21;
  --tgwr-surface-rgb: 23, 33, 43;
  --tgwr-card-rgb: 23, 33, 43;
  --tgwr-border-rgb: 86, 112, 134;
  --tgwr-fg: #f2f7fb;
  --tgwr-muted-rgb: 142, 165, 184;
  --tgwr-accent1-rgb: 42, 171, 238;
  --tgwr-accent2-rgb: 126, 87, 194;
  --tgwr-grid-rgb: 42, 171, 238;
}
```

- [ ] Reduce body background from multi-orb neon to a restrained Telegram Premium gradient.
- [ ] Keep class names used by components (`tgwr-gradient-text`, `tgwr-info-card`, `tgwr-word-token`) so existing code still compiles.
- [ ] Run `npm run typecheck`. Expected: exit 0.

## Task 2: Setup Onboarding

- [ ] In `src/renderer/src/App.tsx`, replace the sidebar/dashboard hierarchy with a single top product header and three guided step sections.
- [ ] Keep the existing state and handlers: `onPickExportDir`, `onStartImport`, `onBuildReport`, `loadReport`.
- [ ] Show worker health as a small pill, not a large sidebar card.
- [ ] Keep DB/report/export paths visible in a subdued technical details block.
- [ ] Restyle the existing report prompt as a Telegram-like sheet with two clear actions: open existing, create fresh.
- [ ] Run `npm run typecheck`. Expected: exit 0.

## Task 3: Slide Story Frame And Controls

- [ ] In `SlideFrame.tsx`, remove `tgwr-scanlines`, rounded 44px cyber panel, and large blur-orbs.
- [ ] Replace with a cleaner story surface: dark Telegram background, subtle gradient top edge, content slots unchanged.
- [ ] In `SlidesView.tsx`, simplify controls into a Telegram story control rail:
  - compact slide counter,
  - period toggle,
  - Details,
  - People,
  - PNG,
  - PDF,
  - previous/next.
- [ ] Preserve export staging and screenshot mode behavior.
- [ ] Run `npm run typecheck`. Expected: exit 0.

## Task 4: Editorial Key Slides

- [ ] Rework `Slide01Cover.tsx` into Telegram Wrapped cover with local/private signal and period metadata.
- [ ] Rework `Slide02TotalMessages.tsx` into a hero-number layout with fewer cards.
- [ ] Rework `Slide03SentVsReceived.tsx` into sent/received chat bubble comparison.
- [ ] Rework `Slide07TopPersonMessages.tsx` into a profile/contact card.
- [ ] Rework `Slide11WordCloud.tsx` into a cleaner typographic poster.
- [ ] Rework `Slide13MediaCounts.tsx` into media-gallery summary.
- [ ] Rework `Slide19Achievements.tsx` into Premium badge board.
- [ ] Rework `Slide20End.tsx` and `Slide21Credits.tsx` to match the new ending.
- [ ] Run `npm run test:synthetic`. Expected: exit 0; Chrome screenshot checks may be skipped if Chrome is absent.

## Task 5: Explore Mode

- [ ] In `PeopleView.tsx`, restyle the left pane as a Telegram chat list and the right pane as a profile analytics panel.
- [ ] Keep search, selected person, period toggle, and all analytics sections.
- [ ] In `DetailsView.tsx`, restyle cards and tables to match Explore mode: flatter rows, less glow, stronger table hierarchy.
- [ ] Run `npm run typecheck`. Expected: exit 0.

## Task 6: Copy Polish

- [ ] Replace rough/meme-heavy slide subtitles with confident Telegram-native Russian copy.
- [ ] Remove repeated `IW$` kickers or replace them with `TGWR`.
- [ ] Keep copy short enough for 1920x1080 export and mobile scaling.
- [ ] Run `rg -n "IW\\$|Парни|не один|Покидай|кибер|cyber|scanline" src/renderer/src` and review any remaining hits intentionally.
- [ ] Run `npm run typecheck`. Expected: exit 0.

## Task 7: Full Verification

- [ ] Run `npm run verify`. Expected: exit 0.
- [ ] Run `PYTHONWARNINGS=error::DeprecationWarning npm run test:synthetic`. Expected: exit 0.
- [ ] Run `npm audit --omit=dev`. Expected: `found 0 vulnerabilities`.
- [ ] Run `git status --short` and summarize changed files.

## Self-Review

Spec coverage:

- Telegram-native visual language: Tasks 1, 3, 4, 5.
- Setup onboarding: Task 2.
- Editorial key slides: Task 4.
- Explore mode: Task 5.
- Copy tone: Task 6.
- Verification: Task 7.

Placeholder scan: no unresolved TBD/TODO placeholders are present.

Type consistency: all referenced files exist in the current renderer tree, and the plan preserves existing public props/handlers.
