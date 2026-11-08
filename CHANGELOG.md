# Changelog

All notable changes to DrillSAT. The format follows [Keep a Changelog](https://keepachangelog.com/) and
versions follow [Semantic Versioning](https://semver.org/).

## [1.3.0] - 2026-11-08

### Changed
- **AI-generated questions match the official SAT format and College Board difficulty.** Generation now
  works in three layers. (1) The prompt carries the official item format and question stem for the
  chosen skill (e.g. Words in Context blanks, Rhetorical Synthesis notes, Text 1/Text 2 pairs, the
  Standard English conventions stem), a College Board difficulty rubric, and three official items of
  the exact skill, difficulty and answer format. (2) Deterministic SAT format rules reject drafts that
  could not appear on the digital SAT: R&W passage length and blanks, a single question ending in "?",
  no "all/none of the above", math outside SAT scope (calculus, logarithms, matrices, complex numbers,
  sequences, combinatorics), references to figures the app cannot show, grid-in answers that do not fit
  the 5/6-character answer grid. A test runs these rules over all 3,770 official items and none fails.
  (3) An independent reviewer pass solves the draft without its key and rates it against official Easy,
  Medium and Hard items of the same skill; the draft is kept only if the answers agree, exactly one
  answer is defensible, it is plausible as a real SAT item and the rated difficulty equals the requested
  one. Rejected drafts are rewritten with the reason (up to four tries).
- Generated passages render notes as bullet lists, pipe-separated data as real tables and Text 1/Text 2
  headings like the official items.
- **Lighter, airier interface.** Type is one step smaller throughout (13 px UI, 15 px reading text) with a
  taller line height; buttons, inputs, answer choices and letter circles are more compact; page gutters,
  card gaps and section spacing are larger (56 px gutters, 32 px between cards, 48 px above content);
  content is capped at 1200 px; shadows are flatter.
- The window opens at a share of the screen (up to 1440 x 940) instead of a fixed 1280 x 820, which
  overflowed displays running at 150 % scaling.

### Verified
- All 3,770 official difficulty labels equal the College Board question bank's current values (checked
  against the live question list on 2026-11-08), and the bank still contains exactly the live set of ids.

## [1.2.0] - 2026-11-08

### Changed
- **Calmer, more open layout.** Base type 14 px with 16 px reading text at 1.65 line height and a 68-character
  measure; 8 px spacing scale with 32 px card padding, 24 px gaps and 40 px page gutters; slimmer sidebar
  (168 px, 40 px nav items); lighter header; the session bar is now a single quiet line (question count,
  progress, timer, mode, End session) instead of a boxed card; softer borders and shadows; content capped at
  1320 px and centred on large windows. The question/answer split is 7:5, and questions with long answer
  choices (typical for Reading & Writing) stack the choices full-width under the passage so they read in
  1-3 lines; everything stacks below 1180 px.
- **Answer choices never re-wrap.** The inline "Selected" pill is gone. Selection, correct and incorrect are
  shown by border/background colour plus a small check or cross badge on the letter circle, which lives in
  the fixed-width letter column. All states share the same 1 px border, padding and type, so text never
  moves. Guarded by an end-to-end test that measures every choice's text box across default, hover, focus,
  selected and checked states.
- **Designed AI solution.** The solver now returns structured JSON that is rendered as a key-concept callout,
  a numbered stepper with per-step math, a highlighted final answer and an optional "common trap" note,
  with a skeleton while it loads and a fade-in when ready. Malformed replies fall back to a proper
  markdown renderer (no raw asterisks); errors show a retry button. The prompt forbids filler.

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
