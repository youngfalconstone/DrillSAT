import { create } from 'zustand';
import { api, type AppInfo } from './api';
import type {
  AnswerRecord, ChatMessage, Difficulty, ProgressData, Question, QuestionIndexEntry, Section, SessionRecord, Settings,
} from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';
import { checkAnswer } from '@shared/answerCheck';
import { computeLevels, nextDifficulty, updateStreak } from '@shared/adaptive';
import { filterQuestions, shuffle } from '@shared/search';

export type Screen = 'home' | 'bank' | 'practice' | 'performance' | 'study' | 'settings' | 'help';

export interface SessionConfig {
  section: Section;
  skills: string[]; // empty = all skills of the section
  difficultyMode: Difficulty | 'adaptive' | 'mixed';
  count: number;
  includeAI: boolean;
  onlyUnseen: boolean;
}

export interface SessionAnswerState {
  answer: string | null;
  submitted: boolean;
  correct: boolean;
  timeMs: number;
  marked: boolean;
  at: number;
}

export interface ActiveSession {
  id: string;
  startedAt: number;
  config: SessionConfig;
  questionIds: string[];
  idx: number;
  answers: Record<string, SessionAnswerState>;
  questionStartedAt: number;
  finished: boolean;
  levels: Record<string, Difficulty>; // live adaptive levels for this session
}

const EMPTY_PROGRESS: ProgressData = { version: 1, sessions: [], levels: {}, streak: { current: 0, best: 0, lastDay: null }, reviewFlags: [] };

interface State {
  ready: boolean;
  loadError: string | null;
  index: QuestionIndexEntry[];
  aiQuestions: Question[];
  settings: Settings;
  appInfo: AppInfo | null;
  progress: ProgressData;
  screen: Screen;
  session: ActiveSession | null;
  lastSession: SessionRecord | null;
  // question currently displayed anywhere (for the tutor)
  currentQuestion: Question | null;
  currentAnswer: string | null;
  currentAnswered: boolean;
  chatOpen: boolean;
  chatMessages: ChatMessage[];
  calcOpen: boolean;
  calcWidth: number;
  calcStates: Record<string, unknown>;
  qCache: Map<string, Question>;
  toast: { text: string; kind: 'info' | 'error' } | null;

  init(): Promise<void>;
  nav(s: Screen): void;
  getQuestion(id: string): Promise<Question>;
  allIndex(): QuestionIndexEntry[];
  updateSettings(p: Partial<Settings>): Promise<void>;
  setSecret(name: 'llm' | 'desmos', v: string | null): Promise<void>;
  setCurrent(q: Question | null, answer?: string | null, answered?: boolean): void;
  toggleChat(open?: boolean): void;
  pushChat(m: ChatMessage): void;
  clearChat(): void;
  toggleCalc(open?: boolean): void;
  setCalcWidth(w: number): void;
  saveCalcState(id: string, s: unknown): void;
  showToast(text: string, kind?: 'info' | 'error'): void;
  // sessions
  startSession(cfg: SessionConfig, presetIds?: string[]): Promise<void>;
  sessionGoto(i: number): void;
  sessionSetAnswer(ans: string | null): void;
  sessionSubmit(): Promise<void>;
  sessionToggleMark(): void;
  sessionNext(): Promise<void>;
  sessionEnd(): Promise<SessionRecord | null>;
  sessionDiscard(): void;
  attachReview(sessionId: string, review: SessionRecord['review']): Promise<void>;
  setLevel(skill: string, d: Difficulty | null): Promise<void>;
  toggleReviewFlag(id: string): Promise<void>;
  addAIQuestion(q: Question): Promise<void>;
  removeAIQuestion(id: string): Promise<void>;
  resetProgress(): Promise<void>;
}

