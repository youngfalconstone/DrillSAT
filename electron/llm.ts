import Anthropic from '@anthropic-ai/sdk';
import type { AIError, ChatMessage, LLMProvider } from '../src/shared/types';

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  usage?: { input: number; output: number };
}

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string | null;
  baseUrl?: string;
}

export const REQUEST_TIMEOUT_MS = 90_000;
export const MAX_RETRIES = 2;

export class LLMError extends Error implements AIError {
  code: AIError['code'];
  constructor(code: AIError['code'], message: string) {
    super(message);
    this.code = code;
  }
  toJSON(): AIError {
    return { code: this.code, message: this.message };
  }
}

const clients = new Map<string, Anthropic>();
function anthropicClient(apiKey: string): Anthropic {
  let c = clients.get(apiKey);
  if (!c) {
    c = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });
    clients.set(apiKey, c);
  }
  return c;
}

function mapAnthropicError(err: unknown): LLMError {
  if (err instanceof Anthropic.AuthenticationError) return new LLMError('auth', 'The LLM API key was rejected. Check it in Settings.');
  if (err instanceof Anthropic.PermissionDeniedError) return new LLMError('auth', 'This API key is not allowed to use the selected model.');
  if (err instanceof Anthropic.NotFoundError) return new LLMError('bad_response', 'The selected model was not found. Pick another model in Settings.');
  if (err instanceof Anthropic.RateLimitError) return new LLMError('rate_limit', 'Rate limited by the LLM provider. Wait a moment and try again.');
  if (err instanceof Anthropic.BadRequestError) return new LLMError('bad_response', `The provider rejected the request: ${err.message}`);
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new LLMError('timeout', 'The LLM request timed out. Check your connection and try again.');
  if (err instanceof Anthropic.APIConnectionError) return new LLMError('network', 'Could not reach the LLM provider. Are you online?');
  if (err instanceof Anthropic.APIError) return new LLMError('unknown', `LLM provider error ${err.status ?? ''}: ${err.message}`);
  return new LLMError('unknown', err instanceof Error ? err.message : String(err));
}

async function completeAnthropic(req: CompletionRequest, cfg: LLMConfig): Promise<CompletionResult> {
  const client = anthropicClient(cfg.apiKey!);
  try {
    const response = await client.messages.create({
      model: cfg.model,
      max_tokens: req.maxTokens ?? 8000,
      system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    if (response.stop_reason === 'refusal') {
      throw new LLMError('bad_response', 'The model declined to answer this request.');
    }
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return {
      text,
      model: response.model,
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    };
  } catch (err) {
    if (err instanceof LLMError) throw err;
    throw mapAnthropicError(err);
  }
}

async function completeOpenAI(req: CompletionRequest, cfg: LLMConfig): Promise<CompletionResult> {
  const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const body = {
    model: cfg.model,
    max_tokens: req.maxTokens ?? 8000,
    messages: [{ role: 'system', content: req.system }, ...req.messages.map((m) => ({ role: m.role, content: m.content }))],
  };
  let lastErr: LLMError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.status === 401 || res.status === 403) throw new LLMError('auth', 'The LLM API key was rejected. Check it in Settings.');
      if (res.status === 404) throw new LLMError('bad_response', 'Model or endpoint not found. Check the model name and base URL in Settings.');
      if (res.status === 429) {
        lastErr = new LLMError('rate_limit', 'Rate limited by the LLM provider. Wait a moment and try again.');
      } else if (res.status >= 500) {
        lastErr = new LLMError('unknown', `LLM provider error ${res.status}.`);
      } else if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new LLMError('bad_response', `The provider rejected the request (${res.status}): ${t.slice(0, 300)}`);
      } else {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; model?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        const text = data.choices?.[0]?.message?.content ?? '';
        return { text, model: data.model ?? cfg.model, usage: { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0 } };
      }
    } catch (err) {
      if (err instanceof LLMError && err.code !== 'rate_limit' && err.code !== 'unknown') throw err;
      if (err instanceof LLMError) lastErr = err;
      else if ((err as Error).name === 'AbortError') lastErr = new LLMError('timeout', 'The LLM request timed out. Check your connection and try again.');
      else lastErr = new LLMError('network', 'Could not reach the LLM provider. Are you online?');
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
  }
  throw lastErr ?? new LLMError('unknown', 'Unknown LLM error');
}

export async function complete(req: CompletionRequest, cfg: LLMConfig): Promise<CompletionResult> {
  if (!cfg.apiKey) throw new LLMError('no_key', 'No LLM API key is set. Add one in Settings to use AI features.');
  if (!cfg.model) throw new LLMError('bad_response', 'No model selected. Pick one in Settings.');
  return cfg.provider === 'anthropic' ? completeAnthropic(req, cfg) : completeOpenAI(req, cfg);
}
