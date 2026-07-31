export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getOptionalEnv(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export function getBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}

export function getNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getUploadDir(): string {
  return getOptionalEnv('UPLOAD_DIR', process.cwd() + '/uploads');
}

export function getMaxUploadBytes(): number {
  return getNumberEnv('MAX_UPLOAD_MB', 20) * 1024 * 1024;
}

export function getDocumentMirrorEnabled(): boolean {
  return getBooleanEnv('DOCUMENT_MIRROR_ENABLED', false);
}

export function getDocumentMirrorNextcloudFolder(): string {
  return getOptionalEnv('DOCUMENT_MIRROR_NEXTCLOUD_FOLDER', 'NFRP Portfolio Demo');
}

export function getDocumentMirrorNextcloudBaseUrl(): string {
  return getOptionalEnv('DOCUMENT_MIRROR_NEXTCLOUD_BASE_URL').replace(/\/$/, '');
}

export function getDocumentMirrorNextcloudUser(): string {
  return getOptionalEnv('DOCUMENT_MIRROR_NEXTCLOUD_USER');
}

export function getDocumentMirrorNextcloudPassword(): string {
  return getOptionalEnv('DOCUMENT_MIRROR_NEXTCLOUD_PASS');
}

export function getInboxOcrLanguages(): string {
  return getOptionalEnv('INBOX_OCR_LANGUAGES', 'ita+eng');
}

export function getInboxOcrTimeoutMs(): number {
  return getNumberEnv('INBOX_OCR_TIMEOUT_SECONDS', 180) * 1000;
}

// Numero di processi paralleli per OCRmyPDF. 0 = automatico (numero di core, risolto in inbox-ocr).
// Su questa macchina dual-core il default automatico usa tutti i core e dimezza i tempi rispetto al vecchio --jobs 1.
export function getInboxOcrJobs(): number {
  return getNumberEnv('INBOX_OCR_JOBS', 0);
}

// Pulizia immagine (unpaper) prima dell'OCR. Attiva di default: migliora le scansioni sporche senza cambiare
// l'output sui campioni testati. Si può spegnere (INBOX_OCR_CLEAN=false) per guadagnare altri ~25% di tempo.
export function getInboxOcrCleanEnabled(): boolean {
  return getBooleanEnv('INBOX_OCR_CLEAN', true);
}

// Quante analisi inbox elaborare in parallelo in background. Default 1 = una alla volta, per non saturare
// la CPU su hardware modesto e tenere il server reattivo. Limite massimo applicato lato coda.
export function getInboxAnalysisConcurrency(): number {
  return getNumberEnv('INBOX_ANALYSIS_CONCURRENCY', 1);
}

export function getAppPublicUrl(): string {
  return getOptionalEnv('APP_PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, '');
}

export function shouldUseSecureCookies(): boolean {
  const override = process.env.COOKIE_SECURE?.trim();
  if (override) return ['true', '1', 'yes', 'on'].includes(override.toLowerCase());

  try {
    return new URL(getAppPublicUrl()).protocol === 'https:';
  } catch {
    return process.env.NODE_ENV === 'production';
  }
}

export function getAssistantEnabled(): boolean {
  return getBooleanEnv('ASSISTANT_ENABLED', false);
}

export function getOllamaBaseUrl(): string {
  return getOptionalEnv('OLLAMA_BASE_URL', 'http://localhost:11434').replace(/\/$/, '');
}

export function getOllamaModel(): string {
  return getOptionalEnv('OLLAMA_MODEL', 'qwen3:1.7b');
}

export function getTelegramChatIds(): string[] {
  return getOptionalEnv('TELEGRAM_CHAT_IDS')
    .split(',')
    .map((chatId) => chatId.trim())
    .filter(Boolean);
}
