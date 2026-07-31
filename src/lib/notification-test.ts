import { NotificationChannel, NotificationType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getAppPublicUrl } from '@/lib/env';
import { sendTelegramNotification } from '@/lib/telegram';

export async function sendTelegramTestNotification() {
  const message = [
    '✅ Test notifiche archivio documenti',
    '',
    'Se ricevi questo messaggio, il bot Telegram è configurato correttamente.',
    getAppPublicUrl()
  ].join('\n');

  const results = await sendTelegramNotification(message);
  const success = results.some((result) => result.ok);
  const error = results
    .filter((result) => !result.ok)
    .map((result) => `${result.chatId || 'config'}: ${result.error}`)
    .join(' | ');

  await prisma.notificationLog.create({
    data: {
      type: NotificationType.TEST,
      channel: NotificationChannel.TELEGRAM,
      success,
      error: error || null
    }
  });

  return { success, error: error || null, results };
}
