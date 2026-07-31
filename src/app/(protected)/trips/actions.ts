'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { setFlashMessage } from '@/lib/flash';
import { normalizeTripNumbers } from '@/lib/trip-numbering';
import {
  createTripFromForm,
  getTripActionErrorMessage,
  parseLoadingBaseForm,
  parseLoadingBaseUpdateForm,
  parseSalesPointForm,
  parseSalesPointUpdateForm,
  parseTripProductForm,
  parseTripProductUpdateForm,
  updateTripFromForm
} from '@/lib/trip-form';

function redirectWithError(path: string, message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`${path}?${params.toString()}`);
}

function logTripError(message: string, error: unknown) {
  console.error(message, error instanceof Error ? { message: error.message, stack: error.stack } : { error });
}

export async function createTripAction(formData: FormData) {
  await requireUser();
  let trip;
  try {
    trip = await createTripFromForm(formData);
  } catch (error) {
    logTripError('Creazione viaggio fallita.', error);
    redirectWithError('/trips/new', getTripActionErrorMessage(error));
  }

  revalidatePath('/trips');
  await setFlashMessage({
    type: 'success',
    title: 'Viaggio salvato',
    message: 'Il nuovo viaggio e stato inserito correttamente.'
  });
  redirect(`/trips/${trip.id}`);
}

export async function updateTripAction(id: string, formData: FormData) {
  await requireUser();
  try {
    await updateTripFromForm(id, formData);
  } catch (error) {
    logTripError('Aggiornamento viaggio fallito.', error);
    redirectWithError(`/trips/${id}`, getTripActionErrorMessage(error));
  }

  revalidatePath('/trips');
  revalidatePath(`/trips/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Viaggio aggiornato',
    message: 'Le modifiche sono state salvate correttamente.'
  });
  redirect(`/trips/${id}`);
}

export async function deleteTripAction(id: string) {
  await requireUser();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.trip.delete({ where: { id } });
      await normalizeTripNumbers(tx);
    });
  } catch (error) {
    logTripError('Eliminazione viaggio fallita.', error);
    redirectWithError(`/trips/${id}`, getTripActionErrorMessage(error));
  }

  revalidatePath('/trips');
  await setFlashMessage({
    type: 'success',
    title: 'Viaggio eliminato',
    message: 'Il viaggio e stato eliminato definitivamente.'
  });
  redirect('/trips');
}

export async function createLoadingBaseAction(formData: FormData) {
  await requireUser();
  try {
    await prisma.loadingBase.create({ data: parseLoadingBaseForm(formData) });
  } catch (error) {
    logTripError('Creazione base di carico fallita.', error);
    redirectWithError('/trips/settings', getTripActionErrorMessage(error));
  }

  revalidatePath('/trips/settings');
  revalidatePath('/trips/new');
  await setFlashMessage({
    type: 'success',
    title: 'Base salvata',
    message: 'La base di carico e disponibile nei nuovi viaggi.'
  });
  redirect('/trips/settings');
}

export async function updateLoadingBaseAction(id: string, formData: FormData) {
  await requireUser();
  try {
    await prisma.loadingBase.update({ where: { id }, data: parseLoadingBaseUpdateForm(formData) });
  } catch (error) {
    logTripError('Aggiornamento base di carico fallito.', error);
    redirectWithError(`/trips/settings/loading-bases/${id}`, getTripActionErrorMessage(error));
  }

  revalidatePath('/trips/settings');
  revalidatePath('/trips/new');
  revalidatePath('/trips');
  revalidatePath(`/trips/settings/loading-bases/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Base aggiornata',
    message: 'Le modifiche alla base di carico sono state salvate.'
  });
  redirect('/trips/settings');
}

export async function createSalesPointAction(formData: FormData) {
  await requireUser();
  try {
    await prisma.salesPoint.create({ data: parseSalesPointForm(formData) });
  } catch (error) {
    logTripError('Creazione punto vendita fallita.', error);
    redirectWithError('/trips/settings', getTripActionErrorMessage(error));
  }

  revalidatePath('/trips/settings');
  revalidatePath('/trips/new');
  await setFlashMessage({
    type: 'success',
    title: 'Punto vendita salvato',
    message: 'Il punto vendita e disponibile nei nuovi viaggi.'
  });
  redirect('/trips/settings');
}

export async function updateSalesPointAction(id: string, formData: FormData) {
  await requireUser();
  try {
    await prisma.salesPoint.update({ where: { id }, data: parseSalesPointUpdateForm(formData) });
  } catch (error) {
    logTripError('Aggiornamento punto vendita fallito.', error);
    redirectWithError(`/trips/settings/sales-points/${id}`, getTripActionErrorMessage(error));
  }

  revalidatePath('/trips/settings');
  revalidatePath('/trips/new');
  revalidatePath('/trips');
  revalidatePath(`/trips/settings/sales-points/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Punto vendita aggiornato',
    message: 'Le modifiche al punto vendita sono state salvate.'
  });
  redirect('/trips/settings');
}

export async function createTripProductAction(formData: FormData) {
  await requireUser();
  try {
    await prisma.tripProduct.create({ data: parseTripProductForm(formData) });
  } catch (error) {
    logTripError('Creazione prodotto viaggio fallita.', error);
    redirectWithError('/trips/settings', getTripActionErrorMessage(error));
  }

  revalidatePath('/trips/settings');
  revalidatePath('/trips/new');
  await setFlashMessage({
    type: 'success',
    title: 'Prodotto salvato',
    message: 'Il prodotto e disponibile nei nuovi viaggi.'
  });
  redirect('/trips/settings');
}

export async function updateTripProductAction(id: string, formData: FormData) {
  await requireUser();
  try {
    await prisma.tripProduct.update({ where: { id }, data: parseTripProductUpdateForm(formData) });
  } catch (error) {
    logTripError('Aggiornamento prodotto viaggio fallito.', error);
    redirectWithError(`/trips/settings/products/${id}`, getTripActionErrorMessage(error));
  }

  revalidatePath('/trips/settings');
  revalidatePath('/trips/new');
  revalidatePath('/trips');
  revalidatePath(`/trips/settings/products/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Prodotto aggiornato',
    message: 'Le modifiche al prodotto sono state salvate.'
  });
  redirect('/trips/settings');
}
