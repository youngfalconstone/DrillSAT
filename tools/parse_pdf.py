"""Parse a College Board SAT question-bank PDF export into JSON.

Usage: python tools/parse_pdf.py <bank.pdf> <out.json> [--text cached.txt]

Extracts, for every "Question ID:" block: id, test, domain, skill, difficulty, stem text,
answer choices (MCQ) and the page range. Math notation in these PDFs is drawn as vector
graphics, so stem text for equation-heavy questions is lossy; the output is used as the
index/search layer and is enriched with full content by tools/build_bank.py.
"""
import json, re, subprocess, sys, os

DOMAINS = ["Algebra", "Advanced Math", "Problem-Solving and Data Analysis", "Geometry and Trigonometry",
           "Information and Ideas", "Craft and Structure", "Expression of Ideas", "Standard English Conventions"]
SKILLS = ["Linear equations in one variable", "Linear equations in two variables", "Linear functions",
          "Systems of two linear equations in two variables", "Linear inequalities in one or two variables",
          "Equivalent expressions", "Nonlinear equations in one variable and systems of equations in two variables",
          "Nonlinear functions", "Ratios, rates, proportional relationships, and units", "Percentages",
          "One-variable data: Distributions and measures of center and spread",
          "Two-variable data: Models and scatterplots", "Probability and conditional probability",
          "Inference from sample statistics and margin of error",
          "Evaluating statistical claims: Observational studies and experiments",
          "Area and volume", "Lines, angles, and triangles", "Right triangles and trigonometry", "Circles",
          "Central Ideas and Details", "Inferences", "Command of Evidence", "Words in Context",
          "Text Structure and Purpose", "Cross-Text Connections", "Cross-text Connections", "Rhetorical Synthesis",
          "Transitions", "Boundaries", "Form, Structure, and Sense"]
SKILLS_SORTED = sorted(SKILLS, key=len, reverse=True)
LABELS = {"Assessment", "SAT", "Test", "Math", "Reading and Writing", "Domain", "Skill", "Difficulty",
          "Easy", "Medium", "Hard", "Question", "Answer"}

def norm(s):
    return re.sub(r"\s+", " ", s).strip()

def parse_block(block, start_page):
    lines = [l.rstrip() for l in block.split("\n")]
    header = lines[0]
    qid = re.match(r"Question ID:\s*([0-9a-f]{8})", header).group(1)
    body = "\n".join(lines[1:])
    pages = body.count("\f") + 1
    body = body.replace("\f", "\n")
    m = re.search(r"^(Math|Reading and Writing)$", body, re.M)
    test = m.group(1) if m else None
    m = re.search(r"^(Easy|Medium|Hard)$", body, re.M)
    difficulty = m.group(1) if m else None
    domain = next((d for d in DOMAINS if re.search(r"^%s$" % re.escape(d), body, re.M)), None)
    flat = norm(body)
    skill = next((s for s in SKILLS_SORTED if s in flat), None)
    # Strip header label/value lines, then split stem / choices
    keep = []
    skill_words = set()
    for l in body.split("\n"):
        t = l.strip()
        if not t or t in LABELS or t in DOMAINS or t in SKILLS:
            continue
        keep.append(t)
    text = "\n".join(keep)
    # remove wrapped skill lines (skill split over multiple lines)
    if skill:
        for frag in [skill, skill.replace(" ", "\n")]:
            pass
    # choices
    choice_re = re.compile(r"(?:(?<=^)|(?<=\s))([A-D])\.\s")
    choices = {}
    stem_lines, in_choices = [], False
    # Find first line that starts with "A. " -> choices begin
    rest = []
    for l in keep:
        if not in_choices and re.match(r"^A\.\s", l):
            in_choices = True
        (rest if in_choices else stem_lines).append(l)
    if in_choices:
        joined = "\n".join(rest)
        parts = re.split(r"(?:^|\s)([A-D])\.\s", joined)
        # parts: ['', 'A', text, 'B', text, ...]
        cur = None
        for i in range(1, len(parts) - 1, 2):
            letter, val = parts[i], parts[i + 1]
            if letter in choices:  # duplicate letter => the rest belongs to stem continuation, keep anyway
                choices[letter] += " " + norm(val)
            else:
                choices[letter] = norm(val)
    stem = norm(" ".join(stem_lines))
    # remove leftover wrapped skill text from stem (e.g. "variables" fragments) - heuristic
    return {"id": qid, "test": test, "domain": domain, "skill": skill, "difficulty": difficulty,
            "stem_text": stem, "choices": choices if len(choices) >= 2 else None,
            "page": start_page, "pages": pages}

def main():
    pdf, out = sys.argv[1], sys.argv[2]
    txt_path = sys.argv[4] if len(sys.argv) > 4 and sys.argv[3] == "--text" else None
    if txt_path and os.path.exists(txt_path):
        txt = open(txt_path, encoding="utf-8", errors="replace").read()
    else:
        txt = subprocess.run(["pdftotext", "-enc", "UTF-8", pdf, "-"], capture_output=True, check=True).stdout.decode("utf-8", "replace")
    txt = txt.replace("\r\n", "\n")
    # page index for each block start
    starts = [m.start() for m in re.finditer(r"Question ID: [0-9a-f]{8}", txt)]
    records = []
    for i, s in enumerate(starts):
        e = starts[i + 1] if i + 1 < len(starts) else len(txt)
        page = txt.count("\f", 0, s) + 1
        records.append(parse_block(txt[s:e], page))
    json.dump(records, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    from collections import Counter
    print(out, len(records), "questions")
    print(" tests", Counter(r["test"] for r in records))
    print(" domains", Counter(r["domain"] for r in records))
    print(" difficulty", Counter(r["difficulty"] for r in records))
    print(" missing skill", sum(1 for r in records if not r["skill"]))
    print(" with choices", sum(1 for r in records if r["choices"]), " 4 choices", sum(1 for r in records if r["choices"] and len(r["choices"]) == 4))
    print(" unique ids", len(set(r["id"] for r in records)))

if __name__ == "__main__":
    main()
