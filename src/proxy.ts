import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthSecret,
  SESSION_COOKIE_NAME,
  verifySessionToken
} from '@/lib/auth-session';

const PROTECTED_PAGE_PREFIXES = [
  '/acquisitions',
  '/costs',
  '/customers',
  '/dashboard',
  '/documents',
  '/drivers',
  '/fines',
  '/fuel',
  '/leases',
  '/maintenances',
  '/nfrp-bot',
  '/others',
  '/road-accidents',
  '/settings',
  '/tolls',
  '/trips',
  '/vehicles',
  '/warehouse'
] as const;

/**
 * Rotte del vecchio modulo "fatture e DDT" confluite nel registro unico delle
 * manutenzioni. Il redirect vive qui perche `redirect()` dentro una pagina in
 * streaming non produce piu una risposta 3xx, ma una pagina vuota con salto lato client.
 */
const UNIFIED_MAINTENANCE_ROUTES = new Map<string, string>([
  ['/maintenances/expenses', '/maintenances'],
  ['/maintenances/expenses/new', '/maintenances/new']
]);

export function getUnifiedMaintenanceTarget(pathname: string): string | null {
  return UNIFIED_MAINTENANCE_ROUTES.get(pathname.replace(/\/+$/, '') || '/') ?? null;
}

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

  const unifiedTarget = getUnifiedMaintenanceTarget(request.nextUrl.pathname);
  if (unifiedTarget) {
    const target = new URL(unifiedTarget, request.url);
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target, 307);
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
    '/customers/:path*',
    '/dashboard/:path*',
    '/documents/:path*',
    '/drivers/:path*',
    '/fines/:path*',
    '/fuel/:path*',
    '/leases/:path*',
    '/maintenances/:path*',
    '/nfrp-bot/:path*',
    '/others/:path*',
    '/road-accidents/:path*',
    '/settings/:path*',
    '/tolls/:path*',
    '/trips/:path*',
    '/vehicles/:path*',
    '/warehouse/:path*',
    '/api/documents/:path*'
  ]
};
