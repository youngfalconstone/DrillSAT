import { describe, it, expect } from 'vitest';
import {
  AIValidationError, buildChatSystem, buildGeneratePrompt, extractJson, generateQuestion, htmlToText,
  parseGeneratedQuestion, parseReview, reviewSession, questionToText, type GenerateSpec,
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
  it('retries once on invalid output then succeeds', async () => {
    let calls = 0;
    const completer = async () => {
      calls++;
      if (calls === 1) return 'not json';
      return JSON.stringify({ stem: 'A store sells pens for $2 each. How much do 9 pens cost, in dollars?', options: ['11', '16', '18', '20'], correct: 'C', explanation: 'Multiply 2 by 9 to get 18 dollars total.' });
    };
    const q = await generateQuestion(spec, bank, completer);
    expect(calls).toBe(2);
    expect(q.correct).toEqual(['C']);
  });
  it('gives up after the retry budget', async () => {
    await expect(generateQuestion(spec, bank, async () => '{}')).rejects.toThrow(AIValidationError);
  });
  it('sends examples and the skill in the prompt', () => {
    const req = buildGeneratePrompt(spec);
    expect(req.messages[0].content).toContain('Linear functions');
    expect(req.messages[0].content).toContain('Example 1');
    expect(req.system).toContain('JSON');
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
