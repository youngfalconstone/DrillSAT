/**
 * Estimated SAT section score from answers to official questions.
 *
 * Calibration comes from College Board, not from guesses (DECISIONS.md #35):
 *  - Every official question carries College Board's Skills Insight performance score band (1-7). College Board
 *    assigned questions to bands by RP67 mapping: a question belongs to the lowest band in which students scoring
 *    in that band answer it correctly with probability >= 0.67 ("Skills Insight for the SAT Suite", Appendix).
 *  - The band score ranges and the percentile anchors used to define them (SAT 25th/50th/75th/90th percentiles)
 *    are published in the same document (Table 15).
 *
 * Model: a 3-parameter logistic item response function on the 200-800 scale. A question in band k answers
 * correctly with probability 0.67 at the score where band k begins (the RP67 point lies between the typical
 * scores of band k-1 and band k); multiple-choice questions have a 0.2 guessing floor, grid-ins none.
 * The prior is the SAT-taker score distribution implied by College Board's percentile anchors, widened 1.5x so
 * that very low and very high scorers are not pulled to the middle. The estimate is the posterior mean on the
 * 10-point scale grid, and the range is the central 80% posterior interval.
 *
 * Slope: chosen so a full adaptive section (2 modules) has a posterior SD of ~30 points, which matches College
 * Board's published section score range of +/-30 points (derived from the standard error of measurement; total
 * +/-40). Simulation (tests/score.test.ts) checks bias, error and 80%-range coverage across the scale.
 */
import type { Section } from './types';

export const SCORE_BANDS: Record<Section, [number, number][]> = {
  // Skills Insight Table 3 / Table 15 (band 1 is "<370")
  rw: [[200, 360], [370, 410], [420, 480], [490, 540], [550, 600], [610, 670], [680, 800]],
  math: [[200, 360], [370, 410], [420, 460], [470, 540], [550, 600], [610, 670], [680, 800]],
};

/** SAT-taker distribution: median 550 (SAT 50th pct), spread from the 25th-75th percentile anchors. */
export const SCORE_PRIOR: Record<Section, { mean: number; sd: number }> = {
  rw: { mean: 550, sd: (610 - 490) / 1.349 }, // ~89
  math: { mean: 550, sd: (610 - 470) / 1.349 }, // ~104
};

/** Item discrimination per scale point; matches College Board's +/-30-point section SEM for a full section. */
export const SLOPE = 0.013;
export const GUESS_MCQ = 0.2;
/** Prior width multiplier (1 = the SAT-taker distribution). */
export const PRIOR_SCALE = 1.5;
const RP = 0.67;

export const MIN_ITEMS = 20;
export const RECENT_ITEMS = 60;

const GRID: number[] = Array.from({ length: 61 }, (_, i) => 200 + i * 10);

function logit(p: number) {
  return Math.log(p / (1 - p));
}

/** Score at which a question of band k is answered correctly with probability 0.67. */
export function rp67Point(section: Section, band: number): number {
  const b = SCORE_BANDS[section];
  const k = Math.min(7, Math.max(1, Math.round(band)));
  if (k === 1) return b[0][1] - 30; // below 370: items easy enough for the lowest band
  return b[k - 1][0]; // the lower edge of band k
}

export interface ItemParams {
  band: number;
  type: 'mcq' | 'spr';
}

/** Probability of a correct answer at scale score s. */
export function pCorrect(section: Section, item: ItemParams, s: number, slope = SLOPE): number {
  const g = item.type === 'mcq' ? GUESS_MCQ : 0;
  const s67 = rp67Point(section, item.band);
  const b = s67 - logit((RP - g) / (1 - g)) / slope;
  return g + (1 - g) / (1 + Math.exp(-slope * (s - b)));
}

export interface ScoredAnswer extends ItemParams {
  correct: boolean;
}

