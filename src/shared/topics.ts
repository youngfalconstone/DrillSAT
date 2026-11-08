/**
 * Topic (skill) names for display. The College Board skill names are long; lists show a short name and
 * keep the official one as a tooltip. Data, filters and AI prompts always use the official name.
 */
import type { QuestionIndexEntry, Section } from './types';
import { DOMAINS } from './types';

const SHORT: Record<string, string> = {
  'Linear equations in one variable': 'Linear equations (one variable)',
  'Linear equations in two variables': 'Linear equations (two variables)',
  'Systems of two linear equations in two variables': 'Systems of linear equations',
  'Linear inequalities in one or two variables': 'Linear inequalities',
  'Nonlinear equations in one variable and systems of equations in two variables': 'Nonlinear equations and systems',
  'Ratios, rates, proportional relationships, and units': 'Ratios, rates and units',
  'Probability and conditional probability': 'Probability',
  'One-variable data: Distributions and measures of center and spread': 'One-variable data',
  'Two-variable data: Models and scatterplots': 'Two-variable data',
  'Inference from sample statistics and margin of error': 'Sampling and margin of error',
  'Evaluating statistical claims: Observational studies and experiments': 'Studies and experiments',
  'Lines, angles, and triangles': 'Lines, angles and triangles',
  'Right triangles and trigonometry': 'Right triangles and trigonometry',
};

/** Short display name for a skill. */
export function topicLabel(skill: string): string {
  return SHORT[skill] ?? skill;
}

/** The bank spells one skill two ways ("Cross-text" on 2 items); treat them as one topic. */
export function normalizeSkill(skill: string): string {
  return skill === 'Cross-text Connections' ? 'Cross-Text Connections' : skill;
}

export type TopicGroup = { domain: string; skills: string[] };

/** Skills present in `entries`, grouped by domain in the official domain order. */
export function topicsByDomain(entries: Pick<QuestionIndexEntry, 'section' | 'domain' | 'skill'>[], section: Section | 'all'): TopicGroup[] {
  const m = new Map<string, Set<string>>();
  for (const e of entries) {
    if (section !== 'all' && e.section !== section) continue;
    if (!m.has(e.domain)) m.set(e.domain, new Set());
    m.get(e.domain)!.add(e.skill);
  }
  const order = section === 'all' ? [...DOMAINS.math, ...DOMAINS.rw] : DOMAINS[section];
  return order
    .filter((d) => m.has(d))
    .map((domain) => ({ domain, skills: [...m.get(domain)!].sort((a, b) => topicLabel(a).localeCompare(topicLabel(b))) }));
}
