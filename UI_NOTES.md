# UI_NOTES.md — visual traits of the reference screenshot

Source: `ui_reference` screenshot (College Board style "SAT Question Bank" practice screen).

## Layout
- **Left sidebar**, fixed width (~175 px), full height, dark navy. Top block holds the brand
  ("CollegeBoard" with an acorn-style logo). Below it a bright-blue **program selector** bar
  ("SAT ⌄") that spans the sidebar width.
- Sidebar navigation list: Home, Question Bank, Practice Tests, Performance, Study Tools, then a
  divider, then Settings and Help. Each item = icon (left, ~18 px, light gray) + label. The active
  item (Question Bank) has a slightly lighter navy background and a white left accent bar.
- **Top header** (white, ~85 px): page title "SAT Question Bank" (bold, ~26 px) with a one-line
  subtitle in muted gray. User avatar chip ("JD" in a light-gray circle) with a caret at the far right.
- **Session bar** below the header: white rounded card containing (left→right) a bar-chart icon,
  "Question 12 of 20" (bold), a long thin **progress bar** (light gray track, blue fill, fully
  rounded), a clock icon + timer `00:01:42` (monospace-looking digits), and a light-blue pill
  "Math: No Calculator".
- **Content area** is a light gray page background (#f3f4f6-ish) with two white cards:
  - Left card (~60 %): question tag pill ("Math | Algebra", dark navy bg, white text, small radius)
    then the stem in serif-rendered math (`f(x) = 2x² − 3x + 1`), then a figure (graph) centered.
  - Right card (~40 %): the four answer choices stacked, then "Add to Review" (full-width light
    gray button with bookmark icon), then a row with "‹ Previous" (outlined pill) and "Next ›"
    (solid blue pill, wider).
- Cards: white, 1 px light border (#e5e7eb), ~12 px radius, soft shadow, ~24 px padding, 16–20 px
  gaps between cards.

## Colors
- Sidebar navy: `#1b2537` (approx.), active item `#28334a`, divider `#334155`.
- Program selector blue / primary button blue: `#1d6fd8` (bright "College Board" blue).
- Page background: `#f3f4f6`. Card: `#ffffff`. Borders: `#e5e7eb`.
- Text: near-black `#111827` for headings, `#374151` body, `#6b7280` muted.
- Choice letter circle: slate `#4b5563` background, white letter; choice box border `#d1d5db`.
- Light-blue pill (session mode): bg `#dbeafe`, text `#1e40af`.
- Progress fill: `#1d6fd8` on `#e5e7eb`.

## Typography
- Sans-serif UI font (Roboto / Inter look). Title ~26 px bold; nav labels 15 px; body 16 px.
- Math is rendered in a serif/italic math face (MathJax/MathML look) — questions must render
  real math notation, not plain text.

## Components
- Choice rows: full-width white boxes, 1 px border, 10 px radius, 56–60 px tall, letter badge
  (32 px circle) at left, choice text in 18 px.
- Buttons: fully rounded pills, 44–48 px tall. Primary = solid blue with white text & chevron.
  Secondary = white with 1 px gray border. Tertiary ("Add to Review") = light gray fill.
- Pills/tags: small radius (6 px) for category tag; full radius for status pills.
- Icons: simple line icons (Material-like) in muted gray.

## Spacing
- 24 px outer padding; 16 px between stacked controls; 12 px between choice rows.

## Theme
- The reference is light only. A dark theme is still offered in Settings (same navy palette
  extended to the content area) because the brief asks for it "if the reference supports it";
  light remains the default and matches the screenshot.
