/**
 * Spaced review of missed questions (Leitner boxes). A wrong answer puts the question in the queue, due the next
 * day. Each correct review moves it to a longer interval (1 -> 3 -> 7 days); after three spaced correct reviews it
 * leaves the queue. A wrong review sends it back to the start. Answering a queued question correctly before it is
 * due does not count as a review (it was seen too recently to show retention).
 */
export interface ReviewItem {
  id: string;
  box: number; // 0, 1, 2: index into INTERVAL_DAYS for the next review
  due: number; // epoch ms (start of the local day it becomes due)
  added: number;
  lapses: number;
}

export type ReviewQueue = Record<string, ReviewItem>;

export const INTERVAL_DAYS = [1, 3, 7];
const DAY = 86400000;

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dueIn(now: number, days: number): number {
  return startOfDay(now) + days * DAY;
}

export function applyAnswer(queue: ReviewQueue, id: string, correct: boolean, now: number): ReviewQueue {
  const cur = queue[id];
  if (!correct) {
    return { ...queue, [id]: { id, box: 0, due: dueIn(now, INTERVAL_DAYS[0]), added: cur?.added ?? now, lapses: (cur?.lapses ?? 0) + 1 } };
  }
  if (!cur || cur.due > now) return queue; // not queued, or answered before it was due
  const box = cur.box + 1;
  if (box >= INTERVAL_DAYS.length) {
    const rest = { ...queue };
    delete rest[id];
    return rest;
  }
  return { ...queue, [id]: { ...cur, box, due: dueIn(now, INTERVAL_DAYS[box]) } };
}

export function applyAnswers(queue: ReviewQueue, answers: { questionId: string; correct: boolean; at: number }[]): ReviewQueue {
  return [...answers].sort((a, b) => a.at - b.at).reduce((q, a) => applyAnswer(q, a.questionId, a.correct, a.at), queue);
}

export function dueIds(queue: ReviewQueue, now: number): string[] {
  return Object.values(queue).filter((r) => r.due <= now).sort((a, b) => a.due - b.due || a.added - b.added).map((r) => r.id);
}

export function nextDue(queue: ReviewQueue, now: number): number | null {
  const future = Object.values(queue).filter((r) => r.due > now).map((r) => r.due);
  return future.length ? Math.min(...future) : null;
}
