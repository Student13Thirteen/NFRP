'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { removeStoredPdf } from '@/lib/files';
import { setFlashMessage } from '@/lib/flash';
import {
  parseMaintenanceCategoryForm,
  parseMaintenanceCategoryUpdateForm,
  parseMaintenanceSupplierForm,
  parseMaintenanceSupplierUpdateForm,
  createMaintenanceFromForm,
  getMaintenanceActionErrorMessage,
  updateMaintenanceFromForm
} from '@/lib/maintenance-form';

function redirectWithError(path: string, message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`${path}?${params.toString()}`);
}

function logMaintenanceError(message: string, error: unknown) {
  console.error(message, error instanceof Error ? { message: error.message, stack: error.stack } : { error });
}

export async function createMaintenanceAction(formData: FormData) {
  await requireUser();
  let maintenance;
  try {
    maintenance = await createMaintenanceFromForm(formData);
  } catch (error) {
    logMaintenanceError('Creazione manutenzione fallita.', error);
    redirectWithError('/maintenances', getMaintenanceActionErrorMessage(error));
  }

  revalidatePath('/maintenances');
  await setFlashMessage({
    type: 'success',
    title: 'Manutenzione salvata',
    message: 'La manutenzione e stata inserita correttamente.'
  });
  redirect(`/maintenances/${maintenance.id}`);
}

export async function updateMaintenanceAction(id: string, formData: FormData) {
  await requireUser();
  try {
    await updateMaintenanceFromForm(id, formData);
  } catch (error) {
    logMaintenanceError('Aggiornamento manutenzione fallito.', error);
    redirectWithError(`/maintenances/${id}`, getMaintenanceActionErrorMessage(error));
  }

  revalidatePath('/maintenances');
  revalidatePath(`/maintenances/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Manutenzione aggiornata',
    message: 'Le modifiche sono state salvate correttamente.'
  });
  redirect(`/maintenances/${id}`);
}

export async function deleteMaintenanceAction(id: string) {
  await requireUser();
  const maintenance = await prisma.maintenance.findUnique({ where: { id } });
  if (!maintenance) {
    redirectWithError('/maintenances', 'Manutenzione non trovata.');
  }

  try {
    await prisma.maintenance.delete({ where: { id } });
  } catch (error) {
    logMaintenanceError('Eliminazione manutenzione fallita.', error);
    redirectWithError(`/maintenances/${id}`, getMaintenanceActionErrorMessage(error));
  }

  if (maintenance.filePath) {
    try {
      await removeStoredPdf(maintenance.filePath);
    } catch (error) {
      console.error('Impossibile eliminare il PDF manutenzione dal filesystem.', {
        maintenanceId: id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  revalidatePath('/maintenances');
  await setFlashMessage({
    type: 'success',
    title: 'Manutenzione eliminata',
    message: 'La manutenzione e stata eliminata definitivamente.'
  });
  redirect('/maintenances');
}

export async function createMaintenanceCategoryAction(formData: FormData) {
  await requireUser();
  try {
    await prisma.category.create({ data: parseMaintenanceCategoryForm(formData) });
  } catch (error) {
    logMaintenanceError('Creazione categoria manutenzione fallita.', error);
    redirectWithError('/maintenances/settings', getMaintenanceActionErrorMessage(error));
  }

  revalidatePath('/maintenances/settings');
  revalidatePath('/maintenances');
  revalidatePath('/maintenances/new');
  revalidatePath('/warehouse/settings');
  revalidatePath('/warehouse');
  revalidatePath('/warehouse/new');
  await setFlashMessage({
    type: 'success',
    title: 'Categoria salvata',
    message: 'La categoria e disponibile in manutenzioni e magazzino.'
  });
  redirect('/maintenances/settings');
}

export async function updateMaintenanceCategoryAction(id: string, formData: FormData) {
  await requireUser();
  try {
    await prisma.category.update({ where: { id }, data: parseMaintenanceCategoryUpdateForm(formData) });
  } catch (error) {
    logMaintenanceError('Aggiornamento categoria manutenzione fallito.', error);
    redirectWithError(`/maintenances/settings/categories/${id}`, getMaintenanceActionErrorMessage(error));
  }

  revalidatePath('/maintenances/settings');
  revalidatePath('/maintenances');
  revalidatePath('/maintenances/new');
  revalidatePath('/warehouse/settings');
  revalidatePath('/warehouse');
  revalidatePath('/warehouse/new');
  revalidatePath(`/maintenances/settings/categories/${id}`);
  revalidatePath(`/warehouse/settings/categories/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Categoria aggiornata',
    message: 'Le modifiche alla categoria condivisa sono state salvate.'
  });
  redirect('/maintenances/settings');
}

