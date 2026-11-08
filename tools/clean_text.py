"""Readable plain text from College Board question HTML, for list previews and search.

- MathML is converted structurally to compact linear math: <mfrac> -> (a)/(b), <msup> -> x², <msqrt> -> √x ...
  (the MathML `alttext` is spoken English such as "StartFraction 12 x plus 28 Over 4 EndFraction").
- Math images in the older disclosed items only carry spoken alt text ("17 point 5"); that is converted
  with a small speech-to-symbols pass.
- Figures (inline SVG) and screen-reader-only long descriptions are dropped: they describe a picture,
  they are not the question.
"""
import html as htmlmod
import re
from html.parser import HTMLParser

VOID = {"br", "img", "hr", "input", "meta", "link", "col", "area", "base", "wbr", "source", "mspace", "none", "mprescripts"}
BLOCK = {"p", "div", "li", "ul", "ol", "tr", "table", "br", "h1", "h2", "h3", "h4", "figure", "blockquote", "section"}
SKIP_TAGS = {"svg", "figure", "script", "style", "annotation", "annotation-xml"}


class Node:
    __slots__ = ("tag", "attrs", "children", "parent")

    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.children, self.parent = tag, dict(attrs), [], parent


class TreeBuilder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root", [], None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag.lower(), attrs, self.cur)
        self.cur.children.append(n)
        if n.tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag.lower(), attrs, self.cur))

    def handle_endtag(self, tag):
        tag = tag.lower()
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def parse(fragment):
    b = TreeBuilder()
    b.feed(fragment or "")
    b.close()
    return b.root


# ---------- MathML -> linear text ----------

