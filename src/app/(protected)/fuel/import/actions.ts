'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  assignFuelCardToPendingBatch,
  confirmAllPending,
  confirmAllPendingForBatch,
  confirmFuelEntry,
  deleteAllPending,
  deleteAllPendingForBatch,
  deletePendingFuelEntry
} from '@/lib/fuel-import';
import { setFlashMessage } from '@/lib/flash';

const REVIEW_ALL_PATH = '/fuel/import/review';

function reviewPath(batchId: string): string {
  return `/fuel/import/${batchId}`;
}

function actionErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message.slice(0, 300) : 'Operazione non riuscita.';
}

async function setActionError(error: unknown) {
  await setFlashMessage({
    type: 'error',
    title: 'Completa la validazione',
    message: actionErrorMessage(error)
  });
}

export async function assignBatchFuelCardReviewAction(batchId: string, formData: FormData) {
  await requireUser();
  try {
    const result = await assignFuelCardToPendingBatch(batchId, formData);
    revalidatePath(REVIEW_ALL_PATH);
    revalidatePath(reviewPath(batchId));
    await setFlashMessage({
      type: 'success',
      title: 'Tessera associata',
      message: `${result.cardNumber} applicata a ${result.updatedRows} righe della fattura.`
    });
  } catch (error) {
    await setActionError(error);
  }
  redirect(REVIEW_ALL_PATH);
}

export async function assignBatchFuelCardAction(batchId: string, formData: FormData) {
  await requireUser();
  try {
    const result = await assignFuelCardToPendingBatch(batchId, formData);
    revalidatePath(REVIEW_ALL_PATH);
    revalidatePath(reviewPath(batchId));
    await setFlashMessage({
      type: 'success',
      title: 'Tessera associata',
      message: `${result.cardNumber} applicata a ${result.updatedRows} righe della fattura.`
    });
  } catch (error) {
    await setActionError(error);
  }
  redirect(reviewPath(batchId));
}

export async function confirmFuelEntryAction(batchId: string, id: string) {
  await requireUser();
  try {
    await confirmFuelEntry(id);
  } catch (error) {
    await setActionError(error);
    redirect(reviewPath(batchId));
  }
  revalidatePath(reviewPath(batchId));
  revalidatePath('/fuel');
  redirect(reviewPath(batchId));
}

export async function deletePendingFuelEntryAction(batchId: string, id: string) {
  await requireUser();
  await deletePendingFuelEntry(id);
  revalidatePath(reviewPath(batchId));
  revalidatePath('/fuel');
  redirect(reviewPath(batchId));
}

export async function confirmAllPendingAction(batchId: string) {
  await requireUser();
  let confirmed: number;
  try {
    confirmed = await confirmAllPendingForBatch(batchId);
  } catch (error) {
    await setActionError(error);
    redirect(reviewPath(batchId));
  }
  revalidatePath('/fuel');
  revalidatePath(reviewPath(batchId));
  await setFlashMessage({
    type: 'success',
    title: 'Rifornimenti confermati',
    message: `${confirmed} righe sono entrate nel centro costi e nei calcoli km/euro.`
  });
  redirect('/fuel');
}

export async function deleteAllPendingAction(batchId: string) {
  await requireUser();
  const deleted = await deleteAllPendingForBatch(batchId);
  revalidatePath('/fuel');
  revalidatePath(reviewPath(batchId));
  await setFlashMessage({
    type: 'success',
    title: 'Righe in attesa eliminate',
    message: `${deleted} righe importate sono state scartate.`
  });
  redirect('/fuel');
}

// --- Revisione aggregata (/fuel/import/review): tutte le fatture in attesa insieme ---

export async function confirmFuelEntryReviewAction(id: string) {
  await requireUser();
  try {
    await confirmFuelEntry(id);
  } catch (error) {
    await setActionError(error);
    redirect(REVIEW_ALL_PATH);
  }
  revalidatePath(REVIEW_ALL_PATH);
  revalidatePath('/fuel');
  redirect(REVIEW_ALL_PATH);
}

export async function deletePendingFuelEntryReviewAction(id: string) {
  await requireUser();
  await deletePendingFuelEntry(id);
  revalidatePath(REVIEW_ALL_PATH);
  revalidatePath('/fuel');
  redirect(REVIEW_ALL_PATH);
}

export async function confirmBatchReviewAction(batchId: string) {
  await requireUser();
  let confirmed: number;
  try {
    confirmed = await confirmAllPendingForBatch(batchId);
  } catch (error) {
    await setActionError(error);
    redirect(REVIEW_ALL_PATH);
  }
  revalidatePath(REVIEW_ALL_PATH);
  revalidatePath('/fuel');
  await setFlashMessage({
    type: 'success',
    title: 'Fattura confermata',
    message: `${confirmed} righe sono entrate nel centro costi e nei calcoli km/euro.`
  });
  redirect(REVIEW_ALL_PATH);
}

export async function deleteBatchReviewAction(batchId: string) {
  await requireUser();
  const deleted = await deleteAllPendingForBatch(batchId);
  revalidatePath(REVIEW_ALL_PATH);
  revalidatePath('/fuel');
  await setFlashMessage({
    type: 'success',
    title: 'Righe della fattura eliminate',
    message: `${deleted} righe importate sono state scartate.`
  });
  redirect(REVIEW_ALL_PATH);
}

export async function confirmAllPendingReviewAction() {
  await requireUser();
  let confirmed: number;
  try {
    confirmed = await confirmAllPending();
  } catch (error) {
    await setActionError(error);
    redirect(REVIEW_ALL_PATH);
  }
  revalidatePath(REVIEW_ALL_PATH);
  revalidatePath('/fuel');
  await setFlashMessage({
    type: 'success',
    title: 'Rifornimenti confermati',
    message: `${confirmed} righe sono entrate nel centro costi e nei calcoli km/euro.`
  });
  redirect('/fuel');
}

export async function deleteAllPendingReviewAction() {
  await requireUser();
  const deleted = await deleteAllPending();
  revalidatePath(REVIEW_ALL_PATH);
  revalidatePath('/fuel');
  await setFlashMessage({
    type: 'success',
    title: 'Righe in attesa eliminate',
    message: `${deleted} righe importate sono state scartate.`
  });
  redirect('/fuel');
}
