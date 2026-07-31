'use server';

import { requireUser } from '@/lib/auth';

import { DocumentStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getMirrorDocumentById } from '@/lib/document-mirror';
import { enqueueDocumentMirrorDelete, enqueueDocumentMirrorSync } from '@/lib/document-mirror-queue';
import {
  createDocumentFromForm,
  getDocumentFormErrorMessage,
  logDocumentFormError,
  renewDocumentFromForm,
  updateDocumentFromForm
} from '@/lib/document-form';
import { setFlashMessage } from '@/lib/flash';
import { removeStoredPdf } from '@/lib/files';

function redirectWithError(path: string, message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`${path}?${params.toString()}`);
}

export async function createDocumentAction(formData: FormData) {
  await requireUser();
  let document;
  try {
    document = await createDocumentFromForm(formData);
  } catch (error) {
    logDocumentFormError('Creazione documento fallita.', error);
    redirectWithError('/documents/new', getDocumentFormErrorMessage(error));
  }

  revalidatePath('/documents');
  revalidatePath('/documents/disposed');
  revalidatePath('/dashboard');
  await setFlashMessage({
    type: 'success',
    title: 'Documento salvato',
    message: 'Il nuovo documento e stato inserito correttamente.'
  });
  redirect(`/documents/${document.id}`);
}

export async function updateDocumentAction(id: string, formData: FormData) {
  await requireUser();
  try {
    await updateDocumentFromForm(id, formData);
  } catch (error) {
    logDocumentFormError('Aggiornamento documento fallito.', error);
    redirectWithError(`/documents/${id}`, getDocumentFormErrorMessage(error));
  }

  revalidatePath('/documents');
  revalidatePath('/documents/history');
  revalidatePath('/documents/disposed');
  revalidatePath('/dashboard');
  revalidatePath(`/documents/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Modifiche salvate',
    message: 'Il documento e stato aggiornato correttamente.'
  });
  redirect(`/documents/${id}`);
}

export async function archiveDocumentAction(id: string) {
  await requireUser();
  const previousDocument = await getMirrorDocumentById(id);
  if (!previousDocument) throw new Error('Documento non trovato.');
  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { status: DocumentStatus.ARCHIVED } });
    await enqueueDocumentMirrorSync(tx, {
      documentId: id,
      previousDocument,
      uploadRequired: false
    });
  });
  revalidatePath('/documents');
  revalidatePath('/documents/history');
  revalidatePath('/documents/disposed');
  revalidatePath('/dashboard');
  revalidatePath(`/documents/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Documento archiviato',
    message: 'Il documento non comparira tra le scadenze attive.'
  });
}

export async function deleteDocumentAction(id: string) {
  await requireUser();
  const document = await getMirrorDocumentById(id);
  if (!document) throw new Error('Documento non trovato.');

  await prisma.$transaction(async (tx) => {
    await enqueueDocumentMirrorDelete(tx, document);
    await tx.document.delete({ where: { id } });
  });

  try {
    if (document.filePath) await removeStoredPdf(document.filePath);
  } catch (error) {
    console.error('Impossibile eliminare il PDF dal filesystem.', {
      documentId: id,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  revalidatePath('/documents');
  revalidatePath('/documents/history');
  revalidatePath('/documents/disposed');
  revalidatePath('/dashboard');
  if (document.driverId) revalidatePath(`/drivers/${document.driverId}`);
  if (document.tractorId) revalidatePath(`/vehicles/tractors/${document.tractorId}`);
  if (document.trailerId) revalidatePath(`/vehicles/trailers/${document.trailerId}`);
  if (document.otherEntityId) revalidatePath(`/others/${document.otherEntityId}`);
  await setFlashMessage({
    type: 'success',
    title: 'Documento eliminato',
    message: "Il documento e stato rimosso dall'archivio."
  });
  redirect('/documents');
}

export async function renewDocumentAction(id: string, formData: FormData) {
  await requireUser();
  let newDocument;
  try {
    newDocument = await renewDocumentFromForm(id, formData);
  } catch (error) {
    logDocumentFormError('Rinnovo documento fallito.', error);
    redirectWithError(`/documents/${id}`, getDocumentFormErrorMessage(error));
  }

  revalidatePath('/documents');
  revalidatePath('/documents/history');
  revalidatePath('/documents/disposed');
  revalidatePath('/dashboard');
  revalidatePath(`/documents/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Documento rinnovato',
    message: 'Il rinnovo e stato registrato correttamente.'
  });
  redirect(`/documents/${newDocument.id}`);
}
