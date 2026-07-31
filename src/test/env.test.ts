import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldUseSecureCookies } from '@/lib/env';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cookie transport security', () => {
  it('keeps local HTTP login usable in the production container', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_PUBLIC_URL', 'http://localhost:3000');
    vi.stubEnv('COOKIE_SECURE', '');

    expect(shouldUseSecureCookies()).toBe(false);
  });

  it('enables secure cookies for HTTPS deployments', () => {
    vi.stubEnv('APP_PUBLIC_URL', 'https://operations.example.com');
    vi.stubEnv('COOKIE_SECURE', '');

    expect(shouldUseSecureCookies()).toBe(true);
  });

  it('accepts an explicit operator override', () => {
    vi.stubEnv('APP_PUBLIC_URL', 'http://localhost:3000');
    vi.stubEnv('COOKIE_SECURE', 'true');
    expect(shouldUseSecureCookies()).toBe(true);

    vi.stubEnv('APP_PUBLIC_URL', 'https://operations.example.com');
    vi.stubEnv('COOKIE_SECURE', 'false');
    expect(shouldUseSecureCookies()).toBe(false);
  });
});
