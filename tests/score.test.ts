import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { BankIndex, Section } from '@shared/types';
import {
  combineTotal, estimateFromAnswers, estimateFromHistory, isEstimate, pCorrect, rp67Point, SCORE_BANDS, MIN_ITEMS, type ScoredAnswer,
} from '@shared/score';
import { assembleModule, MODULE_SPEC, routeModule2, seededRng } from '@shared/testForm';

const index: BankIndex = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'data', 'bank', 'index.json'), 'utf-8'));
const byId = new Map(index.questions.map((e) => [e.id, e]));

describe('item model', () => {
  it('a band-k question is answered correctly with p = 0.67 where band k begins', () => {
    for (const section of ['rw', 'math'] as Section[]) for (let k = 1; k <= 7; k++) for (const type of ['mcq', 'spr'] as const) {
      expect(pCorrect(section, { band: k, type }, rp67Point(section, k))).toBeCloseTo(0.67, 6);
    }
    expect(rp67Point('rw', 3)).toBe(SCORE_BANDS.rw[2][0]);
    expect(rp67Point('math', 7)).toBe(680);
  });
  it('is increasing in score and harder bands are harder', () => {
    expect(pCorrect('math', { band: 4, type: 'mcq' }, 600)).toBeGreaterThan(pCorrect('math', { band: 4, type: 'mcq' }, 500));
    expect(pCorrect('math', { band: 6, type: 'spr' }, 550)).toBeLessThan(pCorrect('math', { band: 3, type: 'spr' }, 550));
    expect(pCorrect('rw', { band: 7, type: 'mcq' }, 200)).toBeGreaterThan(0.2); // guessing floor
  });
  it('every official question has a band; bands nest inside College Board difficulty', () => {
    for (const e of index.questions) {
      expect(e.band).toBeGreaterThanOrEqual(1);
      const want = e.difficulty === 'E' ? [1, 2, 3] : e.difficulty === 'M' ? [4, 5] : [6, 7];
      expect(want).toContain(e.band);
    }
  });
});

function simulateSection(section: Section, truth: number, seed: number) {
  const rng = seededRng(seed);
  const used = new Set<string>();
  const ans = (ids: string[]) => ids.map((id) => {
    const e = byId.get(id)!;
    const item = { band: e.band!, type: e.type };
    return { ...item, correct: rng() < pCorrect(section, item, truth) } as ScoredAnswer;
  });
  const a1 = ans(assembleModule(index.questions, section, 1, 'base', used, new Set(), rng));
  const a2 = ans(assembleModule(index.questions, section, 2, routeModule2(section, a1), used, new Set(), rng));
  return estimateFromAnswers(section, [...a1, ...a2]);
}

describe('full-section estimates (simulated test takers with known scores)', () => {
  for (const section of ['rw', 'math'] as Section[]) {
    it(`${section}: small error and honest 80% ranges across the scale`, () => {
      let cover = 0, n = 0, absErr = 0, width = 0;
      const midErr: number[] = [];
      for (const truth of [300, 400, 450, 500, 550, 600, 650, 700, 750]) {
        for (let s = 0; s < 30; s++) {
          const e = simulateSection(section, truth, truth * 131 + s);
          absErr += Math.abs(e.score - truth);
          width += e.high - e.low;
          if (truth >= 450 && truth <= 650) midErr.push(Math.abs(e.score - truth));
          if (e.low <= truth && truth <= e.high) cover++;
          n++;
        }
      }
      const mae = absErr / n;
      const midMae = midErr.reduce((a, b) => a + b, 0) / midErr.length;
      const coverage = cover / n;
      expect(mae).toBeLessThan(35);
      expect(midMae).toBeLessThan(30); // College Board's own section range is +/-30
      expect(coverage).toBeGreaterThan(0.7);
      expect(coverage).toBeLessThan(0.95);
      expect(width / n).toBeLessThan(110);
    }, 120000);
  }

  it('all correct is near the top, all wrong near the bottom, chance-level guessing stays low', () => {
    const items = (section: Section, correct: (i: number) => boolean) => {
      const ids = assembleModule(index.questions, section, 1, 'base', new Set(), new Set(), seededRng(5))
        .concat(assembleModule(index.questions, section, 2, 'harder', new Set(), new Set(), seededRng(6)));
      return ids.map((id, i) => ({ band: byId.get(id)!.band!, type: byId.get(id)!.type, correct: correct(i) }));
    };
    for (const section of ['rw', 'math'] as Section[]) {
      expect(estimateFromAnswers(section, items(section, () => true)).score).toBeGreaterThanOrEqual(740);
      expect(estimateFromAnswers(section, items(section, () => true)).high).toBe(800);
      expect(estimateFromAnswers(section, items(section, () => false)).score).toBeLessThanOrEqual(260);
      expect(estimateFromAnswers(section, items(section, (i) => i % 4 === 0)).score).toBeLessThanOrEqual(360);
    }
  });

  it('modules have the official length and the total combines both sections', () => {
    const u = new Set<string>();
    expect(assembleModule(index.questions, 'rw', 1, 'base', u, new Set(), seededRng(1))).toHaveLength(MODULE_SPEC.rw.count);
    expect(assembleModule(index.questions, 'math', 2, 'harder', u, new Set(), seededRng(2))).toHaveLength(MODULE_SPEC.math.count);
    const rw = estimateFromAnswers('rw', [{ band: 4, type: 'mcq', correct: true }]);
    const math = estimateFromAnswers('math', [{ band: 4, type: 'mcq', correct: false }]);
    const t = combineTotal(rw, math);
    expect(t.score).toBe(rw.score + math.score);
    expect(t.low).toBeLessThanOrEqual(t.score);
    expect(t.high).toBeGreaterThanOrEqual(t.score);
  });
});

describe('estimate from practice history', () => {
  const ids = index.questions.filter((e) => e.section === 'math').slice(0, 80).map((e) => e.id);
  const bandOf = (id: string) => { const e = byId.get(id); return e?.band ? { band: e.band, type: e.type } : undefined; };
  it('needs enough official answers', () => {
    const few = ids.slice(0, MIN_ITEMS - 1).map((id, i) => ({ questionId: id, section: 'math' as Section, correct: true, at: i }));
    const r = estimateFromHistory('math', few, bandOf);
    expect(isEstimate(r)).toBe(false);
    if (!isEstimate(r)) expect(r.needed).toBe(1);
  });
  it('counts only the first attempt at a question and ignores AI questions', () => {
    const base = ids.slice(0, 30).map((id, i) => ({ questionId: id, section: 'math' as Section, correct: false, at: i }));
    const repeats = ids.slice(0, 30).map((id, i) => ({ questionId: id, section: 'math' as Section, correct: true, at: 100 + i }));
    const ai = Array.from({ length: 30 }, (_, i) => ({ questionId: 'ai-' + i, section: 'math' as Section, correct: true, at: 200 + i, source: 'ai' }));
    const r = estimateFromHistory('math', [...base, ...repeats, ...ai], bandOf);
    expect(isEstimate(r)).toBe(true);
    if (isEstimate(r)) {
      expect(r.n).toBe(30);
      expect(r.score).toBeLessThan(400); // the later correct repeats did not count
    }
  });
});
