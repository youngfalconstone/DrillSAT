/**
 * Full-length digital SAT practice test assembly (DECISIONS.md #36).
 *
 * Structure follows the digital SAT: each section has two modules; module 2 is routed easier or harder from
 * module 1 performance. Reading and Writing: 2 x 27 questions, 32 minutes each. Math: 2 x 22 questions,
 * 35 minutes each, about a quarter grid-ins. Content mix per module follows College Board's domain weights
 * (R&W: Craft and Structure ~28%, Information and Ideas ~26%, Standard English Conventions ~26%, Expression of
 * Ideas ~20%; Math: Algebra ~35%, Advanced Math ~35%, Problem-Solving and Data Analysis ~15%, Geometry and
 * Trigonometry ~15%). R&W questions appear grouped by question type in the official order; Math questions run
 * roughly easiest to hardest. (Real tests also include unscored pretest questions; these are all scored.)
 */
import type { Difficulty, QuestionIndexEntry, Section } from './types';
import { estimateFromAnswers, type ScoredAnswer } from './score';

import type { ModuleLevel } from './types';
export type { ModuleLevel };

export const MODULE_SPEC: Record<Section, { count: number; minutes: number }> = {
  rw: { count: 27, minutes: 32 },
  math: { count: 22, minutes: 35 },
};

export const BREAK_MINUTES = 10;

/** R&W slots per module, in the order questions appear. */
const RW_SLOTS: [string, number][] = [
  ['Words in Context', 4],
  ['Text Structure and Purpose', 2],
  ['Cross-Text Connections', 1],
  ['Central Ideas and Details', 2],
  ['Command of Evidence', 3],
  ['Inferences', 2],
  ['Boundaries', 3],
  ['Form, Structure, and Sense', 4],
  ['Transitions', 3],
  ['Rhetorical Synthesis', 3],
];

/** Math domain counts for module 1 and module 2 (sum to 22 each; 15/15/7/7 over the section). */
const MATH_SLOTS: [string, [number, number]][] = [
  ['Algebra', [8, 7]],
  ['Advanced Math', [7, 8]],
  ['Problem-Solving and Data Analysis', [4, 3]],
  ['Geometry and Trigonometry', [3, 4]],
];
const MATH_SPR_PER_MODULE = 6;

/** Difficulty mix of a module. */
export const LEVEL_MIX: Record<ModuleLevel, Record<Difficulty, number>> = {
  base: { E: 1 / 3, M: 1 / 3, H: 1 / 3 },
  easier: { E: 0.5, M: 0.38, H: 0.12 },
  harder: { E: 0.12, M: 0.38, H: 0.5 },
};

/** Route to the harder module 2 when the module 1 estimate reaches the SAT median band (550). */
export const ROUTE_HARDER_AT = 540;

export type Rng = () => number;

export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Spread n slots over difficulties by the mix (largest remainder), then shuffle. */
function difficultyPlan(n: number, mix: Record<Difficulty, number>, rng: Rng): Difficulty[] {
  const ds: Difficulty[] = ['E', 'M', 'H'];
  const raw = ds.map((d) => mix[d] * n);
  const base = raw.map(Math.floor);
  let left = n - base.reduce((x, y) => x + y, 0);
  const order = raw.map((r, i) => [r - base[i] + rng() * 1e-6, i] as const).sort((x, y) => y[0] - x[0]);
  for (const [, i] of order) if (left-- > 0) base[i]++;
  return shuffled(ds.flatMap((d, i) => Array<Difficulty>(base[i]).fill(d)), rng);
}

interface PickCtx {
  pool: QuestionIndexEntry[];
  used: Set<string>;
  seen: Set<string>;
  rng: Rng;
}

/** Pick one official question; relax difficulty, then "unseen", before giving up. */
function pick(ctx: PickCtx, f: (e: QuestionIndexEntry) => boolean, d: Difficulty): QuestionIndexEntry | null {
  const tiers = [
    (e: QuestionIndexEntry) => f(e) && e.difficulty === d && !ctx.seen.has(e.id),
    (e: QuestionIndexEntry) => f(e) && e.difficulty === d,
    (e: QuestionIndexEntry) => f(e) && !ctx.seen.has(e.id),
    (e: QuestionIndexEntry) => f(e),
  ];
  for (const t of tiers) {
    const c = ctx.pool.filter((e) => !ctx.used.has(e.id) && t(e));
    if (c.length) {
      const e = c[Math.floor(ctx.rng() * c.length)];
      ctx.used.add(e.id);
      return e;
    }
  }
  return null;
}

const DIFF_RANK: Record<Difficulty, number> = { E: 0, M: 1, H: 2 };

export function assembleModule(
  index: QuestionIndexEntry[],
  section: Section,
  moduleNo: 1 | 2,
  level: ModuleLevel,
  used: Set<string>,
  seen: Set<string>,
  rng: Rng,
): string[] {
  const pool = index.filter((e) => e.section === section && e.source === 'official' && e.content !== false && e.band);
  const ctx: PickCtx = { pool, used, seen, rng };
  const plan = difficultyPlan(MODULE_SPEC[section].count, LEVEL_MIX[level], rng);
  let k = 0;
  const out: QuestionIndexEntry[] = [];
  if (section === 'rw') {
    for (const [skill, n] of RW_SLOTS) {
      const group: QuestionIndexEntry[] = [];
      for (let i = 0; i < n; i++) {
        const e = pick(ctx, (x) => x.skill === skill, plan[k++]);
        if (e) group.push(e);
      }
      // within a question type, easier first
      out.push(...group.sort((a, b) => DIFF_RANK[a.difficulty] - DIFF_RANK[b.difficulty] || (a.band ?? 0) - (b.band ?? 0)));
    }
  } else {
    const slots: { domain: string; spr: boolean }[] = [];
    for (const [domain, counts] of MATH_SLOTS) for (let i = 0; i < counts[moduleNo - 1]; i++) slots.push({ domain, spr: false });
    // grid-ins spread across domains
    for (const i of shuffled(slots.map((_, j) => j), rng).slice(0, MATH_SPR_PER_MODULE)) slots[i].spr = true;
    for (const s of slots) {
      const want = s.spr ? 'spr' : 'mcq';
      const e = pick(ctx, (x) => x.domain === s.domain && x.type === want, plan[k++]) ?? pick(ctx, (x) => x.domain === s.domain, plan[k - 1]);
      if (e) out.push(e);
    }
    // roughly easiest to hardest, with some mixing like the real test
    out.sort((a, b) => (a.band ?? 4) + rng() * 2.5 - ((b.band ?? 4) + rng() * 2.5));
  }
  return out.map((e) => e.id);
}

/** Module 2 level from module 1 answers, using the same score model as the results. */
export function routeModule2(section: Section, module1: ScoredAnswer[]): ModuleLevel {
  return estimateFromAnswers(section, module1).score >= ROUTE_HARDER_AT ? 'harder' : 'easier';
}
