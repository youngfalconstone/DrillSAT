# Changelog

All notable changes to DrillSAT. The format follows [Keep a Changelog](https://keepachangelog.com/) and
versions follow [Semantic Versioning](https://semver.org/).

## [1.6.1] - 2026-11-08

### Fixed
- **Adaptive practice stayed on Medium.** Levels moved per topic after four answers in that topic, but a
  10-question session touches each of ~19 topics about once, so in practice every adaptive question (Quick
  sessions, Practice default, Drill, Practice this skill) was Medium no matter how well you did. Adaptive now
  picks from the College Board score band you answer correctly about 60% of the time at your current
  estimated score (same model as the score estimate), updated after every answer. Answering everything right
  reaches Hard by the third question and the top score band by the fifth; misses bring it down to Easy.
  Manual per-topic levels in Performance still apply.

### Added
- **Hardest only** difficulty: College Board's score band 7 (aimed at 680–800 scorers). College Board "Hard"
  covers bands 6 and 7, and band 6 can feel easy to strong students; the setup screen now says so.

## [1.6.0] - 2026-11-08

### Added
- **Bluebook-style answer tools** in practice, the bank and practice tests: answer eliminator (cross out
  choices, choosing one restores it; X), highlighter (select text to highlight, click to remove; H) and the
  Math reference sheet (R).
- **Full-length practice tests** (new Practice Tests screen): full test or one section; Reading and Writing
  2 × 27 questions in 32 minutes each, Math 2 × 22 in 35 minutes each, 10-minute break; module 2 routed
  harder or easier from module 1; College Board domain mix, R&W question order by type, about six grid-ins
  per Math module; countdown with hide, question navigator, Check Your Work page, auto-submit at 0:00;
  saved after every change and resumed after a restart with the clock paused. No difficulty labels, answers
  or AI help during the test. Results: total and section scores with likely ranges, correct by domain and
  module, routing, time used, pacing, and every question with its official explanation. Answers count
  toward progress, levels, streaks and spaced review.
- **Estimated SAT score** on Home and Performance, and on every test result. Built on College Board's score
  band (1–7) for each official question, assigned by College Board with RP67 mapping, and the published
  band score ranges and percentile anchors ("Skills Insight for the SAT Suite"). A 3PL item-response model
  on the 200–800 scale, with the slope set so a full section has the ±30-point precision College Board
  reports for real scores. Reports the score and the central 80% range; needs 20 official questions per
  section; uses the first attempt at each of the last 60 official questions; ignores AI questions. Unit tests
  simulate test takers with known scores across the scale and check error and range coverage.
- **Spaced review**: missed questions return after 1, 3 and 7 days until answered correctly three times;
  Home shows what is due with one-click review sessions.
- **Pacing feedback** (Settings, on by default): time per question vs. the real test pace after each check,
  and pacing summaries for sessions and tests.
- **Automatic updates** (electron-updater, GitHub Releases): the installed app downloads new versions in
  the background and installs them on restart or quit; the portable app shows a download link. Status and
  "Check for updates" in Settings.

### Changed
- **Question Bank previews show real math** instead of spoken alt text ("(12x + 28)/4 − s/13 = r(x − 8)"
  instead of "StartFraction 12 x plus 28 Over 4 EndFraction…") and no longer start with figure descriptions.
  Search and AI duplicate checks use the same clean text. (758 previews had spoken math; 2 legitimate prose
  uses remain.)
- The bank index carries each question's College Board score band.

## [1.5.0] - 2026-11-08

### Changed
- **Generate questions for several topics or whole domains at once.** Study Tools now uses the same topic
  list as Practice: tick any mix of topics and domains (nothing ticked = every topic in the section). The
  questions are spread evenly over the chosen topics in random order, and up to 10 can be generated in one
  go (was 5).
- If no draft for a topic passes the SAT format and difficulty checks, that question is skipped and the
  rest carry on; a note lists the skipped topics. Network and key errors still stop the run.
- The single-topic dropdown is gone; one topic component is used everywhere.

## [1.4.0] - 2026-11-08

### Changed
- **One simple topic list everywhere.** Practice, the Question Bank and Study Tools share a single topic
  component: topics grouped under their domain, short names for the long College Board skill names (the
  official name shows on hover, and data, filters and AI prompts still use it), and a domain checkbox that
  selects or clears all of its topics. Study Tools uses the same grouping in its dropdown instead of
  "Domain — Skill" lines.
- Practice topics: nothing ticked means all topics. The "Only these / Everything except these" switch is
  gone; a "Clear (n)" button appears when topics are selected.
- Question Bank: the separate Domain and Skill lists are merged into the topic list; difficulty, format
  and source options are stacked; the search icon sits inside the search field; the whole filter panel
  scrolls as one instead of a small box inside it.
- Short topic names also appear in the question header, bank results, Home and Performance.
- "Cross-text Connections" (2 items) and "Cross-Text Connections" are now one topic.
- Study Tools has a one-line description instead of a paragraph.

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
