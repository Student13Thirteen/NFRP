'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  closeContainerTrip,
  createContainerExtraFromForm,
  createContainerTariffFromForm,
  createContainerTripFromForm,
  getContainerTripActionError,
  reopenContainerTrip,
  updateContainerExtraFromForm,
  updateContainerTripFromForm
} from '@/lib/container-trip-form';
import { setFlashMessage } from '@/lib/flash';

function errorHref(path: string, error: unknown) {
  return `${path}?${new URLSearchParams({ error: getContainerTripActionError(error) }).toString()}`;
}

function revalidateContainerTrips(id?: string) {
  revalidatePath('/trips');
  revalidatePath('/trips/container');
  revalidatePath('/costs');
  if (id) revalidatePath(`/trips/container/${id}`);
}

export async function createContainerTripAction(formData: FormData) {
  await requireUser();
  let trip;
  try {
    trip = await createContainerTripFromForm(formData);
  } catch (error) {
    redirect(errorHref('/trips/container/new', error));
  }
  revalidateContainerTrips(trip.id);
  await setFlashMessage({
    type: 'success',
    title: 'Trasporto container creato',
    message: `Viaggio container n. ${trip.tripNumber} salvato separatamente dai viaggi carburante.`
  });
  redirect(`/trips/container/${trip.id}`);
}

export async function updateContainerTripAction(id: string, formData: FormData) {
  await requireUser();
  try {
    await updateContainerTripFromForm(id, formData);
  } catch (error) {
    redirect(errorHref(`/trips/container/${id}`, error));
  }
  revalidateContainerTrips(id);
  await setFlashMessage({
    type: 'success',
    title: 'Trasporto container aggiornato',
    message: 'Dati operativi, tappe e chilometri sono stati salvati.'
  });
  redirect(`/trips/container/${id}`);
}

export async function closeContainerTripAction(id: string) {
  await requireUser();
  try {
    await closeContainerTrip(id);
  } catch (error) {
    redirect(errorHref(`/trips/container/${id}`, error));
  }
  revalidateContainerTrips(id);
  await setFlashMessage({
    type: 'success',
    title: 'Viaggio chiuso',
    message: 'Il trasporto e ora da fatturare e i suoi importi sono entrati nel centro costi.'
  });
  redirect(`/trips/container/${id}#chiusura-viaggio`);
}

export async function reopenContainerTripAction(id: string) {
  await requireUser();
  try {
    await reopenContainerTrip(id);
  } catch (error) {
    redirect(errorHref(`/trips/container/${id}`, error));
  }
  revalidateContainerTrips(id);
  await setFlashMessage({
    type: 'success',
    title: 'Viaggio riaperto',
    message: 'Il trasporto e tornato in verifica ed e stato temporaneamente escluso dal centro costi.'
  });
  redirect(`/trips/container/${id}#completa-viaggio`);
}

export async function createContainerExtraAction(containerTripId: string, formData: FormData) {
  await requireUser();
  try {
    await createContainerExtraFromForm(containerTripId, formData);
  } catch (error) {
    redirect(errorHref(`/trips/container/${containerTripId}`, error));
  }
  revalidateContainerTrips(containerTripId);
  redirect(`/trips/container/${containerTripId}`);
}

export async function updateContainerExtraAction(containerTripId: string, extraId: string, formData: FormData) {
  await requireUser();
  try {
    await updateContainerExtraFromForm(extraId, formData);
  } catch (error) {
    redirect(errorHref(`/trips/container/${containerTripId}`, error));
  }
  revalidateContainerTrips(containerTripId);
  redirect(`/trips/container/${containerTripId}`);
}

export async function createContainerTariffAction(formData: FormData) {
  await requireUser();
  try {
    await createContainerTariffFromForm(formData);
  } catch (error) {
    redirect(errorHref('/trips/container/settings', error));
  }
  revalidatePath('/trips/container/settings');
  revalidatePath('/trips/container');
  redirect('/trips/container/settings');
}
