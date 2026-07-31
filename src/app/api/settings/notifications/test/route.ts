import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { sendTelegramTestNotification } from '@/lib/notification-test';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const result = await sendTelegramTestNotification();
  return NextResponse.json({ ok: result.success, error: result.error });
}
