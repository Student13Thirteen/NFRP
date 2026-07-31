'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { setFlashMessage } from '@/lib/flash';
import {
  createExpenseDocumentFromForm,
  getExpenseActionErrorMessage,
  updateExpenseDocumentLines
} from '@/lib/expense-form';
import {
  confirmAllPendingExpenses,
  confirmExpenseDocument,
  deleteAllPendingExpenses,
  deleteExpenseDocument
} from '@/lib/expense-confirm';

const LIST_PATH = '/maintenances/expenses';
const REVIEW_PATH = '/maintenances/expenses/review';

function revalidateExpenseViews() {
  revalidatePath(LIST_PATH);
  revalidatePath(REVIEW_PATH);
  revalidatePath('/maintenances');
  revalidatePath('/warehouse');
  revalidatePath('/leases');
  revalidatePath('/costs');
}

function redirectWithError(path: string, message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`${path}?${params.toString()}`);
}

function logExpenseError(message: string, error: unknown) {
  console.error(message, error instanceof Error ? { message: error.message, stack: error.stack } : { error });
}

export async function createExpenseDocumentAction(formData: FormData) {
  await requireUser();
  let pending = false;
  try {
    pending = formData.get('saveAsPending') === 'on';
    await createExpenseDocumentFromForm(formData);
  } catch (error) {
    logExpenseError('Creazione documento di spesa fallita.', error);
    redirectWithError(`${LIST_PATH}/new`, getExpenseActionErrorMessage(error));
  }

  revalidateExpenseViews();
  await setFlashMessage({
    type: 'success',
    title: pending ? 'Documento salvato da validare' : 'Documento di spesa salvato',
    message: pending
      ? 'Lo trovi tra i documenti in attesa di validazione.'
      : 'Le righe sono state registrate e il magazzino aggiornato dove previsto.'
  });
  redirect(pending ? REVIEW_PATH : LIST_PATH);
}

export async function confirmExpenseWithEditsAction(documentId: string, formData: FormData) {
  await requireUser();
  try {
    await updateExpenseDocumentLines(documentId, formData);
    await confirmExpenseDocument(documentId);
  } catch (error) {
    logExpenseError('Conferma documento di spesa fallita.', error);
    redirectWithError(REVIEW_PATH, getExpenseActionErrorMessage(error));
  }

  revalidateExpenseViews();
  await setFlashMessage({
    type: 'success',
    title: 'Documento confermato',
    message: 'Le righe sono entrate nei costi e il magazzino è stato aggiornato dove previsto.'
  });
  redirect(REVIEW_PATH);
}

export async function deleteExpenseFromDetailAction(documentId: string) {
  await requireUser();
  try {
    await deleteExpenseDocument(documentId);
  } catch (error) {
    logExpenseError('Eliminazione documento di spesa fallita.', error);
    redirectWithError(`${LIST_PATH}/${documentId}`, getExpenseActionErrorMessage(error));
  }
  revalidateExpenseViews();
  await setFlashMessage({
    type: 'info',
    title: 'Documento eliminato',
    message: 'Il documento di spesa è stato eliminato.'
  });
  redirect(LIST_PATH);
}

export async function deleteExpenseDocumentAction(documentId: string) {
  await requireUser();
  try {
    await deleteExpenseDocument(documentId);
  } catch (error) {
    logExpenseError('Eliminazione documento di spesa fallita.', error);
    redirectWithError(REVIEW_PATH, getExpenseActionErrorMessage(error));
  }
  revalidateExpenseViews();
  redirect(REVIEW_PATH);
}

export async function confirmAllPendingExpensesAction() {
  await requireUser();
  let count = 0;
  try {
    count = await confirmAllPendingExpenses();
  } catch (error) {
    logExpenseError('Conferma di tutti i documenti fallita.', error);
    redirectWithError(REVIEW_PATH, getExpenseActionErrorMessage(error));
  }
  revalidateExpenseViews();
  await setFlashMessage({
    type: 'success',
    title: 'Documenti confermati',
    message: `${count} documenti confermati e registrati nei costi.`
  });
  redirect(LIST_PATH);
}

export async function deleteAllPendingExpensesAction() {
  await requireUser();
  let count = 0;
  try {
    count = await deleteAllPendingExpenses();
  } catch (error) {
    logExpenseError('Eliminazione di tutti i documenti fallita.', error);
    redirectWithError(REVIEW_PATH, getExpenseActionErrorMessage(error));
  }
  revalidateExpenseViews();
  await setFlashMessage({
    type: 'info',
    title: 'Documenti eliminati',
    message: `${count} documenti in attesa eliminati.`
  });
  redirect(LIST_PATH);
}
