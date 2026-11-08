import { create } from 'zustand';
import { normalizeSkill } from '@shared/topics';
import { api, type AppInfo } from './api';
import type {
  AnswerRecord, ChatMessage, Difficulty, ProgressData, Question, QuestionIndexEntry, Section, SectionScore, SessionRecord, Settings,
  TestModuleRecord, TestRecord,
} from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';
import { checkAnswer } from '@shared/answerCheck';
import { computeLevels, nextDifficulty, updateStreak } from '@shared/adaptive';
import { filterQuestions, shuffle } from '@shared/search';
import { applyAnswers } from '@shared/review';
import { combineTotal, estimateFromAnswers } from '@shared/score';
import { assembleModule, BREAK_MINUTES, MODULE_SPEC, routeModule2, seededRng } from '@shared/testForm';

export type Screen = 'home' | 'bank' | 'practice' | 'tests' | 'performance' | 'study' | 'settings' | 'help';

export interface SessionConfig {
  section: Section;
  skills: string[]; // empty = all skills of the section
  difficultyMode: Difficulty | 'adaptive' | 'mixed';
  count: number;
  includeAI: boolean;
  onlyUnseen: boolean;
  /** 'review' = spaced review of missed questions */
  kind?: 'practice' | 'review';
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

export interface TestAnswerState {
  answer: string | null;
  marked: boolean;
  timeMs: number;
}

/** A full-length practice test in progress. Saved to active-test.json after every change, so it can resume. */
export interface ActiveTest {
  id: string;
  startedAt: number;
  sections: Section[];
  modules: TestModuleRecord[]; // finished modules plus the current one (last)
  phase: 'module' | 'review' | 'break';
  idx: number;
  answers: Record<string, TestAnswerState>;
  remainingMs: number; // time left in the module or break, measured at clockAt
  clockAt: number;
  questionStartedAt: number;
  used: string[];
  annotations?: { eliminated: Record<string, string[]>; highlights: Record<string, [number, number][]> };
}

export function testRemaining(t: ActiveTest, now: number): number {
  return Math.max(0, t.remainingMs - (now - t.clockAt));
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
  // answer tools (per question, kept for the app run; saved with a test in progress)
  eliminated: Record<string, string[]>;
  highlights: Record<string, [number, number][]>;
  /** answer-tool modes, kept while moving between questions */
  tools: { eliminate: boolean; highlight: boolean };
  setTools(p: Partial<{ eliminate: boolean; highlight: boolean }>): void;
  // full-length practice tests
  test: ActiveTest | null;
  lastTest: TestRecord | null;

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
  toggleEliminated(id: string, letter: string): void;
  setHighlights(id: string, ranges: [number, number][]): void;
  startTest(sections: Section[]): Promise<void>;
  testGoto(i: number): void;
  testSetAnswer(a: string | null): void;
  testToggleMark(): void;
  testShowReview(): void;
  testSubmitModule(): Promise<void>;
  testEndBreak(): Promise<void>;
  testAbandon(): Promise<void>;
  openTestResult(t: TestRecord | null): void;
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
  eliminated: {},
  highlights: {},
  tools: { eliminate: false, highlight: false },
  setTools(p) {
    set({ tools: { ...get().tools, ...p } });
  },
  test: null,
  lastTest: null,

  async init() {
    try {
      const [bank, settings, appInfo, progress, aiQuestions, calcStates, savedTest] = await Promise.all([
        api.bank.index(),
        api.settings.get(),
        api.app.info(),
        api.store.get<ProgressData>('progress.json'),
        api.store.get<Question[]>('ai-questions.json'),
        api.store.get<Record<string, unknown>>('calc-state.json'),
        api.store.get<ActiveTest>('active-test.json'),
      ]);
      const p = progress ?? EMPTY_PROGRESS;
      const indexEntries = bank.questions.map((e) => (e.skill === normalizeSkill(e.skill) ? e : { ...e, skill: normalizeSkill(e.skill) }));
      const now = Date.now();
      const test = savedTest && savedTest.id ? { ...savedTest, clockAt: now, questionStartedAt: now } : null;
      set({
        index: indexEntries, settings, appInfo, progress: p, aiQuestions: aiQuestions ?? [], calcStates: calcStates ?? {}, test,
        eliminated: test?.annotations?.eliminated ?? {}, highlights: test?.annotations?.highlights ?? {}, ready: true,
      });
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
    q.skill = normalizeSkill(q.skill);
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
      kind: s.config.kind ?? 'practice',
    };
    const p = get().progress;
    const sessions = [...p.sessions, rec];
    const allAnswers = sessions.flatMap((x) => x.answers);
    const manual = Object.fromEntries(Object.entries(p.levels).filter(([k]) => k.startsWith('manual:')));
    const levels = { ...computeLevels(allAnswers), ...manual };
    // manual overrides are stored under "manual:<skill>" and win
    for (const [k, v] of Object.entries(manual)) levels[k.slice(7)] = v;
    const progress: ProgressData = {
      ...p, sessions, levels, streak: updateStreak(p.streak, Date.now()), review: applyAnswers(p.review ?? {}, answers),
    };
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
    set({ progress: EMPTY_PROGRESS, lastSession: null, lastTest: null });
  },

  toggleEliminated(id, letter) {
    const cur = get().eliminated[id] ?? [];
    const next = cur.includes(letter) ? cur.filter((x) => x !== letter) : [...cur, letter];
    set({ eliminated: { ...get().eliminated, [id]: next } });
    if (get().test) void saveTest(get());
  },
  setHighlights(id, ranges) {
    set({ highlights: { ...get().highlights, [id]: ranges } });
    if (get().test) void saveTest(get());
  },

  // ---------- full-length practice tests ----------

  async startTest(sections) {
    const st = get();
    const seen = new Set(st.progress.sessions.flatMap((x) => x.questionIds));
    const used = new Set<string>();
    const section = sections[0];
    const ids = assembleModule(st.index, section, 1, 'base', used, seen, seededRng(Date.now()));
    const now = Date.now();
    const limit = MODULE_SPEC[section].minutes * 60000;
    const test: ActiveTest = {
      id: 't' + now.toString(36), startedAt: now, sections,
      modules: [{ section, no: 1, level: 'base', questionIds: ids, timeLimitMs: limit, timeUsedMs: 0 }],
      phase: 'module', idx: 0, answers: {}, remainingMs: limit, clockAt: now, questionStartedAt: now, used: [...used],
    };
    set({ test, lastTest: null, eliminated: {}, highlights: {}, screen: 'tests' });
    await saveTest(get());
  },

  testGoto(i) {
    const t = get().test;
    if (!t) return;
    const mod = t.modules[t.modules.length - 1];
    if (i < 0 || i >= mod.questionIds.length) return;
    set({ test: { ...withQuestionTime(t, Date.now()), idx: i, phase: 'module' } });
    void saveTest(get());
  },

  testSetAnswer(a) {
    const t = get().test;
    if (!t || t.phase !== 'module') return;
    const id = t.modules[t.modules.length - 1].questionIds[t.idx];
    const prev = t.answers[id] ?? { answer: null, marked: false, timeMs: 0 };
    set({ test: { ...t, answers: { ...t.answers, [id]: { ...prev, answer: a } } } });
    // choosing an answer un-eliminates it, as in Bluebook
    const el = get().eliminated[id];
    if (a && el?.includes(a)) set({ eliminated: { ...get().eliminated, [id]: el.filter((x) => x !== a) } });
    void saveTest(get());
  },

  testToggleMark() {
    const t = get().test;
    if (!t) return;
    const id = t.modules[t.modules.length - 1].questionIds[t.idx];
    const prev = t.answers[id] ?? { answer: null, marked: false, timeMs: 0 };
    set({ test: { ...t, answers: { ...t.answers, [id]: { ...prev, marked: !prev.marked } } } });
    void saveTest(get());
  },

  testShowReview() {
    const t = get().test;
    if (!t) return;
    set({ test: { ...withQuestionTime(t, Date.now()), phase: 'review' } });
    void saveTest(get());
  },

  async testSubmitModule() {
    const st = get();
    let t = st.test;
    if (!t || t.phase === 'break') return;
    const now = Date.now();
    t = withQuestionTime(t, now);
    const mods = [...t.modules];
    const cur = { ...mods[mods.length - 1] };
    cur.timeUsedMs = Math.min(cur.timeLimitMs, cur.timeLimitMs - testRemaining(t, now));
    mods[mods.length - 1] = cur;
    const used = new Set(t.used);
    for (const id of cur.questionIds) used.add(id);
    if (cur.no === 1) {
      // route module 2 from module 1 performance, with the same score model as the results
      const scored = await Promise.all(cur.questionIds.map(async (id) => {
        const q = await st.getQuestion(id);
        const e = st.index.find((x) => x.id === id);
        return { band: e?.band ?? 4, type: q.type, correct: checkAnswer(q, t!.answers[id]?.answer ?? null) };
      }));
      const level = routeModule2(cur.section, scored);
      const seen = new Set(st.progress.sessions.flatMap((x) => x.questionIds));
      const ids = assembleModule(st.index, cur.section, 2, level, used, seen, seededRng(now));
      const limit = MODULE_SPEC[cur.section].minutes * 60000;
      mods.push({ section: cur.section, no: 2, level, questionIds: ids, timeLimitMs: limit, timeUsedMs: 0 });
      set({ test: { ...t, modules: mods, phase: 'module', idx: 0, remainingMs: limit, clockAt: now, questionStartedAt: now, used: [...used] } });
      await saveTest(get());
      return;
    }
    const next = t.sections[t.sections.indexOf(cur.section) + 1];
    if (next) {
      set({ test: { ...t, modules: mods, phase: 'break', idx: 0, remainingMs: BREAK_MINUTES * 60000, clockAt: now, used: [...used] } });
      await saveTest(get());
      return;
    }
    await finishTest({ ...t, modules: mods });
  },

  async testEndBreak() {
    const st = get();
    const t = st.test;
    if (!t || t.phase !== 'break') return;
    const done = t.modules[t.modules.length - 1].section;
    const section = t.sections[t.sections.indexOf(done) + 1];
    const used = new Set(t.used);
    const seen = new Set(st.progress.sessions.flatMap((x) => x.questionIds));
    const ids = assembleModule(st.index, section, 1, 'base', used, seen, seededRng(Date.now()));
    const now = Date.now();
    const limit = MODULE_SPEC[section].minutes * 60000;
    set({ test: { ...t, modules: [...t.modules, { section, no: 1, level: 'base', questionIds: ids, timeLimitMs: limit, timeUsedMs: 0 }], phase: 'module', idx: 0, remainingMs: limit, clockAt: now, questionStartedAt: now, used: [...used] } });
    await saveTest(get());
  },

  async testAbandon() {
    set({ test: null, eliminated: {}, highlights: {} });
    await api.store.set('active-test.json', null);
  },

  openTestResult(t) {
    set({ lastTest: t, screen: 'tests' });
  },
}));

