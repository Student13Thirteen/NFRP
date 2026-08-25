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
import { getTrailerTypeLabel, parseMotorVehicleType } from '@/lib/vehicle-types';

const tractorSchema = z.object({
  plate: z.string().min(1, 'Targa richiesta').max(20),
  brand: z.string().max(80).nullable(),
  model: z.string().max(80).nullable(),
  notes: z.string().max(2000).nullable()
});

function parseTractor(formData: FormData) {
  return {
    ...tractorSchema.parse({
      plate: normalizePlate(formString(formData, 'plate')),
      brand: optionalFormString(formData, 'brand'),
      model: optionalFormString(formData, 'model'),
      notes: optionalFormString(formData, 'notes')
    }),
    // Tipologia facoltativa: un mezzo non classificato resta esplicitamente tale.
    vehicleType: parseMotorVehicleType(optionalFormString(formData, 'vehicleType'))
  };
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
  // `layout` e necessario: il messaggio di conferma vive nel layout protetto.
  revalidatePath(`/vehicles/tractors/${tractor.id}`, 'layout');
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
  revalidatePath(`/vehicles/tractors/${tractorId}`, 'layout');
  await setFlashMessage({
    type: 'success',
    title: 'Associazione salvata',
    message: 'Il periodo trattore-autista e ora disponibile per manutenzioni e rifornimenti.'
  });
}

export async function updateTractorDriverAssignmentAction(tractorId: string, assignmentId: string, formData: FormData) {
  await requireUser();
  try {
    await updateDriverAssignment(assignmentId, assignmentInput(tractorId, formData));
  } catch (error) {
    assignmentErrorRedirect(tractorId, error);
  }
  revalidatePath('/vehicles/tractors');
  revalidatePath(`/vehicles/tractors/${tractorId}`, 'layout');
  await setFlashMessage({
    type: 'success',
    title: 'Periodo aggiornato',
    message: 'Le nuove date saranno usate nelle associazioni automatiche.'
  });
}

export async function deleteTractorDriverAssignmentAction(tractorId: string, assignmentId: string) {
  await requireUser();
  try {
    await deleteDriverAssignment(assignmentId, tractorId);
  } catch (error) {
    assignmentErrorRedirect(tractorId, error);
  }
  revalidatePath('/vehicles/tractors');
  revalidatePath(`/vehicles/tractors/${tractorId}`, 'layout');
  await setFlashMessage({
    type: 'success',
    title: 'Associazione eliminata',
    message: 'Il periodo e stato rimosso dallo storico.'
  });
}

/**
 * Abbinamento trattore-semirimorchio. Il vincolo e volutamente morbido: se la
 * targa scelta risulta gia abbinata altrove l'operazione riesce comunque, ma il
 * gestionale lo dichiara esplicitamente con un avviso invece di correggere in
 * silenzio o rifiutare un accoppiamento che sul piazzale e reale.
 */
export async function assignTrailerToTractorAction(tractorId: string, formData: FormData) {
  await requireUser();
  const trailerId = optionalFormString(formData, 'trailerId');
  if (!trailerId) {
    redirect(`/vehicles/tractors/${tractorId}?pairingError=${encodeURIComponent('Seleziona un semirimorchio da abbinare.')}#trailer-pairing`);
  }

  const [tractor, trailer, alreadyPaired] = await Promise.all([
    prisma.tractor.findUnique({ where: { id: tractorId }, select: { id: true, plate: true } }),
    prisma.trailer.findUnique({
      where: { id: trailerId },
      select: { id: true, plate: true, bodyType: true, tankCargo: true, assignedTractorId: true, assignedTractor: { select: { plate: true } } }
    }),
    prisma.trailer.findMany({
      where: { assignedTractorId: tractorId, id: { not: trailerId } },
      select: { plate: true }
    })
  ]);
  if (!tractor) throw new Error('Trattore non trovato.');
  if (!trailer) {
    redirect(`/vehicles/tractors/${tractorId}?pairingError=${encodeURIComponent('Semirimorchio non valido.')}#trailer-pairing`);
  }

  if (trailer.assignedTractorId === tractorId) {
    redirect(`/vehicles/tractors/${tractorId}#trailer-pairing`);
  }

  await prisma.trailer.update({ where: { id: trailer.id }, data: { assignedTractorId: tractorId } });

  const warnings: string[] = [];
  if (trailer.assignedTractor?.plate) {
    warnings.push(`${trailer.plate} era abbinato a ${trailer.assignedTractor.plate}: l'abbinamento precedente e stato sostituito.`);
  }
  if (alreadyPaired.length > 0) {
    warnings.push(
      `${tractor.plate} risulta ora abbinato a ${alreadyPaired.length + 1} semirimorchi (${[...alreadyPaired.map((item) => item.plate), trailer.plate].join(', ')}).`
    );
  }

  revalidatePath('/vehicles/tractors');
  revalidatePath(`/vehicles/tractors/${tractorId}`, 'layout');
  revalidatePath('/vehicles/trailers');
  revalidatePath(`/vehicles/trailers/${trailer.id}`);
  await setFlashMessage({
    type: warnings.length > 0 ? 'warning' : 'success',
    title: warnings.length > 0 ? 'Abbinamento salvato con avviso' : 'Semirimorchio abbinato',
    message:
      warnings.length > 0
        ? warnings.join(' ')
        : `${getTrailerTypeLabel(trailer)} ${trailer.plate} e ora abbinato a ${tractor.plate}.`
  });
}