function entryOf(q: Question): QuestionIndexEntry {
  return {
    id: q.id, section: q.section, domain: q.domain, skill: q.skill, difficulty: q.difficulty, type: q.type, source: q.source,
    text: q.text ?? '', preview: (q.text ?? '').slice(0, 160), content: true, hasFigure: false, hasTable: false,
    optionsText: q.options?.map((o) => o.html.replace(/<[^>]+>/g, '')),
  };
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  loadError: null,
  index: [],
  aiQuestions: [],
  settings: DEFAULT_SETTINGS,
  appInfo: null,
  progress: EMPTY_PROGRESS,
  screen: 'home',
  session: null,
  lastSession: null,
  currentQuestion: null,
  currentAnswer: null,
  currentAnswered: false,
  chatOpen: false,
  chatMessages: [],
  calcOpen: false,
  calcWidth: 440,
  calcStates: {},
  qCache: new Map(),
  toast: null,

  async init() {
    try {
      const [bank, settings, appInfo, progress, aiQuestions, calcStates] = await Promise.all([
        api.bank.index(),
        api.settings.get(),
        api.app.info(),
        api.store.get<ProgressData>('progress.json'),
        api.store.get<Question[]>('ai-questions.json'),
        api.store.get<Record<string, unknown>>('calc-state.json'),
      ]);
      const p = progress ?? EMPTY_PROGRESS;
      set({ index: bank.questions, settings, appInfo, progress: p, aiQuestions: aiQuestions ?? [], calcStates: calcStates ?? {}, ready: true });
      document.documentElement.dataset.theme = settings.theme;
    } catch (err) {
      set({ loadError: (err as Error).message, ready: true });
    }
  },

  nav(s) {
    set({ screen: s });
  },

  async getQuestion(id) {
    const { qCache, aiQuestions } = get();
    const c = qCache.get(id);
    if (c) return c;
    const ai = aiQuestions.find((q) => q.id === id);
    if (ai) return ai;
    const q = await api.bank.question(id);
    qCache.set(id, q);
    return q;
  },

  allIndex() {
    const { index, aiQuestions } = get();
    return aiQuestions.length ? [...index, ...aiQuestions.map(entryOf)] : index;
  },

  async updateSettings(p) {
    const settings = await api.settings.update(p);
    set({ settings });
    document.documentElement.dataset.theme = settings.theme;
  },

  async setSecret(name, v) {
    const settings = await api.settings.setSecret(name, v);
    set({ settings });
  },

  setCurrent(q, answer = null, answered = false) {
    set({ currentQuestion: q, currentAnswer: answer, currentAnswered: answered });
  },

  toggleChat(open) {
    set((s) => ({ chatOpen: open ?? !s.chatOpen }));
  },
  pushChat(m) {
    set((s) => ({ chatMessages: [...s.chatMessages, m] }));
  },
  clearChat() {
    set({ chatMessages: [] });
  },
  toggleCalc(open) {
    set((s) => ({ calcOpen: open ?? !s.calcOpen }));
  },
  setCalcWidth(w) {
    set({ calcWidth: Math.max(320, Math.min(900, w)) });
  },
  saveCalcState(id, st) {
    const calcStates = { ...get().calcStates, [id]: st };
    set({ calcStates });
    void api.store.set('calc-state.json', calcStates);
  },
  showToast(text, kind = 'info') {
    set({ toast: { text, kind } });
    setTimeout(() => set((s) => (s.toast?.text === text ? { toast: null } : {})), 4000);
  },

  async startSession(cfg, presetIds) {
    const { progress } = get();
    const levels = { ...progress.levels };
    const ids = presetIds ? presetIds.slice(0, cfg.count) : [pickQuestion(get(), cfg, levels, [])].filter(Boolean) as string[];
    if (!presetIds && cfg.difficultyMode !== 'adaptive') {
      // non-adaptive: pre-pick the whole session
      while (ids.length < cfg.count) {
        const next = pickQuestion(get(), cfg, levels, ids);
        if (!next) break;
        ids.push(next);
      }
    }
    if (!ids.length) {
      get().showToast('No questions match this selection.', 'error');
      return;
    }
    const session: ActiveSession = {
      id: 's' + Date.now().toString(36), startedAt: Date.now(), config: cfg, questionIds: ids, idx: 0, answers: {},
      questionStartedAt: Date.now(), finished: false, levels,
    };
    set({ session, screen: 'practice', lastSession: null });
  },

  sessionGoto(i) {
    const s = get().session;
    if (!s || i < 0 || i >= s.questionIds.length) return;
    set({ session: { ...s, idx: i, questionStartedAt: Date.now() } });
  },

  sessionSetAnswer(ans) {
    const s = get().session;
    if (!s) return;
    const id = s.questionIds[s.idx];
    const prev = s.answers[id] ?? { answer: null, submitted: false, correct: false, timeMs: 0, marked: false, at: 0 };
    if (prev.submitted) return;
    set({ session: { ...s, answers: { ...s.answers, [id]: { ...prev, answer: ans } } } });
  },

  async sessionSubmit() {
    const s = get().session;
    if (!s) return;
    const id = s.questionIds[s.idx];
    const q = await get().getQuestion(id);
    const prev = s.answers[id] ?? { answer: null, submitted: false, correct: false, timeMs: 0, marked: false, at: 0 };
    if (prev.submitted) return;
    const correct = checkAnswer(q, prev.answer);
    const timeMs = prev.timeMs + (Date.now() - s.questionStartedAt);
    const answers = { ...s.answers, [id]: { ...prev, submitted: true, correct, timeMs, at: Date.now() } };
    let levels = s.levels;
    if (s.config.difficultyMode === 'adaptive' && get().settings.adaptiveEnabled) {
      const recent = sessionAnswerRecords({ ...s, answers }, get()).filter((a) => a.skill === q.skill);
      const hist = get().progress.sessions.flatMap((ss) => ss.answers).filter((a) => a.skill === q.skill);
      levels = { ...levels, [q.skill]: nextDifficulty(levels[q.skill] ?? 'M', [...hist, ...recent]) };
    }
    set({ session: { ...s, answers, levels } });
  },

  sessionToggleMark() {
    const s = get().session;
    if (!s) return;
    const id = s.questionIds[s.idx];
    const prev = s.answers[id] ?? { answer: null, submitted: false, correct: false, timeMs: 0, marked: false, at: 0 };
    set({ session: { ...s, answers: { ...s.answers, [id]: { ...prev, marked: !prev.marked } } } });
  },

  async sessionNext() {
    const s = get().session;
    if (!s) return;
    if (s.idx + 1 < s.questionIds.length) {
      get().sessionGoto(s.idx + 1);
      return;
    }
    if (s.questionIds.length >= s.config.count) return;
    const next = pickQuestion(get(), s.config, s.levels, s.questionIds);
    if (!next) {
      get().showToast('No more questions match this selection.', 'info');
      return;
    }
    set({ session: { ...s, questionIds: [...s.questionIds, next], idx: s.idx + 1, questionStartedAt: Date.now() } });
  },

  async sessionEnd() {
    const s = get().session;
    if (!s) return null;
    const answers = sessionAnswerRecords(s, get());
    if (!answers.length) {
      set({ session: null, screen: 'practice' });
      return null;
    }
    const rec: SessionRecord = {
      id: s.id, startedAt: s.startedAt, endedAt: Date.now(), section: s.config.section, skills: s.config.skills,
      difficultyMode: s.config.difficultyMode, questionIds: s.questionIds.filter((id) => s.answers[id]?.submitted), answers,
    };
    const p = get().progress;
    const sessions = [...p.sessions, rec];
    const allAnswers = sessions.flatMap((x) => x.answers);
    const manual = Object.fromEntries(Object.entries(p.levels).filter(([k]) => k.startsWith('manual:')));
    const levels = { ...computeLevels(allAnswers), ...manual };
    // manual overrides are stored under "manual:<skill>" and win
    for (const [k, v] of Object.entries(manual)) levels[k.slice(7)] = v;
    const progress: ProgressData = { ...p, sessions, levels, streak: updateStreak(p.streak, Date.now()) };
    await api.store.set('progress.json', progress);
    set({ progress, session: null, lastSession: rec });
    return rec;
  },

  sessionDiscard() {
    set({ session: null });
  },

  async attachReview(sessionId, review) {
    const p = get().progress;
    const sessions = p.sessions.map((s) => (s.id === sessionId ? { ...s, review } : s));
    const progress = { ...p, sessions };
    await api.store.set('progress.json', progress);
    set({ progress, lastSession: sessions.find((s) => s.id === sessionId) ?? null });
  },

  async setLevel(skill, d) {
    const p = get().progress;
    const levels = { ...p.levels };
    if (d) {
      levels[skill] = d;
      levels['manual:' + skill] = d;
    } else {
      delete levels['manual:' + skill];
      const computed = computeLevels(p.sessions.flatMap((s) => s.answers));
      if (computed[skill]) levels[skill] = computed[skill];
      else delete levels[skill];
    }
    const progress = { ...p, levels };
    await api.store.set('progress.json', progress);
    set({ progress });
  },

  async toggleReviewFlag(id) {
    const p = get().progress;
    const flags = p.reviewFlags.includes(id) ? p.reviewFlags.filter((x) => x !== id) : [...p.reviewFlags, id];
    const progress = { ...p, reviewFlags: flags };
    await api.store.set('progress.json', progress);
    set({ progress });
  },

  async addAIQuestion(q) {
    const aiQuestions = [...get().aiQuestions, q];
    await api.store.set('ai-questions.json', aiQuestions);
    set({ aiQuestions });
  },

  async removeAIQuestion(id) {
    const aiQuestions = get().aiQuestions.filter((q) => q.id !== id);
    await api.store.set('ai-questions.json', aiQuestions);
    set({ aiQuestions });
  },

  async resetProgress() {
    await api.store.set('progress.json', EMPTY_PROGRESS);
    set({ progress: EMPTY_PROGRESS, lastSession: null });
  },
}));

