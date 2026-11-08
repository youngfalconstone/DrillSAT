/**
 * AI feature logic: prompt construction, response parsing and validation.
 * Pure functions - the actual LLM call is injected (`Completer`) so this is unit-testable with mocks.
 */
import type { AIReview, AnswerRecord, ChatMessage, Difficulty, Question, QuestionIndexEntry, Section } from './types';
import { DIFFICULTY_LABEL, SECTION_LABEL } from './types';
import { parseSpr } from './answerCheck';
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

export interface GenerateSpec {
  section: Section;
  domain: string;
  skill: string;
  difficulty: Difficulty;
  type: 'mcq' | 'spr';
  examples: Question[];
}

export function buildGeneratePrompt(spec: GenerateSpec): CompletionRequest {
  const ex = spec.examples
    .slice(0, 3)
    .map((q, i) => `--- Example ${i + 1} (${DIFFICULTY_LABEL[q.difficulty]}) ---\n${questionToText(q)}`)
    .join('\n\n');
  const fmt = spec.type === 'mcq'
    ? `{"stimulus": "<passage/table text or empty string>", "stem": "<question>", "options": ["<A>", "<B>", "<C>", "<D>"], "correct": "<A|B|C|D>", "explanation": "<why the correct answer is right and each other option is wrong>"}`
    : `{"stimulus": "", "stem": "<question>", "keys": ["<numeric answer as a number string, e.g. 12 or 3/4 or .75>"], "explanation": "<step-by-step solution>"}`;
  const system = `You write original, high-quality digital SAT practice questions that are indistinguishable in style, length, and rigor from official College Board questions. Match the section, domain, skill and difficulty exactly. Never copy or lightly paraphrase the examples - write a new scenario. Write math with LaTeX inside $...$ (inline) delimiters; do not use MathML or Unicode superscripts. The question must have exactly one defensible correct answer. Reply with ONLY a JSON object, no prose, no markdown fence.`;
  const user = `Section: ${SECTION_LABEL[spec.section]}
Domain: ${spec.domain}
Skill: ${spec.skill}
Difficulty: ${DIFFICULTY_LABEL[spec.difficulty]}
Format: ${spec.type === 'mcq' ? 'multiple choice with four options' : 'student-produced response (numeric answer)'}

Style examples from the official bank (do NOT reuse their scenarios or numbers):

${ex}

Now write ONE new question of the same kind. Output exactly this JSON shape:
${fmt}`;
  return { system, messages: [{ role: 'user', content: user }], maxTokens: 4000 };
}

export interface GeneratedQuestion extends Question {
  explanationText: string;
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
    source: 'ai', stimulus: stimulus ? textToHtml(stimulus) : '', stem: textToHtml(stem), rationale: textToHtml(explanation),
    explanationText: explanation, createdAt: Date.now(), text: '',
  };

  if (spec.type === 'mcq') {
    const opts = Array.isArray(o.options) ? o.options.map((x) => (typeof x === 'string' ? x.trim() : '')) : [];
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
    const keys = keysRaw.map((k) => String(k).trim()).filter((k) => parseSpr(k) !== null);
    if (!keys.length) throw new AIValidationError('Generated question has no numeric answer key.');
    q.keys = keys;
  }

  q.text = questionToText(q);
  const stemText = htmlToText(q.stimulus + ' ' + q.stem);
  for (const b of bank) {
    if (similarity(stemText, b.text) >= 0.6) throw new AIValidationError('Generated question duplicates a bank question.');
  }
  return q;
}

export async function generateQuestion(
  spec: GenerateSpec,
  bank: Pick<QuestionIndexEntry, 'text'>[],
  completer: Completer,
  attempts = 2,
): Promise<GeneratedQuestion> {
  let lastErr: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    const text = await completer(buildGeneratePrompt(spec));
    try {
      return parseGeneratedQuestion(extractJson(text), spec, bank);
    } catch (err) {
      if (err instanceof AIValidationError) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new AIValidationError('Could not generate a valid question.');
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
