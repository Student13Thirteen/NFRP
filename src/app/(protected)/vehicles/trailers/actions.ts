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

const trailerSchema = z.object({
  plate: z.string().min(1, 'Targa richiesta').max(20),
  brand: z.string().max(80).nullable(),
  model: z.string().max(80).nullable(),
  assignedTractorId: z.string().min(1).nullable(),
  notes: z.string().max(2000).nullable()
});

function parseTrailer(formData: FormData) {
  return trailerSchema.parse({
    plate: normalizePlate(formString(formData, 'plate')),
    brand: optionalFormString(formData, 'brand'),
    model: optionalFormString(formData, 'model'),
    assignedTractorId: optionalFormString(formData, 'assignedTractorId'),
    notes: optionalFormString(formData, 'notes')
  });
}

export async function createTrailerAction(formData: FormData) {
  await requireUser();
  const trailer = await prisma.trailer.create({
    data: {
      ...parseTrailer(formData),
      active: true,
      lifecycleStatus: VehicleLifecycleStatus.ACTIVE
    }
  });
  revalidatePath('/vehicles/trailers');
  await setFlashMessage({
    type: 'success',
    title: 'Semirimorchio salvato',
    message: 'La nuova targa e stata inserita correttamente.'
  });
  redirect(`/vehicles/trailers/${trailer.id}`);
}

export async function updateTrailerAction(id: string, formData: FormData) {
  await requireUser();
  const trailerData = parseTrailer(formData);
  const lifecycleStatus = z.nativeEnum(VehicleLifecycleStatus).parse(formString(formData, 'lifecycleStatus'));
  const lifecycleEndedAt = parseVehicleLifecycleEndedAt(formString(formData, 'lifecycleEndedAt'), lifecycleStatus);
  const current = await prisma.trailer.findUnique({ where: { id }, select: { lifecycleStatus: true, plate: true } });
  if (!current) throw new Error('Semirimorchio non trovato.');

  const mirrorPathChanges =
    current.plate !== trailerData.plate ||
    (current.lifecycleStatus !== lifecycleStatus &&
      (isDisposedVehicleStatus(current.lifecycleStatus) || isDisposedVehicleStatus(lifecycleStatus)));
  const previousDocuments = mirrorPathChanges
    ? await prisma.document.findMany({ where: { trailerId: id }, include: documentInclude })
    : [];

  await prisma.$transaction(async (tx) => {
    await tx.trailer.update({
      where: { id },
      data: {
        ...trailerData,
        active: lifecycleStatus === VehicleLifecycleStatus.ACTIVE,
        lifecycleStatus,
        lifecycleEndedAt
      }
    });

    if (isDisposedVehicleStatus(lifecycleStatus)) {
      await tx.document.updateMany({
        where: {
          trailerId: id,
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

  revalidatePath('/vehicles/trailers');
  revalidatePath(`/vehicles/trailers/${id}`);
  revalidatePath('/documents');
  revalidatePath('/documents/history');
  revalidatePath('/documents/disposed');
  revalidatePath('/dashboard');
  await setFlashMessage({
    type: 'success',
    title: 'Semirimorchio aggiornato',
    message: isDisposedVehicleStatus(lifecycleStatus)
      ? `La targa e stata classificata come ${getVehicleLifecycleLabel(lifecycleStatus).toLocaleLowerCase('it-IT')}. Documenti e PDF restano nello storico dedicato.`
      : 'Le modifiche sono state salvate correttamente.'
  });
  redirect(`/vehicles/trailers/${id}`);
}
