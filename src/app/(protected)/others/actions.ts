'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { setFlashMessage } from '@/lib/flash';
import { formBoolean, formString, optionalFormString } from '@/lib/form';

const otherEntitySchema = z.object({
  name: z.string().min(1, 'Nome richiesto').max(120),
  category: z.string().min(1, 'Categoria richiesta').max(80),
  notes: z.string().max(2000).nullable(),
  active: z.boolean()
});

function parseOtherEntity(formData: FormData) {
  return otherEntitySchema.parse({
    name: formString(formData, 'name'),
    category: formString(formData, 'category'),
    notes: optionalFormString(formData, 'notes'),
    active: formBoolean(formData, 'active')
  });
}

export async function createOtherEntityAction(formData: FormData) {
  await requireUser();
  const entity = await prisma.otherEntity.create({ data: parseOtherEntity(formData) });
  revalidatePath('/others');
  await setFlashMessage({
    type: 'success',
    title: 'Entita salvata',
    message: 'Il nuovo riferimento e stato creato correttamente.'
  });
  redirect(`/others/${entity.id}`);
}

export async function updateOtherEntityAction(id: string, formData: FormData) {
  await requireUser();
  await prisma.otherEntity.update({ where: { id }, data: parseOtherEntity(formData) });
  revalidatePath('/others');
  revalidatePath(`/others/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Entita aggiornata',
    message: 'Le modifiche sono state salvate correttamente.'
  });
  redirect(`/others/${id}`);
}

export async function deleteOtherEntityAction(id: string) {
  await requireUser();
  await prisma.otherEntity.delete({ where: { id } });
  revalidatePath('/others');
  await setFlashMessage({
    type: 'success',
    title: 'Entita eliminata',
    message: 'Il riferimento e stato rimosso.'
  });
  redirect('/others');
}
