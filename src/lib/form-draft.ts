export const FORM_DRAFT_RESTORE_EVENT = 'nfrp:restore-form-draft';
export const FORM_DRAFT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const FORM_DRAFT_STORAGE_PREFIX = 'nfrp:form-draft:';

export function formDraftStorageKey(recoveryKey: string): string {
  return `${FORM_DRAFT_STORAGE_PREFIX}${recoveryKey}`;
}

export function isFormDraftStorageKey(key: string): boolean {
  return key.startsWith(FORM_DRAFT_STORAGE_PREFIX);
}

export function recoveredFormRowKey(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

export type FormDraftValues = Record<string, string[]>;

export type FormDraft = {
  createdAt: number;
  hadFiles: boolean;
  values: FormDraftValues;
};

export function isFormDraft(value: unknown): value is FormDraft {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FormDraft>;
  if (typeof candidate.createdAt !== 'number' || typeof candidate.hadFiles !== 'boolean') return false;
  if (!candidate.values || typeof candidate.values !== 'object' || Array.isArray(candidate.values)) return false;
  return Object.values(candidate.values).every(
    (items) => Array.isArray(items) && items.every((item) => typeof item === 'string')
  );
}

export function formDraftFromEvent(event: Event): FormDraft | null {
  if (!(event instanceof CustomEvent)) return null;
  return isFormDraft(event.detail) ? event.detail : null;
}
