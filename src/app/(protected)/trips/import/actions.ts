'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { setFlashMessage } from '@/lib/flash';
import { TRIP_IMPORT_DRIVER_FIELD_PREFIX } from '@/lib/driver-name-match';
import {
  confirmAllPendingTripImports,
  confirmAllPendingTripImportsForBatch,
  confirmTripImportRow,
  discardAllPendingTripImports,
  discardAllPendingTripImportsForBatch,
  discardPendingTripImportRow
} from '@/lib/trip-import';

const REVIEW_PATH = '/trips/import/review';

function getDriverSelections(formData: FormData): Map<string, string | null> {
  const selections = new Map<string, string | null>();
  for (const [fieldName, value] of formData.entries()) {
    if (!fieldName.startsWith(TRIP_IMPORT_DRIVER_FIELD_PREFIX) || typeof value !== 'string') continue;
    const rowId = fieldName.slice(TRIP_IMPORT_DRIVER_FIELD_PREFIX.length).trim();
    if (!rowId) continue;
    selections.set(rowId, value.trim() || null);
  }
  return selections;
}

function revalidateTripImportPaths() {
  revalidatePath(REVIEW_PATH);
  revalidatePath('/trips');
  revalidatePath('/trips/container');
  revalidatePath('/costs');
}

export async function confirmTripImportRowAction(id: string, formData: FormData) {
  await requireUser();
  const selections = getDriverSelections(formData);
  await confirmTripImportRow(id, selections.has(id) ? selections.get(id) : undefined);
  revalidateTripImportPaths();
  redirect(REVIEW_PATH);
}

export async function confirmAndCompleteTripImportRowAction(id: string, formData: FormData) {
  await requireUser();
  const selections = getDriverSelections(formData);
  const { tripId } = await confirmTripImportRow(id, selections.has(id) ? selections.get(id) : undefined);
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

export async function confirmTripImportBatchAction(batchId: string, formData: FormData) {
  await requireUser();
  const confirmed = await confirmAllPendingTripImportsForBatch(batchId, getDriverSelections(formData));
  revalidateTripImportPaths();
  await setFlashMessage({
    type: 'success',
    title: 'Bolle container confermate',
    message: `${confirmed} righe del file sono diventate trasporti container separati.`
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
    message: `${discarded} righe del file sono state scartate.`
  });
  redirect(REVIEW_PATH);
}

export async function confirmAllTripImportsAction(formData: FormData) {
  await requireUser();
  const confirmed = await confirmAllPendingTripImports(getDriverSelections(formData));
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
