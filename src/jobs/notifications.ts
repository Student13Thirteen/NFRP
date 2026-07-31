import parser from 'cron-parser';
import { prisma } from '@/lib/db';
import { getNumberEnv, getOptionalEnv } from '@/lib/env';
import { runExpirationNotificationJob } from '@/lib/notifications';

const once = process.argv.includes('--once');
const cronExpression = getOptionalEnv('NOTIFICATION_CRON', '0 8 * * *');
const notificationTimezone = getOptionalEnv('NOTIFICATION_TIMEZONE', 'Europe/Rome');
const failureRetries = getNumberEnv('NOTIFICATION_FAILURE_RETRIES', 3);
const retryDelayMs = getNumberEnv('NOTIFICATION_RETRY_DELAY_MINUTES', 10) * 60 * 1000;

async function runOnce() {
  const startedAt = new Date();
  console.log(`[notifications] starting at ${startedAt.toISOString()}`);
  const result = await runExpirationNotificationJob(startedAt);
  console.log(`[notifications] completed scanned=${result.scanned} sent=${result.sent} failed=${result.failed}`);
  return result;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function worker() {
  console.log(`[notifications] worker active with cron "${cronExpression}" timezone="${notificationTimezone}"`);

  while (true) {
    const interval = parser.parseExpression(cronExpression, { currentDate: new Date(), tz: notificationTimezone });
    const nextRun = interval.next().toDate();
    const delay = Math.max(1000, nextRun.getTime() - Date.now());
    console.log(`[notifications] next run at ${nextRun.toISOString()}`);
    await sleep(delay);

    try {
      let result = await runOnce();
      for (let attempt = 1; result.failed > 0 && attempt <= failureRetries; attempt += 1) {
        console.log(
          `[notifications] retry ${attempt}/${failureRetries} scheduled in ${Math.round(retryDelayMs / 60000)} minutes after ${result.failed} failure(s)`
        );
        await sleep(retryDelayMs);
        result = await runOnce();
      }
    } catch (error) {
      console.error('[notifications] job failed', error);
    }
  }
}

const shutdown = async () => {
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (once) {
  runOnce()
    .catch((error) => {
      console.error('[notifications] job failed', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
} else {
  worker().catch(async (error) => {
    console.error('[notifications] worker crashed', error);
    await prisma.$disconnect();
    process.exit(1);
  });
}
