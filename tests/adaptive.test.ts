import { describe, it, expect } from 'vitest';
import { nextDifficulty, computeLevels, updateStreak, liveStreak, skillStats } from '@shared/adaptive';
import type { AnswerRecord } from '@shared/types';

function ans(correct: boolean, skill = 'Linear functions', i = 0): AnswerRecord {
  return {
    questionId: 'q' + i, section: 'math', domain: 'Algebra', skill, difficulty: 'M', type: 'mcq', source: 'official',
    answer: 'A', correct, timeMs: 1000, marked: false, at: 1700000000000 + i * 1000,
  };
}

describe('nextDifficulty', () => {
  it('holds with too few answers', () => {
    expect(nextDifficulty('M', [ans(true), ans(true), ans(true)])).toBe('M');
  });
  it('steps up at >= 80% over the window', () => {
    expect(nextDifficulty('M', [true, true, true, true, false].map((c) => ans(c)))).toBe('H');
    expect(nextDifficulty('E', [true, true, true, true].map((c) => ans(c)))).toBe('M');
    expect(nextDifficulty('H', [true, true, true, true].map((c) => ans(c)))).toBe('H'); // capped
  });
  it('steps down at <= 40%', () => {
    expect(nextDifficulty('M', [false, false, true, false, true].map((c) => ans(c)))).toBe('E');
    expect(nextDifficulty('E', [false, false, false, false].map((c) => ans(c)))).toBe('E'); // floored
  });
  it('holds in between', () => {
    expect(nextDifficulty('M', [true, false, true, false, true, true].map((c) => ans(c)))).toBe('M');
  });
  it('only looks at the last 6 answers', () => {
    const list = [false, false, false, false, false, false, true, true, true, true, true, true].map((c) => ans(c));
    expect(nextDifficulty('M', list)).toBe('H');
  });
});

describe('computeLevels', () => {
  it('derives per-skill levels from history', () => {
    const list = [
      ...[true, true, true, true].map((c, i) => ans(c, 'Linear functions', i)),
      ...[false, false, false, false].map((c, i) => ans(c, 'Circles', 10 + i)),
      ...[true, false].map((c, i) => ans(c, 'Percentages', 20 + i)),
    ];
    const levels = computeLevels(list);
    expect(levels['Linear functions']).toBe('H');
    expect(levels['Circles']).toBe('E');
    expect(levels['Percentages']).toBe('M');
  });
});

describe('streaks', () => {
  const day = 86400000;
  const t0 = new Date(2026, 10, 7, 12).getTime();
  it('starts, continues and resets', () => {
    let s = updateStreak({ current: 0, best: 0, lastDay: null }, t0);
    expect(s.current).toBe(1);
    s = updateStreak(s, t0 + 3600000); // same day
    expect(s.current).toBe(1);
    s = updateStreak(s, t0 + day);
    expect(s.current).toBe(2);
    expect(s.best).toBe(2);
    s = updateStreak(s, t0 + 3 * day); // skipped a day
    expect(s.current).toBe(1);
    expect(s.best).toBe(2);
  });
  it('liveStreak reports 0 after a gap', () => {
    const s = updateStreak({ current: 0, best: 0, lastDay: null }, t0);
    expect(liveStreak(s, t0)).toBe(1);
    expect(liveStreak(s, t0 + day)).toBe(1);
    expect(liveStreak(s, t0 + 2 * day)).toBe(0);
  });
});

describe('skillStats', () => {
  it('aggregates accuracy and time', () => {
    const st = skillStats([ans(true), ans(false), ans(true, 'Circles')]);
    const lf = st.find((s) => s.skill === 'Linear functions')!;
    expect(lf.attempts).toBe(2);
    expect(lf.accuracy).toBe(0.5);
    expect(lf.avgTimeMs).toBe(1000);
    expect(lf.byDifficulty.M.attempts).toBe(2);
  });
});
