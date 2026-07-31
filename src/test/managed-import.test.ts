import { describe, expect, it } from 'vitest';
import {
  consumeManagedImportEvents,
  MANAGED_IMPORT_ACCEPT,
  parseManagedImportEvent
} from '@/lib/managed-import';
import {
  createManagedImportStream,
  wantsManagedImportStream
} from '@/lib/managed-import-stream';

describe('managed import progress stream', () => {
  it('consumes complete SSE events and preserves an incomplete tail', () => {
    const first = 'data: {"type":"progress","message":"OCR in corso","elapsedSeconds":8}\n\n';
    const partial = 'data: {"type":"complete","redirectTo":"/maintenances/expenses/review"';
    const consumed = consumeManagedImportEvents(first + partial);

    expect(consumed.events).toEqual([
      { type: 'progress', message: 'OCR in corso', elapsedSeconds: 8 }
    ]);
    expect(consumed.remainder).toBe(partial);

    const completed = consumeManagedImportEvents(
      `${consumed.remainder},"notice":{"type":"info","title":"Completato"}}\n\n`
    );
    expect(completed.events).toEqual([
      {
        type: 'complete',
        redirectTo: '/maintenances/expenses/review',
        notice: { type: 'info', title: 'Completato' }
      }
    ]);
    expect(completed.remainder).toBe('');
  });

  it('rejects unsafe redirects and malformed events', () => {
    expect(parseManagedImportEvent('data: not-json')).toBeNull();
    expect(
      parseManagedImportEvent(
        'data: {"type":"complete","redirectTo":"https://example.com","notice":{"type":"info","title":"No"}}'
      )
    ).toBeNull();
  });

  it('sends heartbeats and a final completion event', async () => {
    const response = createManagedImportStream(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 18));
        return {
          redirectTo: '/maintenances/expenses/review',
          notice: {
            type: 'info' as const,
            title: 'Import manutenzioni completato',
            message: '9 documenti importati.'
          }
        };
      },
      { heartbeatMs: 5 }
    );

    expect(response.headers.get('content-type')).toContain(MANAGED_IMPORT_ACCEPT);
    expect(response.headers.get('x-accel-buffering')).toBe('no');

    const body = await response.text();
    const consumed = consumeManagedImportEvents(body);
    expect(consumed.events.filter((event) => event.type === 'progress').length).toBeGreaterThan(1);
    expect(consumed.events.at(-1)).toEqual({
      type: 'complete',
      redirectTo: '/maintenances/expenses/review',
      notice: {
        type: 'info',
        title: 'Import manutenzioni completato',
        message: '9 documenti importati.'
      }
    });
  });

  it('keeps failures inside the stream and recognizes the request header', async () => {
    const request = new Request('http://localhost/api/import', {
      headers: { Accept: `${MANAGED_IMPORT_ACCEPT}, */*` }
    });
    expect(wantsManagedImportStream(request)).toBe(true);

    const response = createManagedImportStream(
      async () => {
        throw new Error('PDF non leggibile');
      },
      { errorMessage: (error) => (error instanceof Error ? error.message : 'Errore') }
    );
    const consumed = consumeManagedImportEvents(await response.text());
    expect(consumed.events.at(-1)).toEqual({ type: 'error', message: 'PDF non leggibile' });
  });
});
