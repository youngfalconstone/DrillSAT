import type { AIError, BankIndex, Question, Settings } from '@shared/types';
import type { CompletionRequest } from '@shared/ai';

export interface AppInfo {
  version: string;
  electron: string;
  chrome: string;
  wine: boolean;
  secureStorage: boolean;
  userData: string;
  packaged: boolean;
}

type CompleteResult = { ok: true; text: string; model: string } | { ok: false; error: AIError };

interface Api {
  bank: { index(): Promise<BankIndex>; question(id: string): Promise<Question> };
  settings: {
    get(): Promise<Settings>;
    update(patch: Partial<Settings>): Promise<Settings>;
    setSecret(name: 'llm' | 'desmos', value: string | null): Promise<Settings>;
    getDesmosKey(): Promise<string | null>;
  };
  store: { get<T>(name: string): Promise<T | null>; set(name: string, data: unknown): Promise<boolean> };
  ai: { complete(req: CompletionRequest): Promise<CompleteResult>; test(): Promise<{ ok: true; model: string; text: string } | { ok: false; error: AIError }> };
  app: { info(): Promise<AppInfo>; openExternal(url: string): Promise<void> };
}

declare global {
  interface Window {
    api: Api;
  }
}

export const api: Api = window.api;

export class AIRequestError extends Error implements AIError {
  code: AIError['code'];
  constructor(e: AIError) {
    super(e.message);
    this.code = e.code;
  }
}

/** Completer that goes through the main process; throws AIRequestError with a user-facing message. */
export async function complete(req: CompletionRequest): Promise<string> {
  if (!navigator.onLine) throw new AIRequestError({ code: 'network', message: 'You are offline. AI features need an internet connection; the question bank still works.' });
  const r = await api.ai.complete(req);
  if (!r.ok) throw new AIRequestError(r.error);
  return r.text;
}
