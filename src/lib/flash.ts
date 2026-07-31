import 'server-only';

import { cookies } from 'next/headers';
import { shouldUseSecureCookies } from '@/lib/env';

export const FLASH_COOKIE_NAME = 'nfrp_portfolio_flash';

export type FlashMessagePayload = {
  type: 'success' | 'info' | 'error';
  title: string;
  message?: string;
  createdAt: number;
};

type SetFlashMessageInput = Omit<FlashMessagePayload, 'createdAt'>;

export async function setFlashMessage(message: SetFlashMessageInput) {
  const cookieStore = await cookies();
  const payload: FlashMessagePayload = { ...message, createdAt: Date.now() };

  cookieStore.set(FLASH_COOKIE_NAME, encodeURIComponent(JSON.stringify(payload)), {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookies(),
    path: '/',
    maxAge: 60
  });
}

export async function getFlashMessage(): Promise<FlashMessagePayload | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(FLASH_COOKIE_NAME)?.value;
  if (!value) return null;

  try {
    const payload = JSON.parse(decodeURIComponent(value)) as Partial<FlashMessagePayload>;
    if (payload.type !== 'success' && payload.type !== 'info' && payload.type !== 'error') return null;
    if (!payload.title || typeof payload.title !== 'string') return null;

    return {
      type: payload.type,
      title: payload.title,
      message: typeof payload.message === 'string' ? payload.message : undefined,
      createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : Date.now()
    };
  } catch {
    return null;
  }
}
