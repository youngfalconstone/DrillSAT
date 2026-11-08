import { describe, it, expect } from 'vitest';
import {
  AIValidationError, DIFFICULTY_GUIDE, SKILL_FORMAT, buildChatSystem, buildGeneratePrompt, buildVerifyPrompt, extractJson, fitsSprGrid,
  generateQuestion, htmlToText, itemTextToHtml, judgeVerdict, parseGeneratedQuestion, parseReview, reviewSession, questionToText, type GenerateSpec,
} from '@shared/ai';
import type { AnswerRecord, Question } from '@shared/types';

const example: Question = {
  id: 'abcd1234', section: 'math', domain: 'Algebra', skill: 'Linear functions', difficulty: 'M', type: 'mcq', source: 'official',
  stimulus: '', stem: '<p>If <math alttext="f left parenthesis x right parenthesis equals 2 x plus 1"><mi>f</mi></math>, what is f(3)?</p>',
  options: [{ id: 'A', html: '<p>5</p>' }, { id: 'B', html: '<p>7</p>' }, { id: 'C', html: '<p>9</p>' }, { id: 'D', html: '<p>11</p>' }],
  correct: ['B'], rationale: '<p>Choice B is correct.</p>',
};
const spec: GenerateSpec = { section: 'math', domain: 'Algebra', skill: 'Linear functions', difficulty: 'M', type: 'mcq', examples: [example] };
const bank = [{ text: htmlToText(example.stem) }];

describe('htmlToText / questionToText', () => {
  it('replaces MathML with alttext and strips tags', () => {
    expect(htmlToText(example.stem)).toBe('If f left parenthesis x right parenthesis equals 2 x plus 1 , what is f(3)?');
    expect(questionToText(example)).toContain('B. 7');
  });
});

describe('extractJson', () => {
  it('handles fences and prose', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":{"b":2}} done')).toEqual({ a: { b: 2 } });
    expect(() => extractJson('no json here')).toThrow(AIValidationError);
  });
});

describe('parseGeneratedQuestion', () => {
  const good = {
    stimulus: '', stem: 'A taxi charges $3 plus $2 per mile. What is the cost, in dollars, of a 7-mile ride?',
    options: ['10', '14', '17', '21'], correct: 'C', explanation: 'Cost = 3 + 2(7) = 17. The other options add or multiply incorrectly.',
  };
  it('accepts a well-formed mcq', () => {
    const q = parseGeneratedQuestion(good, spec, bank, 'ai-1');
    expect(q.source).toBe('ai');
    expect(q.options?.length).toBe(4);
    expect(q.correct).toEqual(['C']);
    expect(q.stem).toContain('taxi');
    expect(q.rationale.length).toBeGreaterThan(0);
  });
  it('maps option text given as "correct" back to a letter', () => {
    const q = parseGeneratedQuestion({ ...good, correct: '17' }, spec, bank);
    expect(q.correct).toEqual(['C']);
  });
  it('rejects missing/duplicate options and bad correct letters', () => {
    expect(() => parseGeneratedQuestion({ ...good, options: ['1', '2', '3'] }, spec, bank)).toThrow(AIValidationError);
    expect(() => parseGeneratedQuestion({ ...good, options: ['1', '1', '2', '3'] }, spec, bank)).toThrow(/distinct/);
    expect(() => parseGeneratedQuestion({ ...good, correct: 'E' }, spec, bank)).toThrow(/correct option/);
    expect(() => parseGeneratedQuestion({ ...good, explanation: 'ok' }, spec, bank)).toThrow(/explanation/);
  });
  it('rejects near-duplicates of bank questions', () => {
    const dup = { ...good, stem: 'If f left parenthesis x right parenthesis equals 2 x plus 1 , what is f(3)?' };
    expect(() => parseGeneratedQuestion(dup, spec, bank)).toThrow(/duplicates/);
  });
  it('validates spr keys', () => {
    const sprSpec: GenerateSpec = { ...spec, type: 'spr' };
    const q = parseGeneratedQuestion({ stem: 'What is 3/4 as a decimal rounded to two places?', keys: ['.75', '3/4'], explanation: 'Divide 3 by 4 to get 0.75 exactly.' }, sprSpec, bank);
    expect(q.keys).toEqual(['.75', '3/4']);
    expect(() => parseGeneratedQuestion({ stem: 'What is the value of x in the equation?', keys: ['x = 2'], explanation: 'Solve the equation to find the value of x.' }, sprSpec, bank)).toThrow(/numeric/);
  });
});