/** Add the time spent on the current test question since it was shown. */
function withQuestionTime(t: ActiveTest, now: number): ActiveTest {
  if (t.phase !== 'module') return { ...t, questionStartedAt: now };
  const mod = t.modules[t.modules.length - 1];
  const id = mod.questionIds[t.idx];
  if (!id) return t;
  const prev = t.answers[id] ?? { answer: null, marked: false, timeMs: 0 };
  return { ...t, answers: { ...t.answers, [id]: { ...prev, timeMs: prev.timeMs + Math.max(0, now - t.questionStartedAt) } }, questionStartedAt: now };
}

async function saveTest(st: Pick<State, 'test' | 'eliminated' | 'highlights'>) {
  const t = st.test;
  if (!t) return;
  const now = Date.now();
  const ids = new Set(t.modules.flatMap((m) => m.questionIds));
  const pick = <T,>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).filter(([k]) => ids.has(k)));
  // snapshot the clock so a restart resumes with the time that was left
  const snap: ActiveTest = { ...t, remainingMs: testRemaining(t, now), clockAt: now, annotations: { eliminated: pick(st.eliminated), highlights: pick(st.highlights) } };
  await api.store.set('active-test.json', snap);
}

/** Score the test, save it to progress (tests, per-section sessions, levels, streak, spaced review). */
async function finishTest(t: ActiveTest) {
  const st = useStore.getState();
  const endedAt = Date.now();
  const byId = new Map(st.index.map((e) => [e.id, e]));
  const answers: AnswerRecord[] = [];
  for (const m of t.modules) {
    for (const id of m.questionIds) {
      const q = await st.getQuestion(id);
      const a = t.answers[id];
      answers.push({
        questionId: id, section: m.section, domain: q.domain, skill: q.skill, difficulty: q.difficulty, type: q.type, source: 'official',
        answer: a?.answer ?? null, correct: checkAnswer(q, a?.answer ?? null), timeMs: a?.timeMs ?? 0, marked: !!a?.marked, at: endedAt,
      });
    }
  }
  const scores: Partial<Record<Section, SectionScore>> = {};
  const est: Partial<Record<Section, ReturnType<typeof estimateFromAnswers>>> = {};
  for (const section of t.sections) {
    const list = answers.filter((a) => a.section === section);
    const e = estimateFromAnswers(section, list.map((a) => ({ band: byId.get(a.questionId)?.band ?? 4, type: a.type, correct: a.correct })));
    est[section] = e;
    scores[section] = { score: e.score, low: e.low, high: e.high, correct: list.filter((a) => a.correct).length, total: list.length };
  }
  const total = est.rw && est.math ? combineTotal(est.rw, est.math) : undefined;
  const rec: TestRecord = { id: t.id, startedAt: t.startedAt, endedAt, sections: t.sections, modules: t.modules, answers, scores, total };

  const p = st.progress;
  const sectionSessions: SessionRecord[] = t.sections.map((section) => {
    const list = answers.filter((a) => a.section === section);
    return {
      id: `${t.id}-${section}`, startedAt: t.startedAt, endedAt, section, skills: [], difficultyMode: 'mixed',
      questionIds: list.map((a) => a.questionId), answers: list, kind: 'test',
    };
  });
  const sessions = [...p.sessions, ...sectionSessions];
  const manual = Object.fromEntries(Object.entries(p.levels).filter(([k]) => k.startsWith('manual:')));
  const levels = { ...computeLevels(sessions.flatMap((x) => x.answers)), ...manual };
  for (const [k, v] of Object.entries(manual)) levels[k.slice(7)] = v;
  const progress: ProgressData = {
    ...p, sessions, levels, streak: updateStreak(p.streak, endedAt), review: applyAnswers(p.review ?? {}, answers), tests: [...(p.tests ?? []), rec],
  };
  await api.store.set('progress.json', progress);
  await api.store.set('active-test.json', null);
  useStore.setState({ progress, test: null, lastTest: rec, eliminated: {}, highlights: {} });
}

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
