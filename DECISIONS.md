# DECISIONS.md

Every significant choice made while building the app, with the reason.

## Data

1. **The provided PDFs have no answer keys or rationales, and all math notation is vector art.**
   Checked by extracting the full text of both files (0 hits for "Correct Answer"/"Rationale") and by
   inspecting page objects (equations are `curves`, not text/images). An SAT practice app that cannot
   check answers is useless, so the bank was **enriched from College Board's public question-bank API**
   (the backend of satsuitequestionbank.collegeboard.org, no auth required). The API returned exactly
   the same question ids as the PDFs, so the PDFs remain the source of truth for *which* questions are
   in the bank and for their metadata; the API supplies stems with MathML, options, keys and rationales.
   The pipeline is reproducible (`tools/`), the merged bank is checked in (`data/bank/`), and the app
   never touches the network for bank data.
2. **Bank is shipped as one index file plus one JSON per question** (`data/bank/index.json` + `q/<id>.json`)
   instead of one 45 MB blob, so the renderer loads a 3.6 MB index at startup and fetches question
   bodies lazily through IPC. Keeps startup fast and memory low with the full bank loaded.
3. **MathML is rendered natively by Chromium** (MathML Core, Chromium ≥ 109; Electron 45 ships
   Chromium 146). No MathJax/KaTeX round-trip is needed for official content. `<mfenced>` is not in
   MathML Core, so it is rewritten at build time. KaTeX is used only for AI-generated content, which the
   model is asked to write with `$…$` LaTeX delimiters.
4. **Seven disclosed SPR items spell their key out in words** ("three halves"); a small word→fraction
   parser was added rather than hand-editing data.

## Framework and packaging

5. **Electron** (as preferred by the brief): bundles Chromium, so Desmos (a web view) works identically
   on Windows and under Wine, and nothing depends on WebView2/WinUI/UWP.
6. **Vite + React + TypeScript** for the renderer, `vite-plugin-electron` for main/preload. Zustand for
   state. No UI component library — the reference look is specific enough that hand-written CSS matches
   it more closely.
7. **electron-builder** producing an NSIS installer *and* a portable single `.exe`. The portable exe is the
   recommended artifact for Wine (no installer UI to go wrong).
8. **No Wine run was possible on the build machine** (Windows 11, no WSL, no Linux host available in this
   session). Wine compatibility was addressed by construction instead: Electron only, no WebView2, no
   native Node modules (pure JS dependencies only), `safeStorage` guarded with a fallback, GPU
   acceleration disabled under Wine (detected via `WINEPREFIX`/`wine` env or `--disable-gpu`), and a
   documented Wine procedure in the README. This is the one milestone that could not be verified here;
   the README says exactly how to run it.

## Secrets and settings

9. **API keys are encrypted with Electron `safeStorage`** (DPAPI on Windows) and stored in
   `userData/settings.json` as base64 ciphertext. If encryption is unavailable (some Wine prefixes),
   the app stores them obfuscated (base64) and shows a warning in Settings rather than refusing to work.
10. **LLM provider**: the settings screen supports **Anthropic** (default, Claude models) and any
    **OpenAI-compatible** endpoint (base URL + model), because the brief says "an LLM API" without naming
    one. All calls are made from the main process (no CORS, keys never enter the renderer), with a
    45 s timeout, 2 retries with backoff, and typed error messages.
11. **Desmos key**: stored like the LLM key. If no key is entered the calculator panel shows a clear
    message with a link to request a key; it does not silently use a demo key in production. A
    development-only demo key can be entered in Settings for testing (Desmos publishes one in its docs).

## Practice logic

12. **Adaptive difficulty** uses a per-topic rolling window of the last 6 answers: ≥ 80 % correct with
    ≥ 4 answers → step up; ≤ 40 % → step down; otherwise hold. Sessions start at the learner's current
    level for that topic (default Medium). Manual override (E/M/H/Mixed) disables adaptation for that session.
13. **SPR checking** follows the official SAT grid-in rules (see DATA_NOTES.md) and additionally accepts any
    value numerically equal to a key within 1e-4 after the 4-character rounding/truncation rule.
14. **Timer** is per question and per session; stored with each answer. Disabled with the Settings toggle.
15. **Calculator state per question** is stored in memory (`getState()`/`setState()`) keyed by question id
    for the life of the app session, plus a Clear button. The Desmos script is loaded once per app run.

## AI features

16. **Generation prompt** uses 3 bank questions of the same section/skill/difficulty as style examples
    (text only — SVG figures are excluded), asks for strict JSON, and validates: exactly one correct
    option (mcq) or ≥1 numeric key (spr), a non-empty explanation, 4 distinct options, and no
    near-duplicate of a bank stem (Jaccard similarity of word 3-grams ≥ 0.6 rejects). Generated
    questions are tagged `source: "ai"` and shown with an "AI-generated" badge everywhere.