describe('generateQuestion with a mocked completer', () => {
  const item = { stem: 'A store sells pens for $2 each. How much do 9 pens cost, in dollars?', options: ['11', '16', '18', '20'], correct: 'C', explanation: 'Multiply 2 by 9 to get 18 dollars total.' };
  const verdict = (o: Record<string, unknown> = {}) => JSON.stringify({ answer: 'C', singleAnswer: true, satPlausible: true, difficulty: 'M', issues: [], ...o });
  const isReview = (req: { system: string }) => req.system.includes('content reviewer');

  it('retries on invalid output then succeeds after an independent review', async () => {
    let gen = 0, rev = 0;
    const q = await generateQuestion(spec, bank, async (req) => {
      if (isReview(req)) { rev++; return verdict(); }
      gen++;
      return gen === 1 ? 'not json' : JSON.stringify(item);
    });
    expect([gen, rev]).toEqual([2, 1]);
    expect(q.correct).toEqual(['C']);
  });
  it('rejects items the reviewer rates at another difficulty, and feeds the reason back', async () => {
    const prompts: string[] = [];
    let rev = 0;
    const q = await generateQuestion(spec, bank, async (req) => {
      if (isReview(req)) return verdict({ difficulty: rev++ === 0 ? 'E' : 'M' });
      prompts.push(req.messages[0].content);
      return JSON.stringify(item);
    });
    expect(q.difficulty).toBe('M');
    expect(prompts.length).toBe(2);
    expect(prompts[1]).toContain('rated Easy');
  });
  it('rejects items whose key the reviewer does not reproduce, or that are not SAT-plausible', async () => {
    await expect(generateQuestion(spec, bank, async (req) => (isReview(req) ? verdict({ answer: 'B' }) : JSON.stringify(item)), 2)).rejects.toThrow(/independent check got B/);
    await expect(generateQuestion(spec, bank, async (req) => (isReview(req) ? verdict({ satPlausible: false, issues: ['not SAT style'] }) : JSON.stringify(item)), 2)).rejects.toThrow(/not appear on the SAT/);
    await expect(generateQuestion(spec, bank, async (req) => (isReview(req) ? verdict({ singleAnswer: false }) : JSON.stringify(item)), 2)).rejects.toThrow(/exactly one/);
  });
  it('gives up after the retry budget', async () => {
    await expect(generateQuestion(spec, bank, async () => '{}')).rejects.toThrow(AIValidationError);
  });
  it('sends examples, the skill format and the difficulty rubric in the prompt', () => {
    const req = buildGeneratePrompt(spec);
    expect(req.messages[0].content).toContain('Linear functions');
    expect(req.messages[0].content).toContain('Official example 1');
    expect(req.messages[0].content).toContain(DIFFICULTY_GUIDE.math.M);
    expect(req.messages[0].content).toContain(SKILL_FORMAT['Linear functions']);
    expect(req.system).toContain('JSON');
  });
  it('gives the reviewer official anchors at each difficulty and never the candidate key', () => {
    const q = parseGeneratedQuestion(item, spec, bank);
    const req = buildVerifyPrompt(q, { ...spec, anchors: { E: example, H: { ...example, difficulty: 'H' } } });
    const content = req.messages[0].content;
    expect(content).toContain('Official Easy item');
    expect(content).toContain('Official Hard item');
    expect(content.slice(content.indexOf('--- Candidate item ---'))).not.toContain('Key:');
  });
  it('checks a grid-in key numerically against the reviewer', () => {
    const sprSpec: GenerateSpec = { ...spec, type: 'spr' };
    const q = parseGeneratedQuestion({ stem: 'What is 3/4 as a decimal rounded to two places?', keys: ['3/4'], explanation: 'Divide 3 by 4 to get 0.75 exactly.' }, sprSpec, bank);
    expect(() => judgeVerdict(q, sprSpec, { answer: '0.75', singleAnswer: true, satPlausible: true, difficulty: 'M', issues: [] })).not.toThrow();
    expect(() => judgeVerdict(q, sprSpec, { answer: '0.7', singleAnswer: true, satPlausible: true, difficulty: 'M', issues: [] })).toThrow();
  });
});

