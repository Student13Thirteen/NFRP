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
import { parseTankCargo, parseTrailerBodyType } from '@/lib/vehicle-types';

const trailerSchema = z.object({
  plate: z.string().min(1, 'Targa richiesta').max(20),
  brand: z.string().max(80).nullable(),
  model: z.string().max(80).nullable(),
  assignedTractorId: z.string().min(1).nullable(),
  notes: z.string().max(2000).nullable()
});

function parseTrailer(formData: FormData) {
  const bodyType = parseTrailerBodyType(optionalFormString(formData, 'bodyType'));
  return {
    ...trailerSchema.parse({
      plate: normalizePlate(formString(formData, 'plate')),
      brand: optionalFormString(formData, 'brand'),
      model: optionalFormString(formData, 'model'),
      assignedTractorId: optionalFormString(formData, 'assignedTractorId'),
      notes: optionalFormString(formData, 'notes')
    }),
    bodyType,
    // Il carico resta solo sulle cisterne: cambiando allestimento non puo
    // sopravvivere un residuo "GPL" su un container o un frigo.
    tankCargo: parseTankCargo(optionalFormString(formData, 'tankCargo'), bodyType)
  };
}

/**
 * Avviso non bloccante sull'abbinamento: la targa si salva comunque, ma se il
 * trattore scelto e gia in coppia con altri semirimorchi l'operatore lo legge
 * subito invece di scoprirlo dopo.
 */
async function buildPairingWarning(trailerId: string, assignedTractorId: string | null): Promise<string | null> {
  if (!assignedTractorId) return null;
  // Una sola lettura: targa del trattore e semirimorchi gia in coppia con lui.
  const tractor = await prisma.tractor.findUnique({
    where: { id: assignedTractorId },
    select: {
      plate: true,
      assignedTrailers: { where: { id: { not: trailerId } }, select: { plate: true }, orderBy: { plate: 'asc' } }
    }
  });
  if (!tractor || tractor.assignedTrailers.length === 0) return null;
  return `${tractor.plate} risulta abbinato anche a ${tractor.assignedTrailers.map((item) => item.plate).join(', ')}.`;
}

export async function createTrailerAction(formData: FormData) {
  await requireUser();
  const trailerData = parseTrailer(formData);
  const trailer = await prisma.trailer.create({
    data: {
      ...trailerData,
      active: true,
      lifecycleStatus: VehicleLifecycleStatus.ACTIVE
    }
  });
  const pairingWarning = await buildPairingWarning(trailer.id, trailerData.assignedTractorId);
  revalidatePath(`/vehicles/trailers/${trailer.id}`, 'layout');
  revalidatePath('/vehicles/trailers');
  revalidatePath('/vehicles/tractors');
  await setFlashMessage({
    type: pairingWarning ? 'warning' : 'success',
    title: pairingWarning ? 'Semirimorchio salvato con avviso' : 'Semirimorchio salvato',
    message: pairingWarning || 'La nuova targa e stata inserita correttamente.'
  });
  redirect(`/vehicles/trailers/${trailer.id}`);
}

/**
 * Classificazione rapida dalla lista semirimorchi: allestimento e carico
 * viaggiano insieme, cosi passando a container o frigo il carico cisterna viene
 * azzerato nello stesso salvataggio.
 */
export async function setTrailerBodyTypeAction(trailerId: string, bodyValue: string, cargoValue: string): Promise<void> {
  await requireUser();
  const bodyType = parseTrailerBodyType(bodyValue);
  const tankCargo = parseTankCargo(cargoValue, bodyType);
  await prisma.trailer.update({ where: { id: trailerId }, data: { bodyType, tankCargo } });
  revalidatePath('/vehicles/trailers');
  revalidatePath(`/vehicles/trailers/${trailerId}`);
}

export async function updateTrailerAction(id: string, formData: FormData) {
  await requireUser();
  const trailerData = parseTrailer(formData);
  const lifecycleStatus = z.nativeEnum(VehicleLifecycleStatus).parse(formString(formData, 'lifecycleStatus'));
  const lifecycleEndedAt = parseVehicleLifecycleEndedAt(formString(formData, 'lifecycleEndedAt'), lifecycleStatus);
  const current = await prisma.trailer.findUnique({ where: { id }, select: { lifecycleStatus: true, plate: true } });
  if (!current) throw new Error('Semirimorchio non trovato.');

  const documentsAffected = current.plate !== trailerData.plate || current.lifecycleStatus !== lifecycleStatus;
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

  const pairingWarning = await buildPairingWarning(id, trailerData.assignedTractorId);

  revalidatePath('/vehicles/trailers');
  revalidatePath(`/vehicles/trailers/${id}`, 'layout');
  revalidatePath('/vehicles/tractors');
  // Vedi la nota nelle azioni dei mezzi a motore: si invalidano documenti e
  // quadro operativo solo quando cambiano davvero.
  if (documentsAffected) {
    revalidatePath('/documents');
    revalidatePath('/documents/history');
    revalidatePath('/documents/disposed');
    revalidatePath('/dashboard');
  }
  await setFlashMessage({
    type: pairingWarning ? 'warning' : 'success',
    title: pairingWarning ? 'Semirimorchio aggiornato con avviso' : 'Semirimorchio aggiornato',
    message: isDisposedVehicleStatus(lifecycleStatus)
      ? `La targa e stata classificata come ${getVehicleLifecycleLabel(lifecycleStatus).toLocaleLowerCase('it-IT')}. Documenti e PDF restano nello storico dedicato.`
      : pairingWarning || 'Le modifiche sono state salvate correttamente.'
  });
  // Come per i mezzi a motore: si resta sulla scheda gia aggiornata.
}
