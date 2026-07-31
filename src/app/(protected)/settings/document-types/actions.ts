'use server';

import { requireUser } from '@/lib/auth';

import { EntityType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { setFlashMessage } from '@/lib/flash';
import { formBoolean, formString } from '@/lib/form';
import { DEFAULT_FIRE_EXTINGUISHER_RATES } from '@/lib/fire-extinguisher';
import { updateFireExtinguisherRates } from '@/lib/fire-extinguisher-settings';

const documentTypeSchema = z.object({
  name: z.string().min(1, 'Nome richiesto').max(120),
  suggestedEntityType: z.nativeEnum(EntityType),
  defaultNoticeDays: z.number().int().min(1).max(3650),
  active: z.boolean()
});

function parseDocumentType(formData: FormData) {
  return documentTypeSchema.parse({
    name: formString(formData, 'name'),
    suggestedEntityType: formString(formData, 'suggestedEntityType'),
    defaultNoticeDays: Number(formData.get('defaultNoticeDays') || 30),
    active: formBoolean(formData, 'active')
  });
}

export async function createDocumentTypeAction(formData: FormData) {
  await requireUser();
  await prisma.documentType.create({ data: parseDocumentType(formData) });
  revalidatePath('/settings/document-types');
  await setFlashMessage({
    type: 'success',
    title: 'Tipo documento salvato',
    message: 'La nuova categoria e stata creata correttamente.'
  });
}

export async function updateDocumentTypeAction(id: string, formData: FormData) {
  await requireUser();
  await prisma.documentType.update({ where: { id }, data: parseDocumentType(formData) });
  revalidatePath('/settings/document-types');
  await setFlashMessage({
    type: 'success',
    title: 'Tipo documento aggiornato',
    message: 'Le modifiche sono state salvate correttamente.'
  });
}

export async function deleteDocumentTypeAction(id: string) {
  await requireUser();
  await prisma.documentType.delete({ where: { id } });
  revalidatePath('/settings/document-types');
  await setFlashMessage({
    type: 'success',
    title: 'Tipo documento eliminato',
    message: 'La categoria e stata rimossa.'
  });
}

function parseRateCents(formData: FormData, capacityKg: number): number {
  const value = formString(formData, `fireExtinguisherRate${capacityKg}`)
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error(`Tariffa estintore ${capacityKg} kg non valida.`);
  }
  return Math.round(Number(value) * 100);
}

export async function updateFireExtinguisherRatesAction(formData: FormData) {
  await requireUser();
  await updateFireExtinguisherRates(
    DEFAULT_FIRE_EXTINGUISHER_RATES.map((rate) => ({
      capacityKg: rate.capacityKg,
      priceCents: parseRateCents(formData, rate.capacityKg)
    }))
  );
  revalidatePath('/settings/document-types');
  await setFlashMessage({
    type: 'success',
    title: 'Tariffe estintori aggiornate',
    message: 'I prossimi documenti useranno i nuovi prezzi per il calcolo automatico.'
  });
}
