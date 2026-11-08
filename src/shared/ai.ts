/**
 * AI feature logic: prompt construction, response parsing and validation.
 * Pure functions - the actual LLM call is injected (`Completer`) so this is unit-testable with mocks.
 */
import type { AIReview, AnswerRecord, ChatMessage, Difficulty, Question, QuestionIndexEntry, Section } from './types';
import { DIFFICULTY_LABEL, SECTION_LABEL } from './types';
import { checkSpr, parseSpr } from './answerCheck';
import { similarity } from './search';
import { skillStats } from './adaptive';

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
}
export type Completer = (req: CompletionRequest) => Promise<string>;

export class AIValidationError extends Error {
  code = 'validation' as const;
}

// ---------- helpers ----------

/** Plain text of an HTML fragment: MathML -> alttext, strip tags. */
export function htmlToText(html: string): string {
  if (!html) return '';
  let s = html.replace(/<math[^>]*alttext="([^"]*)"[^>]*>[\s\S]*?<\/math>/g, (_m, alt) => ' ' + decode(alt) + ' ');
  s = s.replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, (_m, alt) => ' ' + decode(alt) + ' ');
  s = s.replace(/<svg[\s\S]*?<\/svg>/g, ' [figure] ');
  s = s.replace(/<\/(p|div|tr|li|h\d)>/g, '\n').replace(/<br\s*\/?>/g, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  return decode(s).replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

export function questionToText(q: Question): string {
  const parts: string[] = [];
  if (q.stimulus) parts.push(htmlToText(q.stimulus));
  parts.push(htmlToText(q.stem));
  if (q.type === 'mcq' && q.options) {
    for (const o of q.options) parts.push(`${o.id}. ${htmlToText(o.html)}`);
  } else {
    parts.push('(Student-produced response: enter a number)');
  }
  return parts.join('\n');
}

/** Extract the first JSON object from a model reply (tolerates ```json fences and prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1));
    } catch {
      /* try next */
    }
  }
  throw new AIValidationError('The AI reply did not contain valid JSON.');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Minimal markdown-ish text -> HTML for AI content; keeps $...$ for KaTeX. */
