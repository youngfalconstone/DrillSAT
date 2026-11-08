# DATA_NOTES.md — question bank schema and data pipeline

## Inputs

| File | Pages | Questions | Section |
|---|---|---|---|
| `SAT Questions.pdf` (`math_question_bank`) | 1,941 | 1,925 | Math |
| `SAT Questions (ENG).pdf` (`reading_question_bank`) | 1,858 | 1,845 | Reading and Writing |

Both are College Board "SAT Suite Question Bank" PDF exports (US Letter, one question per page,
long questions spill onto a second page). Every question block has the same layout:

```
Question ID: <8 hex chars>
Assessment | Test | Domain | Skill | Difficulty      (table header)
SAT        | Math | Algebra | Linear functions | Hard (table row; difficulty also drawn as 1–3 bars)
Question
<stem text, figures, tables>
Answer                        (multiple-choice only)
A. ... B. ... C. ... D. ...
```

### What the PDFs contain
- **ID** (`Question ID: ac472881`) — the College Board public question id. Unique across both files.
- **Test** — `Math` or `Reading and Writing`.
- **Domain** (4 per section) and **Skill** (19 math skills, 11 R&W skills — see counts below).
- **Difficulty** — `Easy` / `Medium` / `Hard`.
- **Stem** text and, for multiple-choice items, choices `A.`–`D.`.
- Figures (graphs, diagrams), tables and **all math notation are drawn as vector graphics**, so
  `pdftotext` returns the prose but drops every equation, exponent, fraction, etc.
  Of 1,925 math questions only 312 have four fully text-extractable choices.

### What the PDFs do NOT contain
- **No answer key** and **no rationale/explanation** for any question. A grep over the full text of
  both PDFs finds zero occurrences of "Correct Answer"/"Rationale" (apart from passages that use the
  words). Without keys the app could not check answers, so see "Enrichment" below.

## Pipeline (`tools/`)

1. `parse_pdf.py <pdf> <out.json>` — runs `pdftotext -enc UTF-8`, splits on `Question ID:`, extracts
   id / test / domain / skill / difficulty / stem text / choices / page. Result: `data/pdf_math.json`,
   `data/pdf_rw.json`. All 3,770 questions parse with complete metadata (0 missing skills).
2. `fetch_bank.py` — for every id in the PDFs, downloads the full item from College Board's public
   question-bank API (the same backend the satsuitequestionbank.collegeboard.org site uses; no
   authentication, no special headers). The API's question list for SAT Math / R&W returns exactly the
   same 1,925 + 1,845 ids as the PDFs, in the same order. Two item formats exist:
   - **Current items** (`external_id` UUID, 3,311 items): `POST …/get-question` → `{type: "mcq"|"spr",
     stimulus?, stem, answerOptions[{id, content}], correct_answer: ["B"], keys, rationale}`.
     Stem/options/rationale are HTML with **MathML** for notation and inline **SVG** for figures.
   - **Disclosed items** (`ibn` code, 459 math items): `GET saic.collegeboard.org/disclosed/<ibn>.json`
     → `[{item_id, section, prompt, body?, answer: {style: "Multiple Choice"|"SPR", choices{a..d}{body},
     correct_choice?, rationale}}]`. Math notation here is base64 PNG `<img>` tags (self-contained).
   Raw responses are cached in `data/raw/<id>.json` (gitignored, 44 MB).
3. `build_bank.py` — merges PDF metadata with the fetched content and writes the bank the app ships.

## Shipped bank format (`data/bank/`)

`index.json` (3.6 MB) — `{version, count, counts, questions: Question[]}` where each record is

| Field | Type | Notes |
|---|---|---|
| `id` | string | 8-hex College Board id |
| `section` | `"math"` \| `"rw"` | |
| `domain` | string | one of 8 domains |
| `skill` | string | one of 30 skills (`Cross-text Connections` kept as a separate spelling, 2 items) |
| `difficulty` | `"E"` \| `"M"` \| `"H"` | |
| `type` | `"mcq"` \| `"spr"` | spr = student-produced response (grid-in), math only |
| `hasFigure`, `hasTable` | boolean | from the HTML (`<svg>`/`<img>`, `<table>`) |
| `text` | string | plain-text stimulus + stem (MathML replaced by its `alttext`) — used for search |
| `preview` | string | first 160 chars of `text` |
| `optionsText` | string[] | plain-text choices (mcq) |
| `page` | number | first page of the question in the source PDF |
| `source` | `"official"` | AI-generated questions use `"ai"` and live in user data, not here |
| `content` | boolean | full content available in `q/<id>.json` (true for all 3,770) |

`q/<id>.json` — `{id, section, domain, skill, difficulty, type, source, stimulus, stem, options:[{id:"A", html}],
correct:["B"], keys:["3/17", ".1764"], rationale}`. `stimulus`/`stem`/`rationale`/`options[].html` are HTML
fragments (MathML + SVG + tables). `correct` is the list of correct option letters (always exactly one);
`keys` is the list of accepted student-produced answers (fractions and/or decimals as strings).

### Normalisations applied in `build_bank.py`
- `<mfenced>` (deprecated, not implemented by Chromium's MathML Core) is rewritten to
  `<mrow><mo>(</mo>…<mo>)</mo></mrow>` honouring `open`/`close`/`separators`.
- 11 disclosed multiple-choice items lack `correct_choice`; the key is taken from the rationale's
  "Choice X is correct." sentence. 70 disclosed SPR items have no key field; the key is parsed from
  "The correct answer is …" (including spelled-out fractions such as "three halves" → `3/2`).
- Validation at build time: every mcq has exactly 4 options and exactly 1 correct letter; every spr has
  at least one key; domain/skill/difficulty from the API equal the PDF values for all 3,770 items.

## Counts

Math (1,925): Algebra 616 · Advanced Math 540 · Problem-Solving and Data Analysis 421 · Geometry and
Trigonometry 348. Difficulty E 685 / M 630 / H 610. Types: 1,461 mcq, 464 spr. 612 items have figures,
180 have tables.

Reading and Writing (1,845): Information and Ideas 555 · Craft and Structure 471 · Standard English
Conventions 421 · Expression of Ideas 398. Difficulty E 611 / M 624 / H 610. All mcq. 581 items carry
a separate `stimulus` (passage, paired passages, table, poem, notes list).

## Answer formats
- **mcq**: one letter A–D.
- **spr**: a number. SAT rules implemented in `src/shared/answerCheck.ts`: accept any key exactly;
  accept numerically equal fractions/decimals; decimals may be rounded or truncated to the 4th
  character (5 with a leading minus); no mixed numbers; leading zero optional.
