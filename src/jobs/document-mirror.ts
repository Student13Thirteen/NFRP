import { prisma } from '@/lib/db';
import {
  cleanupCompletedDocumentMirrorJobs,
  processNextDocumentMirrorJob,
  recoverInterruptedDocumentMirrorJobs
} from '@/lib/document-mirror-queue';

const IDLE_POLL_MS = 750;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
let stopping = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function worker() {
  const recovered = await recoverInterruptedDocumentMirrorJobs();
  const cleaned = await cleanupCompletedDocumentMirrorJobs();
  console.log(`[document-mirror] worker active recovered=${recovered} cleaned=${cleaned}`);

  let nextCleanupAt = Date.now() + CLEANUP_INTERVAL_MS;
  while (!stopping) {
    const processed = await processNextDocumentMirrorJob();
    if (Date.now() >= nextCleanupAt) {
      await cleanupCompletedDocumentMirrorJobs();
      nextCleanupAt = Date.now() + CLEANUP_INTERVAL_MS;
    }
    if (!processed) await sleep(IDLE_POLL_MS);
  }
}

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

worker()
  .catch((error) => {
    console.error('[document-mirror] worker crashed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
