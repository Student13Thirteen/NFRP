import 'server-only';

import {
  DocumentMirrorJobStatus,
  type DocumentMirrorJob,
  type Prisma
} from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  executeQueuedDocumentMirrorOperation,
  getDocumentMirrorRemotePath,
  type MirrorDocument
} from '@/lib/document-mirror';
import { getDocumentMirrorEnabled } from '@/lib/env';

type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

export type MirrorSyncRequest = {
  documentId: string;
  previousDocument?: MirrorDocument | null;
  uploadRequired?: boolean;
};

function previousRemotePath(document?: MirrorDocument | null): string | null {
  return document?.filePath ? getDocumentMirrorRemotePath(document) : null;
}

export async function enqueueDocumentMirrorSyncs(
  client: PrismaClientOrTx,
  requests: MirrorSyncRequest[]
): Promise<number> {
  if (!getDocumentMirrorEnabled() || requests.length === 0) return 0;

  const result = await client.documentMirrorJob.createMany({
    data: requests.map((request) => ({
      documentId: request.documentId,
      operation: 'SYNC',
      previousRemotePath: previousRemotePath(request.previousDocument),
      uploadRequired: request.uploadRequired ?? true
    }))
  });
  return result.count;
}

export async function enqueueDocumentMirrorSync(
  client: PrismaClientOrTx,
  request: MirrorSyncRequest
): Promise<void> {
  await enqueueDocumentMirrorSyncs(client, [request]);
}

export async function enqueueDocumentMirrorDelete(
  client: PrismaClientOrTx,
  document: MirrorDocument
): Promise<void> {
  if (!getDocumentMirrorEnabled() || !document.filePath) return;
  await client.documentMirrorJob.create({
    data: {
      documentId: document.id,
      operation: 'DELETE',
      previousRemotePath: getDocumentMirrorRemotePath(document),
      uploadRequired: false
    }
  });
}

const STALE_PROCESSING_MS = 10 * 60 * 1000;
const LONG_RETRY_MS = 6 * 60 * 60 * 1000;

function claimableWhere(now: Date): Prisma.DocumentMirrorJobWhereInput {
  return {
    OR: [
      {
        status: { in: [DocumentMirrorJobStatus.PENDING, DocumentMirrorJobStatus.FAILED] },
        availableAt: { lte: now }
      },
      {
        status: DocumentMirrorJobStatus.PROCESSING,
        lockedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) }
      }
    ]
  };
}

async function claimNextDocumentMirrorJob(): Promise<DocumentMirrorJob | null> {
  const now = new Date();
  const where = claimableWhere(now);
  const candidate = await prisma.documentMirrorJob.findFirst({
    where,
    orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }]
  });
  if (!candidate) return null;

  const claimed = await prisma.documentMirrorJob.updateMany({
    where: { id: candidate.id, ...where },
    data: {
      status: DocumentMirrorJobStatus.PROCESSING,
      lockedAt: now,
      attempts: { increment: 1 },
      lastError: null
    }
  });
  if (claimed.count === 0) return null;
  return prisma.documentMirrorJob.findUnique({ where: { id: candidate.id } });
}

function retryDelayMs(attempts: number): number {
  if (attempts >= 7) return LONG_RETRY_MS;
  return Math.min(2 ** Math.max(1, attempts) * 1000, 5 * 60 * 1000);
}

export async function processNextDocumentMirrorJob(): Promise<boolean> {
  const job = await claimNextDocumentMirrorJob();
  if (!job) return false;

  try {
    await executeQueuedDocumentMirrorOperation({
      documentId: job.documentId,
      operation: job.operation,
      previousRemotePath: job.previousRemotePath,
      uploadRequired: job.uploadRequired
    });
    await prisma.documentMirrorJob.update({
      where: { id: job.id },
      data: {
        status: DocumentMirrorJobStatus.COMPLETED,
        completedAt: new Date(),
        lockedAt: null,
        lastError: null
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const terminalBackoff = job.attempts >= 7;
    await prisma.documentMirrorJob.update({
      where: { id: job.id },
      data: {
        status: terminalBackoff ? DocumentMirrorJobStatus.FAILED : DocumentMirrorJobStatus.PENDING,
        availableAt: new Date(Date.now() + retryDelayMs(job.attempts)),
        lockedAt: null,
        lastError: message.slice(0, 4000)
      }
    });
    console.error('[document-mirror] job failed', {
      jobId: job.id,
      documentId: job.documentId,
      attempt: job.attempts,
      retryMode: terminalBackoff ? 'long' : 'quick',
      error: message
    });
  }

  return true;
}

export async function recoverInterruptedDocumentMirrorJobs(): Promise<number> {
  const result = await prisma.documentMirrorJob.updateMany({
    where: { status: DocumentMirrorJobStatus.PROCESSING },
    data: {
      status: DocumentMirrorJobStatus.PENDING,
      availableAt: new Date(),
      lockedAt: null,
      lastError: 'Worker riavviato durante la sincronizzazione: job recuperato automaticamente.'
    }
  });
  return result.count;
}

export async function cleanupCompletedDocumentMirrorJobs(): Promise<number> {
  const retentionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.documentMirrorJob.deleteMany({
    where: {
      status: DocumentMirrorJobStatus.COMPLETED,
      completedAt: { lt: retentionCutoff }
    }
  });
  return result.count;
}
