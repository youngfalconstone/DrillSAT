import { describe, it, expect } from 'vitest';
import { applyAnswer, applyAnswers, dueIds, nextDue, startOfDay, INTERVAL_DAYS } from '@shared/review';
import { pacingSummary, TARGET_MS, fmtSeconds } from '@shared/pacing';

const DAY = 86400000;
const t0 = new Date(2026, 10, 8, 15, 30).getTime();

describe('spaced review', () => {
  it('a miss is due tomorrow, then 3 and 7 days after correct reviews, then graduates', () => {
    let q = applyAnswer({}, 'a', false, t0);
    expect(q.a.due).toBe(startOfDay(t0) + DAY);
    expect(dueIds(q, t0)).toEqual([]);
    const d1 = startOfDay(t0) + DAY + 3600000;
    expect(dueIds(q, d1)).toEqual(['a']);
    q = applyAnswer(q, 'a', true, d1);
    expect(q.a.box).toBe(1);
    expect(q.a.due).toBe(startOfDay(d1) + INTERVAL_DAYS[1] * DAY);
    const d2 = q.a.due + 1000;
    q = applyAnswer(q, 'a', true, d2);
    expect(q.a.box).toBe(2);
    q = applyAnswer(q, 'a', true, q.a.due + 1000);
    expect(q.a).toBeUndefined();
  });
  it('a miss during review resets it; a correct answer before it is due does not count', () => {
    let q = applyAnswer({}, 'a', false, t0);
    q = applyAnswer(q, 'a', true, t0 + 1000); // same day: too early
    expect(q.a.box).toBe(0);
    q = applyAnswer(q, 'a', true, q.a.due + 1);
    q = applyAnswer(q, 'a', false, q.a.due + 1);
    expect(q.a.box).toBe(0);
    expect(q.a.lapses).toBe(2);
  });
  it('applies a session in time order and reports the next due date', () => {
    const q = applyAnswers({}, [{ questionId: 'b', correct: false, at: t0 + 5 }, { questionId: 'a', correct: false, at: t0 }]);
    expect(Object.keys(q).sort()).toEqual(['a', 'b']);
    expect(nextDue(q, t0)).toBe(startOfDay(t0) + DAY);
    expect(dueIds(q, t0 + 2 * DAY)).toEqual(['a', 'b']);
  });
});

describe('pacing', () => {
  it('compares average time with the real test pace', () => {
    const p = pacingSummary([
      { section: 'math', timeMs: 200000 }, { section: 'math', timeMs: 100000 },
      { section: 'rw', timeMs: 60000 }, { section: 'rw', timeMs: 70000 },
    ]);
    const math = p.find((x) => x.section === 'math')!;
    expect(math.targetMs).toBeCloseTo(TARGET_MS.math);
    expect(math.verdict).toBe('slow');
    expect(math.slow).toBe(1);
    expect(p.find((x) => x.section === 'rw')!.verdict).toBe('on-pace');
    expect(fmtSeconds(95454)).toBe('1:35');
    expect(fmtSeconds(42000)).toBe('42s');
  });
});
