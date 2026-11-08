import { describe, it, expect } from 'vitest';
import { checkAnswer, checkSpr, parseSpr } from '@shared/answerCheck';
import type { Question } from '@shared/types';

const mcq: Question = {
  id: 'x', section: 'math', domain: 'Algebra', skill: 'Linear functions', difficulty: 'E', type: 'mcq', source: 'official',
  stimulus: '', stem: '<p>q</p>', options: [{ id: 'A', html: '1' }, { id: 'B', html: '2' }, { id: 'C', html: '3' }, { id: 'D', html: '4' }],
  correct: ['C'], rationale: 'r',
};

describe('parseSpr', () => {
  it('parses integers, decimals, fractions, negatives', () => {
    expect(parseSpr('403')).toBe(403);
    expect(parseSpr('.5')).toBe(0.5);
    expect(parseSpr('0.5')).toBe(0.5);
    expect(parseSpr('3/2')).toBe(1.5);
    expect(parseSpr('-3/4')).toBe(-0.75);
    expect(parseSpr('1,100')).toBe(1100);
    expect(parseSpr(' 12 ')).toBe(12);
  });
  it('rejects garbage', () => {
    expect(parseSpr('')).toBeNull();
    expect(parseSpr('abc')).toBeNull();
    expect(parseSpr('1/0')).toBeNull();
    expect(parseSpr('1 1/2')).toBeNull();
    expect(parseSpr('2..3')).toBeNull();
  });
});

describe('checkSpr (SAT grid-in rules)', () => {
  it('accepts exact keys and equivalent forms', () => {
    const keys = ['.1764', '.1765', '3/17'];
    expect(checkSpr('3/17', keys)).toBe(true);
    expect(checkSpr('.1764', keys)).toBe(true);
    expect(checkSpr('0.1765', keys)).toBe(true);
    expect(checkSpr('6/34', keys)).toBe(true);
    expect(checkSpr('.176', keys)).toBe(true); // truncated to 3 decimals
    expect(checkSpr('.18', keys)).toBe(false); // too few decimals
    expect(checkSpr('.1766', keys)).toBe(false);
    expect(checkSpr('17/3', keys)).toBe(false);
  });
  it('handles integers and negatives', () => {
    expect(checkSpr('403', ['403'])).toBe(true);
    expect(checkSpr('403.0', ['403'])).toBe(true);
    expect(checkSpr('-5', ['-5'])).toBe(true);
    expect(checkSpr('5', ['-5'])).toBe(false);
    expect(checkSpr('', ['5'])).toBe(false);
  });
  it('accepts any of several keys', () => {
    expect(checkSpr('15/4', ['10/3', '15/4', '25/6'])).toBe(true);
    expect(checkSpr('3.75', ['10/3', '15/4', '25/6'])).toBe(true);
    expect(checkSpr('4.1666', ['10/3', '15/4', '25/6'])).toBe(true);
    expect(checkSpr('4.1667', ['10/3', '15/4', '25/6'])).toBe(true);
    expect(checkSpr('4.2', ['10/3', '15/4', '25/6'])).toBe(false);
  });
});

describe('checkAnswer', () => {
  it('checks multiple choice case-insensitively', () => {
    expect(checkAnswer(mcq, 'C')).toBe(true);
    expect(checkAnswer(mcq, 'c')).toBe(true);
    expect(checkAnswer(mcq, 'A')).toBe(false);
    expect(checkAnswer(mcq, null)).toBe(false);
  });
  it('checks spr', () => {
    const spr: Question = { ...mcq, type: 'spr', options: undefined, correct: undefined, keys: ['1/2'] };
    expect(checkAnswer(spr, '0.5')).toBe(true);
    expect(checkAnswer(spr, '.5')).toBe(true);
    expect(checkAnswer(spr, '2/4')).toBe(true);
    expect(checkAnswer(spr, '0.51')).toBe(false);
  });
});
