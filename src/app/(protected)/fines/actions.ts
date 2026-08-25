'use server';

import { requireUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { setFlashMessage } from '@/lib/flash';
import {
  addRoadFineAttachments,
  createRoadFine,
  deleteRoadEventAttachment,
  deleteRoadFine,
  roadEventError,
  updateRoadFine
} from '@/lib/road-events';

const LIST_PATH = '/fines';
function errorRedirect(path: string, error: unknown): never {
  redirect(`${path}?${new URLSearchParams({ error: roadEventError(error) })}`);
}
function refresh(id?: string) {
  revalidatePath(LIST_PATH);
  if (id) revalidatePath(`${LIST_PATH}/${id}`);
  revalidatePath('/costs');
  revalidatePath('/dashboard');
}

export async function createRoadFineAction(formData: FormData) {
  await requireUser();
  let id = '';
  try { id = await createRoadFine(formData); } catch (error) { errorRedirect(`${LIST_PATH}/new`, error); }
  refresh(id);
  await setFlashMessage({ type: 'success', title: 'Verbale registrato', message: 'Scadenze, responsabilità e allegati sono disponibili nella scheda.' });
  redirect(`${LIST_PATH}/${id}`);
}

export async function updateRoadFineAction(id: string, formData: FormData) {
  await requireUser();
  try { await updateRoadFine(id, formData); } catch (error) { errorRedirect(`${LIST_PATH}/${id}`, error); }
  refresh(id);
  await setFlashMessage({ type: 'success', title: 'Verbale aggiornato', message: 'Le modifiche e lo stato sono stati registrati nello storico.' });
  redirect(`${LIST_PATH}/${id}`);
}

export async function addRoadFineAttachmentsAction(id: string, formData: FormData) {
  await requireUser();
  try { await addRoadFineAttachments(id, formData); } catch (error) { errorRedirect(`${LIST_PATH}/${id}`, error); }
  refresh(id);
  await setFlashMessage({ type: 'success', title: 'Allegati aggiunti', message: 'I nuovi file sono protetti e disponibili nella scheda.' });
  redirect(`${LIST_PATH}/${id}`);
}

export async function deleteRoadFineAttachmentAction(attachmentId: string) {
  await requireUser();
  let fineId: string | null = null;
  try { ({ fineId } = await deleteRoadEventAttachment(attachmentId)); } catch (error) { errorRedirect(LIST_PATH, error); }
  if (!fineId) errorRedirect(LIST_PATH, new Error('Allegato non collegato a un verbale.'));
  refresh(fineId);
  await setFlashMessage({ type: 'info', title: 'Allegato rimosso', message: 'Il file è stato eliminato e l’operazione registrata nello storico.' });
  redirect(`${LIST_PATH}/${fineId}`);
}

export async function deleteRoadFineAction(id: string) {
  await requireUser();
  try { await deleteRoadFine(id); } catch (error) { errorRedirect(`${LIST_PATH}/${id}`, error); }
  refresh();
  await setFlashMessage({ type: 'info', title: 'Verbale eliminato', message: 'La registrazione iniziale e i relativi allegati sono stati rimossi.' });
  redirect(LIST_PATH);
}
