import type { Difficulty, QuestionIndexEntry, Section, Source } from './types';

export interface Filter {
  section?: Section | 'all';
  domains?: string[];
  skills?: string[];
  difficulties?: Difficulty[];
  types?: ('mcq' | 'spr')[];
  sources?: Source[];
  query?: string;
  excludeIds?: Set<string>;
}

export function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9.\/-]+/).filter((t) => t.length > 0);
}

export function matchesQuery(entry: QuestionIndexEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (entry.id.toLowerCase() === q) return true;
  const hay = (entry.text + ' ' + (entry.optionsText ?? []).join(' ') + ' ' + entry.skill + ' ' + entry.domain).toLowerCase();
  // every token must appear (AND search)
  return tokenize(q).every((t) => hay.includes(t));
}

export function filterQuestions(all: QuestionIndexEntry[], f: Filter): QuestionIndexEntry[] {
  const out: QuestionIndexEntry[] = [];
  for (const e of all) {
    if (f.section && f.section !== 'all' && e.section !== f.section) continue;
    if (f.domains?.length && !f.domains.includes(e.domain)) continue;
    if (f.skills?.length && !f.skills.includes(e.skill)) continue;
    if (f.difficulties?.length && !f.difficulties.includes(e.difficulty)) continue;
    if (f.types?.length && !f.types.includes(e.type)) continue;
    if (f.sources?.length && !f.sources.includes(e.source)) continue;
    if (f.excludeIds?.has(e.id)) continue;
    if (f.query && !matchesQuery(e, f.query)) continue;
    out.push(e);
  }
  return out;
}

/** Deterministic shuffle with a seed (mulberry32). */
export function shuffle<T>(arr: T[], seed = Date.now()): T[] {
  const a = arr.slice();
  let t = seed >>> 0;
  const rnd = () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Word 3-gram Jaccard similarity, used to reject near-duplicate AI questions. */
export function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = tokenize(s);
    const g = new Set<string>();
    for (let i = 0; i + 2 < t.length; i++) g.add(t[i] + ' ' + t[i + 1] + ' ' + t[i + 2]);
    return g;
  };
  const ga = grams(a), gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return inter / (ga.size + gb.size - inter);
}
