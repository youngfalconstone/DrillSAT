import type { Question } from './types';

/** Parse a student-produced response string into a number, following SAT grid-in conventions. */
export function parseSpr(raw: string): number | null {
  if (/\S\s+\S/.test(raw.trim())) return null; // mixed numbers like "1 1/2" are not valid grid-in answers
  let s = raw.trim().replace(/,/g, '');
  if (!s) return null;
  if (s.startsWith('+')) s = s.slice(1);
  const frac = s.match(/^(-?)(\d+)\/(\d+)$/);
  if (frac) {
    const den = Number(frac[3]);
    if (den === 0) return null;
    const v = Number(frac[2]) / den;
    return frac[1] ? -v : v;
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** Is the response within SAT's 5/6-character grid limits? (not enforced on input, informational) */
export function sprTooLong(raw: string): boolean {
  const s = raw.trim();
  return s.startsWith('-') ? s.length > 6 : s.length > 5;
}

/**
 * SAT rule: a decimal answer may be rounded or truncated to fit the grid (4 digits/characters after
 * an optional minus sign). So 3/17 = 0.17647… accepts .1764, .1765, 0.176 is NOT enough (needs the
 * 4 available characters), but we accept anything that equals a key after rounding/truncation to the
 * number of decimals the student typed, provided they used at least 3 decimals or an exact match.
 */
export function checkSpr(raw: string, keys: string[]): boolean {
  const s = raw.trim().replace(/,/g, '');
  if (!s || /\s/.test(s)) return false;
  // exact textual match with any key (with/without leading zero)
  const norm = (x: string) => x.replace(/^(-?)0+(?=\.)/, '$1').replace(/^(-?)\./, '$10.');
  for (const k of keys) if (norm(s) === norm(k.trim())) return true;
  const v = parseSpr(s);
  if (v === null) return false;
  for (const k of keys) {
    const kv = parseSpr(k);
    if (kv === null) continue;
    if (Math.abs(v - kv) < 1e-9) return true;
    // decimals: allow truncation/rounding to the typed precision if the student used >= 3 decimals
    const m = s.match(/\.(\d+)$/);
    if (m && m[1].length >= 3) {
      const p = m[1].length;
      const f = Math.pow(10, p);
      const trunc = Math.trunc(kv * f) / f;
      const round = Math.round(kv * f) / f;
      if (Math.abs(v - trunc) < 1e-9 || Math.abs(v - round) < 1e-9) return true;
    }
  }
  return false;
}

export function checkAnswer(q: Question, answer: string | null): boolean {
  if (answer === null || answer === undefined) return false;
  if (q.type === 'mcq') return (q.correct ?? []).includes(answer.trim().toUpperCase());
  return checkSpr(answer, q.keys ?? []);
}

/** Human readable correct answer for display. */
export function correctAnswerLabel(q: Question): string {
  if (q.type === 'mcq') return (q.correct ?? []).join(', ');
  return (q.keys ?? []).join(' or ');
}
