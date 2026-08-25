'use server';

import { requireUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { setFlashMessage } from '@/lib/flash';
import {
  addRoadAccidentAttachments,
  createRoadAccident,
  deleteRoadAccident,
  deleteRoadEventAttachment,
  roadEventError,
  updateRoadAccident
} from '@/lib/road-events';

const LIST_PATH = '/road-accidents';
function errorRedirect(path: string, error: unknown): never {
  redirect(`${path}?${new URLSearchParams({ error: roadEventError(error) })}`);
}
function refresh(id?: string) {
  revalidatePath(LIST_PATH);
  if (id) revalidatePath(`${LIST_PATH}/${id}`);
  revalidatePath('/maintenances/new');
  revalidatePath('/costs');
  revalidatePath('/dashboard');
}

export async function createRoadAccidentAction(formData: FormData) {
  await requireUser();
  let id = '';
  try { id = await createRoadAccident(formData); } catch (error) { errorRedirect(`${LIST_PATH}/new`, error); }
  refresh(id);
  await setFlashMessage({ type: 'success', title: 'Sinistro registrato', message: 'Pratica, scadenze, mezzi e allegati sono disponibili nella scheda.' });
  redirect(`${LIST_PATH}/${id}`);
}

export async function updateRoadAccidentAction(id: string, formData: FormData) {
  await requireUser();
  try { await updateRoadAccident(id, formData); } catch (error) { errorRedirect(`${LIST_PATH}/${id}`, error); }
  refresh(id);
  await setFlashMessage({ type: 'success', title: 'Sinistro aggiornato', message: 'Le modifiche e lo stato sono stati registrati nello storico.' });
  redirect(`${LIST_PATH}/${id}`);
}

export async function addRoadAccidentAttachmentsAction(id: string, formData: FormData) {
  await requireUser();
  try { await addRoadAccidentAttachments(id, formData); } catch (error) { errorRedirect(`${LIST_PATH}/${id}`, error); }
  refresh(id);
  await setFlashMessage({ type: 'success', title: 'Allegati aggiunti', message: 'I nuovi file sono protetti e disponibili nella scheda.' });
  redirect(`${LIST_PATH}/${id}`);
}

export async function deleteRoadAccidentAttachmentAction(attachmentId: string) {
  await requireUser();
  let accidentId: string | null = null;
  try { ({ accidentId } = await deleteRoadEventAttachment(attachmentId)); } catch (error) { errorRedirect(LIST_PATH, error); }
  if (!accidentId) errorRedirect(LIST_PATH, new Error('Allegato non collegato a un sinistro.'));
  refresh(accidentId);
  await setFlashMessage({ type: 'info', title: 'Allegato rimosso', message: 'Il file è stato eliminato e l’operazione registrata nello storico.' });
  redirect(`${LIST_PATH}/${accidentId}`);
}

export async function deleteRoadAccidentAction(id: string) {
  await requireUser();
  try { await deleteRoadAccident(id); } catch (error) { errorRedirect(`${LIST_PATH}/${id}`, error); }
  refresh();
  await setFlashMessage({ type: 'info', title: 'Sinistro eliminato', message: 'La prima segnalazione e i relativi allegati sono stati rimossi.' });
  redirect(LIST_PATH);
}