17. **Chatbot** receives the current question (text + options, correct answer marked as hidden context)
    and a compact progress summary; its system prompt tells it not to reveal the answer unless asked.

## Verification and tooling

18. **End-to-end tests run the real built app with Playwright's Electron driver** (`tests/e2e`), using a
    throw-away user-data folder (`SAT_USER_DATA` env var honoured by the main process). They cover
    bank loading, filtering/search, a MathML question, an SPR answer, a full R&W practice session with
    timer/mark/summary, settings + encrypted key storage, the no-key AI error path and the Desmos panel.
19. **Desmos could not be exercised live**: the demo key that Desmos used to publish in its docs
    (`dcb31709…`) now returns `403 Unrecognized API key`, and obtaining a key requires a Desmos account
    (desmos.com/my-api). The integration follows the v1.11 API docs exactly (script URL with `apiKey`,
    `GraphingCalculator`, `getState`/`setState`/`setBlank`, `observeEvent('change')`), and the e2e test
    verifies the bad-key / offline / no-key paths and that the question stays usable. With a valid key in
    `DESMOS_API_KEY` the same test also types an expression and checks the per-question state survives
    navigating away and back. **A live Desmos run is the one open verification item.**
20. **Keyboard shortcut for the calculator is `G`** (graph), not `C`, because `C` selects answer choice C.
21. **TypeScript 7 (native tsc)** was what `npm install typescript@latest` resolved to; it works with the
    Vite 8 / Rolldown toolchain. `baseUrl` is gone in TS 7, so path aliases use `./src/shared/*`.
22. **No commits were made** on the user's behalf; the folder is `git init`-ed with a `.gitignore` that
    excludes `node_modules`, build output and the raw API cache (`data/raw`, 44 MB, reproducible).
23. **The packaged build was verified, not just the dev build**: the Playwright suite runs against
    `release/win-unpacked/DrillSAT.exe` (`SAT_E2E_EXE`), which exercises the asar + `resources/bank`
    paths. `node_modules` is excluded from the package because Vite bundles everything (asar 2 MB; the
    installer is ~137 MB and the portable exe ~122 MB, almost all Electron/Chromium + the 46 MB bank).

## 1.1.0 (smoothness and readability revamp)

24. **Scroll bug root cause**: the shell grid row had no explicit size, so it grew to the content height,
    `main.page` never overflowed and the `overflow: hidden` body ate wheel/keyboard input. Fixed in the
    layout (`grid-template-rows: minmax(0, 1fr)`, `min-height: 0` down the chain), not by forcing
    `scrollTop`. `main.page` is focusable (tabindex -1) and focused on each screen so keyboard scrolling
    works; an input-driven smooth scroll that is still animating when the screen changes is cancelled
    (re-asserted for 300 ms unless the user scrolls again). The question list restores its position on back.
25. **Contrast**: tokens were checked with a WCAG script (see git history of this file). Muted text moved
    from #6b7280 to #5b6372 (5.5:1 on the page background), links use #1558b0 / #60a5fa, amber #92400e,
    green #166534. Buttons keep #1d6fd8 with white (4.86:1).
26. **Motion**: only transform/opacity are animated (hover colour changes aside); tokens 150/200/280 ms with
    one ease curve; skeletons replace spinners for question loads; `prefers-reduced-motion` zeroes every
    animation except the small progress spinner. Frame timing is asserted in e2e (p95 < 34 ms while
    scrolling the full list; measured ~17 ms).
27. **Uninstall lesson**: an inventory that tests `%APPDATA%\DrillSAT` and `%APPDATA%\drillsat` separately
    lists the same NTFS folder twice. Treat case-variant paths as one before any delete decision.
28. **Old release handling**: v1.0.0 keeps its tag and notes (marked superseded) but its installer assets are
    deleted, so the only downloads are the current ones.
29. **CSP allows `'unsafe-eval'` for scripts** (1.1.1). The Desmos v1.11 bundle evaluates code from strings and
    silently stops without it. The renderer remains sandboxed (contextIsolation, no nodeIntegration, IPC
    allow-list), scripts can still only come from the app itself and desmos.com, so the added exposure is
    limited to what desmos.com serves.
30. **1.2.0 layout**: choice state is conveyed by colour plus an icon badge on the letter circle instead of an
    inline label, because any inline element changes the text column width and re-wraps the answer. Border
    width is 1 px in every state; the "thicker" selected look comes from an inset box-shadow, which does not
    affect layout. Questions whose longest option exceeds 110 characters use a stacked layout (choices
    full-width under the stem, capped at 96ch) so Reading & Writing answers read in 1-3 lines.
