import 'server-only';

import http from 'node:http';
import https from 'node:https';

type NextcloudWebDavConfig = {
  baseUrl: string;
  user: string;
  password: string;
};

type WebDavResponse = {
  status: number;
  body: string;
};

// Una sola connessione TCP riutilizzata per TUTTE le richieste verso Nextcloud.
// Questo evita di aprire centinaia di connessioni ravvicinate, che fanno
// scattare il firewall/anti-flood davanti al server (errori UND_ERR_CONNECT_TIMEOUT).
const KEEP_ALIVE_MS = 30_000;
const SOCKET_TIMEOUT_MS = 60_000;
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 1, keepAliveMsecs: KEEP_ALIVE_MS, timeout: SOCKET_TIMEOUT_MS });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 1, keepAliveMsecs: KEEP_ALIVE_MS, timeout: SOCKET_TIMEOUT_MS });

// Cartelle gia create in questo processo: evita MKCOL ridondanti (il backfill
// passava da ~1100 richieste a ~220 grazie a questa cache).
const ensuredDirectories = new Set<string>();

// Errori di rete considerati transitori: si ritenta con backoff.
const RETRYABLE_NET_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH'
]);

const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
// Spaziatura minima tra richieste: distribuisce il carico ed e gentile col server.
const MIN_REQUEST_SPACING_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Serializza tutte le richieste e impone una spaziatura minima tra una e l'altra.
let requestQueue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = requestQueue.then(async () => {
    const wait = MIN_REQUEST_SPACING_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastRequestAt = Date.now();
    }
  });
  requestQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function normalizeRemotePath(remotePath: string): string {
  return remotePath
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

function encodeRemotePath(remotePath: string): string {
  return normalizeRemotePath(remotePath)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function authHeader(config: NextcloudWebDavConfig): string {
  return `Basic ${Buffer.from(`${config.user}:${config.password}`).toString('base64')}`;
}

function davBaseUrl(config: NextcloudWebDavConfig): string {
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  return `${baseUrl}/remote.php/dav/files/${encodeURIComponent(config.user)}`;
}

function isRetryableError(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (error as { cause?: { code?: string } } | null)?.cause?.code;
  if (code && RETRYABLE_NET_CODES.has(code)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|socket hang up|network/i.test(message);
}

function isRetryableStatus(status: number): boolean {
  return status === 425 || status === 429 || (status >= 500 && status <= 504);
}

function rawRequest(
  config: NextcloudWebDavConfig,
  method: string,
  remotePath: string,
  body?: Buffer,
  contentType?: string,
  extraHeaders?: Record<string, string>
): Promise<WebDavResponse> {
  const url = new URL(`${davBaseUrl(config)}/${encodeRemotePath(remotePath)}`);
  const isHttps = url.protocol === 'https:';
  const agent = isHttps ? httpsAgent : httpAgent;

  const headers: Record<string, string | number> = { Authorization: authHeader(config), ...extraHeaders };
  if (contentType) headers['Content-Type'] = contentType;
  if (body) headers['Content-Length'] = body.length;

  return new Promise<WebDavResponse>((resolve, reject) => {
    const handler = (res: http.IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    };

    const options: https.RequestOptions = { method, agent, headers, timeout: SOCKET_TIMEOUT_MS };
    const req = isHttps ? https.request(url, options, handler) : http.request(url, options, handler);

    req.on('timeout', () => req.destroy(new Error('Nextcloud request timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function requestWithRetry(
  config: NextcloudWebDavConfig,
  method: string,
  remotePath: string,
  body?: Buffer,
  contentType?: string,
  extraHeaders?: Record<string, string>
): Promise<WebDavResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await enqueue(() => rawRequest(config, method, remotePath, body, contentType, extraHeaders));
      if (!isRetryableStatus(response.status)) return response;
      lastError = new Error(`Nextcloud ${method} risposta ${response.status} per ${remotePath}.`);
    } catch (error) {
      if (!isRetryableError(error)) throw error;
      lastError = error;
    }

    if (attempt < MAX_ATTEMPTS - 1) {
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      await sleep(backoff + Math.floor(Math.random() * 250));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Nextcloud ${method} fallito dopo ${MAX_ATTEMPTS} tentativi per ${remotePath}.`);
}

export async function ensureNextcloudDirectory(config: NextcloudWebDavConfig, remotePath: string): Promise<void> {
  const parts = normalizeRemotePath(remotePath).split('/').filter(Boolean);
  let current = '';

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (ensuredDirectories.has(current)) continue;

    const response = await requestWithRetry(config, 'MKCOL', current);
    if ([201, 405].includes(response.status)) {
      ensuredDirectories.add(current);
      continue;
    }
    throw new Error(`Nextcloud MKCOL fallito (${response.status}) per ${current}.`);
  }
}

export async function uploadNextcloudFile(
  config: NextcloudWebDavConfig,
  remotePath: string,
  fileBuffer: Buffer,
  contentType = 'application/pdf'
): Promise<void> {
  const parentPath = normalizeRemotePath(remotePath).split('/').slice(0, -1).join('/');
  if (parentPath) await ensureNextcloudDirectory(config, parentPath);

  const response = await requestWithRetry(config, 'PUT', remotePath, fileBuffer, contentType);
  if (![200, 201, 204].includes(response.status)) {
    throw new Error(`Nextcloud upload fallito (${response.status}) per ${remotePath}.`);
  }
}

export async function deleteNextcloudFile(config: NextcloudWebDavConfig, remotePath: string): Promise<void> {
  const response = await requestWithRetry(config, 'DELETE', remotePath);
  if ([200, 204, 404].includes(response.status)) return;
  throw new Error(`Nextcloud delete fallito (${response.status}) per ${remotePath}.`);
}

export async function moveNextcloudFile(
  config: NextcloudWebDavConfig,
  sourceRemotePath: string,
  destinationRemotePath: string
): Promise<boolean> {
  const parentPath = normalizeRemotePath(destinationRemotePath).split('/').slice(0, -1).join('/');
  if (parentPath) await ensureNextcloudDirectory(config, parentPath);

  const destination = `${davBaseUrl(config)}/${encodeRemotePath(destinationRemotePath)}`;
  const response = await requestWithRetry(config, 'MOVE', sourceRemotePath, undefined, undefined, {
    Destination: destination,
    Overwrite: 'T'
  });
  if ([201, 204].includes(response.status)) return true;
  if (response.status === 404) return false;
  throw new Error(`Nextcloud MOVE fallito (${response.status}) da ${sourceRemotePath} a ${destinationRemotePath}.`);
}
