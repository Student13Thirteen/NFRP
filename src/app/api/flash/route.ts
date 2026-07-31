import { NextResponse } from 'next/server';
import { FLASH_COOKIE_NAME } from '@/lib/flash';
import { shouldUseSecureCookies } from '@/lib/env';

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(FLASH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookies(),
    path: '/',
    maxAge: 0
  });
  return response;
}