31. **AI solution is structured JSON** (keyConcept / steps[text, math] / answer / trap) rendered with real
    components; a markdown-subset renderer is the fallback for non-JSON replies so asterisks never show.
32. **AI question quality gate (1.3.0)**: a generated item is accepted only after the prompt (official
    skill format + difficulty rubric + official same-skill/difficulty/type examples), deterministic SAT
    format rules, and an independent reviewer call (solves blind, rates difficulty against official E/M/H
    anchors of the same skill) all agree. The format rules are calibrated on the official bank and a test
    asserts that no official item violates them, so the rules never reject something College Board would
    print. Difficulty must match exactly; adjacent ratings are rejected, because the user asked for items
    that match College Board difficulty. Cost: two model calls per accepted draft, up to four drafts.
33. **No fractional page zoom**: rendering at 90 % zoom on high-DPI displays was tried for 1.3.0 and
    rejected; Chromium's fractional zoom broke programmatic scroll positions and list scroll restoration
    (deterministic e2e failures). The smaller look comes from the CSS type scale instead, and the window
    opens at a share of the work area.
34. **Topic picker (1.4.0)**: one component for every topic list (grouped by domain, short labels, domain
    tri-state checkbox). Short labels are display-only; the official skill name stays the key everywhere.
    The exclude mode in Practice was removed for simplicity (the user asked for simplicity over options).
    The bank's filter panel must stay `position: sticky`: making it a normal column made programmatic
    scroll positions on `main.page` intermittently snap back (scroll.spec failures), most likely Chromium
    scroll anchoring choosing a node in the tall filter column.
35. **Score estimate (1.6.0)**: calibration comes only from College Board publications: each official
    question's Skills Insight score band (the question-bank API's `score_band_range_cd`, 1-7, nested in
    E/M/H), the RP67 rule used to assign bands, the band score ranges and percentile anchors (Skills Insight
    Tables 3 and 15), and the +/-30-point section score range (SAT score report guide). A band-k question is
    answered correctly with p = 0.67 at the score where band k begins; 3PL with guessing 0.2 for multiple
    choice; slope 0.013 per point, which gives a ~30-point posterior SD for a full section; prior from the
    SAT percentile anchors (median 550), widened 1.5x so extreme scorers are not pulled to the middle. The
    80% interval was chosen over +/-1 SD because simulated coverage of +/-1 SD was ~60% (overconfident).
    Known limit: above ~750 the bank has few questions hard enough to separate scores (all-correct sections
    estimate ~750-770 with ranges reaching 800); the UI says so.
36. **Practice test blueprint**: module lengths/times from the digital SAT; per-module R&W slots by question
    type in the official order (Craft and Structure, Information and Ideas, Standard English Conventions,
    Expression of Ideas); Math 8/7/4/3 and 7/8/3/4 by domain with six grid-ins per module, ordered by band
    with some mixing. Module 2 is harder when the module 1 estimate is >= 540. Real tests also include
    unscored pretest questions; here every question is scored.
37. **Highlights use the CSS Custom Highlight API** with character offsets, so official HTML/MathML is never
    rewritten and highlights survive re-rendering and test resume. Test questions do not reach the AI tutor.
38. **Updater**: electron-updater bundled by Vite into main.js (no runtime node_modules); GitHub provider
    from `publish` in electron-builder.yml (`--publish never`; releases are uploaded with gh and must include
    latest.yml and the setup blockmap). Off when unpackaged, under the e2e tests (SAT_USER_DATA) or with
    SAT_NO_UPDATE; SAT_UPDATE_URL points it at a generic feed to test the full download-and-install flow.
    The portable exe cannot replace itself, so it only links to the release.
39. **Clean bank text**: previews/search use structural MathML-to-text (tools/clean_text.py) instead of
    MathML alttext, which is spoken English; figures and screen-reader descriptions are excluded from
    previews. The question files themselves are unchanged (verified byte for byte).
40. **Scroll test settling**: scroll.spec waits for smooth scrolling to go idle before setting positions; a
    compositor smooth scroll still running under full-suite load could override the programmatic position
    (~1 in 5 full runs). Disabling scroll anchoring did not change this and was reverted.
41. **Adaptive by section ability, not per-topic levels (1.6.1)**: per-topic levels needed 4+ answers in one topic
    to move, which a mixed session never provides, so adaptive sessions were always Medium (verified in the app:
    10/10 correct, 10 Medium questions). Adaptive now targets the band with p(correct) closest to 0.6 at the
    current ability (score model posterior mean over first attempts, no minimum; prior mean = Medium), trying the
    nearest bands across all chosen topics before relaxing. tests/e2e/adaptive.spec.ts asserts the climb and fall.

