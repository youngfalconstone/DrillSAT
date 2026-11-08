<p align="center"><img src="docs/img/wordmark.png" alt="DrillSAT" width="420"></p>

# DrillSAT

**Current version: 1.4.0** · **Download:** <https://youngfalconstone.github.io/DrillSAT/> · [Latest release](https://github.com/youngfalconstone/DrillSAT/releases/latest) · [Changelog](CHANGELOG.md)

<p align="center"><img src="docs/img/tour.gif" alt="DrillSAT tour: question bank, a math question with the official explanation, a practice session and the AI tutor" width="800"></p>

A desktop SAT practice app built with Electron. It ships the complete College Board SAT question
bank (1,925 Math + 1,845 Reading & Writing questions with answer keys and official explanations),
an AI tutor/solver/question generator (Anthropic or any OpenAI-compatible API), adaptive practice
sessions, progress tracking, and the Desmos graphing calculator used on the digital SAT.

Everything except the AI features and the calculator works offline.

## Contents

- [Quick start (Windows)](#quick-start-windows)
- [Adding API keys](#adding-api-keys)
- [Running under Wine (Linux)](#running-under-wine-linux)
- [Features](#features)
- [Development](#development)
- [Building the Windows release](#building-the-windows-release)
- [Rebuilding the question bank](#rebuilding-the-question-bank)
- [Tests](#tests)
- [Troubleshooting](#troubleshooting)

## Quick start (Windows)

1. Grab a build from the [download page](https://youngfalconstone.github.io/DrillSAT/) or the [latest release](https://github.com/youngfalconstone/DrillSAT/releases/latest):
   - `DrillSAT-1.4.0-setup.exe` — installer (NSIS). Installs per-user into `%LOCALAPPDATA%\Programs\DrillSAT`,
     no admin rights needed, adds a Start Menu shortcut (and a desktop shortcut when you run the
     installer interactively; the silent `/S` install skips it).
   - `DrillSAT-1.4.0-portable.exe` — single portable executable, nothing to install.
   The binaries are not code-signed, so SmartScreen shows "Windows protected your PC" on first launch:
   click *More info* → *Run anyway*.
   No separate runtime is required; Electron bundles its own Chromium and Node.
2. Launch it. The question bank is included and loads immediately.
3. Open **Settings** to add your API keys (next section). Without keys you can still browse, practice,
   see official explanations and track progress — only the AI features and the calculator are disabled.

Data (settings, progress, generated questions) lives in `%APPDATA%\DrillSAT\`.

### Uninstalling

- Installer build: *Settings → Apps → Installed apps → DrillSAT → Uninstall*, or run
  `"%LOCALAPPDATA%\Programs\DrillSAT\Uninstall DrillSAT.exe"`. This removes the program folder, the
  shortcuts and the registry entry.
- Your data is deliberately left in place. To remove it too, delete `%APPDATA%\DrillSAT\` (this holds your
  encrypted API keys, progress and generated questions, so back it up first if you may reinstall).
- Portable build: delete the `.exe`; data is in the same `%APPDATA%\DrillSAT\` folder.

## Adding API keys

Settings → **AI (LLM)**

- **Provider**: Anthropic (Claude) or OpenAI-compatible (OpenAI, Azure OpenAI, Groq, Ollama/LM Studio, …).
- **Model**: pick one or enter a custom model id.
- **API key**: paste it and click *Save*. Keys are encrypted with the OS secure storage
  (Windows DPAPI via Electron `safeStorage`) and stored in `settings.json` in the data folder.
  They never leave the machine except to the provider you chose. Use *Test connection* to verify.
- OpenAI-compatible: set the **Base URL** (e.g. `http://localhost:11434/v1` for Ollama).

Settings → **Calculator (Desmos)**

- Request a free API key at <https://www.desmos.com/my-api> (non-commercial use), paste it, *Save*.
- The calculator loads from desmos.com, so it needs an internet connection. If the key is wrong or
  the network blocks desmos.com the panel shows a clear message and the question stays usable.

## Running under Wine (Linux)

The app is plain Electron (no WebView2, no UWP/WinUI, no native Node modules), which is what Wine
runs best. Use the **portable** exe.

```bash
# Wine 8+ recommended (tested configuration target: wine-9.x, 64-bit prefix)
export WINEPREFIX=~/.wine-sat   # optional: dedicated prefix
winecfg                          # once; pick Windows 10
wine DrillSAT-1.4.0-portable.exe
```

Notes and known workarounds:

- The app detects Wine (via `WINEPREFIX`/`WINELOADER` or `winemenubuilder.exe` in `system32`) and
  automatically disables GPU acceleration and the Chromium sandbox, which are the two things that
  commonly break Electron under Wine. You can force these flags on any platform:
  `wine DrillSAT-1.4.0-portable.exe --disable-gpu --no-sandbox`.
- If the window opens but stays blank, also try `--disable-gpu-compositing --in-process-gpu`.
- Secure key storage: under Wine, DPAPI is usually available; if `safeStorage` reports it is not, the
  app stores keys base64-obfuscated and says so in Settings → About ("Secure key storage: Unavailable").
- Desmos works the same way as on Windows (it is just a web page inside Chromium); it needs network
  access from the Wine prefix.
- The installer (NSIS) also runs under Wine, but the portable exe avoids installer quirks entirely.
- Data folder under Wine: `~/.wine/drive_c/users/<you>/AppData/Roaming/drillsat/`.

This build was produced and tested on Windows 11; see `DECISIONS.md` #8 for the Wine testing status.

## Features

- **Question bank**: filter by section, topic (grouped by domain; ticking a domain selects all its topics), difficulty, format (MCQ / grid-in), source
  (official / AI); keyword or ID search; opens any question with official explanation.
- **Practice mode**: one question at a time, per-question and per-session timers (can be switched
  off), mark for review, MCQ and student-produced (grid-in) answers checked with the SAT grid-in
  rules, keyboard shortcuts (A–D / 1–4, Enter, ←/→, M, G, T), instant feedback with the official
  rationale, session summary.
- **Adaptive difficulty**: per-topic level from the last six answers (≥80 % → up, ≤40 % → down);
  manual override per topic in Performance; or fixed/mixed difficulty per session.
- **Topic selection**: include or exclude any skills for a session.
- **AI question generation** (Study Tools): new items in the official digital SAT format for the chosen
  skill, modeled on three official items of the same skill, College Board difficulty and answer format.
  Each item must pass deterministic SAT format rules (passage length, official question stems and blanks,
  SAT math scope, grid-in answers that fit the answer grid, no "all of the above"; every rule holds for
  all 3,770 official items) and an independent AI review that solves it without the key, must reach the
  same answer, finds exactly one defensible answer, judges it plausible as a real SAT item and rates it
  at the requested difficulty against official Easy/Medium/Hard items of the same skill. Rejected drafts
  are rewritten with the reason. Tagged *AI-generated* everywhere.
- **AI solver**: step-by-step solution for any question on request.
- **AI review**: after a session — weak topics, mistake patterns, pacing, recommended next session
  (one click to start it).
- **AI tutor**: side panel on every screen (press `T`), knows the current question and your progress,
  hints without spoiling the answer until you have answered or ask for it.
- **Progress**: history, accuracy by topic/difficulty/domain, average time, streaks; stored locally.
- **Desmos calculator**: resizable, collapsible panel on every Math question (practice and bank),
  state kept per question for the whole app run, Clear button.
- **Settings**: provider/model/key, Desmos key and on/off, light/dark theme, timer, adaptive on/off.

## Development

Requirements: Node.js 20+ (built with Node 26), Python 3.10+ only for the data pipeline.

```bash
npm install
npm run dev        # Vite dev server + Electron with hot reload
npm run build      # renderer + main + preload into dist/ and dist-electron/
npm run typecheck
npm test           # vitest unit tests
```

Layout:

```
electron/        main process: window, IPC, settings/secure storage, LLM client
src/shared/      pure logic: types, answer checking, adaptive difficulty, search, AI prompts+validation
src/             React renderer (screens/, components/, store.ts)
data/bank/       the shipped question bank (index.json + q/<id>.json)
tools/           data pipeline (PDF parse → fetch content → build bank)
tests/           vitest unit tests, tests/e2e Playwright Electron tests
```

## Building the Windows release

```bash
npm run dist            # NSIS installer + portable exe into release/
npm run dist:portable   # portable only
```

The bank is packaged as an extra resource (`resources/bank`), the rest in `app.asar`.

## Rebuilding the question bank

The question bank (`data/`) is **not** in this repository: it is College Board content, generated
locally from your own copy of the question-bank PDF exports. The release builds include it. To build
from source you need `pdftotext` (poppler) on PATH, Python 3 and the two PDFs, then:

```bash
python tools/parse_pdf.py "SAT Questions.pdf" data/pdf_math.json
python tools/parse_pdf.py "SAT Questions (ENG).pdf" data/pdf_rw.json
python tools/fetch_bank.py data/math_list.json data/rw_list.json data/raw   # keys + MathML content
python tools/build_bank.py data/pdf_math.json data/pdf_rw.json data/raw data/bank
```

See `DATA_NOTES.md` for the schema and why the content fetch is needed (the PDFs contain no keys).

## Tests

```bash
npm test                                             # unit: bank loading (all 3,770), answer checking,
                                                     # adaptive logic, AI validation with mocked API
npm run build && npx playwright test -c tests/e2e/playwright.config.ts
# e2e: launches the built app, browses the bank, runs a practice session, checks settings/secure
# storage and the AI/Desmos error paths. Set DESMOS_API_KEY=<valid key> to also exercise the live
# calculator (needs internet). Set SAT_E2E_EXE="release/win-unpacked/DrillSAT.exe" to run the
# same suite against the packaged build (done for every release).
# tests/e2e/scroll.spec.ts and motion.spec.ts cover scrolling on every screen, scroll restore,
# motion tokens, prefers-reduced-motion and frame timing while scrolling the full list.
```

## Troubleshooting

- *"No LLM API key is set"* — add one in Settings. *"rejected"* — wrong key or model not enabled.
- *"timed out"* / *"Could not reach"* — AI calls have a 90 s timeout and two automatic retries; check
  the connection or the base URL.
- *Desmos "Unrecognized API key"* — the key must come from desmos.com/my-api; demo keys from old
  documentation no longer work.
- Blank window under Wine — see the Wine section above.
- Reset everything: delete the data folder (Settings → About shows the path).
