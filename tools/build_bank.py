"""Merge the PDF index (tools/parse_pdf.py output) with the fetched content (tools/fetch_bank.py
output) into the bank the app ships:

  data/bank/index.json      - one compact record per question (metadata + search text)
  data/bank/q/<id>.json     - full content: stimulus/stem HTML, options, keys, rationale

Usage: python tools/build_bank.py data/pdf_math.json data/pdf_rw.json data/raw data/bank
"""
import json, os, re, sys, html as htmlmod
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from clean_text import clean_text  # noqa: E402

DIFF = {"Easy": "E", "Medium": "M", "Hard": "H", "E": "E", "M": "M", "H": "H"}

WORD_NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
            "ten": 10, "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20}
WORD_DEN = {"half": 2, "halves": 2, "third": 3, "thirds": 3, "fourth": 4, "fourths": 4, "quarter": 4, "quarters": 4,
            "fifth": 5, "fifths": 5, "sixth": 6, "sixths": 6, "seventh": 7, "sevenths": 7, "eighth": 8, "eighths": 8,
            "ninth": 9, "ninths": 9, "tenth": 10, "tenths": 10}


def strip_html(s):
    if not s:
        return ""
    # replace math by its alttext / img by alt so search text is meaningful
    s = re.sub(r'<math[^>]*alttext="([^"]*)"[^>]*>.*?</math>', lambda m: " " + htmlmod.unescape(m.group(1)) + " ", s, flags=re.S)
    s = re.sub(r'<img[^>]*alt="([^"]*)"[^>]*>', lambda m: " " + htmlmod.unescape(m.group(1)) + " ", s, flags=re.S)
    s = re.sub(r"<svg.*?</svg>", " [figure] ", s, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    s = htmlmod.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def split_top_level(inner):
    """Split a MathML fragment into its top-level element children."""
    out, depth, cur = [], 0, ""
    tokens = re.split(r"(<[^>]+>)", inner)
    for t in tokens:
        if not t:
            continue
        if t.startswith("</"):
            depth -= 1
            cur += t
            if depth == 0:
                out.append(cur)
                cur = ""
        elif t.startswith("<") and not t.endswith("/>") and not t.startswith("<!"):
            depth += 1
            cur += t
        else:
            cur += t
            if depth == 0 and t.strip():
                out.append(cur)
                cur = ""
    if cur.strip():
        out.append(cur)
    return [c for c in out if c.strip()]


def fix_mathml(s):
    """MathML Core (Chromium) does not implement <mfenced>; rewrite it as mrow/mo."""
    if not s or "<mfenced" not in s:
        return s

    def repl(m):
        attrs = m.group(1) or ""
        op = re.search(r'open="([^"]*)"', attrs)
        cl = re.search(r'close="([^"]*)"', attrs)
        o = htmlmod.unescape(op.group(1)) if op else "("
        c = htmlmod.unescape(cl.group(1)) if cl else ")"
        inner = m.group(2)
        sep = re.search(r'separators="([^"]*)"', attrs)
        seps = (sep.group(1) if sep else ",").strip()
        children = split_top_level(inner)
        if len(children) > 1 and seps:
            parts = []
            for i, ch in enumerate(children):
                if i:
                    parts.append("<mo>%s</mo>" % htmlmod.escape(seps[min(i - 1, len(seps) - 1)]))
                parts.append(ch)
            inner = "".join(parts)
        return "<mrow><mo>%s</mo>%s<mo>%s</mo></mrow>" % (htmlmod.escape(o), inner, htmlmod.escape(c))

    prev = None
    while prev != s:  # innermost first, repeat for nesting
        prev = s
        s = re.sub(r"<mfenced([^>]*)>((?:(?!<mfenced)(?!</mfenced>).)*)</mfenced>", repl, s, flags=re.S)
    return s


def parse_correct_from_rationale(rat):
    t = strip_html(rat)
    m = re.search(r"Choice\s+([A-D])\s+is\s+correct", t)
    return m.group(1) if m else None


def words_to_fractions(t):
    """'three halves' -> '3/2', '7 over 6' -> '7/6', 'the fraction 10 over 3' -> '10/3'."""
    t = re.sub(r"the fraction\s+", "", t)
    t = re.sub(r"(\d+)\s+over\s+(\d+)", r"\1/\2", t)

    def w(m):
        n, d = m.group(1).lower(), m.group(2).lower()
        if n in WORD_NUM and d in WORD_DEN:
            return "%d/%d" % (WORD_NUM[n], WORD_DEN[d])
        return m.group(0)
    return re.sub(r"\b([a-z]+)\s+([a-z]+)\b", w, t, flags=re.I)


def parse_spr_from_rationale(rat):
    t = words_to_fractions(strip_html(rat))
    m = re.search(r"correct answers? (?:is|are)\s+(.+?)(?:\.\s|\.$|$)", t)
    if not m:
        return []
    ans = re.sub(r"\(.*?\)", "", m.group(1))
    parts = re.split(r"\s*(?:,|\bor\b|\band\b|\beither\b)\s*", ans)
    vals = []
    for p in parts:
        p = p.strip().rstrip(".").replace(",", "")
        if re.fullmatch(r"-?\d*\.?\d+(?:/\d+)?", p):
            vals.append(p)
    return vals


def build_api(c):
    q = {"type": c["type"], "stimulus": fix_mathml(c.get("stimulus") or ""), "stem": fix_mathml(c.get("stem") or ""),
         "rationale": fix_mathml(c.get("rationale") or "")}
    if c["type"] == "mcq":
        opts = c.get("answerOptions") or []
        q["options"] = [{"id": "ABCD"[i], "html": fix_mathml(o["content"])} for i, o in enumerate(opts)]
        corr = list(c.get("correct_answer") or [])
        if not corr and c.get("keys"):
            corr = ["ABCD"[i] for i, o in enumerate(opts) if o["id"] in c["keys"]]
        q["correct"] = corr
    else:
        q["keys"] = [str(k).strip() for k in (c.get("keys") or [])]
    return q


def build_ibn(items):
    it = items[0]
    a = it["answer"]
    q = {"type": "mcq" if a.get("style") == "Multiple Choice" else "spr", "stimulus": it.get("body") or "",
         "stem": it.get("prompt") or "", "rationale": a.get("rationale") or ""}
    if q["type"] == "mcq":
        ch = a.get("choices") or {}
        q["options"] = [{"id": k.upper(), "html": ch[k]["body"]} for k in ["a", "b", "c", "d"] if k in ch]
        cc = (a.get("correct_choice") or "").upper() or parse_correct_from_rationale(a.get("rationale") or "")
        q["correct"] = [cc] if cc else []
    else:
        q["keys"] = parse_spr_from_rationale(a.get("rationale") or "")
    return q


def main():
    pdf_math, pdf_rw, raw_dir, out_dir = sys.argv[1:5]
    os.makedirs(os.path.join(out_dir, "q"), exist_ok=True)
    pdf = {r["id"]: r for r in json.load(open(pdf_math, encoding="utf-8")) + json.load(open(pdf_rw, encoding="utf-8"))}
    index, problems = [], Counter()
    for qid, rec in pdf.items():
        path = os.path.join(raw_dir, qid + ".json")
        section = "math" if rec["test"] == "Math" else "rw"
        entry = {"id": qid, "section": section, "domain": rec["domain"], "skill": rec["skill"],
                 "difficulty": DIFF[rec["difficulty"]], "page": rec["page"], "source": "official"}
        if os.path.exists(path):
            d = json.load(open(path, encoding="utf-8"))
            c, meta = d["content"], d["meta"]
            q = build_ibn(c) if isinstance(c, list) else build_api(c)
            if meta.get("primary_class_cd_desc") != rec["domain"]:
                problems["domain mismatch"] += 1
            if (meta.get("skill_desc") or "").strip().lower() != (rec["skill"] or "").strip().lower():
                problems["skill mismatch"] += 1
            if DIFF[meta.get("difficulty")] != entry["difficulty"]:
                problems["difficulty mismatch"] += 1
            entry["type"] = q["type"]
            if q["type"] == "mcq" and (len(q.get("options", [])) != 4 or len(q.get("correct", [])) != 1):
                problems["mcq invalid"] += 1
                print("mcq invalid", qid, len(q.get("options", [])), q.get("correct"))
            if q["type"] == "spr" and not q.get("keys"):
                problems["spr no key"] += 1
                print("spr no key", qid, strip_html(q["rationale"])[:120])
            both = q["stem"] + q["stimulus"]
            entry["hasFigure"] = ("<svg" in both) or ("<img" in both)
            entry["hasTable"] = "<table" in both
            # readable math (not spoken alt text) and no figure descriptions; see tools/clean_text.py
            text = clean_text(q["stimulus"] + " " + q["stem"])
            entry["text"] = text
            entry["preview"] = text[:160]
            if q["type"] == "mcq":
                entry["optionsText"] = [clean_text(o["html"])[:80] for o in q["options"]]
            # College Board Skills Insight performance score band (1-7), assigned by RP67 mapping
            band = meta.get("score_band_range_cd")
            if isinstance(band, int) and 1 <= band <= 7:
                entry["band"] = band
            else:
                problems["no band"] += 1
            q.update({"id": qid, "section": section, "domain": rec["domain"], "skill": rec["skill"],
                      "difficulty": entry["difficulty"], "source": "official"})
            with open(os.path.join(out_dir, "q", qid + ".json"), "w", encoding="utf-8") as f:
                json.dump(q, f, ensure_ascii=False, separators=(",", ":"))
            entry["content"] = True
        else:
            problems["no content"] += 1
            entry["type"] = "mcq" if rec["choices"] else "spr"
            entry["text"] = rec["stem_text"]
            entry["preview"] = rec["stem_text"][:160]
            entry["content"] = False
        index.append(entry)
    counts = Counter((e["section"], e["type"]) for e in index)
    out = {"version": 1, "count": len(index), "counts": {f"{k[0]}:{k[1]}": v for k, v in counts.items()},
           "questions": index}
    with open(os.path.join(out_dir, "index.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("questions:", len(index), dict(counts))
    print("problems:", dict(problems))
    print("hasFigure", sum(e.get("hasFigure", False) for e in index), "hasTable", sum(e.get("hasTable", False) for e in index))


if __name__ == "__main__":
    main()
