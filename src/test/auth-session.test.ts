import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  verifySessionToken
} from '@/lib/auth-session';
import { config, isProtectedPagePath, proxy } from '@/proxy';

const TEST_AUTH_SECRET = 'test-only-auth-secret-with-sufficient-length';
const NOW_SECONDS = 2_000_000_000;

function sessionPayload(exp = NOW_SECONDS + 3600) {
  return {
    userId: 'synthetic-user',
    email: 'user@example.invalid',
    exp
  };
}

function protectedRequest(token?: string) {
  const headers = new Headers();
  if (token) {
    headers.set('cookie', `${SESSION_COOKIE_NAME}=${token}`);
  }
  return new NextRequest('http://localhost/dashboard', { headers });
}

describe('session token validation', () => {
  it('accepts a valid signed token', async () => {
    const token = await createSessionToken(sessionPayload(), TEST_AUTH_SECRET);

    await expect(verifySessionToken(token, TEST_AUTH_SECRET, NOW_SECONDS)).resolves.toEqual(
      sessionPayload()
    );
  });

  it('keeps accepting the existing Node HMAC cookie format', async () => {
    const payload = sessionPayload();
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', TEST_AUTH_SECRET)
      .update(encodedPayload)
      .digest('base64url');

    await expect(
      verifySessionToken(`${encodedPayload}.${signature}`, TEST_AUTH_SECRET, NOW_SECONDS)
    ).resolves.toEqual(payload);
  });

  it('rejects an expired token', async () => {
    const token = await createSessionToken(sessionPayload(NOW_SECONDS), TEST_AUTH_SECRET);

    await expect(verifySessionToken(token, TEST_AUTH_SECRET, NOW_SECONDS)).resolves.toBeNull();
  });

  it('rejects a token with an invalid signature', async () => {
    const token = await createSessionToken(sessionPayload(), TEST_AUTH_SECRET);

    await expect(
      verifySessionToken(`${token}invalid`, TEST_AUTH_SECRET, NOW_SECONDS)
    ).resolves.toBeNull();
  });
});

describe('protected page proxy boundary', () => {
  const originalAuthSecret = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  });

  afterEach(() => {
    if (originalAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
  });

  it('covers every protected top-level page prefix in the middleware matcher', () => {
    const protectedPrefixes = [
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
    ];

    for (const prefix of protectedPrefixes) {
      expect(isProtectedPagePath(prefix)).toBe(true);
      expect(config.matcher).toContain(`${prefix}/:path*`);
    }
    expect(isProtectedPagePath('/login')).toBe(false);
    expect(isProtectedPagePath('/api/health')).toBe(false);
  });

  it('redirects an anonymous protected-page request without a response body', async () => {
    const response = await proxy(protectedRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login');
    expect(await response.text()).toBe('');
  });

  it('redirects a protected-page request with an expired cookie', async () => {
    const expiredToken = await createSessionToken(
      {
        ...sessionPayload(),
        exp: Math.floor(Date.now() / 1000) - 1
      },
      TEST_AUTH_SECRET
    );

    expect((await proxy(protectedRequest(expiredToken))).status).toBe(307);
  });

  it('redirects a protected-page request with an invalid signature', async () => {
    const invalidToken = await createSessionToken(
      {
        ...sessionPayload(),
        exp: Math.floor(Date.now() / 1000) + 3600
      },
      'different-test-secret'
    );

    expect((await proxy(protectedRequest(invalidToken))).status).toBe(307);
  });

  it('allows a protected-page request with a valid signed cookie to continue', async () => {
    const validToken = await createSessionToken(
      {
        ...sessionPayload(),
        exp: Math.floor(Date.now() / 1000) + 3600
      },
      TEST_AUTH_SECRET
    );
    const response = await proxy(protectedRequest(validToken));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
