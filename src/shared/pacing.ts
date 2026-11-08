/**
 * Pacing against the real test: Reading and Writing allows 32 minutes for 27 questions (~71 s each), Math 35
 * minutes for 22 questions (~95 s each).
 */
import type { Section } from './types';

export const TARGET_MS: Record<Section, number> = {
  rw: (32 * 60 * 1000) / 27,
  math: (35 * 60 * 1000) / 22,
};

/** A question counts as slow when it took more than 1.5x the target. */
export const SLOW_FACTOR = 1.5;

export interface PacingSummary {
  section: Section;
  n: number;
  avgMs: number;
  targetMs: number;
  slow: number;
  verdict: 'on-pace' | 'slow' | 'fast';
}

export function pacingSummary(answers: { section: Section; timeMs: number }[]): PacingSummary[] {
  const out: PacingSummary[] = [];
  for (const section of ['rw', 'math'] as Section[]) {
    const list = answers.filter((a) => a.section === section && a.timeMs > 0);
    if (!list.length) continue;
    const avgMs = list.reduce((x, a) => x + a.timeMs, 0) / list.length;
    const targetMs = TARGET_MS[section];
    const slow = list.filter((a) => a.timeMs > targetMs * SLOW_FACTOR).length;
    const verdict = avgMs > targetMs * 1.1 ? 'slow' : avgMs < targetMs * 0.5 ? 'fast' : 'on-pace';
    out.push({ section, n: list.length, avgMs, targetMs, slow, verdict });
  }
  return out;
}

export function fmtSeconds(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}