SUP = str.maketrans("0123456789+-−=()nxyi", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ⁿˣʸⁱ")
SUB = str.maketrans("0123456789+-−=()", "₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎")
SPACED_OPS = {"=", "+", "−", "-", "×", "÷", "<", ">", "≤", "≥", "≠", "≈", "±", "⇒", "→"}


def text_of(n):
    return "".join(c if isinstance(c, str) else text_of(c) for c in n.children)


def elements(n):
    return [c for c in n.children if not isinstance(c, str)]


def is_simple(s):
    return bool(re.fullmatch(r"[\w.′'°]+", s))


def wrap(s):
    s = s.strip()
    return s if is_simple(s) or (s.startswith("(") and s.endswith(")") and s.count("(") == 1) else f"({s})"


def lin(n):
    if isinstance(n, str):
        return n.strip()
    t = n.tag
    kids = elements(n)
    if t in ("mi", "mn", "mtext", "ms"):
        v = htmlmod.unescape(text_of(n)).replace("⁡", "").strip()
        if t == "mn" and v.startswith("-"):
            v = "−" + v[1:]
        return v or (" " if t == "mtext" else "")
    if t == "mo":
        op = htmlmod.unescape(text_of(n)).replace("⁡", "").replace("⁢", "").strip()
        if op == "-":
            op = "−"
        return f" {op} " if op in SPACED_OPS else op
    if t == "mspace":
        return " "
    if t == "mfrac" and len(kids) >= 2:
        return f"{wrap(lin(kids[0]))}/{wrap(lin(kids[1]))}"
    if t == "msup" and len(kids) >= 2:
        base, sup = lin(kids[0]), lin(kids[1]).strip()
        if sup and all(ch in "0123456789+-−=()nxyi" for ch in sup):
            return wrap(base) + sup.translate(SUP) if not is_simple(base) else base + sup.translate(SUP)
        return f"{wrap(base)}^{wrap(sup)}"
    if t == "msub" and len(kids) >= 2:
        base, sub = lin(kids[0]), lin(kids[1]).strip()
        if sub and all(ch in "0123456789+-−=()" for ch in sub):
            return base + sub.translate(SUB)
        return f"{base}_{wrap(sub)}"
    if t == "msubsup" and len(kids) >= 3:
        return f"{lin(kids[0])}_{wrap(lin(kids[1]))}^{wrap(lin(kids[2]))}"
    if t == "msqrt":
        inner = "".join(lin(k) for k in kids)
        return "√" + wrap(inner)
    if t == "mroot" and len(kids) >= 2:
        idx = lin(kids[1]).strip()
        root = {"3": "∛", "4": "∜"}.get(idx, f"{idx}√")
        return root + wrap(lin(kids[0]))
    if t in ("mover", "munder") and len(kids) >= 2:
        base, acc = lin(kids[0]), htmlmod.unescape(text_of(kids[1])).strip()
        if acc in ("¯", "‾", "_", "―", "−", "-"):
            return "".join(ch + "̅" for ch in base)  # segment AB -> A̅B̅
        if acc in ("⌢", "︵", "⏜"):
            return "arc " + base
        if acc in ("→", "⟶", "↔"):
            return base
        return base
    if t == "mtable":
        return "; ".join("".join(lin(c) for c in elements(r)) for r in kids)
    if t in ("semantics",):
        return lin(kids[0]) if kids else ""
    # math, mrow, mstyle, menclose, mpadded, mphantom, mtd, mtr ...
    return "".join(lin(k) for k in n.children)


UNARY_MINUS = re.compile(r"(^|[(\[=,;·<>≤≥±×÷+]\s*)−\s+(?=[\w(√.])")


def mathml_to_text(math_node):
    s = lin(math_node)
    s = re.sub(r"\s+", " ", s).strip()
    s = UNARY_MINUS.sub(lambda m: m.group(1) + "−", s)
    s = re.sub(r"\(\s+", "(", s)
    s = re.sub(r"\s+\)", ")", s)
    s = re.sub(r"\s+,", ",", s)
    return s


# ---------- spoken alt text (disclosed items' math images) ----------

SPEECH = [
    (r"\bis less than or equal to\b", "≤"), (r"\bis greater than or equal to\b", "≥"),
    (r"\bless than or equal to\b", "≤"), (r"\bgreater than or equal to\b", "≥"),
    (r"\bis less than\b", "<"), (r"\bis greater than\b", ">"), (r"\bdoes not equal\b", "≠"),
    (r"\bleft parenthesis\b", "("), (r"\bright parenthesis\b", ")"),
    (r"\bopen parenthesis\b", "("), (r"\bclose parenthesis\b", ")"),
    (r"\bsquare root of\b", "√"), (r"\bsquared\b", "²"), (r"\bcubed\b", "³"),
    (r"\bto the (\w+) power\b", r"^\1"), (r"\bequals\b", "="), (r"\bplus\b", "+"), (r"\bminus\b", "−"),
    (r"\bnegative\s+", "−"), (r"\btimes\b", "×"), (r"\bdivided by\b", "÷"), (r"(\d)\s+point\s+(\d)", r"\1.\2"),
    (r"\bcomma\b", ","), (r"\bdegrees\b", "°"), (r"\bpi\b", "π"),
]


def speech_to_text(alt):
    s = htmlmod.unescape(alt or "")
    for a, b in SPEECH:
        s = re.sub(a, b, s, flags=re.I)
    # "x squared, plus 20 x": a comma before a spaced operator is a spoken pause, not punctuation
    s = re.sub(r"\s*,\s*(?=[=)+−×÷<>≤≥]\s)", " ", s)
    s = re.sub(r"(\d) ([a-z])\b", r"\1\2", s)  # "20 x" -> "20x" (math alt text only)
    s = re.sub(r"\s+([²³°,)])", r"\1", s)
    s = re.sub(r"([(√])\s+", r"\1", s)
    s = re.sub(r"\s+", " ", s).strip()
    return UNARY_MINUS.sub(lambda m: m.group(1) + "−", s)


# ---------- whole fragment ----------

def _classes(n):
    return (n.attrs.get("class") or "").split()


def _walk(n, out):
    if isinstance(n, str):
        out.append(n)
        return
    if n.tag in SKIP_TAGS or "sr-only" in _classes(n):
        out.append(" ")
        return
    if n.tag == "math":
        out.append(" " + mathml_to_text(n) + " ")
        return
    if n.tag == "img":
        alt = n.attrs.get("alt") or ""
        if "math-img" in _classes(n) or n.attrs.get("role") == "math":
            out.append(" " + speech_to_text(alt) + " ")
        return
    if n.tag in BLOCK:
        out.append("\n")
    for c in n.children:
        _walk(c, out)
    if n.tag in BLOCK:
        out.append("\n")


def clean_text(fragment):
    out = []
    _walk(parse(fragment), out)
    s = htmlmod.unescape("".join(out)).replace(" ", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" *\n[\n ]*", "\n", s).strip()
    s = re.sub(r" ([,.;:?!])", r"\1", s)
    # paragraphs: a block that ends without sentence punctuation (an equation, a list item) gets " · "
    s = re.sub(r"(?<![.?!:;,])\n", " · ", s)
    return s.replace("\n", " ")
