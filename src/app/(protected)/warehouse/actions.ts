'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { removeStoredPdf } from '@/lib/files';
import { setFlashMessage } from '@/lib/flash';
import {
  getWarehouseActionErrorMessage,
  parseWarehouseCategoryForm,
  parseWarehouseCategoryUpdateForm,
  parseWarehouseSupplierForm,
  parseWarehouseSupplierUpdateForm
} from '@/lib/warehouse-form';
import { mountOnVehicle } from '@/lib/warehouse-movement';

function parseActionDate(value: string): Date {
  const normalized = (value || '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  const italian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalized);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : italian
      ? { year: Number(italian[3]), month: Number(italian[2]), day: Number(italian[1]) }
      : null;
  if (!parts) throw new Error('Data movimento non valida. Usa gg/mm/aaaa.');
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (Number.isNaN(date.getTime())) throw new Error('Data movimento non valida. Usa gg/mm/aaaa.');
  return date;
}

function redirectWithError(path: string, message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`${path}?${params.toString()}`);
}

function logWarehouseError(message: string, error: unknown) {
  console.error(message, error instanceof Error ? { message: error.message, stack: error.stack } : { error });
}

export async function deleteWarehouseItemAction(id: string) {
  await requireUser();
  const item = await prisma.warehouseItem.findUnique({ where: { id } });
  if (!item) redirectWithError('/warehouse', 'Record magazzino non trovato.');

  try {
    await prisma.warehouseItem.delete({ where: { id } });
  } catch (error) {
    logWarehouseError('Eliminazione record magazzino fallita.', error);
    redirectWithError(`/warehouse/${id}`, getWarehouseActionErrorMessage(error));
  }

  if (item.filePath) {
    try {
      await removeStoredPdf(item.filePath);
    } catch (error) {
      console.error('Impossibile eliminare il PDF magazzino dal filesystem.', {
        warehouseItemId: id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  revalidatePath('/warehouse');
  await setFlashMessage({
    type: 'success',
    title: 'Record magazzino eliminato',
    message: 'Il record e stato eliminato definitivamente.'
  });
  redirect('/warehouse');
}

export async function mountOnVehicleAction(itemId: string, formData: FormData) {
  await requireUser();
  try {
    const vehicleKey = String(formData.get('vehicleKey') || '').trim();
    const quantity = Number(String(formData.get('quantity') || '').trim());
    const movementDate = parseActionDate(String(formData.get('movementDate') || ''));
    const notes = String(formData.get('notes') || '').trim() || null;
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Quantità da montare non valida.');
    await mountOnVehicle(itemId, { vehicleKey, quantity, movementDate, notes });
  } catch (error) {
    logWarehouseError('Montaggio su mezzo fallito.', error);
    redirectWithError(`/warehouse/${itemId}`, getWarehouseActionErrorMessage(error));
  }

  revalidatePath(`/warehouse/${itemId}`);
  revalidatePath('/warehouse');
  await setFlashMessage({
    type: 'success',
    title: 'Pezzo montato su mezzo',
    message: 'La giacenza è stata aggiornata e il costo attribuito al mezzo.'
  });
  redirect(`/warehouse/${itemId}`);
}

export async function createWarehouseCategoryAction(formData: FormData) {
  await requireUser();
  try {
    await prisma.category.create({ data: parseWarehouseCategoryForm(formData) });
  } catch (error) {
    logWarehouseError('Creazione categoria magazzino fallita.', error);
    redirectWithError('/warehouse/settings', getWarehouseActionErrorMessage(error));
  }

  revalidatePath('/warehouse/settings');
  revalidatePath('/warehouse');
  revalidatePath('/warehouse/new');
  revalidatePath('/maintenances/settings');
  revalidatePath('/maintenances');
  revalidatePath('/maintenances/new');
  await setFlashMessage({
    type: 'success',
    title: 'Categoria salvata',
    message: 'La categoria e disponibile in magazzino e manutenzioni.'
  });
  redirect('/warehouse/settings');
}

export async function updateWarehouseCategoryAction(id: string, formData: FormData) {
  await requireUser();
  try {
    await prisma.category.update({ where: { id }, data: parseWarehouseCategoryUpdateForm(formData) });
  } catch (error) {
    logWarehouseError('Aggiornamento categoria magazzino fallita.', error);
    redirectWithError(`/warehouse/settings/categories/${id}`, getWarehouseActionErrorMessage(error));
  }

  revalidatePath('/warehouse/settings');
  revalidatePath('/warehouse');
  revalidatePath('/warehouse/new');
  revalidatePath('/maintenances/settings');
  revalidatePath('/maintenances');
  revalidatePath('/maintenances/new');
  revalidatePath(`/warehouse/settings/categories/${id}`);
  revalidatePath(`/maintenances/settings/categories/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Categoria aggiornata',
    message: 'Le modifiche alla categoria condivisa sono state salvate.'
  });
  redirect('/warehouse/settings');
}

export async function deleteWarehouseCategoryAction(id: string) {
  await requireUser();
  try {
    await prisma.category.delete({ where: { id } });
  } catch (error) {
    logWarehouseError('Eliminazione categoria magazzino fallita.', error);
    redirectWithError(`/warehouse/settings/categories/${id}`, getWarehouseActionErrorMessage(error));
  }

  revalidatePath('/warehouse/settings');
  revalidatePath('/warehouse');
  revalidatePath('/warehouse/new');
  revalidatePath('/maintenances/settings');
  revalidatePath('/maintenances');
  revalidatePath('/maintenances/new');
  await setFlashMessage({
    type: 'success',
    title: 'Categoria eliminata',
    message: 'La categoria condivisa e stata eliminata.'
  });
  redirect('/warehouse/settings');
}

export async function createWarehouseSupplierAction(formData: FormData) {
  await requireUser();
  try {
    await prisma.supplier.create({ data: parseWarehouseSupplierForm(formData) });
  } catch (error) {
    logWarehouseError('Creazione fornitore magazzino fallita.', error);
    redirectWithError('/warehouse/settings', getWarehouseActionErrorMessage(error));
  }

  revalidatePath('/warehouse/settings');
  revalidatePath('/warehouse');
  revalidatePath('/warehouse/new');
  revalidatePath('/maintenances/settings');
  revalidatePath('/maintenances');
  revalidatePath('/maintenances/new');
  await setFlashMessage({
    type: 'success',
    title: 'Fornitore salvato',
    message: 'Il fornitore e disponibile in magazzino e manutenzioni.'
  });
  redirect('/warehouse/settings');
}

export async function updateWarehouseSupplierAction(id: string, formData: FormData) {
  await requireUser();
  try {
    await prisma.supplier.update({ where: { id }, data: parseWarehouseSupplierUpdateForm(formData) });
  } catch (error) {
    logWarehouseError('Aggiornamento fornitore magazzino fallito.', error);
    redirectWithError(`/warehouse/settings/suppliers/${id}`, getWarehouseActionErrorMessage(error));
  }

  revalidatePath('/warehouse/settings');
  revalidatePath('/warehouse');
  revalidatePath('/warehouse/new');
  revalidatePath('/maintenances/settings');
  revalidatePath('/maintenances');
  revalidatePath('/maintenances/new');
  revalidatePath(`/warehouse/settings/suppliers/${id}`);
  revalidatePath(`/maintenances/settings/suppliers/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Fornitore aggiornato',
    message: 'Le modifiche al fornitore condiviso sono state salvate.'
  });
  redirect('/warehouse/settings');
}

export async function deleteWarehouseSupplierAction(id: string) {
  await requireUser();
  try {
    await prisma.supplier.delete({ where: { id } });
  } catch (error) {
    logWarehouseError('Eliminazione fornitore fallita.', error);
    redirectWithError(`/warehouse/settings/suppliers/${id}`, getWarehouseActionErrorMessage(error));
  }

  revalidatePath('/warehouse/settings');
  revalidatePath('/warehouse');
  revalidatePath('/warehouse/new');
  revalidatePath('/maintenances/settings');
  revalidatePath('/maintenances');
  revalidatePath('/maintenances/new');
  await setFlashMessage({
    type: 'success',
    title: 'Fornitore eliminato',
    message: 'Il fornitore e stato eliminato. I record collegati restano senza fornitore associato.'
  });
  redirect('/warehouse/settings');
}
