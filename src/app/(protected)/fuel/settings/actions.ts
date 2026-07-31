'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { formBoolean, formString, optionalFormString } from '@/lib/form';
import { recalculateFuelMetricsForPlates } from '@/lib/fuel-import';
import { setFlashMessage } from '@/lib/flash';

const fuelSupplierSchema = z.object({
  name: z.string().min(1, 'Nome distributore richiesto.').max(120),
  notes: z.string().max(2000).nullable()
});

const fuelSupplierUpdateSchema = fuelSupplierSchema.extend({
  active: z.boolean()
});

const fuelCardSchema = z.object({
  fuelSupplierId: z.string().min(1).nullable(),
  cardNumber: z.string().min(1, 'Numero tessera richiesto.').max(80),
  label: z.string().max(120).nullable(),
  assignedTractorId: z.string().min(1).nullable(),
  notes: z.string().max(2000).nullable()
});

const fuelCardUpdateSchema = fuelCardSchema.extend({
  active: z.boolean()
});

const fuelProductSchema = z.object({
  code: z.string().min(1, 'Codice prodotto richiesto.').max(20),
  name: z.string().min(1, 'Nome prodotto richiesto.').max(120),
  isFuel: z.boolean(),
  notes: z.string().max(2000).nullable()
});

const fuelProductUpdateSchema = fuelProductSchema.extend({
  active: z.boolean()
});

function redirectWithError(path: string, message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`${path}?${params.toString()}`);
}

function getFuelSettingsActionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    if (error.message.includes('Unique constraint failed')) return 'Esiste gia un record con questi dati.';
    return error.message.slice(0, 300);
  }
  return 'Operazione non riuscita. Riprova.';
}

function parseFuelSupplier(formData: FormData) {
  return fuelSupplierSchema.parse({
    name: formString(formData, 'name'),
    notes: optionalFormString(formData, 'notes')
  });
}

function parseFuelSupplierUpdate(formData: FormData) {
  return fuelSupplierUpdateSchema.parse({
    ...parseFuelSupplier(formData),
    active: formBoolean(formData, 'active')
  });
}

function parseFuelCard(formData: FormData) {
  return fuelCardSchema.parse({
    fuelSupplierId: optionalFormString(formData, 'fuelSupplierId'),
    cardNumber: formString(formData, 'cardNumber').replace(/\s+/g, ''),
    label: optionalFormString(formData, 'label'),
    assignedTractorId: optionalFormString(formData, 'assignedTractorId'),
    notes: optionalFormString(formData, 'notes')
  });
}

function parseFuelCardUpdate(formData: FormData) {
  return fuelCardUpdateSchema.parse({
    ...parseFuelCard(formData),
    active: formBoolean(formData, 'active')
  });
}

function parseFuelProduct(formData: FormData) {
  return fuelProductSchema.parse({
    code: formString(formData, 'code').toUpperCase().replace(/\s+/g, ''),
    name: formString(formData, 'name'),
    isFuel: formBoolean(formData, 'isFuel'),
    notes: optionalFormString(formData, 'notes')
  });
}

function parseFuelProductUpdate(formData: FormData) {
  return fuelProductUpdateSchema.parse({
    ...parseFuelProduct(formData),
    active: formBoolean(formData, 'active')
  });
}

async function revalidateFuelSettings(idPath?: string) {
  revalidatePath('/fuel/settings');
  revalidatePath('/fuel');
  revalidatePath('/fuel/new');
  if (idPath) revalidatePath(idPath);
}

async function recalculateEntriesForProduct(productId: string) {
  const entries = await prisma.fuelEntry.findMany({ where: { fuelProductId: productId }, select: { plate: true } });
  await recalculateFuelMetricsForPlates(prisma, entries.map((entry) => entry.plate));
}

export async function createFuelSupplierAction(formData: FormData) {
  await requireUser();
  try {
    await prisma.fuelSupplier.create({ data: parseFuelSupplier(formData) });
  } catch (error) {
    console.error('Creazione distributore carburante fallita.', error);
    redirectWithError('/fuel/settings', getFuelSettingsActionErrorMessage(error));
  }

  await revalidateFuelSettings();
  await setFlashMessage({
    type: 'success',
    title: 'Distributore salvato',
    message: 'Il distributore carburante e stato inserito.'
  });
  redirect('/fuel/settings');
}