export function textToHtml(s: string): string {
  const paras = escapeHtml(s.trim()).split(/\n{2,}/);
  return paras.map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

// ---------- question generation ----------
//
// Generated questions must be indistinguishable in format from College Board items and sit at the
// requested College Board difficulty. Three layers enforce that (DECISIONS.md #32):
//   1. the prompt: per-skill official item format, a difficulty rubric, and official examples of the
//      exact skill + difficulty + type;
//   2. `checkSatFormat`: deterministic rules measured on the official bank (passage length, grid-in fit,
//      SAT math scope, no "all of the above", R&W blank/notes conventions);
//   3. `buildVerifyPrompt`: an independent reviewer pass that solves the item without the key and rates
//      its difficulty against official anchor items (one Easy, one Medium, one Hard) of the same skill.
//      The item is kept only if the reviewer's answer equals the key, the answer is unique, the item is
//      plausible as a real SAT item, and the rated difficulty equals the requested one.

/** College Board item format for each skill: what the stimulus looks like and the official question stem. */
export const SKILL_FORMAT: Record<string, string> = {
  // Reading and Writing
  'Words in Context': 'One short text (25-90 words) containing a single blank written as ______. Stem: "Which choice completes the text with the most logical and precise word or phrase?" Options are single words or short phrases of the same part of speech. (Alternative official form: a word in the text is quoted and the stem asks "As used in the text, what does the word \\"X\\" most nearly mean?")',
  'Text Structure and Purpose': 'One text (60-150 words), literary or informational. Stem: "Which choice best states the main purpose of the text?" or "Which choice best describes the overall structure of the text?" or "Which choice best describes the function of the [first/second/third] sentence in the overall structure of the text?" Options are full-sentence descriptions starting with a verb ("To argue...", "It introduces...").',
  'Cross-Text Connections': 'Two short texts on the same topic labelled "Text 1" and "Text 2" (each 40-90 words), the second responding to or complicating the first. Stem: "Based on the texts, how would the author of Text 2 most likely respond to the [claim/finding] in Text 1?" (or how would the authors of both texts most likely describe...). Options start with "By ...".',
  'Central Ideas and Details': 'One text (60-150 words), informational or literary (literary excerpts are introduced like "The following text is from [Author]\'s [year] novel [Title]."). Stem: "Which choice best states the main idea of the text?" or "According to the text, ...?" or "Based on the text, ...?"',
  'Command of Evidence': 'Either (textual) a text that states a claim or hypothesis, with the stem "Which finding, if true, would most directly support/weaken the [researcher\'s] [claim/hypothesis]?" or "Which quotation from [the poem/the novel] most effectively illustrates the claim?"; or (quantitative) a short text plus a data table (write the table as pipe-separated rows: a title line, a header row, then data rows) with the stem "Which choice most effectively uses data from the table to complete the [statement/example]?" and the text ending in a blank ______.',
  'Inferences': 'One informational text (60-150 words) that ends with an incomplete sentence ending in ______. Stem: "Which choice most logically completes the text?" Options are clauses that would finish the final sentence.',
  'Transitions': 'One text (40-100 words) with a blank ______ where a transition word or phrase belongs (start of a sentence, followed by a comma when appropriate). Stem: "Which choice completes the text with the most logical transition?" Options are transitions such as "However,", "For example,", "Similarly,", "In other words,".',
  'Rhetorical Synthesis': 'Stimulus starts "While researching a topic, a student has taken the following notes:" followed by 4-6 bullet notes, each on its own line starting with "- ". Stem: "The student wants to [specific rhetorical goal]. Which choice most effectively uses relevant information from the notes to accomplish this goal?" Options are single sentences built from the notes.',
  'Boundaries': 'One text (25-90 words) with a blank ______ at a sentence/clause boundary. Stem: "Which choice completes the text so that it conforms to the conventions of Standard English?" The four options are the same words differing ONLY in punctuation (comma, semicolon, colon, dash, period, no punctuation).',
  'Form, Structure, and Sense': 'One text (25-90 words) with a blank ______. Stem: "Which choice completes the text so that it conforms to the conventions of Standard English?" The four options are forms of the same word or phrase differing in verb tense/agreement, pronoun, possessive/plural, or modifier placement.',
  // Math
  'Linear equations in one variable': 'Solve or reason about a linear equation in one variable (possibly with constants as parameters, or asking for the number of solutions), in context or abstract.',
  'Linear functions': 'Interpret or build a linear function f(x)=mx+b from a context, table, or values; slope/intercept meaning.',
  'Linear equations in two variables': 'Linear equation in two variables (often a context such as total cost), interpreting coefficients, finding solutions, or writing the equation.',
  'Systems of two linear equations in two variables': 'Solve or reason about a system of two linear equations (including no/infinitely many solutions), in context or abstract.',
  'Linear inequalities in one or two variables': 'Write, solve, or interpret a linear inequality (one or two variables), often a budget or capacity context.',
  'Nonlinear functions': 'Quadratic, exponential, polynomial, rational or radical functions: evaluating, interpreting parameters, vertex/intercepts, growth/decay.',
  'Nonlinear equations in one variable and systems of equations in two variables': 'Solve quadratic, radical, rational or absolute-value equations, or a system with one linear and one nonlinear equation.',
  'Equivalent expressions': 'Rewrite polynomial, rational, radical or exponential expressions in an equivalent form; identify which expression is equivalent.',
  'Ratios, rates, proportional relationships, and units': 'Ratios, rates, proportions, unit conversion, in a realistic context.',
  'Percentages': 'Percent of a quantity, percent increase/decrease, successive percent changes.',
  'One-variable data: Distributions and measures of center and spread': 'Mean, median, range, standard deviation (conceptual only), effect of adding/removing values; data may be given as a list or frequency table.',
  'Two-variable data: Models and scatterplots': 'Interpret a line or curve of best fit, predicted vs. actual values, linear vs. exponential models; describe any data in text or a table (no figure).',
  'Probability and conditional probability': 'Probability from a two-way table or counts, including conditional probability ("given that").',
  'Inference from sample statistics and margin of error': 'Random samples, generalizing to a population, interpreting margin of error and estimates.',
  'Evaluating statistical claims: Observational studies and experiments': 'What conclusion is supported by an observational study or randomized experiment (causation vs. association, population scope).',
  'Area and volume': 'Area, surface area, volume of standard figures; scale factor effects; figures described in words.',
  'Lines, angles, and triangles': 'Angle relationships, parallel lines and transversals, triangle angle sums, similar/congruent triangles; figures described in words.',
  'Right triangles and trigonometry': 'Pythagorean theorem, special right triangles, sine/cosine/tangent in right triangles, radians/degrees.',
  'Circles': 'Circle equations (x-h)^2+(y-k)^2=r^2 including completing the square, arc length, sector area, central angles.',
};
SKILL_FORMAT['Cross-text Connections'] = SKILL_FORMAT['Cross-Text Connections'];

/** Difficulty rubric, written from the College Board's description of how its items vary in difficulty. */
export const DIFFICULTY_GUIDE: Record<Section, Record<Difficulty, string>> = {
  math: {
    E: 'Easy: one or two routine steps; the question asks directly for the quantity you compute; friendly numbers; most test takers answer correctly.',
    M: 'Medium: two or three steps; requires translating a context into math or a modest algebraic manipulation; one tempting distractor from a common slip.',
    H: 'Hard: multi-step and abstract (constants as parameters, number of solutions, equivalent forms, combining two concepts); the asked quantity is not the first thing you solve for; distractors come from plausible partial work; fewer than a third of test takers answer correctly.',
  },
  rw: {
    E: 'Easy: accessible, everyday prose; the answer is stated or very nearly stated in the text; common vocabulary; wrong choices are clearly off-topic or contradicted.',
    M: 'Medium: moderately complex informational or literary prose; requires a small inference or careful reading; at least one distractor is partly supported.',
    H: 'Hard: dense academic or older literary prose with sophisticated vocabulary and syntax; requires precise reasoning about the text; every distractor is plausible and partly true, and only careful comparison eliminates it.',
  },
};

const MATH_OUT_OF_SCOPE = /\b(derivative|integral|antiderivative|logarithms?|matrix|matrices|vectors?|imaginary|complex numbers?|factorial|permutations?|sigma notation|arithmetic sequence|geometric sequence|limit as)\b|\\(int|lim|log|ln|sum|vec|binom)\b|\blog_|\bln\s*\(|\bi\^2\b|\d!|\bnCr\b/i;
const BANNED_OPTION = /^(all|none|both|neither) of the (above|choices|options)\.?$|^[a-d] and [a-d]$/i;

export interface GenerateSpec {
  section: Section;
  domain: string;
  skill: string;
  difficulty: Difficulty;
  type: 'mcq' | 'spr';
  /** Official questions of the same skill, difficulty and type (style references). */
  examples: Question[];
  /** Official questions of the same skill at each difficulty, used to calibrate the reviewer. */
  anchors?: Partial<Record<Difficulty, Question>>;
}

function formatSpec(spec: GenerateSpec): string {
  if (spec.section === 'rw') {
    return `Digital SAT Reading and Writing format: one short stimulus (a single text of 25-150 words, or two short texts, or notes, optionally with one small table) followed by ONE question and four answer choices A-D. Put the passage/notes/table in "stimulus" and only the question sentence in "stem". Use the official question stem wording for the skill. Blanks are written as ______ (six underscores). Texts are original, factual-sounding passages on literature, history/social studies, the humanities or science, like the official ones. No "all of the above"/"none of the above".`;
  }
  return `Digital SAT Math format: a self-contained question (realistic context or pure algebra/geometry) that a student can answer with a graphing calculator and the standard SAT reference sheet. Stay strictly within SAT content: no calculus, logarithms, matrices, vectors, complex numbers, sequences/series notation, factorials or combinatorics formulas. Do not rely on a figure: describe any geometric figure fully in words, and give data as a pipe-separated table (title line, header row, data rows) if needed. ${spec.type === 'spr'
    ? 'Student-produced response: the answer is a single number that fits the SAT grid (at most 5 characters for a positive answer, 6 for a negative one, counting the decimal point, slash and minus sign); no units, no variables. If the exact answer is a repeating decimal, give it as a fraction key (and optionally the decimal rounded or truncated to fit).'
    : 'Multiple choice: four options A-D, each a number or expression in the same form, ordered from least to greatest when they are numbers; no "all of the above"/"none of the above". Distractors come from realistic mistakes.'}`;
}

export function buildGeneratePrompt(spec: GenerateSpec, feedback?: string): CompletionRequest {
  const ex = spec.examples
    .slice(0, 3)
    .map((q, i) => `--- Official example ${i + 1} (${DIFFICULTY_LABEL[q.difficulty]}) ---\n${questionToText(q)}`)
    .join('\n\n');
  const fmt = spec.type === 'mcq'
    ? `{"stimulus": "<passage, notes or table, or empty string>", "stem": "<question>", "options": ["<A>", "<B>", "<C>", "<D>"], "correct": "<A|B|C|D>", "explanation": "<why the correct answer is right and each other option is wrong, in the style of a College Board rationale>"}`
    : `{"stimulus": "", "stem": "<question>", "keys": ["<numeric answer, e.g. 12 or 3/4 or .75>"], "explanation": "<step-by-step solution in the style of a College Board rationale>"}`;
  const system = `You are a College Board item writer for the digital SAT. You write original practice items that are indistinguishable in format, length, tone and rigor from official SAT Suite Question Bank items, at exactly the requested College Board difficulty. Never copy or lightly paraphrase the examples - write a new scenario with new numbers. Write math with LaTeX inside $...$ (inline) delimiters; do not use MathML or Unicode superscripts. The item must have exactly one defensible correct answer, and you must verify it by solving the item yourself before answering. Reply with ONLY a JSON object, no prose, no markdown fence.`;
  const user = `Section: ${SECTION_LABEL[spec.section]}
Domain: ${spec.domain}
Skill: ${spec.skill}
Required difficulty: ${DIFFICULTY_GUIDE[spec.section][spec.difficulty]}
Answer format: ${spec.type === 'mcq' ? 'multiple choice with four options' : 'student-produced response (numeric answer)'}

${formatSpec(spec)}

Official item format for this skill: ${SKILL_FORMAT[spec.skill] ?? 'match the official examples below.'}

Official ${DIFFICULTY_LABEL[spec.difficulty]} examples of this skill (match their structure, length and rigor; do NOT reuse their scenarios or numbers):

${ex}
${feedback ? `\nYour previous attempt was rejected: ${feedback}\nWrite a different item that fixes this.\n` : ''}
Now write ONE new item. Output exactly this JSON shape:
${fmt}`;
  return { system, messages: [{ role: 'user', content: user }], maxTokens: 4000 };
}

export interface GeneratedQuestion extends Question {
  explanationText: string;
}

/**
 * Text of a generated stimulus/stem -> HTML: paragraphs, "- " bullet notes as a list and
 * pipe-separated rows as a table (first line of a table block may be a title). Keeps $…$ for KaTeX.
 */
export function itemTextToHtml(s: string): string {
  // "Text 1" / "Text 2" labels become their own block, rendered like the official paired-passage headings
  const blocks = s.replace(/\r\n/g, '\n').replace(/^(Text [12])[:.]?[ \t]*/gm, '\n\n$1\n\n').trim().split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const tableStart = lines.findIndex((l) => l.includes('|'));
    const tableLines = tableStart >= 0 ? lines.slice(tableStart).filter((l) => !/^\|?\s*:?-{2,}/.test(l)) : [];
    if (tableStart >= 0 && tableLines.length >= 2 && tableLines.every((l) => l.includes('|'))) {
      const before = lines.slice(0, tableStart);
      const cells = (l: string) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => escapeHtml(c.trim()));
      const [head, ...rows] = tableLines;
      const caption = before.length ? `<caption>${escapeHtml(before.join(' '))}</caption>` : '';
      out.push(`<table>${caption}<thead><tr>${cells(head).map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const bulletStart = lines.findIndex((l) => /^[-•*]\s+/.test(l));
    if (bulletStart >= 0 && lines.slice(bulletStart).every((l) => /^[-•*]\s+/.test(l))) {
      if (bulletStart > 0) out.push(`<p>${escapeHtml(lines.slice(0, bulletStart).join(' '))}</p>`);
      out.push(`<ul>${lines.slice(bulletStart).map((l) => `<li>${escapeHtml(l.replace(/^[-•*]\s+/, ''))}</li>`).join('')}</ul>`);
      continue;
    }
    if (lines.length === 1 && /^Text [12]$/.test(lines[0])) {
      out.push(`<span class="paired_passage">${lines[0]}</span>`);
      continue;
    }
    out.push(`<p>${lines.map(escapeHtml).join('<br>')}</p>`);
  }
  return out.join('');
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

/** True when a student-produced response fits the SAT answer grid (5 characters, 6 with a minus sign). */
export function fitsSprGrid(key: string): boolean {
  const k = key.trim();
  return parseSpr(k) !== null && k.length <= (k.startsWith('-') ? 6 : 5) && /^-?(\d+(\.\d*)?|\.\d+|\d+\/\d+)$/.test(k);
}

/**
 * Deterministic digital-SAT format rules. Every rule was checked against the 3,770 official items:
 * none of them is violated by any official item (tests/ai.test.ts, tests/bank.test.ts).
 * Throws AIValidationError naming the first broken rule.
 */
export function checkSatFormat(
  raw: { stimulus: string; stem: string; options?: string[]; keys?: string[] },
  spec: GenerateSpec,
  opts_: { allowFigure?: boolean } = {},
): void {
  const { stimulus, stem } = raw;
  const opts = raw.options ?? [];
  for (const o of opts) if (BANNED_OPTION.test(o.trim())) throw new AIValidationError(`Option "${o}" is not an SAT answer format.`);
  if (spec.section === 'rw') {
    if (spec.type !== 'mcq') throw new AIValidationError('Reading and Writing items are always multiple choice.');
    // table rows (pipe-separated) are data, not prose, and are not counted
    const prose = (t: string) => t.split('\n').filter((l) => !l.includes('|')).join(' ');
    const words = wordCount(prose(stimulus)) + wordCount(stem);
    if (!stimulus) throw new AIValidationError('Reading and Writing items need a passage, notes or table in "stimulus".');
    if (!opts_.allowFigure && (words < 20 || words > 230)) throw new AIValidationError(`Passage plus question is ${words} words; official items are 20-230.`);
    if (wordCount(stem) > 60) throw new AIValidationError('The question stem is too long for an SAT item.');
    if (!/\?\s*$/.test(stem)) throw new AIValidationError('The question stem must be a single question ending in "?".');
    for (const o of opts) if (wordCount(o) > 100) throw new AIValidationError('An answer choice is longer than any official choice.');
    const blankSkills = ['Words in Context', 'Transitions', 'Boundaries', 'Form, Structure, and Sense', 'Inferences'];
    if (blankSkills.includes(spec.skill) && !/_{3,}/.test(stimulus) && !/most nearly mean/i.test(stem)) {
      throw new AIValidationError(`${spec.skill} items need a blank (______) in the text.`);
    }
    if (/^Cross-[Tt]ext Connections$/.test(spec.skill) && !(/Text 1/.test(stimulus) && /Text 2/.test(stimulus))) throw new AIValidationError('Cross-Text Connections items need "Text 1" and "Text 2".');
  } else {
    const all = [stimulus, stem, ...opts].join(' ');
    const hit = all.match(MATH_OUT_OF_SCOPE);
    if (hit) throw new AIValidationError(`"${hit[0]}" is outside digital SAT math content.`);
    if (!opts_.allowFigure && /\b(figure|graph) (above|below|shown)\b|\bshown (above|below)\b/i.test(all) && !/\|/.test(all)) {
      throw new AIValidationError('The item refers to a figure the app cannot show.');
    }
    // prose length only (LaTeX stripped); the reviewer pass judges overall length against official items
    if (!opts_.allowFigure && wordCount([stimulus, stem].join(' ').replace(/\$[^$]*\$/g, ' ')) > 220) throw new AIValidationError('The question is longer than official SAT math items.');
    if (spec.type === 'spr') {
      if (!(raw.keys ?? []).some(fitsSprGrid)) throw new AIValidationError('The numeric answer does not fit the SAT answer grid (5 characters, 6 if negative).');
    }
  }
}

/** Validate the model's JSON and turn it into a Question. Throws AIValidationError on any problem. */
export function parseGeneratedQuestion(
  raw: unknown,
  spec: GenerateSpec,
  bank: Pick<QuestionIndexEntry, 'text'>[],
  id = `ai-${Date.now().toString(36)}`,
): GeneratedQuestion {
  if (!raw || typeof raw !== 'object') throw new AIValidationError('Generated question is not an object.');
  const o = raw as Record<string, unknown>;
  const stem = typeof o.stem === 'string' ? o.stem.trim() : '';
  const stimulus = typeof o.stimulus === 'string' ? o.stimulus.trim() : '';
  const explanation = typeof o.explanation === 'string' ? o.explanation.trim() : '';
  if (stem.length < 10) throw new AIValidationError('Generated question has no stem.');
  if (explanation.length < 20) throw new AIValidationError('Generated question has no usable explanation.');

  const q: GeneratedQuestion = {
    id, section: spec.section, domain: spec.domain, skill: spec.skill, difficulty: spec.difficulty, type: spec.type,
    source: 'ai', stimulus: stimulus ? itemTextToHtml(stimulus) : '', stem: itemTextToHtml(stem), rationale: textToHtml(explanation),
    explanationText: explanation, createdAt: Date.now(), text: '',
  };

  let opts: string[] = [];
  let keys: string[] = [];
  if (spec.type === 'mcq') {
    opts = Array.isArray(o.options) ? o.options.map((x) => (typeof x === 'string' ? x.trim().replace(/^[A-D][.)]\s+/, '') : '')) : [];
    if (opts.length !== 4 || opts.some((x) => !x)) throw new AIValidationError('Generated question must have exactly four non-empty options.');
    if (new Set(opts.map((x) => x.toLowerCase())).size !== 4) throw new AIValidationError('Generated options are not distinct.');
    let correct = typeof o.correct === 'string' ? o.correct.trim().toUpperCase() : '';
    if (correct.length > 1) {
      // model may have written the option text instead of the letter
      const idx = opts.findIndex((x) => x.toLowerCase() === correct.toLowerCase());
      correct = idx >= 0 ? 'ABCD'[idx] : correct[0];
    }
    if (!['A', 'B', 'C', 'D'].includes(correct)) throw new AIValidationError('Generated question does not name exactly one correct option.');
    q.options = opts.map((html, i) => ({ id: 'ABCD'[i], html: textToHtml(html) }));
    q.correct = [correct];
  } else {
    const keysRaw = Array.isArray(o.keys) ? o.keys : o.keys !== undefined ? [o.keys] : [];
    keys = keysRaw.map((k) => String(k).trim()).filter((k) => parseSpr(k) !== null);
    if (!keys.length) throw new AIValidationError('Generated question has no numeric answer key.');
    q.keys = keys;
  }

  checkSatFormat({ stimulus, stem, options: opts, keys }, spec);

  q.text = questionToText(q);
  const stemText = htmlToText(q.stimulus + ' ' + q.stem);
  for (const b of bank) {
    if (similarity(stemText, b.text) >= 0.6) throw new AIValidationError('Generated question duplicates a bank question.');
  }
  return q;
}

// ---------- independent review of a generated item ----------

export interface ItemVerdict {
  answer: string;
  singleAnswer: boolean;
  satPlausible: boolean;
  difficulty: Difficulty;
  issues: string[];
}

function questionWithoutKey(q: Question): string {
  return questionToText(q);
}

function keyOf(q: Question): string {
  return q.type === 'mcq' ? q.correct?.[0] ?? '?' : (q.keys ?? []).join(' or ');
}

export function buildVerifyPrompt(q: Question, spec: GenerateSpec): CompletionRequest {
  const anchors = (['E', 'M', 'H'] as Difficulty[])
    .filter((d) => spec.anchors?.[d])
    .map((d) => `--- Official ${DIFFICULTY_LABEL[d]} item (College Board rated) ---\n${questionToText(spec.anchors![d]!)}\nKey: ${keyOf(spec.anchors![d]!)}`)
    .join('\n\n');
  const system = `You are a College Board content reviewer for the digital SAT. You check a candidate practice item written by someone else. Work independently: solve it yourself before judging. Be strict: reject anything that would not plausibly appear on a real digital SAT ${SECTION_LABEL[spec.section]} section. Reply with ONLY a JSON object, no prose, no markdown fence.`;
  const user = `Skill: ${SECTION_LABEL[spec.section]} - ${spec.domain} - ${spec.skill}

College Board difficulty rubric for this section:
- ${DIFFICULTY_GUIDE[spec.section].E}
- ${DIFFICULTY_GUIDE[spec.section].M}
- ${DIFFICULTY_GUIDE[spec.section].H}
${anchors ? `\nCalibration anchors - official items of this skill with their official difficulty:\n\n${anchors}\n` : ''}
--- Candidate item ---
${questionWithoutKey(q)}

1. Solve the candidate item. ${q.type === 'mcq' ? 'Give the letter of the single best answer.' : 'Give the numeric answer.'}
2. Decide whether exactly one answer is defensible (false if two options could be argued, none is right, or the item is ambiguous).
3. Decide whether the item would plausibly appear on the digital SAT as written: official format and question stem for this skill, SAT content scope, realistic length, clean wording, no errors of fact or math.
4. Rate its difficulty on the College Board scale by comparing it with the anchors.

Output exactly: {"answer": "<letter or number>", "singleAnswer": true|false, "satPlausible": true|false, "difficulty": "E"|"M"|"H", "issues": ["<short problem>", ...]}`;
  return { system, messages: [{ role: 'user', content: user }], maxTokens: 2000 };
}

export function parseVerdict(text: string): ItemVerdict {
  const raw = extractJson(text);
  if (!raw || typeof raw !== 'object') throw new AIValidationError('Reviewer reply is not an object.');
  const o = raw as Record<string, unknown>;
  const difficulty = String(o.difficulty ?? '').trim().toUpperCase().charAt(0) as Difficulty;
  if (!['E', 'M', 'H'].includes(difficulty)) throw new AIValidationError('Reviewer reply has no difficulty rating.');
  return {
    answer: String(o.answer ?? '').trim(),
    singleAnswer: o.singleAnswer === true,
    satPlausible: o.satPlausible === true,
    difficulty,
    issues: Array.isArray(o.issues) ? o.issues.map((x) => String(x)).filter(Boolean).slice(0, 5) : [],
  };
}

/** Accept the item only if the reviewer agrees on the key, uniqueness, SAT plausibility and difficulty. */
export function judgeVerdict(q: Question, spec: GenerateSpec, v: ItemVerdict): void {
  const agrees = q.type === 'mcq'
    ? v.answer.toUpperCase().replace(/[^A-D]/g, '').charAt(0) === q.correct?.[0]
    : checkSpr(v.answer, q.keys ?? []);
  if (!agrees) throw new AIValidationError(`An independent check got ${v.answer || 'no answer'}, not the key ${keyOf(q)}.`);
  if (!v.singleAnswer) throw new AIValidationError(`The item does not have exactly one defensible answer${v.issues[0] ? ` (${v.issues[0]})` : ''}.`);
  if (!v.satPlausible) throw new AIValidationError(`The item would not appear on the SAT as written${v.issues[0] ? ` (${v.issues[0]})` : ''}.`);
  if (v.difficulty !== spec.difficulty) {
    throw new AIValidationError(`It rated ${DIFFICULTY_LABEL[v.difficulty]} against official items, not ${DIFFICULTY_LABEL[spec.difficulty]}.`);
  }
}

export async function generateQuestion(
  spec: GenerateSpec,
  bank: Pick<QuestionIndexEntry, 'text'>[],
  completer: Completer,
  attempts = 4,
): Promise<GeneratedQuestion> {
  let lastErr: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const text = await completer(buildGeneratePrompt(spec, lastErr?.message));
      const q = parseGeneratedQuestion(extractJson(text), spec, bank);
      judgeVerdict(q, spec, parseVerdict(await completer(buildVerifyPrompt(q, spec))));
      return q;
    } catch (err) {
      if (err instanceof AIValidationError) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw new AIValidationError(`Could not generate an item that passed the SAT format and difficulty checks. Last problem: ${lastErr?.message ?? 'unknown'}`);
}

// ---------- solver ----------

export interface SolutionStep {
  text: string;
  /** optional display-math LaTeX for the step (no $ delimiters) */
  math?: string;
}
export interface Solution {
  keyConcept: string;
  steps: SolutionStep[];
  answer: { label: string; reason: string };
  trap?: string;
}

export function buildSolvePrompt(q: Question): CompletionRequest {
  const answer = q.type === 'mcq' ? `Correct option: ${q.correct?.[0]}` : `Accepted answers: ${(q.keys ?? []).join(' or ')}`;
  const system = `You are an expert SAT tutor writing a concise, scannable solution for a student. No greetings, no filler, no praise. Inline math uses LaTeX inside $...$; the optional "math" field of a step holds one display equation in LaTeX WITHOUT delimiters. Reply with ONLY a JSON object of this exact shape:
{"keyConcept": "<the single idea the question tests, 1-2 short sentences>",
 "steps": [{"text": "<one short sentence>", "math": "<optional LaTeX equation>"}, ...],  // 2-6 steps
 "answer": {"label": "<the correct choice letter, or the numeric answer>", "reason": "<one line>"},
 "trap": "<optional: why the most tempting wrong choice is wrong, one sentence, or omit>"}`;
  const user = `${SECTION_LABEL[q.section]} - ${q.domain} - ${q.skill} (${DIFFICULTY_LABEL[q.difficulty]})

${questionToText(q)}

${answer}

Produce the JSON solution.`;
  return { system, messages: [{ role: 'user', content: user }], maxTokens: 2000 };
}

/** Validate a solver reply. Returns null when the JSON is missing or malformed (caller falls back to text). */
export function parseSolution(text: string): Solution | null {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const keyConcept = str(o.keyConcept);
  const stepsRaw = Array.isArray(o.steps) ? o.steps : [];
  const steps: SolutionStep[] = stepsRaw
    .map((s) => (typeof s === 'string' ? { text: s.trim() } : s && typeof s === 'object' ? { text: str((s as Record<string, unknown>).text), math: str((s as Record<string, unknown>).math) || undefined } : { text: '' }))
    .filter((s) => s.text)
    .slice(0, 8);
  const ans = (o.answer && typeof o.answer === 'object' ? o.answer : {}) as Record<string, unknown>;
  const answer = { label: str(ans.label) || str(o.answer), reason: str(ans.reason) };
  if (!keyConcept || steps.length < 1 || !answer.label) return null;
  const trap = str(o.trap) || undefined;
  return { keyConcept, steps, answer, trap };
}

/** Small markdown subset -> HTML (bold, italic, headings, lists, paragraphs); keeps $…$ for KaTeX. */
export function mdToHtml(md: string): string {
  const esc = escapeHtml(md.replace(/\r\n/g, '\n').trim());
  const inline = (s: string) =>
    s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*\w$])\*(?!\s)([^*$]+?)\*(?!\w)/g, '$1<em>$2</em>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const blocks = esc.split(/\n{2,}/);
  const out: string[] = [];
  for (const b of blocks) {
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*(\d+[.)]|[-*•])\s+/.test(l))) {
      const ordered = /^\s*\d+[.)]/.test(lines[0]);
      out.push(`<${ordered ? 'ol' : 'ul'}>${lines.map((l) => `<li>${inline(l.replace(/^\s*(\d+[.)]|[-*•])\s+/, ''))}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
    } else if (/^#{1,6}\s/.test(lines[0]) && lines.length === 1) {
      out.push(`<h4>${inline(lines[0].replace(/^#{1,6}\s+/, ''))}</h4>`);
    } else {
      out.push(`<p>${lines.map(inline).join('<br>')}</p>`);
    }
  }
  return out.join('');
}

// ---------- chatbot ----------

export interface ChatContext {
  question?: Question | null;
  userAnswer?: string | null;
  answered?: boolean;
  progressSummary?: string;
}

export function buildChatSystem(ctx: ChatContext): string {
  const parts = [
    `You are a friendly SAT tutor inside a practice app. Explain concepts clearly and briefly (under 200 words unless asked for more). Use LaTeX in $...$ for math. Ask one guiding question when the student seems stuck.`,
    `RULES: Do not reveal the correct answer to the current question unless the student explicitly asks for the answer or has already answered it. Give hints and explain the underlying concept instead. Never claim a different answer than the official key.`,
  ];
  if (ctx.question) {
    const q = ctx.question;
    const key = q.type === 'mcq' ? `Official correct option: ${q.correct?.[0]}` : `Official accepted answers: ${(q.keys ?? []).join(' or ')}`;
    parts.push(`CURRENT QUESTION (${SECTION_LABEL[q.section]} - ${q.domain} - ${q.skill}, ${DIFFICULTY_LABEL[q.difficulty]}${q.source === 'ai' ? ', AI-generated' : ''}):\n${questionToText(q)}\n\n[Hidden key for you only] ${key}`);
    if (ctx.answered) parts.push(`The student has already answered this question (their answer: ${ctx.userAnswer ?? 'none'}). You may discuss the answer openly now.`);
    else if (ctx.userAnswer) parts.push(`The student currently has "${ctx.userAnswer}" selected but has not submitted yet.`);
  }
  if (ctx.progressSummary) parts.push(`STUDENT PROGRESS:\n${ctx.progressSummary}`);
  return parts.join('\n\n');
}

// ---------- session review ----------

export function progressSummary(answers: AnswerRecord[]): string {
  if (!answers.length) return 'No questions answered yet.';
  const total = answers.length;
  const correct = answers.filter((a) => a.correct).length;
  const stats = skillStats(answers).slice(0, 12);
  const lines = stats.map((s) => `- ${s.skill}: ${s.correct}/${s.attempts} (${Math.round(s.accuracy * 100)}%), avg ${Math.round(s.avgTimeMs / 1000)}s`);
  return `Overall: ${correct}/${total} correct (${Math.round((100 * correct) / total)}%).\nBy skill:\n${lines.join('\n')}`;
}

export function buildReviewPrompt(answers: AnswerRecord[], questions: Record<string, Question | undefined>): CompletionRequest {
  const rows = answers.map((a, i) => {
    const q = questions[a.questionId];
    const correctAns = q ? (q.type === 'mcq' ? q.correct?.[0] : (q.keys ?? []).join('/')) : '?';
    return `${i + 1}. [${a.section}/${a.skill}/${DIFFICULTY_LABEL[a.difficulty]}] ${a.correct ? 'CORRECT' : 'WRONG'} answered=${a.answer ?? 'skipped'} key=${correctAns} time=${Math.round(a.timeMs / 1000)}s${a.marked ? ' marked' : ''}\n   ${q ? htmlToText(q.stem).slice(0, 220) : ''}`;
  });
  const system = `You are an SAT coach analyzing one practice session. Be specific and encouraging. Reply with ONLY a JSON object:
{"summary": "<2-3 sentences>", "weakTopics": [{"skill": "<skill name exactly as given>", "accuracy": <0-1>, "note": "<what to work on>"}], "mistakePatterns": ["<pattern>", ...], "pacing": "<observations about time per question>", "nextSession": {"section": "math"|"rw", "skills": ["<skill>", ...], "difficulty": "E"|"M"|"H"|"mixed", "count": <5-20>, "reason": "<why>"}}`;
  const user = `Session results (${answers.length} questions):\n${rows.join('\n')}\n\n${progressSummary(answers)}\n\nAnalyze weak topics, common mistake patterns, pacing (time per question), and recommend the next session.`;
  return { system, messages: [{ role: 'user', content: user }], maxTokens: 3000 };
}

export function parseReview(raw: unknown): AIReview {
  if (!raw || typeof raw !== 'object') throw new AIValidationError('Review is not an object.');
  const o = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const summary = str(o.summary);
  if (!summary) throw new AIValidationError('Review has no summary.');
  const weakTopics = Array.isArray(o.weakTopics)
    ? o.weakTopics.filter((w) => w && typeof w === 'object').map((w) => {
        const x = w as Record<string, unknown>;
        return { skill: str(x.skill), accuracy: Math.max(0, Math.min(1, Number(x.accuracy) || 0)), note: str(x.note) };
      }).filter((w) => w.skill)
    : [];
  const mistakePatterns = Array.isArray(o.mistakePatterns) ? o.mistakePatterns.map(str).filter(Boolean) : [];
  const ns = (o.nextSession && typeof o.nextSession === 'object' ? o.nextSession : {}) as Record<string, unknown>;
  const section: Section = ns.section === 'rw' ? 'rw' : 'math';
  const diff = ['E', 'M', 'H', 'mixed'].includes(ns.difficulty as string) ? (ns.difficulty as Difficulty | 'mixed') : 'mixed';
  const count = Math.max(5, Math.min(20, Math.round(Number(ns.count)) || 10));
  return {
    summary, weakTopics, mistakePatterns, pacing: str(o.pacing),
    nextSession: { section, skills: Array.isArray(ns.skills) ? ns.skills.map(str).filter(Boolean) : [], difficulty: diff, count, reason: str(ns.reason) },
    generatedAt: Date.now(),
  };
}

export async function reviewSession(
  answers: AnswerRecord[],
  questions: Record<string, Question | undefined>,
  completer: Completer,
): Promise<AIReview> {
  const text = await completer(buildReviewPrompt(answers, questions));
  return parseReview(extractJson(text));
}
