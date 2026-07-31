import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import {
  createAllReadyDocumentsFromInboxSuggestions,
  type InboxBulkValidationProgress
} from '@/lib/document-inbox';

export const dynamic = 'force-dynamic';

type StreamEvent =
  | ({ type: 'progress' } & InboxBulkValidationProgress)
  | ({ type: 'complete' } & InboxBulkValidationProgress)
  | { type: 'error'; message: string };

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Non autorizzato.' }, { status: 401 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      void (async () => {
        let lastProgress: InboxBulkValidationProgress = { imported: 0, processed: 0, skipped: 0, total: 0 };
        try {
          const result = await createAllReadyDocumentsFromInboxSuggestions({
            onProgress(progress) {
              lastProgress = progress;
              send({ type: 'progress', ...progress });
            }
          });
          revalidatePath('/documents/inbox');
          revalidatePath('/documents');
          revalidatePath('/documents/history');
          revalidatePath('/documents/disposed');
          revalidatePath('/dashboard');
          send({ type: 'complete', ...lastProgress, ...result });
        } catch (error) {
          send({
            type: 'error',
            message: error instanceof Error ? error.message : 'Validazione massiva non riuscita.'
          });
        } finally {
          controller.close();
        }
      })();
    }
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no'
    }
  });
}
