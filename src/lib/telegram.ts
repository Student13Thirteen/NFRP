import { getAppPublicUrl, getBooleanEnv, getNumberEnv, getOptionalEnv, getTelegramChatIds } from '@/lib/env';

export type TelegramSendResult = {
  chatId: string;
  ok: boolean;
  error?: string;
};

export function isTelegramConfigured() {
  return {
    enabled: getBooleanEnv('TELEGRAM_NOTIFICATIONS_ENABLED', true),
    hasToken: Boolean(getOptionalEnv('TELEGRAM_BOT_TOKEN')),
    chatIds: getTelegramChatIds()
  };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTelegramError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const cause = (error as Error & { cause?: unknown }).cause;
  if (!cause) return error.message;
  if (cause instanceof Error) return `${error.message}: ${cause.message}`;
  if (typeof cause === 'object') {
    const details = cause as { code?: unknown; message?: unknown };
    const code = typeof details.code === 'string' ? details.code : '';
    const message = typeof details.message === 'string' ? details.message : '';
    return [error.message, code, message].filter(Boolean).join(': ');
  }

  return `${error.message}: ${String(cause)}`;
}

export async function sendTelegramNotification(message: string): Promise<TelegramSendResult[]> {
  const token = getOptionalEnv('TELEGRAM_BOT_TOKEN');
  const chatIds = getTelegramChatIds();
  const enabled = getBooleanEnv('TELEGRAM_NOTIFICATIONS_ENABLED', true);
  const attempts = Math.max(1, getNumberEnv('TELEGRAM_SEND_ATTEMPTS', 4));
  const timeoutMs = getNumberEnv('TELEGRAM_SEND_TIMEOUT_MS', 15000);
  const retryDelayMs = getNumberEnv('TELEGRAM_SEND_RETRY_DELAY_MS', 3000);

  if (!enabled) {
    return chatIds.map((chatId) => ({ chatId, ok: false, error: 'Telegram disattivato' }));
  }
  if (!token || chatIds.length === 0) {
    return [{ chatId: '', ok: false, error: 'TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_IDS non configurati' }];
  }

  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;
  const results: TelegramSendResult[] = [];

  for (const chatId of chatIds) {
    let sent = false;
    let lastError = '';

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            disable_web_page_preview: true
          })
        });

        if (response.ok) {
          results.push({ chatId, ok: true });
          sent = true;
          break;
        }

        const body = await response.text();
        lastError = `HTTP ${response.status}: ${body.slice(0, 300)}`;
      } catch (error) {
        lastError = formatTelegramError(error);
      } finally {
        clearTimeout(timeout);
      }

      if (attempt < attempts) {
        await sleep(retryDelayMs * attempt);
      }
    }

    if (!sent) {
      results.push({ chatId, ok: false, error: `${lastError || 'invio fallito'} dopo ${attempts} tentativi` });
    }
  }

  return results;
}

export function buildDocumentUrl(documentId: string): string {
  return `${getAppPublicUrl()}/documents/${documentId}`;
}