export async function updateFuelSupplierAction(id: string, formData: FormData) {
  await requireUser();
  try {
    await prisma.fuelSupplier.update({ where: { id }, data: parseFuelSupplierUpdate(formData) });
  } catch (error) {
    console.error('Aggiornamento distributore carburante fallito.', error);
    redirectWithError(`/fuel/settings/suppliers/${id}`, getFuelSettingsActionErrorMessage(error));
  }

  await revalidateFuelSettings(`/fuel/settings/suppliers/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Distributore aggiornato',
    message: 'Le modifiche al distributore sono state salvate.'
  });
  redirect('/fuel/settings');
}

export async function deleteFuelSupplierAction(id: string) {
  await requireUser();
  try {
    await prisma.fuelSupplier.delete({ where: { id } });
  } catch (error) {
    console.error('Eliminazione distributore carburante fallita.', error);
    redirectWithError(`/fuel/settings/suppliers/${id}`, getFuelSettingsActionErrorMessage(error));
  }

  await revalidateFuelSettings();
  await setFlashMessage({
    type: 'success',
    title: 'Distributore eliminato',
    message: 'I record collegati restano disponibili senza distributore associato.'
  });
  redirect('/fuel/settings');
}

export async function createFuelCardAction(formData: FormData) {
  await requireUser();
  try {
    await prisma.fuelCard.create({ data: parseFuelCard(formData) });
  } catch (error) {
    console.error('Creazione tessera carburante fallita.', error);
    redirectWithError('/fuel/settings', getFuelSettingsActionErrorMessage(error));
  }

  await revalidateFuelSettings();
  await setFlashMessage({
    type: 'success',
    title: 'Tessera salvata',
    message: 'La tessera carburante e stata inserita.'
  });
  redirect('/fuel/settings');
}

export async function updateFuelCardAction(id: string, formData: FormData) {
  await requireUser();
  const data = parseFuelCardUpdate(formData);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.fuelCard.update({ where: { id }, data });
      await tx.fuelEntry.updateMany({
        where: { fuelCardId: id },
        data: {
          fuelSupplierId: data.fuelSupplierId,
          cardNumber: data.cardNumber
        }
      });
    });
  } catch (error) {
    console.error('Aggiornamento tessera carburante fallito.', error);
    redirectWithError(`/fuel/settings/cards/${id}`, getFuelSettingsActionErrorMessage(error));
  }

  await revalidateFuelSettings(`/fuel/settings/cards/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Tessera aggiornata',
    message: 'Le modifiche alla tessera sono state salvate.'
  });
  redirect('/fuel/settings');
}

export async function deleteFuelCardAction(id: string) {
  await requireUser();
  try {
    await prisma.fuelCard.delete({ where: { id } });
  } catch (error) {
    console.error('Eliminazione tessera carburante fallita.', error);
    redirectWithError(`/fuel/settings/cards/${id}`, getFuelSettingsActionErrorMessage(error));
  }

  await revalidateFuelSettings();
  await setFlashMessage({
    type: 'success',
    title: 'Tessera eliminata',
    message: 'I rifornimenti collegati restano disponibili con il numero tessera salvato nel record.'
  });
  redirect('/fuel/settings');
}

export async function createFuelProductAction(formData: FormData) {
  await requireUser();
  try {
    await prisma.fuelProduct.create({ data: parseFuelProduct(formData) });
  } catch (error) {
    console.error('Creazione prodotto carburante fallita.', error);
    redirectWithError('/fuel/settings', getFuelSettingsActionErrorMessage(error));
  }

  await revalidateFuelSettings();
  await setFlashMessage({
    type: 'success',
    title: 'Prodotto salvato',
    message: 'Il prodotto e disponibile nei rifornimenti.'
  });
  redirect('/fuel/settings');
}

export async function updateFuelProductAction(id: string, formData: FormData) {
  await requireUser();
  const data = parseFuelProductUpdate(formData);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.fuelProduct.update({ where: { id }, data });
      await tx.fuelEntry.updateMany({
        where: { fuelProductId: id },
        data: {
          productCode: data.code,
          productName: data.name
        }
      });
    });
    await recalculateEntriesForProduct(id);
  } catch (error) {
    console.error('Aggiornamento prodotto carburante fallito.', error);
    redirectWithError(`/fuel/settings/products/${id}`, getFuelSettingsActionErrorMessage(error));
  }

  await revalidateFuelSettings(`/fuel/settings/products/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Prodotto aggiornato',
    message: 'Le modifiche al prodotto sono state salvate e i rifornimenti collegati sono stati riallineati.'
  });
  redirect('/fuel/settings');
}

export async function deleteFuelProductAction(id: string) {
  await requireUser();
  try {
    const entryCount = await prisma.fuelEntry.count({ where: { fuelProductId: id } });
    if (entryCount > 0) {
      await prisma.fuelProduct.update({ where: { id }, data: { active: false } });
    } else {
      await prisma.fuelProduct.delete({ where: { id } });
    }
  } catch (error) {
    console.error('Eliminazione prodotto carburante fallita.', error);
    redirectWithError(`/fuel/settings/products/${id}`, getFuelSettingsActionErrorMessage(error));
  }

  await revalidateFuelSettings();
  await setFlashMessage({
    type: 'success',
    title: 'Prodotto rimosso',
    message: 'Il prodotto non viene piu proposto nei nuovi rifornimenti. I record storici restano coerenti.'
  });
  redirect('/fuel/settings');
}
