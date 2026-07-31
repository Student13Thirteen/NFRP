'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createAllReadyDocumentsFromInboxSuggestions,
  createDocumentFromInboxSuggestions,
  discardAllPendingInboxItems,
  discardInboxItem
} from '@/lib/document-inbox';
import { getDocumentFormErrorMessage, logDocumentFormError } from '@/lib/document-form';
import { setFlashMessage } from '@/lib/flash';

const INBOX_PATH = '/documents/inbox';

function redirectWithError(message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`${INBOX_PATH}?${params.toString()}`);
}

function revalidateDocumentInboxViews() {
  revalidatePath(INBOX_PATH);
  revalidatePath('/documents');
  revalidatePath('/documents/history');
  revalidatePath('/documents/disposed');
  revalidatePath('/dashboard');
}

export async function validateInboxItemAction(id: string) {
  await requireUser();
  try {
    await createDocumentFromInboxSuggestions(id);
  } catch (error) {
    logDocumentFormError('Validazione inbox fallita.', error);
    redirectWithError(getDocumentFormErrorMessage(error));
  }

  revalidateDocumentInboxViews();
  await setFlashMessage({
    type: 'success',
    title: 'Documento importato',
    message: 'Il PDF inbox e stato validato con i dati riconosciuti automaticamente.'
  });
  redirect(INBOX_PATH);
}

export async function validateAllReadyInboxItemsAction() {
  await requireUser();
  let result: Awaited<ReturnType<typeof createAllReadyDocumentsFromInboxSuggestions>>;
  try {
    result = await createAllReadyDocumentsFromInboxSuggestions();
  } catch (error) {
    logDocumentFormError('Validazione massiva inbox fallita.', error);
    redirectWithError(getDocumentFormErrorMessage(error));
  }

  revalidateDocumentInboxViews();
  await setFlashMessage({
    type: result.imported > 0 ? 'success' : 'info',
    title: result.imported > 0 ? 'PDF validati' : 'Nessun PDF validabile automaticamente',
    message:
      result.skipped > 0
        ? `${result.imported} importati. ${result.skipped} restano da revisionare per dati mancanti o ambigui.`
        : `${result.imported} PDF sono stati importati.`
  });
  redirect(INBOX_PATH);
}

export async function discardInboxItemAction(id: string) {
  await requireUser();
  try {
    await discardInboxItem(id);
  } catch (error) {
    logDocumentFormError('Eliminazione inbox fallita.', error);
    redirectWithError(getDocumentFormErrorMessage(error));
  }

  revalidatePath(INBOX_PATH);
  await setFlashMessage({
    type: 'success',
    title: 'PDF eliminato',
    message: 'Il file e stato rimosso definitivamente dalla inbox.'
  });
  redirect(INBOX_PATH);
}

export async function discardAllPendingInboxItemsAction() {
  await requireUser();
  let deleted = 0;
  try {
    deleted = await discardAllPendingInboxItems();
  } catch (error) {
    logDocumentFormError('Eliminazione massiva inbox fallita.', error);
    redirectWithError(getDocumentFormErrorMessage(error));
  }

  revalidatePath(INBOX_PATH);
  await setFlashMessage({
    type: 'success',
    title: 'PDF eliminati',
    message: `${deleted} PDF in attesa sono stati rimossi dalla inbox.`
  });
  redirect(INBOX_PATH);
}
