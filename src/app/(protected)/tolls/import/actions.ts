'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  confirmAllPendingTolls,
  confirmAllPendingTollsForBatch,
  confirmTollEntry,
  deleteAllPendingTolls,
  deleteAllPendingTollsForBatch,
  deletePendingTollEntry
} from '@/lib/toll-import';
import { setFlashMessage } from '@/lib/flash';

const REVIEW_PATH = '/tolls/import/review';

function detailPath(batchId: string): string {
  return `/tolls/imports/${encodeURIComponent(batchId)}`;
}

export async function confirmTollEntryReviewAction(id: string) {
  await requireUser();
  await confirmTollEntry(id);
  revalidatePath(REVIEW_PATH);
  revalidatePath('/tolls');
  revalidatePath('/tolls/cards');
  redirect(REVIEW_PATH);
}

export async function deletePendingTollEntryReviewAction(id: string) {
  await requireUser();
  await deletePendingTollEntry(id);
  revalidatePath(REVIEW_PATH);
  revalidatePath('/tolls');
  redirect(REVIEW_PATH);
}

export async function confirmTollEntryDetailAction(batchId: string, id: string) {
  await requireUser();
  await confirmTollEntry(id);
  revalidatePath(REVIEW_PATH);
  revalidatePath('/tolls');
  revalidatePath('/tolls/cards');
  revalidatePath('/costs');
  revalidatePath(detailPath(batchId));
  redirect(detailPath(batchId));
}

export async function deletePendingTollEntryDetailAction(batchId: string, id: string) {
  await requireUser();
  await deletePendingTollEntry(id);
  revalidatePath(REVIEW_PATH);
  revalidatePath('/tolls');
  revalidatePath(detailPath(batchId));
  redirect(detailPath(batchId));
}

export async function confirmTollBatchReviewAction(batchId: string) {
  await requireUser();
  const confirmed = await confirmAllPendingTollsForBatch(batchId);
  revalidatePath(REVIEW_PATH);
  revalidatePath('/tolls');
  revalidatePath('/tolls/cards');
  await setFlashMessage({
    type: 'success',
    title: 'Pedaggi confermati',
    message: `${confirmed} righe sono entrate nel centro costi autostrade.`
  });
  redirect(REVIEW_PATH);
}

export async function deleteTollBatchReviewAction(batchId: string) {
  await requireUser();
  const deleted = await deleteAllPendingTollsForBatch(batchId);
  revalidatePath(REVIEW_PATH);
  revalidatePath('/tolls');
  await setFlashMessage({
    type: 'success',
    title: 'Righe autostrade eliminate',
    message: `${deleted} righe importate sono state scartate.`
  });
  redirect(REVIEW_PATH);
}

export async function confirmTollBatchDetailAction(batchId: string) {
  await requireUser();
  const confirmed = await confirmAllPendingTollsForBatch(batchId);
  revalidatePath(REVIEW_PATH);
  revalidatePath('/tolls');
  revalidatePath('/tolls/cards');
  revalidatePath('/costs');
  revalidatePath(detailPath(batchId));
  await setFlashMessage({
    type: 'success',
    title: 'File autostrade confermato',
    message: `${confirmed} pedaggi sono entrati nel centro costi.`
  });
  redirect(detailPath(batchId));
}

export async function deleteTollBatchDetailAction(batchId: string) {
  await requireUser();
  const deleted = await deleteAllPendingTollsForBatch(batchId);
  revalidatePath(REVIEW_PATH);
  revalidatePath('/tolls');
  revalidatePath(detailPath(batchId));
  await setFlashMessage({
    type: 'success',
    title: 'File autostrade scartato',
    message: `${deleted} pedaggi in attesa sono stati eliminati.`
  });
  redirect('/tolls');
}

export async function confirmAllPendingTollsReviewAction() {
  await requireUser();
  const confirmed = await confirmAllPendingTolls();
  revalidatePath(REVIEW_PATH);
  revalidatePath('/tolls');
  revalidatePath('/tolls/cards');
  await setFlashMessage({
    type: 'success',
    title: 'Pedaggi confermati',
    message: `${confirmed} righe sono entrate nel centro costi autostrade.`
  });
  redirect('/tolls');
}

export async function deleteAllPendingTollsReviewAction() {
  await requireUser();
  const deleted = await deleteAllPendingTolls();
  revalidatePath(REVIEW_PATH);
  revalidatePath('/tolls');
  await setFlashMessage({
    type: 'success',
    title: 'Righe autostrade eliminate',
    message: `${deleted} righe importate sono state scartate.`
  });
  redirect('/tolls');
}
