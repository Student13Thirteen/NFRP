'use client';

import type { ComponentPropsWithoutRef, FormEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  FORM_DRAFT_MAX_AGE_MS,
  FORM_DRAFT_RESTORE_EVENT,
  formDraftStorageKey,
  isFormDraft,
  type FormDraft,
  type FormDraftValues
} from '@/lib/form-draft';

type RecoverableFormProps = Omit<ComponentPropsWithoutRef<'form'>, 'children'> & {
  children: ReactNode;
  recoveryKey: string;
  recoverOnError?: boolean;
};

function captureDraft(form: HTMLFormElement): FormDraft {
  const values: FormDraftValues = {};
  let hadFiles = false;
  for (const [name, value] of new FormData(form).entries()) {
    if (!name || /password|token|secret/i.test(name)) continue;
    if (value instanceof File) {
      if (value.size > 0) hadFiles = true;
      continue;
    }
    (values[name] ||= []).push(value);
  }
  return { createdAt: Date.now(), hadFiles, values };
}

function setNativeValue(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const prototype = control instanceof HTMLInputElement
    ? HTMLInputElement.prototype
    : control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(control, value);
  else control.value = value;
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

function restoreControls(form: HTMLFormElement, draft: FormDraft) {
  const controls = Array.from(form.elements).filter(
    (element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
  );
  const indexByName = new Map<string, number>();

  for (const control of controls) {
    if (!control.name || control instanceof HTMLInputElement && control.type === 'file') continue;
    const values = draft.values[control.name] || [];
    if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')) {
      const checked = values.includes(control.value || 'on');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
      if (setter) setter.call(control, checked);
      else control.checked = checked;
      control.dispatchEvent(new Event('change', { bubbles: true }));
      continue;
    }

    const index = indexByName.get(control.name) || 0;
    const value = values[index];
    indexByName.set(control.name, index + 1);
    if (value === undefined) continue;
    if (control instanceof HTMLSelectElement && !Array.from(control.options).some((option) => option.value === value)) continue;
    setNativeValue(control, value);
  }
}

export function RecoverableForm({ children, recoveryKey, recoverOnError = false, ...formProps }: RecoverableFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [restored, setRestored] = useState(false);
  const [hadFiles, setHadFiles] = useState(false);

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    try {
      sessionStorage.setItem(formDraftStorageKey(recoveryKey), JSON.stringify(captureDraft(event.currentTarget)));
    } catch {
      // Il salvataggio del form e un aiuto UX: non deve mai bloccare l'invio reale.
    }
  }

  useEffect(() => {
    const key = formDraftStorageKey(recoveryKey);
    try {
      if (!recoverOnError) {
        sessionStorage.removeItem(key);
        return;
      }

      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const draft = JSON.parse(raw) as unknown;
      if (!isFormDraft(draft) || Date.now() - draft.createdAt > FORM_DRAFT_MAX_AGE_MS) {
        sessionStorage.removeItem(key);
        return;
      }
      const form = formRef.current;
      if (!form) return;

      form.dispatchEvent(new CustomEvent(FORM_DRAFT_RESTORE_EVENT, { detail: draft }));
      const restore = () => restoreControls(form, draft);
      restore();
      requestAnimationFrame(() => requestAnimationFrame(restore));
      window.setTimeout(restore, 80);
      setHadFiles(draft.hadFiles);
      setRestored(true);
    } catch {
      // Storage disabilitato o contenuto non valido: il form resta comunque utilizzabile.
    }
  }, [recoverOnError, recoveryKey]);

  return (
    <form {...formProps} ref={formRef} onSubmitCapture={saveDraft}>
      {restored ? (
        <p className="form-recovery-notice" role="status">
          I dati inseriti sono stati ripristinati dopo l&apos;errore.
          {hadFiles ? ' Per sicurezza devi selezionare nuovamente gli allegati.' : ''}
        </p>
      ) : null}
      {children}
    </form>
  );
}
