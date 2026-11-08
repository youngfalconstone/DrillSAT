import type { AnswerRecord, Difficulty } from './types';

export const DIFF_ORDER: Difficulty[] = ['E', 'M', 'H'];

export const ADAPTIVE_WINDOW = 6;
export const STEP_UP_ACCURACY = 0.8;
export const STEP_DOWN_ACCURACY = 0.4;
export const MIN_ANSWERS = 4;

export function stepUp(d: Difficulty): Difficulty {
  return DIFF_ORDER[Math.min(2, DIFF_ORDER.indexOf(d) + 1)];
}
export function stepDown(d: Difficulty): Difficulty {
  return DIFF_ORDER[Math.max(0, DIFF_ORDER.indexOf(d) - 1)];
}

/**
 * Decide the next difficulty for a skill from the most recent answers on that skill.
 * Looks at the last ADAPTIVE_WINDOW answers; needs at least MIN_ANSWERS to move.
 */
export function nextDifficulty(current: Difficulty, recent: AnswerRecord[]): Difficulty {
  const window = recent.slice(-ADAPTIVE_WINDOW);
  if (window.length < MIN_ANSWERS) return current;
  const acc = window.filter((a) => a.correct).length / window.length;
  if (acc >= STEP_UP_ACCURACY) return stepUp(current);
  if (acc <= STEP_DOWN_ACCURACY) return stepDown(current);
  return current;
}

/** Recompute all skill levels from a full answer history (chronological). */
export function computeLevels(answers: AnswerRecord[], start: Difficulty = 'M'): Record<string, Difficulty> {
  const bySkill: Record<string, AnswerRecord[]> = {};
  for (const a of answers) (bySkill[a.skill] ??= []).push(a);
  const levels: Record<string, Difficulty> = {};
  for (const [skill, list] of Object.entries(bySkill)) {
    let level = start;
    // walk forward so that each decision only sees prior answers, mirroring live behaviour
    for (let i = MIN_ANSWERS; i <= list.length; i++) {
      level = nextDifficulty(level, list.slice(Math.max(0, i - ADAPTIVE_WINDOW), i));
    }
    levels[skill] = level;
  }
  return levels;
}

export interface SkillStats {
  skill: string;
  domain: string;
  section: string;
  attempts: number;
  correct: number;
  accuracy: number;
  avgTimeMs: number;
  byDifficulty: Record<Difficulty, { attempts: number; correct: number }>;
}

export function skillStats(answers: AnswerRecord[]): SkillStats[] {
  const map = new Map<string, SkillStats>();
  for (const a of answers) {
    let s = map.get(a.skill);
    if (!s) {
      s = {
        skill: a.skill, domain: a.domain, section: a.section, attempts: 0, correct: 0, accuracy: 0, avgTimeMs: 0,
        byDifficulty: { E: { attempts: 0, correct: 0 }, M: { attempts: 0, correct: 0 }, H: { attempts: 0, correct: 0 } },
      };
      map.set(a.skill, s);
    }
    s.attempts++;
    if (a.correct) s.correct++;
    s.avgTimeMs += a.timeMs;
    s.byDifficulty[a.difficulty].attempts++;
    if (a.correct) s.byDifficulty[a.difficulty].correct++;
  }
  for (const s of map.values()) {
    s.accuracy = s.attempts ? s.correct / s.attempts : 0;
    s.avgTimeMs = s.attempts ? s.avgTimeMs / s.attempts : 0;
  }
  return [...map.values()].sort((a, b) => b.attempts - a.attempts);
}

/** Day key in local time, used for streaks. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function updateStreak(
  streak: { current: number; best: number; lastDay: string | null },
  now: number,
): { current: number; best: number; lastDay: string | null } {
  const today = dayKey(now);
  if (streak.lastDay === today) return streak;
  const yesterday = dayKey(now - 86400000);
  const current = streak.lastDay === yesterday ? streak.current + 1 : 1;
  return { current, best: Math.max(streak.best, current), lastDay: today };
}

/** Is the streak still alive as of `now` (i.e. practiced today or yesterday)? */
export function liveStreak(streak: { current: number; lastDay: string | null }, now: number): number {
  if (!streak.lastDay) return 0;
  const today = dayKey(now);
  const yesterday = dayKey(now - 86400000);
  return streak.lastDay === today || streak.lastDay === yesterday ? streak.current : 0;
}
