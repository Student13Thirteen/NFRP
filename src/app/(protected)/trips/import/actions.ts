'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { setFlashMessage } from '@/lib/flash';
import {
  confirmAllPendingTripImports,
  confirmAllPendingTripImportsForBatch,
  confirmTripImportRow,
  discardAllPendingTripImports,
  discardAllPendingTripImportsForBatch,
  discardPendingTripImportRow
} from '@/lib/trip-import';

const REVIEW_PATH = '/trips/import/review';

function revalidateTripImportPaths() {
  revalidatePath(REVIEW_PATH);
  revalidatePath('/trips');
  revalidatePath('/trips/container');
  revalidatePath('/costs');
}

export async function confirmTripImportRowAction(id: string) {
  await requireUser();
  await confirmTripImportRow(id);
  revalidateTripImportPaths();
  redirect(REVIEW_PATH);
}

export async function confirmAndCompleteTripImportRowAction(id: string) {
  await requireUser();
  const { tripId } = await confirmTripImportRow(id);
  revalidateTripImportPaths();
  await setFlashMessage({
    type: 'success',
    title: 'Bolla trasformata in viaggio',
    message: 'Completa ora km, tappe, extra e importi. Il centro costi resta invariato finche non chiudi il viaggio.'
  });
  redirect(`/trips/container/${tripId}?fromImport=1#completa-viaggio`);
}

export async function discardTripImportRowAction(id: string) {
  await requireUser();
  await discardPendingTripImportRow(id);
  revalidateTripImportPaths();
  redirect(REVIEW_PATH);
}

export async function confirmTripImportBatchAction(batchId: string) {
  await requireUser();
  const confirmed = await confirmAllPendingTripImportsForBatch(batchId);
  revalidateTripImportPaths();
  await setFlashMessage({
    type: 'success',
    title: 'Bolle container confermate',
    message: `${confirmed} righe del PDF sono diventate trasporti container separati.`
  });
  redirect(REVIEW_PATH);
}

export async function discardTripImportBatchAction(batchId: string) {
  await requireUser();
  const discarded = await discardAllPendingTripImportsForBatch(batchId);
  revalidateTripImportPaths();
  await setFlashMessage({
    type: 'success',
    title: 'Bolle container scartate',
    message: `${discarded} righe del PDF sono state scartate.`
  });
  redirect(REVIEW_PATH);
}

export async function confirmAllTripImportsAction() {
  await requireUser();
  const confirmed = await confirmAllPendingTripImports();
  revalidateTripImportPaths();
  await setFlashMessage({
    type: 'success',
    title: 'Bolle container confermate',
    message: `${confirmed} righe sono diventate trasporti container separati.`
  });
  redirect('/trips/container');
}

export async function discardAllTripImportsAction() {
  await requireUser();
  const discarded = await discardAllPendingTripImports();
  revalidateTripImportPaths();
  await setFlashMessage({
    type: 'success',
    title: 'Bolle container scartate',
    message: `${discarded} righe in attesa sono state scartate.`
  });
  redirect('/trips/container');
}
