'use server';

import { requireUser } from '@/lib/auth';

import { DocumentStatus, Prisma, VehicleLifecycleStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  createDriverAssignment,
  createDriverAssignmentInTransaction,
  deleteDriverAssignment,
  parseDriverAssignmentPeriod,
  updateDriverAssignment
} from '@/lib/driver-assignments';
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
  notes: z.string().max(2000).nullable()
});

function parseTractor(formData: FormData) {
  return tractorSchema.parse({
    plate: normalizePlate(formString(formData, 'plate')),
    brand: optionalFormString(formData, 'brand'),
    model: optionalFormString(formData, 'model'),
    notes: optionalFormString(formData, 'notes')
  });
}

function assignmentErrorRedirect(id: string, error: unknown): never {
  const message = error instanceof Error && error.message ? error.message.slice(0, 260) : 'Operazione non riuscita.';
  redirect(`/vehicles/tractors/${id}?assignmentError=${encodeURIComponent(message)}#driver-assignments`);
}

function assignmentInput(tractorId: string, formData: FormData) {
  const driverId = formString(formData, 'driverId');
  const period = parseDriverAssignmentPeriod({
    validFrom: formString(formData, 'validFrom'),
    validTo: formString(formData, 'validTo')
  });
  return {
    tractorId,
    driverId,
    ...period,
    notes: optionalFormString(formData, 'assignmentNotes')
  };
}

export async function createTractorAction(formData: FormData) {
  await requireUser();
  const assignedDriverId = optionalFormString(formData, 'assignedDriverId');
  const assignmentValidFrom = assignedDriverId
    ? parseDriverAssignmentPeriod({ validFrom: formString(formData, 'assignmentValidFrom'), validTo: '' }).validFrom
    : null;
  let tractor: { id: string };
  try {
    tractor = await prisma.$transaction(async (tx) => {
      const created = await tx.tractor.create({
        data: {
          ...parseTractor(formData),
          active: true,
          lifecycleStatus: VehicleLifecycleStatus.ACTIVE
        }
      });
      if (assignedDriverId && assignmentValidFrom) {
        await createDriverAssignmentInTransaction(tx, {
          tractorId: created.id,
          driverId: assignedDriverId,
          validFrom: assignmentValidFrom,
          validTo: null,
          notes: 'Associazione indicata durante la creazione del trattore.'
        });
      }
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message.slice(0, 260) : 'Creazione trattore non riuscita.';
    redirect(`/vehicles/tractors?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/vehicles/tractors');
  await setFlashMessage({
    type: 'success',
    title: 'Trattore salvato',
    message: 'La nuova targa e stata inserita correttamente.'
  });
  redirect(`/vehicles/tractors/${tractor.id}`);
}

export async function createTractorDriverAssignmentAction(tractorId: string, formData: FormData) {
  await requireUser();
  try {
    await createDriverAssignment(assignmentInput(tractorId, formData), {
      closeOpenAssignments: formData.get('closeOpenAssignments') === 'on'
    });
  } catch (error) {
    assignmentErrorRedirect(tractorId, error);
  }
  revalidatePath('/vehicles/tractors');
  revalidatePath(`/vehicles/tractors/${tractorId}`);
  await setFlashMessage({
    type: 'success',
    title: 'Associazione salvata',
    message: 'Il periodo trattore-autista e ora disponibile per manutenzioni e rifornimenti.'
  });
  redirect(`/vehicles/tractors/${tractorId}#driver-assignments`);
}

export async function updateTractorDriverAssignmentAction(tractorId: string, assignmentId: string, formData: FormData) {
  await requireUser();
  try {
    await updateDriverAssignment(assignmentId, assignmentInput(tractorId, formData));
  } catch (error) {
    assignmentErrorRedirect(tractorId, error);
  }
  revalidatePath('/vehicles/tractors');
  revalidatePath(`/vehicles/tractors/${tractorId}`);
  await setFlashMessage({
    type: 'success',
    title: 'Periodo aggiornato',
    message: 'Le nuove date saranno usate nelle associazioni automatiche.'
  });
  redirect(`/vehicles/tractors/${tractorId}#driver-assignments`);
}

export async function deleteTractorDriverAssignmentAction(tractorId: string, assignmentId: string) {
  await requireUser();
  try {
    await deleteDriverAssignment(assignmentId, tractorId);
  } catch (error) {
    assignmentErrorRedirect(tractorId, error);
  }
  revalidatePath('/vehicles/tractors');
  revalidatePath(`/vehicles/tractors/${tractorId}`);
  await setFlashMessage({
    type: 'success',
    title: 'Associazione eliminata',
    message: 'Il periodo e stato rimosso dallo storico.'
  });
  redirect(`/vehicles/tractors/${tractorId}#driver-assignments`);
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