describe('SAT format rules', () => {
  const rw: GenerateSpec = { section: 'rw', domain: 'Craft and Structure', skill: 'Words in Context', difficulty: 'M', type: 'mcq', examples: [] };
  const passage = 'In her 2019 study of desert ants, biologist Ana Ruiz found that the insects ______ their way home by counting steps, a strategy that remained reliable even when researchers lengthened the legs of the ants.';
  const stem = 'Which choice completes the text with the most logical and precise word or phrase?';
  const ok = { stimulus: passage, stem, options: ['found', 'lost', 'ignored', 'painted'], correct: 'A', explanation: 'Found fits: the ants navigate home by counting steps.' };
  it('accepts an official-format R&W item', () => {
    expect(parseGeneratedQuestion(ok, rw, []).stimulus).toContain('______');
  });
  it('rejects R&W items without a passage, without a blank, too long, with banned options or no question', () => {
    expect(() => parseGeneratedQuestion({ ...ok, stimulus: '' }, rw, [])).toThrow(/passage/);
    expect(() => parseGeneratedQuestion({ ...ok, stimulus: passage.replace('______', 'find') }, rw, [])).toThrow(/blank/);
    expect(() => parseGeneratedQuestion({ ...ok, stimulus: passage.repeat(8) }, rw, [])).toThrow(/words/);
    expect(() => parseGeneratedQuestion({ ...ok, options: ['found', 'lost', 'ignored', 'All of the above'] }, rw, [])).toThrow(/not an SAT answer format/);
    expect(() => parseGeneratedQuestion({ ...ok, stem: 'Complete the text with the best word.' }, rw, [])).toThrow(/ending in/);
  });
  it('rejects math outside SAT scope', () => {
    expect(() => parseGeneratedQuestion({ stimulus: '', stem: 'What is the derivative of $x^2$ at $x = 3$?', options: ['3', '6', '9', '12'], correct: 'B', explanation: 'The derivative of x^2 is 2x, which is 6 at 3.' }, spec, bank)).toThrow(/outside digital SAT/);
    expect(() => parseGeneratedQuestion({ stimulus: '', stem: 'What is the value of $\\log_2 8$ in this case?', options: ['1', '2', '3', '4'], correct: 'C', explanation: 'Two cubed is eight, so the log is three.' }, spec, bank)).toThrow(/outside digital SAT/);
  });
  it('requires grid-in answers that fit the SAT grid', () => {
    expect(fitsSprGrid('3/4')).toBe(true);
    expect(fitsSprGrid('-1.25')).toBe(true);
    expect(fitsSprGrid('12.345')).toBe(false);
    expect(fitsSprGrid('-12.345')).toBe(false);
    expect(fitsSprGrid('x=2')).toBe(false);
    expect(() => parseGeneratedQuestion({ stem: 'What is the value of $2/3$ as a decimal?', keys: ['0.666667'], explanation: 'Two thirds is about 0.666667 as a decimal.' }, { ...spec, type: 'spr' }, bank)).toThrow(/grid/);
  });
  it('renders notes as a list, pipe rows as a table and Text 1/Text 2 labels', () => {
    expect(itemTextToHtml('While researching a topic, a student has taken the following notes:\n- one\n- two')).toContain('<ul><li>one</li><li>two</li></ul>');
    const t = itemTextToHtml('Bird counts\nYear | Count\n2020 | 14\n2021 | 19');
    expect(t).toContain('<caption>Bird counts</caption>');
    expect(t).toContain('<td>19</td>');
    expect(itemTextToHtml('Text 1\nA claim.\n\nText 2\nA reply.')).toContain('<span class="paired_passage">Text 2</span>');
  });
});

