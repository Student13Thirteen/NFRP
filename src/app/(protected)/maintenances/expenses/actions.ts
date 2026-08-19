'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { setFlashMessage } from '@/lib/flash';
import {
  createExpenseDocumentFromForm,
  getExpenseActionErrorMessage,
  updateConfirmedExpenseDocumentDetails,
  updateExpenseDocumentLines
} from '@/lib/expense-form';
import {
  confirmAllPendingExpenses,
  confirmExpenseDocument,
  deleteAllPendingExpenses,
  deleteExpenseDocument
} from '@/lib/expense-confirm';

// Il registro unico delle manutenzioni e `/maintenances`; le rotte `expenses` restano
// per i dettagli documento, l'import e il controllo.
const LIST_PATH = '/maintenances';
const DOCUMENT_PATH = '/maintenances/expenses';
const REVIEW_PATH = '/maintenances/expenses/review';

function revalidateExpenseViews() {
  revalidatePath(LIST_PATH);
  revalidatePath(DOCUMENT_PATH);
  revalidatePath(REVIEW_PATH);
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

function isAlreadyConfirmedExpense(error: unknown): boolean {
  return error instanceof Error && error.message === 'Il documento è già stato confermato.';
}

export async function createExpenseDocumentAction(formData: FormData) {
  await requireUser();
  let pending = false;
  try {
    pending = formData.get('saveAsPending') === 'on';
    await createExpenseDocumentFromForm(formData);
  } catch (error) {
    logExpenseError('Creazione documento di spesa fallita.', error);
    redirectWithError('/maintenances/new', getExpenseActionErrorMessage(error));
  }

  revalidateExpenseViews();
  await setFlashMessage({
    type: 'success',
    title: pending ? 'Manutenzione da controllare' : 'Manutenzione registrata',
    message: pending
      ? 'La trovi tra le manutenzioni in attesa di controllo.'
      : 'Le righe sono state registrate e il magazzino aggiornato dove previsto.'
  });
  redirect(pending ? REVIEW_PATH : LIST_PATH);
}

export async function updateConfirmedExpenseDetailsAction(documentId: string, formData: FormData) {
  await requireUser();
  try {
    await updateConfirmedExpenseDocumentDetails(documentId, formData);
  } catch (error) {
    logExpenseError('Aggiornamento dettagli documento di spesa fallito.', error);
    redirectWithError(`${DOCUMENT_PATH}/${documentId}/edit`, getExpenseActionErrorMessage(error));
  }

  revalidateExpenseViews();
  revalidatePath(`${DOCUMENT_PATH}/${documentId}`);
  revalidatePath(`${DOCUMENT_PATH}/${documentId}/edit`);
  await setFlashMessage({
    type: 'success',
    title: 'Manutenzione aggiornata',
    message: 'Descrizioni, note e PDF sono stati salvati. I dati contabili sono rimasti invariati.'
  });
  redirect(`${DOCUMENT_PATH}/${documentId}`);
}

export async function confirmExpenseWithEditsAction(documentId: string, formData: FormData) {
  await requireUser();
  let alreadyConfirmed = false;
  try {
    await updateExpenseDocumentLines(documentId, formData);
    await confirmExpenseDocument(documentId);
  } catch (error) {
    // Un retry arrivato da una scheda ormai stale non e un errore operativo:
    // il primo invio ha gia raggiunto esattamente il risultato richiesto.
    if (isAlreadyConfirmedExpense(error)) {
      alreadyConfirmed = true;
    } else {
      logExpenseError('Conferma documento di spesa fallita.', error);
      redirectWithError(REVIEW_PATH, getExpenseActionErrorMessage(error));
    }
  }

  revalidateExpenseViews();
  if (alreadyConfirmed) {
    await setFlashMessage({
      type: 'info',
      title: 'Documento già confermato',
      message: 'Un altro invio aveva già confermato il documento: le modifiche di questa scheda non sono state applicate.'
    });
    redirect(`${DOCUMENT_PATH}/${documentId}`);
  }
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
    redirectWithError(`${DOCUMENT_PATH}/${documentId}`, getExpenseActionErrorMessage(error));
  }
  revalidateExpenseViews();
  await setFlashMessage({
    type: 'info',
    title: 'Documento eliminato',
    message: 'Il documento è stato eliminato.'
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
