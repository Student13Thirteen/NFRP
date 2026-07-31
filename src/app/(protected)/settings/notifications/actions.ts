'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { setFlashMessage } from '@/lib/flash';
import { sendTelegramTestNotification } from '@/lib/notification-test';

export async function testTelegramAction() {
  await requireUser();
  const result = await sendTelegramTestNotification();
  revalidatePath('/settings/notifications');
  await setFlashMessage(
    result.success
      ? {
          type: 'success',
          title: 'Notifica inviata',
          message: 'Il test Telegram e stato completato correttamente.'
        }
      : {
          type: 'error',
          title: 'Invio non riuscito',
          message: result.error || 'Controlla la configurazione Telegram.'
        }
  );
}
