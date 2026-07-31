import 'server-only';

import {
  assistantPlanJsonSchema,
  buildAssistantPlannerMessages,
  parseAssistantPlanContent,
  type AssistantConversationMessage
} from '@/lib/assistant-planner';
import { getOllamaBaseUrl, getOllamaModel } from '@/lib/env';

type OllamaChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  error?: string;
};

export class OllamaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaUnavailableError';
  }
}

export class OllamaTimeoutError extends OllamaUnavailableError {
  constructor(
    message: string,
    public readonly model: string
  ) {
    super(message);
    this.name = 'OllamaTimeoutError';
  }
}

export class OllamaModelUnavailableError extends Error {
  constructor(
    message: string,
    public readonly model: string
  ) {
    super(message);
    this.name = 'OllamaModelUnavailableError';
  }
}

function isModelMissing(status: number, errorText: string): boolean {
  return status === 404 || /model.+not found|pull model|not found/i.test(errorText);
}

async function callOllamaChat(model: string, messages: readonly OllamaChatMessage[], signal: AbortSignal): Promise<string> {
  const response = await fetch(`${getOllamaBaseUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      think: false,
      keep_alive: '10m',
      format: assistantPlanJsonSchema,
      options: {
        temperature: 0,
        top_k: 1,
        top_p: 0.1,
        num_ctx: 2048,
        num_predict: 140
      }
    }),
    signal
  });

  const text = await response.text();
  let payload: OllamaChatResponse | null = null;

  try {
    payload = text ? (JSON.parse(text) as OllamaChatResponse) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error || text || `Ollama ha risposto con HTTP ${response.status}.`;
    if (isModelMissing(response.status, message)) throw new OllamaModelUnavailableError(message, model);
    throw new OllamaUnavailableError(message);
  }

  const content = payload?.message?.content;
  if (!content) throw new OllamaUnavailableError('Ollama non ha restituito contenuto utilizzabile.');
  return content;
}

async function callOllamaChatWithTimeout(model: string, messages: readonly OllamaChatMessage[], timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await callOllamaChat(model, messages, controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new OllamaTimeoutError(`Il modello ${model} non ha risposto entro il tempo previsto.`, model);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// L'LLM e' solo la rete di sicurezza per le domande ambigue che le regole locali
// non sanno instradare: e' raro e fuori dal percorso critico, quindi qui si usa un
// modello piccolo (vedi OLLAMA_MODEL) con un timeout generoso che gli lascia il
// tempo di rispondere su hardware modesto, senza fallback verso modelli grandi che
// su questa macchina non girerebbero comunque.
export async function planWithOllama(message: string, history: AssistantConversationMessage[] = []) {
  const messages = buildAssistantPlannerMessages(message, history);
  const configuredModel = getOllamaModel();
  const timeoutMs = 25_000;

  const content = await callOllamaChatWithTimeout(configuredModel, messages, timeoutMs);
  return { plan: parseAssistantPlanContent(content), model: configuredModel };
}
