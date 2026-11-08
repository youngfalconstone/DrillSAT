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