export async function detachTrailerFromTractorAction(tractorId: string, trailerId: string) {
  await requireUser();
  const trailer = await prisma.trailer.findUnique({
    where: { id: trailerId },
    select: { id: true, plate: true, assignedTractorId: true }
  });
  if (!trailer || trailer.assignedTractorId !== tractorId) {
    redirect(`/vehicles/tractors/${tractorId}?pairingError=${encodeURIComponent('Abbinamento non piu presente.')}#trailer-pairing`);
  }

  await prisma.trailer.update({ where: { id: trailerId }, data: { assignedTractorId: null } });

  revalidatePath('/vehicles/tractors');
  revalidatePath(`/vehicles/tractors/${tractorId}`, 'layout');
  revalidatePath('/vehicles/trailers');
  revalidatePath(`/vehicles/trailers/${trailerId}`);
  await setFlashMessage({
    type: 'success',
    title: 'Abbinamento rimosso',
    message: `${trailer.plate} non e piu abbinato a questo trattore. Documenti, costi e storico restano invariati.`
  });
}

/**
 * Classificazione rapida dalla lista. Aggiorna solo la tipologia e invalida solo
 * le due pagine che la mostrano: niente redirect, niente flash e nessuna
 * invalidazione di documenti o quadro operativo, cosi classificare la flotta
 * costa un solo scambio leggero per mezzo.
 */
export async function setTractorVehicleTypeAction(tractorId: string, value: string): Promise<void> {
  await requireUser();
  const vehicleType = parseMotorVehicleType(value);
  await prisma.tractor.update({ where: { id: tractorId }, data: { vehicleType } });
  revalidatePath('/vehicles/tractors');
  revalidatePath(`/vehicles/tractors/${tractorId}`);
}

export async function updateTractorAction(id: string, formData: FormData) {
  await requireUser();
  const tractorData = parseTractor(formData);
  const lifecycleStatus = z.nativeEnum(VehicleLifecycleStatus).parse(formString(formData, 'lifecycleStatus'));
  const lifecycleEndedAt = parseVehicleLifecycleEndedAt(formString(formData, 'lifecycleEndedAt'), lifecycleStatus);
  const current = await prisma.tractor.findUnique({ where: { id }, select: { lifecycleStatus: true, plate: true } });
  if (!current) throw new Error('Trattore non trovato.');

  const documentsAffected = current.plate !== tractorData.plate || current.lifecycleStatus !== lifecycleStatus;
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
  revalidatePath(`/vehicles/tractors/${id}`, 'layout');
  // Documenti e quadro operativo cambiano solo se cambia la targa o se il mezzo
  // esce/rientra in flotta. Invalidarli a ogni salvataggio costringeva il
  // browser a riscaricare mezzo gestionale anche solo per una tipologia.
  if (documentsAffected) {
    revalidatePath('/documents');
    revalidatePath('/documents/history');
    revalidatePath('/documents/disposed');
    revalidatePath('/dashboard');
  }
  await setFlashMessage({
    type: 'success',
    title: 'Trattore aggiornato',
    message: isDisposedVehicleStatus(lifecycleStatus)
      ? `La targa e stata classificata come ${getVehicleLifecycleLabel(lifecycleStatus).toLocaleLowerCase('it-IT')}. Documenti e PDF restano nello storico dedicato.`
      : 'Le modifiche sono state salvate correttamente.'
  });
  // Nessun redirect: la destinazione sarebbe la pagina stessa e imporrebbe un
  // secondo viaggio di rete. Con il layout rivalidato la conferma compare e i
  // dati si aggiornano restando dove si e, senza perdere la posizione.
}