export interface ScoreEstimate {
  section: Section;
  score: number; // rounded to 10
  low: number; // 10th percentile of the posterior
  high: number; // 90th percentile
  n: number;
  posterior: number[]; // on GRID, sums to 1
}

const round10 = (x: number) => Math.min(800, Math.max(200, Math.round(x / 10) * 10));

export function posterior(section: Section, answers: ScoredAnswer[], slope = SLOPE, priorScale = PRIOR_SCALE): number[] {
  const { mean } = SCORE_PRIOR[section];
  const sd = SCORE_PRIOR[section].sd * priorScale;
  const logp = GRID.map((s) => -0.5 * ((s - mean) / sd) ** 2);
  for (const a of answers) {
    for (let i = 0; i < GRID.length; i++) {
      const p = pCorrect(section, a, GRID[i], slope);
      logp[i] += Math.log(a.correct ? p : 1 - p);
    }
  }
  const m = Math.max(...logp);
  const w = logp.map((l) => Math.exp(l - m));
  const z = w.reduce((x, y) => x + y, 0);
  return w.map((x) => x / z);
}

function quantile(post: number[], q: number): number {
  let c = 0;
  for (let i = 0; i < post.length; i++) {
    c += post[i];
    if (c >= q) return GRID[i];
  }
  return 800;
}

export function estimateFromAnswers(section: Section, answers: ScoredAnswer[], slope = SLOPE, priorScale = PRIOR_SCALE): ScoreEstimate {
  const post = posterior(section, answers, slope, priorScale);
  const mean = post.reduce((acc, p, i) => acc + p * GRID[i], 0);
  return { section, score: round10(mean), low: quantile(post, 0.1), high: quantile(post, 0.9), n: answers.length, posterior: post };
}

/** Total score (400-1600) from two independent section posteriors. */
export function combineTotal(rw: ScoreEstimate, math: ScoreEstimate): { score: number; low: number; high: number } {
  const dist = new Map<number, number>();
  rw.posterior.forEach((pr, i) => math.posterior.forEach((pm, j) => {
    const t = GRID[i] + GRID[j];
    dist.set(t, (dist.get(t) ?? 0) + pr * pm);
  }));
  const keys = [...dist.keys()].sort((a, b) => a - b);
  const q = (x: number) => {
    let c = 0;
    for (const k of keys) {
      c += dist.get(k)!;
      if (c >= x) return k;
    }
    return 1600;
  };
  return { score: rw.score + math.score, low: q(0.1), high: q(0.9) };
}

export interface AnswerLike {
  questionId: string;
  section: Section;
  correct: boolean;
  at: number;
  source?: string;
}

/**
 * Estimate from practice history: official questions only (they carry a band), the first attempt at each
 * question (repeats are remembered, not measured), most recent RECENT_ITEMS. Null until MIN_ITEMS.
 */
export function estimateFromHistory(
  section: Section,
  answers: AnswerLike[],
  bandOf: (id: string) => ItemParams | undefined,
): ScoreEstimate | { section: Section; n: number; needed: number } {
  const first = new Map<string, AnswerLike>();
  for (const a of [...answers].sort((x, y) => x.at - y.at)) {
    if (a.section !== section || a.source === 'ai' || first.has(a.questionId)) continue;
    first.set(a.questionId, a);
  }
  const usable = [...first.values()]
    .map((a) => ({ a, p: bandOf(a.questionId) }))
    .filter((x): x is { a: AnswerLike; p: ItemParams } => !!x.p)
    .sort((x, y) => y.a.at - x.a.at)
    .slice(0, RECENT_ITEMS);
  if (usable.length < MIN_ITEMS) return { section, n: usable.length, needed: MIN_ITEMS - usable.length };
  return estimateFromAnswers(section, usable.map(({ a, p }) => ({ ...p, correct: a.correct })));
}

export function isEstimate(x: ScoreEstimate | { needed: number }): x is ScoreEstimate {
  return 'score' in x;
}
