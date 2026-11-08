import { describe, it, expect } from 'vitest';
import { bandOrder, currentAbility, targetBand } from '@shared/score';

describe('adaptive band targeting', () => {
  it('starts in Medium and climbs to the top band for a strong student', () => {
    expect([4, 5]).toContain(targetBand('math', 550));
    expect(targetBand('math', 650)).toBeGreaterThanOrEqual(6);
    expect(targetBand('math', 760)).toBe(7);
    expect(targetBand('rw', 330)).toBeLessThanOrEqual(2);
  });
  it('ability moves after every answer: five right answers in Medium reach Hard', () => {
    const bandOf = () => ({ band: 5, type: 'mcq' as const });
    const answers = Array.from({ length: 5 }, (_, i) => ({ questionId: 'q' + i, section: 'math' as const, correct: true, at: i }));
    const a0 = currentAbility('math', [], bandOf);
    const a5 = currentAbility('math', answers, bandOf);
    expect(Math.abs(a0 - 550)).toBeLessThan(20); // prior mean (the 200-800 grid truncates the upper tail slightly)
    expect([4, 5]).toContain(targetBand('math', a0));
    expect(a5).toBeGreaterThan(a0 + 40);
    expect(targetBand('math', a5)).toBeGreaterThanOrEqual(6);
  });
  it('tries the nearest bands first', () => {
    expect(bandOrder(6)).toEqual([6, 7, 5, 4, 3, 2, 1]);
    expect(bandOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
