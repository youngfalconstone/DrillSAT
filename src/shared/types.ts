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
  difficultyMode: Difficulty | 'adaptive' | 'mixed';
  questionIds: string[];
  answers: AnswerRecord[];
  review?: AIReview;
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
  hasLlmKey: false,
  hasDesmosKey: false,
  secureStorage: true,
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { E: 'Easy', M: 'Medium', H: 'Hard' };
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
