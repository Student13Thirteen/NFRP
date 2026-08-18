'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  confirmAllPendingTolls,
  confirmAllPendingTollsForBatch,
  confirmTollEntry,
  discardAllPendingTolls,
  discardAllPendingTollsForBatch,
  discardPendingTollEntry,
  restoreAllDiscardedTollsForBatch,
  restoreDiscardedTollEntry
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

export async function discardPendingTollEntryReviewAction(id: string) {
  await requireUser();
  await discardPendingTollEntry(id);
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

export async function discardPendingTollEntryDetailAction(batchId: string, id: string) {
  await requireUser();
  await discardPendingTollEntry(id);
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

export async function discardTollBatchReviewAction(batchId: string) {
  await requireUser();
  const discarded = await discardAllPendingTollsForBatch(batchId);
  revalidatePath(REVIEW_PATH);
  revalidatePath('/tolls');
  await setFlashMessage({
    type: 'success',
    title: 'Righe autostrade scartate',
    message: `${discarded} righe sono uscite dalla coda e restano recuperabili nello storico del file.`
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

export async function discardTollBatchDetailAction(batchId: string) {
  await requireUser();
  const discarded = await discardAllPendingTollsForBatch(batchId);
  revalidatePath(REVIEW_PATH);
  revalidatePath('/tolls');
  revalidatePath(detailPath(batchId));
  await setFlashMessage({
    type: 'success',
    title: 'File autostrade scartato',
    message: `${discarded} pedaggi sono usciti dalla coda e possono essere ripristinati dalla scheda del file.`
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

export async function discardAllPendingTollsReviewAction() {
  await requireUser();
  const discarded = await discardAllPendingTolls();
  revalidatePath(REVIEW_PATH);
  revalidatePath('/tolls');
  await setFlashMessage({
    type: 'success',
    title: 'Righe autostrade scartate',
    message: `${discarded} righe sono uscite dalla coda e restano recuperabili nelle schede dei file.`
  });
  redirect('/tolls');
}

export async function restoreDiscardedTollEntryDetailAction(batchId: string, id: string) {
  await requireUser();
  await restoreDiscardedTollEntry(id);
  revalidatePath(REVIEW_PATH);
  revalidatePath('/tolls');
  revalidatePath(detailPath(batchId));
  redirect(detailPath(batchId));
}

export async function restoreTollBatchDetailAction(batchId: string) {
  await requireUser();
  const restored = await restoreAllDiscardedTollsForBatch(batchId);
  revalidatePath(REVIEW_PATH);
  revalidatePath('/tolls');
  revalidatePath(detailPath(batchId));
  await setFlashMessage({
    type: 'success',
    title: 'Pedaggi ripristinati',
    message: `${restored} righe sono tornate nella coda da controllare.`
  });
  redirect(detailPath(batchId));
}
