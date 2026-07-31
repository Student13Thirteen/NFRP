import 'server-only';

import {
  MANAGED_IMPORT_ACCEPT,
  type ManagedImportNotice,
  type ManagedImportStreamEvent
} from '@/lib/managed-import';

export type ManagedImportCompletion = {
  redirectTo: string;
  notice: ManagedImportNotice;
};

type ManagedImportStreamOptions = {
  initialMessage?: string;
  heartbeatMs?: number;
  errorMessage?: (error: unknown) => string;
};

export function wantsManagedImportStream(request: Request): boolean {
  return request.headers.get('accept')?.includes(MANAGED_IMPORT_ACCEPT) ?? false;
}

export function createManagedImportStream(
  run: () => Promise<ManagedImportCompletion>,
  options: ManagedImportStreamOptions = {}
): Response {
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const heartbeatMs = options.heartbeatMs ?? 8_000;
  const initialMessage = options.initialMessage ?? 'PDF ricevuti. Avvio lettura e controlli automatici.';
  let open = true;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ManagedImportStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
          if (heartbeat) clearInterval(heartbeat);
        }
      };

      send({ type: 'progress', message: initialMessage, elapsedSeconds: 0 });
      heartbeat = setInterval(() => {
        const elapsedSeconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
        send({
          type: 'progress',
          message: 'OCR locale ancora in corso: non chiudere questa pagina.',
          elapsedSeconds
        });
      }, heartbeatMs);

      void run()
        .then((result) => {
          send({ type: 'complete', ...result });
        })
        .catch((error: unknown) => {
          send({
            type: 'error',
            message: options.errorMessage?.(error) ??
              (error instanceof Error ? error.message : 'Importazione non riuscita.')
          });
        })
        .finally(() => {
          if (heartbeat) clearInterval(heartbeat);
          if (!open) return;
          open = false;
          controller.close();
        });
    },
    cancel() {
      open = false;
      if (heartbeat) clearInterval(heartbeat);
      // Il lavoro gia avviato continua: gli importer sono idempotenti e il
      // client invita a controllare la revisione prima di un eventuale reinvio.
    }
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': `${MANAGED_IMPORT_ACCEPT}; charset=utf-8`,
      'X-Accel-Buffering': 'no'
    }
  });
}
