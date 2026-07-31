export const SESSION_COOKIE_NAME = 'nfrp_portfolio_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type SessionPayload = {
  userId: string;
  email: string;
  exp: number;
};

function encodeBase64url(input: Uint8Array): string {
  let binary = '';
  for (const byte of input) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64url(input: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(input) || input.length % 4 === 1) return null;

  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function toArrayBuffer(input: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.byteLength);
  new Uint8Array(buffer).set(input);
  return buffer;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return encodeBase64url(new Uint8Array(signature));
}

export function getAuthSecret(): string {
  const secret =
    process.env.AUTH_SECRET?.trim() ||
    (process.env.NODE_ENV === 'production' ? '' : 'dev-secret-change-me');
  if (!secret) {
    throw new Error('AUTH_SECRET is required in production.');
  }
  return secret;
}

export async function createSessionToken(
  payload: SessionPayload,
  secret = getAuthSecret()
): Promise<string> {
  const encodedPayload = encodeBase64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${encodedPayload}.${await sign(encodedPayload, secret)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret = getAuthSecret(),
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<SessionPayload | null> {
  if (!token) return null;

  const tokenParts = token.split('.');
  if (tokenParts.length !== 2) return null;

  const [encodedPayload, signature] = tokenParts;
  if (!encodedPayload || !signature) return null;

  const signatureBytes = decodeBase64url(signature);
  if (!signatureBytes) return null;

  try {
    const key = await importHmacKey(secret);
    const signatureValid = await crypto.subtle.verify(
      'HMAC',
      key,
      toArrayBuffer(signatureBytes),
      new TextEncoder().encode(encodedPayload)
    );
    if (!signatureValid) return null;

    const payloadBytes = decodeBase64url(encodedPayload);
    if (!payloadBytes) return null;
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<SessionPayload>;
    if (
      typeof payload.userId !== 'string' ||
      payload.userId.length === 0 ||
      typeof payload.email !== 'string' ||
      payload.email.length === 0 ||
      typeof payload.exp !== 'number' ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= nowSeconds
    ) {
      return null;
    }

    return payload as SessionPayload;
  } catch {
    return null;
  }
}
