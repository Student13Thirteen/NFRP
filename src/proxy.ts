import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthSecret,
  SESSION_COOKIE_NAME,
  verifySessionToken
} from '@/lib/auth-session';

const PROTECTED_PAGE_PREFIXES = [
  '/acquisitions',
  '/costs',
  '/dashboard',
  '/documents',
  '/drivers',
  '/fuel',
  '/leases',
  '/maintenances',
  '/nfrp-bot',
  '/others',
  '/settings',
  '/tolls',
  '/trips',
  '/vehicles',
  '/warehouse'
] as const;

export function isProtectedPagePath(pathname: string): boolean {
  return PROTECTED_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function proxy(request: NextRequest) {
  if (isProtectedPagePath(request.nextUrl.pathname)) {
    let sessionValid = false;

    try {
      sessionValid = Boolean(
        await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value, getAuthSecret())
      );
    } catch {
      console.error('Verifica sessione non disponibile.');
      return NextResponse.json(
        { error: 'Servizio temporaneamente non disponibile.' },
        { status: 503 }
      );
    }

    if (!sessionValid) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  if (
    request.method === 'POST' &&
    (request.nextUrl.pathname.startsWith('/documents') || request.nextUrl.pathname.startsWith('/api/documents'))
  ) {
    console.info('POST documenti ricevuto.', {
      pathname: request.nextUrl.pathname,
      contentLength: request.headers.get('content-length'),
      contentType: request.headers.get('content-type'),
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
      userAgent: request.headers.get('user-agent')
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/acquisitions/:path*',
    '/costs/:path*',
    '/dashboard/:path*',
    '/documents/:path*',
    '/drivers/:path*',
    '/fuel/:path*',
    '/leases/:path*',
    '/maintenances/:path*',
    '/nfrp-bot/:path*',
    '/others/:path*',
    '/settings/:path*',
    '/tolls/:path*',
    '/trips/:path*',
    '/vehicles/:path*',
    '/warehouse/:path*',
    '/api/documents/:path*'
  ]
};
