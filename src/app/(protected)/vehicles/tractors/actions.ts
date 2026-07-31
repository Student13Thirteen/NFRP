'use server';

import { requireUser } from '@/lib/auth';

import { DocumentStatus, VehicleLifecycleStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { documentInclude } from '@/lib/documents';
import { enqueueDocumentMirrorSyncs } from '@/lib/document-mirror-queue';
import { setFlashMessage } from '@/lib/flash';
import { formString, normalizePlate, optionalFormString } from '@/lib/form';
import {
  getVehicleLifecycleLabel,
  isDisposedVehicleStatus,
  parseVehicleLifecycleEndedAt
} from '@/lib/vehicle-lifecycle';

const tractorSchema = z.object({
  plate: z.string().min(1, 'Targa richiesta').max(20),
  brand: z.string().max(80).nullable(),
  model: z.string().max(80).nullable(),
  assignedDriverId: z.string().min(1).nullable(),
  notes: z.string().max(2000).nullable()
});

function parseTractor(formData: FormData) {
  return tractorSchema.parse({
    plate: normalizePlate(formString(formData, 'plate')),
    brand: optionalFormString(formData, 'brand'),
    model: optionalFormString(formData, 'model'),
    assignedDriverId: optionalFormString(formData, 'assignedDriverId'),
    notes: optionalFormString(formData, 'notes')
  });
}

export async function createTractorAction(formData: FormData) {
  await requireUser();
  const tractor = await prisma.tractor.create({
    data: {
      ...parseTractor(formData),
      active: true,
      lifecycleStatus: VehicleLifecycleStatus.ACTIVE
    }
  });
  revalidatePath('/vehicles/tractors');
  await setFlashMessage({
    type: 'success',
    title: 'Trattore salvato',
    message: 'La nuova targa e stata inserita correttamente.'
  });
  redirect(`/vehicles/tractors/${tractor.id}`);
}

export async function updateTractorAction(id: string, formData: FormData) {
  await requireUser();
  const tractorData = parseTractor(formData);
  const lifecycleStatus = z.nativeEnum(VehicleLifecycleStatus).parse(formString(formData, 'lifecycleStatus'));
  const lifecycleEndedAt = parseVehicleLifecycleEndedAt(formString(formData, 'lifecycleEndedAt'), lifecycleStatus);
  const current = await prisma.tractor.findUnique({ where: { id }, select: { lifecycleStatus: true, plate: true } });
  if (!current) throw new Error('Trattore non trovato.');

  const mirrorPathChanges =
    current.plate !== tractorData.plate ||
    (current.lifecycleStatus !== lifecycleStatus &&
      (isDisposedVehicleStatus(current.lifecycleStatus) || isDisposedVehicleStatus(lifecycleStatus)));
  const previousDocuments = mirrorPathChanges
    ? await prisma.document.findMany({ where: { tractorId: id }, include: documentInclude })
    : [];

  await prisma.$transaction(async (tx) => {
    await tx.tractor.update({
      where: { id },
      data: {
        ...tractorData,
        active: lifecycleStatus === VehicleLifecycleStatus.ACTIVE,
        lifecycleStatus,
        lifecycleEndedAt
      }
    });

    if (isDisposedVehicleStatus(lifecycleStatus)) {
      await tx.document.updateMany({
        where: {
          tractorId: id,
          status: { notIn: [DocumentStatus.ARCHIVED, DocumentStatus.RENEWED] }
        },
        data: { status: DocumentStatus.ARCHIVED }
      });
    }

    await enqueueDocumentMirrorSyncs(
      tx,
      previousDocuments.map((document) => ({
        documentId: document.id,
        previousDocument: document,
        uploadRequired: false
      }))
    );
  });

  revalidatePath('/vehicles/tractors');
  revalidatePath(`/vehicles/tractors/${id}`);
  revalidatePath('/documents');
  revalidatePath('/documents/history');
  revalidatePath('/documents/disposed');
  revalidatePath('/dashboard');
  await setFlashMessage({
    type: 'success',
    title: 'Trattore aggiornato',
    message: isDisposedVehicleStatus(lifecycleStatus)
      ? `La targa e stata classificata come ${getVehicleLifecycleLabel(lifecycleStatus).toLocaleLowerCase('it-IT')}. Documenti e PDF restano nello storico dedicato.`
      : 'Le modifiche sono state salvate correttamente.'
  });
  redirect(`/vehicles/tractors/${id}`);
}
