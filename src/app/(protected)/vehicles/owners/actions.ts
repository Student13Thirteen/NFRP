'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { setFlashMessage } from '@/lib/flash';
import { formString, optionalFormString } from '@/lib/form';
import { findOrCreateVehicleOwner, normalizeVehicleOwnerName } from '@/lib/vehicle-owners';

const vehicleOwnerSchema = z.object({
  name: z.string().min(1, 'Nome proprietario richiesto').max(160),
  vatNumber: z.string().max(20).nullable(),
  phone: z.string().max(40).nullable(),
  notes: z.string().max(2000).nullable()
});

function parseVehicleOwner(formData: FormData) {
  return vehicleOwnerSchema.parse({
    name: normalizeVehicleOwnerName(formString(formData, 'name')),
    vatNumber: optionalFormString(formData, 'vatNumber'),
    phone: optionalFormString(formData, 'phone'),
    notes: optionalFormString(formData, 'notes')
  });
}

function errorRedirect(error: unknown): never {
  const message = error instanceof Error && error.message ? error.message.slice(0, 260) : 'Operazione non riuscita.';
  redirect(`/vehicles/owners?error=${encodeURIComponent(message)}`);
}

export async function createVehicleOwnerAction(formData: FormData) {
  await requireUser();
  let ownerId: string;
  try {
    const data = parseVehicleOwner(formData);
    // Un omonimo non crea un doppione: viene riusato e completato.
    const owner = await findOrCreateVehicleOwner(prisma, data.name);
    await prisma.vehicleOwner.update({
      where: { id: owner.id },
      data: { vatNumber: data.vatNumber, phone: data.phone, notes: data.notes }
    });
    ownerId = owner.id;
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath('/vehicles/owners', 'layout');
  await setFlashMessage({
    type: 'success',
    title: 'Proprietario salvato',
    message: 'Ora e selezionabile nei rifornimenti e nei viaggi con mezzi non aziendali.'
  });
  redirect(`/vehicles/owners?owner=${ownerId}`);
}

export async function updateVehicleOwnerAction(id: string, formData: FormData) {
  await requireUser();
  try {
    const data = parseVehicleOwner(formData);
    await prisma.vehicleOwner.update({
      where: { id },
      data: { ...data, active: formData.get('active') === 'on' }
    });
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath('/vehicles/owners', 'layout');
  revalidatePath('/fuel');
  await setFlashMessage({
    type: 'success',
    title: 'Proprietario aggiornato',
    message: 'Le modifiche sono state salvate correttamente.'
  });
  redirect('/vehicles/owners');
}
