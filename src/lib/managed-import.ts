export const MANAGED_IMPORT_ACCEPT = 'text/event-stream';
export const MANAGED_IMPORT_NOTICE_KEY = 'nfrp-managed-import-notice';

export type ManagedImportNotice = {
  type: 'success' | 'info' | 'error';
  title: string;
  message?: string;
};

export type ManagedImportStreamEvent =
  | { type: 'progress'; message: string; elapsedSeconds: number }
  | { type: 'complete'; redirectTo: string; notice: ManagedImportNotice }
  | { type: 'error'; message: string };

function isNotice(value: unknown): value is ManagedImportNotice {
  if (!value || typeof value !== 'object') return false;
  const notice = value as Partial<ManagedImportNotice>;
  return (
    (notice.type === 'success' || notice.type === 'info' || notice.type === 'error') &&
    typeof notice.title === 'string' &&
    (notice.message === undefined || typeof notice.message === 'string')
  );
}

export function parseManagedImportEvent(value: string): ManagedImportStreamEvent | null {
  const data = value
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!data) return null;

  try {
    const parsed = JSON.parse(data) as Partial<ManagedImportStreamEvent>;
    if (
      parsed.type === 'progress' &&
      typeof parsed.message === 'string' &&
      typeof parsed.elapsedSeconds === 'number'
    ) {
      return {
        type: 'progress',
        message: parsed.message,
        elapsedSeconds: parsed.elapsedSeconds
      };
    }
    if (
      parsed.type === 'complete' &&
      typeof parsed.redirectTo === 'string' &&
      parsed.redirectTo.startsWith('/') &&
      isNotice(parsed.notice)
    ) {
      return {
        type: 'complete',
        redirectTo: parsed.redirectTo,
        notice: parsed.notice
      };
    }
    if (parsed.type === 'error' && typeof parsed.message === 'string') {
      return { type: 'error', message: parsed.message };
    }
  } catch {
    return null;
  }

  return null;
}

export function consumeManagedImportEvents(buffer: string): {
  events: ManagedImportStreamEvent[];
  remainder: string;
} {
  const events: ManagedImportStreamEvent[] = [];
  let remainder = buffer;

  while (true) {
    const boundary = remainder.search(/\r?\n\r?\n/);
    if (boundary < 0) break;
    const match = remainder.slice(boundary).match(/^\r?\n\r?\n/);
    if (!match) break;

    const parsed = parseManagedImportEvent(remainder.slice(0, boundary));
    if (parsed) events.push(parsed);
    remainder = remainder.slice(boundary + match[0].length);
  }

  return { events, remainder };
}
