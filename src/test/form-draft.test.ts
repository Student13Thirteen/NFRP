import { describe, expect, it } from 'vitest';
import {
  FORM_DRAFT_MAX_AGE_MS,
  formDraftStorageKey,
  isFormDraft,
  isFormDraftStorageKey,
  recoveredFormRowKey
} from '@/lib/form-draft';

describe('bozza locale dei form', () => {
  it('accetta soltanto strutture serializzabili con valori stringa', () => {
    expect(isFormDraft({
      createdAt: Date.now(),
      hadFiles: true,
      values: { tractorId: ['tractor-1'], notes: ['testo'] }
    })).toBe(true);
    expect(isFormDraft({ createdAt: Date.now(), hadFiles: false, values: { quantity: [1] } })).toBe(false);
    expect(isFormDraft({ createdAt: 'oggi', hadFiles: false, values: {} })).toBe(false);
  });

  it('limita il recupero a due ore', () => {
    expect(FORM_DRAFT_MAX_AGE_MS).toBe(7_200_000);
  });

  it('riconosce soltanto le proprie chiavi di sessionStorage', () => {
    expect(formDraftStorageKey('expense-new')).toBe('nfrp:form-draft:expense-new');
    expect(isFormDraftStorageKey('nfrp:form-draft:expense-new')).toBe(true);
    expect(isFormDraftStorageKey('altra-app:form-draft:expense-new')).toBe(false);
  });

  it('rinumera densamente le righe recuperate prima di aggiungerne una nuova', () => {
    const recoveredKeys = ['line-1', 'line-2'].map((_, index) => recoveredFormRowKey('line', index));
    const nextKey = recoveredFormRowKey('line', recoveredKeys.length);

    expect(recoveredKeys).toEqual(['line-0', 'line-1']);
    expect(new Set([...recoveredKeys, nextKey]).size).toBe(3);
  });
});