export async function deleteMaintenanceCategoryAction(id: string) {
  await requireUser();
  try {
    await prisma.category.delete({ where: { id } });
  } catch (error) {
    logMaintenanceError('Eliminazione categoria manutenzione fallita.', error);
    redirectWithError(`/maintenances/settings/categories/${id}`, getMaintenanceActionErrorMessage(error));
  }

  revalidatePath('/maintenances/settings');
  revalidatePath('/maintenances');
  revalidatePath('/maintenances/new');
  revalidatePath('/warehouse/settings');
  revalidatePath('/warehouse');
  revalidatePath('/warehouse/new');
  await setFlashMessage({
    type: 'success',
    title: 'Categoria eliminata',
    message: 'La categoria condivisa e stata eliminata.'
  });
  redirect('/maintenances/settings');
}

export async function createMaintenanceSupplierAction(formData: FormData) {
  await requireUser();
  try {
    await prisma.supplier.create({ data: parseMaintenanceSupplierForm(formData) });
  } catch (error) {
    logMaintenanceError('Creazione fornitore manutenzione fallita.', error);
    redirectWithError('/maintenances/settings', getMaintenanceActionErrorMessage(error));
  }

  revalidatePath('/maintenances/settings');
  revalidatePath('/maintenances');
  revalidatePath('/maintenances/new');
  revalidatePath('/warehouse/settings');
  revalidatePath('/warehouse');
  revalidatePath('/warehouse/new');
  await setFlashMessage({
    type: 'success',
    title: 'Fornitore salvato',
    message: 'Il fornitore e disponibile in manutenzioni e magazzino.'
  });
  redirect('/maintenances/settings');
}

export async function updateMaintenanceSupplierAction(id: string, formData: FormData) {
  await requireUser();
  try {
    await prisma.supplier.update({ where: { id }, data: parseMaintenanceSupplierUpdateForm(formData) });
  } catch (error) {
    logMaintenanceError('Aggiornamento fornitore manutenzione fallito.', error);
    redirectWithError(`/maintenances/settings/suppliers/${id}`, getMaintenanceActionErrorMessage(error));
  }

  revalidatePath('/maintenances/settings');
  revalidatePath('/maintenances');
  revalidatePath('/maintenances/new');
  revalidatePath('/warehouse/settings');
  revalidatePath('/warehouse');
  revalidatePath('/warehouse/new');
  revalidatePath(`/maintenances/settings/suppliers/${id}`);
  revalidatePath(`/warehouse/settings/suppliers/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Fornitore aggiornato',
    message: 'Le modifiche al fornitore condiviso sono state salvate.'
  });
  redirect('/maintenances/settings');
}

export async function deleteMaintenanceSupplierAction(id: string) {
  await requireUser();
  try {
    await prisma.supplier.delete({ where: { id } });
  } catch (error) {
    logMaintenanceError('Eliminazione fornitore fallita.', error);
    redirectWithError(`/maintenances/settings/suppliers/${id}`, getMaintenanceActionErrorMessage(error));
  }

  revalidatePath('/maintenances/settings');
  revalidatePath('/maintenances');
  revalidatePath('/maintenances/new');
  revalidatePath('/warehouse/settings');
  revalidatePath('/warehouse');
  revalidatePath('/warehouse/new');
  await setFlashMessage({
    type: 'success',
    title: 'Fornitore eliminato',
    message: 'Il fornitore e stato eliminato. I record collegati restano senza fornitore associato.'
  });
  redirect('/maintenances/settings');
}
