export type Section = 'math' | 'rw';
export type Difficulty = 'E' | 'M' | 'H';
export type QuestionType = 'mcq' | 'spr';
export type Source = 'official' | 'ai';

/** Compact index record (data/bank/index.json). */
export interface QuestionIndexEntry {
  id: string;
  section: Section;
  domain: string;
  skill: string;
  difficulty: Difficulty;
  type: QuestionType;
  hasFigure?: boolean;
  hasTable?: boolean;
  text: string;
  preview: string;
  optionsText?: string[];
  page?: number;
  /** College Board Skills Insight performance score band 1-7 (official items only); see src/shared/score.ts */
  band?: number;
  source: Source;
  content: boolean;
}

export interface Option {
  id: string; // 'A' | 'B' | 'C' | 'D'
  html: string;
}

/** Full question content (data/bank/q/<id>.json, or an AI-generated question). */
export interface Question {
  id: string;
  section: Section;
  domain: string;
  skill: string;
  difficulty: Difficulty;
  type: QuestionType;
  source: Source;
  stimulus: string;
  stem: string;
  options?: Option[];
  correct?: string[];
  keys?: string[];
  rationale: string;
  /** AI questions: plain-text copy used for search / tutor context */
  text?: string;
  createdAt?: number;
}

export interface BankIndex {
  version: number;
  count: number;
  counts: Record<string, number>;
  questions: QuestionIndexEntry[];
}

export interface AnswerRecord {
  questionId: string;
  section: Section;
  domain: string;
  skill: string;
  difficulty: Difficulty;
  type: QuestionType;
  source: Source;
  answer: string | null; // letter or spr text; null = skipped
  correct: boolean;
  timeMs: number;
  marked: boolean;
  at: number; // epoch ms
}

export interface SessionRecord {
  id: string;
  startedAt: number;
  endedAt?: number;
  section: Section;
  skills: string[];
  difficultyMode: DifficultyMode;
  questionIds: string[];
  answers: AnswerRecord[];
  review?: AIReview;
  /** 'test' for a section of a full-length practice test, 'review' for a spaced-review session */
  kind?: 'practice' | 'test' | 'review';
}

export interface AIReview {
  summary: string;
  weakTopics: { skill: string; accuracy: number; note: string }[];
  mistakePatterns: string[];
  pacing: string;
  nextSession: { section: Section; skills: string[]; difficulty: Difficulty | 'mixed'; count: number; reason: string };
  generatedAt: number;
}

export interface ProgressData {
  version: number;
  sessions: SessionRecord[];
  /** adaptive level per skill */
  levels: Record<string, Difficulty>;
  streak: { current: number; best: number; lastDay: string | null };
  reviewFlags: string[]; // question ids marked for review
  /** spaced review of missed questions (src/shared/review.ts) */
  review?: Record<string, { id: string; box: number; due: number; added: number; lapses: number }>;
  /** finished full-length practice tests */
  tests?: TestRecord[];
}

export type ModuleLevel = 'base' | 'easier' | 'harder';

export interface TestModuleRecord {
  section: Section;
  no: 1 | 2;
  level: ModuleLevel;
  questionIds: string[];
  timeLimitMs: number;
  timeUsedMs: number;
}

export interface SectionScore {
  score: number;
  low: number;
  high: number;
  correct: number;
  total: number;
}

export interface TestRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  sections: Section[];
  modules: TestModuleRecord[];
  answers: AnswerRecord[];
  scores: Partial<Record<Section, SectionScore>>;
  total?: { score: number; low: number; high: number };
}

export type LLMProvider = 'anthropic' | 'openai';

export interface Settings {
  llmProvider: LLMProvider;
  llmModel: string;
  openaiBaseUrl: string;
  desmosEnabled: boolean;
  theme: 'light' | 'dark';
  timerEnabled: boolean;
  adaptiveEnabled: boolean;
  /** compare time per question with the real test pace */
  pacingFeedback: boolean;
  /** present when a key is stored; never contains the key itself */
  hasLlmKey: boolean;
  hasDesmosKey: boolean;
  secureStorage: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  llmProvider: 'anthropic',
  llmModel: 'claude-sonnet-5-5',
  openaiBaseUrl: 'https://api.openai.com/v1',
  desmosEnabled: true,
  theme: 'light',
  timerEnabled: true,
  adaptiveEnabled: true,
  pacingFeedback: true,
  hasLlmKey: false,
  hasDesmosKey: false,
  secureStorage: true,
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { E: 'Easy', M: 'Medium', H: 'Hard' };

/** How a practice session picks difficulty. 'hardest' = College Board's top score band (band 7). */
export type DifficultyMode = Difficulty | 'adaptive' | 'mixed' | 'hardest';

export function modeLabel(m: DifficultyMode): string {
  return m === 'adaptive' ? 'Adaptive' : m === 'mixed' ? 'Mixed' : m === 'hardest' ? 'Hardest' : DIFFICULTY_LABEL[m];
}
export const SECTION_LABEL: Record<Section, string> = { math: 'Math', rw: 'Reading and Writing' };

export const DOMAINS: Record<Section, string[]> = {
  math: ['Algebra', 'Advanced Math', 'Problem-Solving and Data Analysis', 'Geometry and Trigonometry'],
  rw: ['Information and Ideas', 'Craft and Structure', 'Expression of Ideas', 'Standard English Conventions'],
};

export interface AIError {
  code: 'no_key' | 'timeout' | 'network' | 'auth' | 'rate_limit' | 'bad_response' | 'validation' | 'unknown';
  message: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
