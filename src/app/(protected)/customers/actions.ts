'use server';

import { requireUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCustomerFormError, parseCustomerForm, parseCustomerUpdateForm } from '@/lib/customer-form';
import { setFlashMessage } from '@/lib/flash';

function redirectWithError(path: string, error: unknown): never {
  redirect(`${path}?error=${encodeURIComponent(getCustomerFormError(error))}`);
}

export async function createCustomerAction(formData: FormData) {
  await requireUser();
  let customer;
  try {
    customer = await prisma.customer.create({ data: parseCustomerForm(formData) });
  } catch (error) {
    redirectWithError('/customers', error);
  }
  revalidatePath('/customers');
  revalidatePath('/trips/container/new');
  await setFlashMessage({
    type: 'success',
    title: 'Cliente salvato',
    message: 'L’anagrafica cliente e ora disponibile nei trasporti container.'
  });
  redirect(`/customers/${customer.id}`);
}

export async function updateCustomerAction(id: string, formData: FormData) {
  await requireUser();
  try {
    await prisma.customer.update({ where: { id }, data: parseCustomerUpdateForm(formData) });
  } catch (error) {
    redirectWithError(`/customers/${id}`, error);
  }
  revalidatePath('/customers');
  revalidatePath(`/customers/${id}`);
  revalidatePath('/trips/container');
  revalidatePath('/trips/container/new');
  await setFlashMessage({
    type: 'success',
    title: 'Cliente aggiornato',
    message: 'Dati fiscali e recapiti sono stati salvati.'
  });
  redirect(`/customers/${id}`);
}

export async function deleteCustomerAction(id: string) {
  await requireUser();
  try {
    await prisma.customer.delete({ where: { id } });
  } catch (error) {
    redirectWithError(`/customers/${id}`, error);
  }
  revalidatePath('/customers');
  revalidatePath('/trips/container');
  revalidatePath('/trips/container/new');
  await setFlashMessage({
    type: 'success',
    title: 'Cliente eliminato',
    message: 'I viaggi collegati restano consultabili con i dati cliente salvati nella loro scheda.'
  });
  redirect('/customers');
}
