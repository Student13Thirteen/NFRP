'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { setFlashMessage } from '@/lib/flash';
import { formBoolean, formString, optionalFormString } from '@/lib/form';

const driverSchema = z.object({
  firstName: z.string().min(1, 'Nome richiesto').max(80),
  lastName: z.string().min(1, 'Cognome richiesto').max(80),
  phone: z.string().max(40).nullable(),
  email: z.string().email().or(z.literal('')).nullable(),
  notes: z.string().max(2000).nullable(),
  active: z.boolean()
});

function parseDriver(formData: FormData) {
  const email = optionalFormString(formData, 'email');
  return driverSchema.parse({
    firstName: formString(formData, 'firstName'),
    lastName: formString(formData, 'lastName'),
    phone: optionalFormString(formData, 'phone'),
    email,
    notes: optionalFormString(formData, 'notes'),
    active: formBoolean(formData, 'active')
  });
}

export async function createDriverAction(formData: FormData) {
  await requireUser();
  const driver = await prisma.driver.create({ data: parseDriver(formData) });
  revalidatePath('/drivers');
  await setFlashMessage({
    type: 'success',
    title: 'Autista salvato',
    message: 'La nuova anagrafica e stata creata correttamente.'
  });
  redirect(`/drivers/${driver.id}`);
}

export async function updateDriverAction(id: string, formData: FormData) {
  await requireUser();
  await prisma.driver.update({ where: { id }, data: parseDriver(formData) });
  revalidatePath('/drivers');
  revalidatePath(`/drivers/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Autista aggiornato',
    message: 'Le modifiche sono state salvate correttamente.'
  });
  redirect(`/drivers/${id}`);
}

export async function deleteDriverAction(id: string) {
  await requireUser();
  await prisma.driver.delete({ where: { id } });
  revalidatePath('/drivers');
  await setFlashMessage({
    type: 'success',
    title: 'Autista eliminato',
    message: "L'anagrafica e stata rimossa."
  });
  redirect('/drivers');
}