// ---------- helpers ----------

export function sessionAnswerRecords(s: ActiveSession, st: Pick<State, 'index' | 'aiQuestions'>): AnswerRecord[] {
  const byId = new Map<string, QuestionIndexEntry>();
  for (const e of st.index) byId.set(e.id, e);
  for (const q of st.aiQuestions) byId.set(q.id, entryOf(q));
  const out: AnswerRecord[] = [];
  for (const id of s.questionIds) {
    const a = s.answers[id];
    const e = byId.get(id);
    if (!a?.submitted || !e) continue;
    out.push({
      questionId: id, section: e.section, domain: e.domain, skill: e.skill, difficulty: e.difficulty, type: e.type, source: e.source,
      answer: a.answer, correct: a.correct, timeMs: a.timeMs, marked: a.marked, at: a.at,
    });
  }
  return out;
}

/** Pick the next question id for a session, honoring skills, difficulty mode, adaptive levels and "unseen". */
export function pickQuestion(
  st: Pick<State, 'index' | 'aiQuestions' | 'progress'>,
  cfg: SessionConfig,
  levels: Record<string, Difficulty>,
  used: string[],
): string | null {
  const all = cfg.includeAI ? [...st.index, ...st.aiQuestions.map(entryOf)] : st.index;
  const seen = new Set<string>(cfg.onlyUnseen ? st.progress.sessions.flatMap((s) => s.questionIds) : []);
  const usedSet = new Set(used);
  const skills = cfg.skills.length ? cfg.skills : [...new Set(all.filter((e) => e.section === cfg.section).map((e) => e.skill))];
  // round-robin through skills by how many are already used
  const order = shuffle(skills, used.length * 7919 + 17);
  for (const skill of order) {
    const diff: Difficulty | undefined = cfg.difficultyMode === 'adaptive' ? (levels[skill] ?? 'M') : cfg.difficultyMode === 'mixed' ? undefined : cfg.difficultyMode;
    const tryDiffs: (Difficulty | undefined)[] = diff ? [diff, undefined] : [undefined];
    for (const d of tryDiffs) {
      let pool = filterQuestions(all, { section: cfg.section, skills: [skill], difficulties: d ? [d] : undefined, excludeIds: usedSet });
      const unseen = pool.filter((e) => !seen.has(e.id));
      if (unseen.length) pool = unseen;
      else if (cfg.onlyUnseen) continue;
      if (pool.length) return shuffle(pool, Date.now() + used.length)[0].id;
    }
  }
  return null;
}