describe('chat system prompt', () => {
  it('includes the question and hides the answer until answered', () => {
    const s = buildChatSystem({ question: example, answered: false });
    expect(s).toContain('Do not reveal');
    expect(s).toContain('Hidden key');
    const s2 = buildChatSystem({ question: example, answered: true, userAnswer: 'A' });
    expect(s2).toContain('already answered');
  });
});

describe('session review', () => {
  const answers: AnswerRecord[] = [
    { questionId: 'abcd1234', section: 'math', domain: 'Algebra', skill: 'Linear functions', difficulty: 'M', type: 'mcq', source: 'official', answer: 'A', correct: false, timeMs: 90000, marked: false, at: 1 },
    { questionId: 'abcd1234', section: 'math', domain: 'Algebra', skill: 'Linear functions', difficulty: 'M', type: 'mcq', source: 'official', answer: 'B', correct: true, timeMs: 30000, marked: true, at: 2 },
  ];
  it('parses a valid review and clamps values', () => {
    const r = parseReview({ summary: 'Good work.', weakTopics: [{ skill: 'Linear functions', accuracy: 1.7, note: 'x' }], mistakePatterns: ['rushing'], pacing: 'slow', nextSession: { section: 'math', skills: ['Linear functions'], difficulty: 'H', count: 99 } });
    expect(r.weakTopics[0].accuracy).toBe(1);
    expect(r.nextSession.count).toBe(20);
    expect(r.nextSession.difficulty).toBe('H');
  });
  it('rejects a review without summary', () => {
    expect(() => parseReview({})).toThrow(AIValidationError);
  });
  it('reviewSession end-to-end with a mock', async () => {
    const r = await reviewSession(answers, { abcd1234: example }, async (req) => {
      expect(req.messages[0].content).toContain('WRONG');
      return '{"summary":"ok","weakTopics":[],"mistakePatterns":[],"pacing":"fine","nextSession":{"section":"rw","skills":[],"difficulty":"mixed","count":10,"reason":"balance"}}';
    });
    expect(r.nextSession.section).toBe('rw');
  });
});

describe('solver output', () => {
  it('parses a structured solution', async () => {
    const { parseSolution, buildSolvePrompt } = await import('@shared/ai');
    const s = parseSolution('```json\n{"keyConcept":"Set f(n) equal to 56.","steps":[{"text":"Set up $7n^3=56$.","math":"7n^3 = 56"},{"text":"Divide by 7."}],"answer":{"label":"A","reason":"n = 2"},"trap":"8 is $n^3$, not $n$."}\n```');
    expect(s?.steps.length).toBe(2);
    expect(s?.steps[0].math).toBe('7n^3 = 56');
    expect(s?.answer.label).toBe('A');
    expect(s?.trap).toContain('not');
    expect(buildSolvePrompt(example).system).toContain('JSON');
  });
  it('returns null for malformed output so the UI can fall back', async () => {
    const { parseSolution } = await import('@shared/ai');
    expect(parseSolution('Great question! First, ...')).toBeNull();
    expect(parseSolution('{"keyConcept":"x"}')).toBeNull();
    expect(parseSolution('{"keyConcept":"x","steps":[],"answer":{"label":"B"}}')).toBeNull();
  });
  it('renders the markdown subset without leaking asterisks', async () => {
    const { mdToHtml } = await import('@shared/ai');
    const html = mdToHtml('**Key concept:** use $a^2$.\n\n1. **Step one.** Do $x$.\n2. Step two.\n\n- a\n- b');
    expect(html).toContain('<strong>Key concept:</strong>');
    expect(html).toContain('<ol><li><strong>Step one.</strong> Do $x$.</li><li>Step two.</li></ol>');
    expect(html).toContain('<ul><li>a</li><li>b</li></ul>');
    expect(html).not.toContain('**');
    expect(mdToHtml('<script>')).toBe('<p>&lt;script&gt;</p>');
  });
});
