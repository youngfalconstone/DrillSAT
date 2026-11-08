# Changelog

All notable changes to DrillSAT. The format follows [Keep a Changelog](https://keepachangelog.com/) and
versions follow [Semantic Versioning](https://semver.org/).

## [1.1.1] - 2026-11-08

### Fixed
- **Desmos calculator never finished loading.** The Desmos API bundle evaluates code from a string, which the
  app's Content Security Policy blocked (`'unsafe-eval'`), so `Desmos.GraphingCalculator` was never defined
  and the panel showed "GraphingCalculator is not a function". The CSP now allows eval for scripts (the
  renderer stays sandboxed with context isolation and no Node access). Verified live with a real key:
  the calculator renders, expressions persist per question, and the AI tutor answers.
- Clearer message when a Desmos key does not enable the graphing calculator.

## [1.1.0] - 2026-11-08

### Fixed
- **Scrolling did not work anywhere.** The app shell's grid row grew to the height of its content, so the
  page area never overflowed and the `overflow: hidden` body swallowed wheel, keyboard and scrollbar input.
  The row is now constrained (`minmax(0, 1fr)`), `main.page` is the single scroll container, it receives
  keyboard focus on every screen (PgUp/PgDn/Space/arrows/Home/End work), a smooth scroll still running
  from the previous screen is cancelled, and the question list keeps its position when you open a
  question and come back. Covered by a new end-to-end scroll suite.

### Changed
- **Readability pass.** A proper type scale with 1.5 body / 1.65 reading line height and a 70-character
  measure for passages, stems and explanations; spacing on an 8 px grid; every text/background pair now
  meets WCAG AA (muted text, links, amber and green pills were adjusted). Answer choices have 2 px
  borders, a hover fill, larger hit targets and explicit **Selected / Correct / Correct answer / Your answer**
  labels with icons, so state is never conveyed by color alone. A visible focus ring for keyboard users.
- **Motion revamp.** Duration and easing tokens defined once (150 / 200 / 280 ms); transform- and
  opacity-only transitions for screen changes, question-to-question navigation, answer feedback, modals,
  the tutor and calculator panels, toasts and score tiles; skeleton placeholders instead of spinners so
  nothing jumps while a question loads; `prefers-reduced-motion` removes all non-essential animation.
  Measured while scrolling the full question list: p95 frame time 17 ms, no frames over 50 ms.
- Version number shown in the sidebar footer and in Settings → About.

### Removed
- The 1.0.0 installers are no longer offered; the 1.0.0 release is marked superseded.

## [1.0.0] - 2026-11-07

First release: full official question bank with keys and explanations, practice sessions with adaptive
difficulty, progress tracking, AI tutor / solver / generator / review (bring your own key), Desmos
calculator, Windows installer and portable build that also runs under Wine.
