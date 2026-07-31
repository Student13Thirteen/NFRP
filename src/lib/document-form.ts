import 'server-only';

import { DocumentStatus, EntityType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getMirrorDocumentById } from '@/lib/document-mirror';
import { enqueueDocumentMirrorSync } from '@/lib/document-mirror-queue';
import { buildEntityRelation } from '@/lib/documents';
import { emptyStoredPdf, removeStoredPdf, storePdfFile, type NullableStoredPdf, type StoredPdf } from '@/lib/files';
import { formString, optionalFormString } from '@/lib/form';
import { isDisposedVehicleStatus } from '@/lib/vehicle-lifecycle';

const documentMetadataSchema = z.object({
  title: z.string().min(1, 'Titolo richiesto').max(180),
  documentTypeId: z.string().min(1),
  entityType: z.nativeEnum(EntityType),
  entityId: z.string().min(1),
  issueDate: z.date().nullable(),
  expiryDate: z.date(),
  noticeDays: z.number().int().min(1).max(3650),
  amountCents: z.number().int().min(0).max(999999999).nullable(),
  notes: z.string().max(4000).nullable(),
  status: z.nativeEnum(DocumentStatus)
});

export function getDocumentFormErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message || 'Dati non validi.';
  }

  if (error instanceof Error && error.message) {
    return error.message.slice(0, 300);
  }

  return 'Operazione non riuscita. Riprova.';
}

export function logDocumentFormError(message: string, error: unknown) {
  console.error(message, error instanceof Error ? { message: error.message, stack: error.stack } : { error });
}

export async function removeUploadedPdfAfterFailure(storedPdf: Pick<StoredPdf, 'filePath'> | NullableStoredPdf | null) {
  if (!storedPdf?.filePath) return;

  try {
    await removeStoredPdf(storedPdf.filePath);
  } catch (error) {
    console.error('Impossibile eliminare il PDF dopo un salvataggio fallito.', {
      filePath: storedPdf.filePath,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function normalizeTypeName(value: string): string {
  return value.toLocaleLowerCase('it-IT').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function isLastDayOfUtcMonth(date: Date): boolean {
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return date.getUTCDate() === lastDay;
}

// Quando si crea/valida un BARRATO ROSA per un mezzo, allinea il GIORNO esatto ai libretti/revisioni attivi
// dello stesso mezzo che hanno la scadenza impostata a FINE MESE nello stesso mese/anno: il talloncino
// revisione riporta solo mese/anno (quindi fine mese), il barrato rosa ha il giorno preciso e i due scadono
// insieme. Copre il caso "carico il barrato dopo il libretto". Best-effort: non blocca mai la creazione.
export async function alignLibrettoExpiryToBarratoRosa(documentId: string): Promise<void> {
  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        status: true,
        entityType: true,
        tractorId: true,
        trailerId: true,
        expiryDate: true,
        documentType: { select: { name: true } }
      }
    });
    if (!document?.expiryDate) return;
    if (document.status === DocumentStatus.ARCHIVED || document.status === DocumentStatus.RENEWED) return;
    if (!normalizeTypeName(document.documentType.name).includes('barrato rosa')) return;

    const vehicleWhere =
      document.entityType === EntityType.TRACTOR && document.tractorId
        ? { tractorId: document.tractorId }
        : document.entityType === EntityType.TRAILER && document.trailerId
          ? { trailerId: document.trailerId }
          : null;
    if (!vehicleWhere) return;

    const expiry = document.expiryDate;
    const monthStart = new Date(Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth() + 1, 1));

    const libretti = await prisma.document.findMany({
      where: {
        status: { notIn: [DocumentStatus.ARCHIVED, DocumentStatus.RENEWED] },
        entityType: document.entityType,
        ...vehicleWhere,
        documentType: { name: { contains: 'libretto', mode: 'insensitive' } },
        expiryDate: { gte: monthStart, lt: nextMonthStart }
      },
      select: { id: true, expiryDate: true }
    });

    for (const libretto of libretti) {
      if (!libretto.expiryDate || !isLastDayOfUtcMonth(libretto.expiryDate)) continue; // solo scadenze fine-mese
      if (libretto.expiryDate.getTime() === expiry.getTime()) continue;
      const previous = await getMirrorDocumentById(libretto.id); // stato pre-modifica per spostare la copia mirror
      await prisma.$transaction(async (tx) => {
        await tx.document.update({ where: { id: libretto.id }, data: { expiryDate: expiry } });
        await enqueueDocumentMirrorSync(tx, {
          documentId: libretto.id,
          previousDocument: previous,
          uploadRequired: false
        });
      });
    }
  } catch (error) {
    console.error('Allineamento scadenza libretto/revisione al barrato rosa non riuscito.', {
      documentId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function parseDate(value: string, required: boolean): Date | null {
  if (!value) {
    if (required) throw new Error('Data obbligatoria mancante.');
    return null;
  }

  const normalizedValue = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizedValue);
  const italianMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalizedValue);
  const parts = isoMatch
    ? { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) }
    : italianMatch
      ? { year: Number(italianMatch[3]), month: Number(italianMatch[2]), day: Number(italianMatch[1]) }
      : null;

  if (!parts) {
    throw new Error('Data non valida. Usa il formato gg/mm/aaaa.');
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    throw new Error('Data non valida. Usa il formato gg/mm/aaaa.');
  }
  return date;
}

function parseEntityKey(entityKey: string) {
  const [entityType, entityId] = entityKey.split(':');
  return {
    entityType: z.nativeEnum(EntityType).parse(entityType),
    entityId: z.string().min(1).parse(entityId)
  };
}

function parseAmountCents(formData: FormData): number | null {
  const value = optionalFormString(formData, 'amount');
  if (value === null) return null;
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error('Costo non valido. Usa al massimo due decimali.');
  }
  return Math.round(Number(normalized) * 100);
}

async function getEntityTitleLabel(entityType: EntityType, entityId: string): Promise<string> {
  if (entityType === EntityType.DRIVER) {
    const driver = await prisma.driver.findUnique({ where: { id: entityId } });
    if (!driver) throw new Error('Autista non valido.');
    return `${driver.firstName} ${driver.lastName}`;
  }

  if (entityType === EntityType.TRACTOR) {
    const tractor = await prisma.tractor.findUnique({ where: { id: entityId } });
    if (!tractor) throw new Error('Trattore non valido.');
    return tractor.plate;
  }

  if (entityType === EntityType.TRAILER) {
    const trailer = await prisma.trailer.findUnique({ where: { id: entityId } });
    if (!trailer) throw new Error('Semirimorchio non valido.');
    return trailer.plate;
  }

  const otherEntity = await prisma.otherEntity.findUnique({ where: { id: entityId } });
  if (!otherEntity) throw new Error('Entità non valida.');
  return `${otherEntity.category}: ${otherEntity.name}`;
}

export async function parseDocumentMetadata(formData: FormData, fallbackNoticeDays?: number) {
  const documentTypeId = formString(formData, 'documentTypeId');
  const documentType = await prisma.documentType.findUnique({ where: { id: documentTypeId } });
  if (!documentType) throw new Error('Tipo documento non valido.');

  const noticeDaysValue = Number(formData.get('noticeDays') || fallbackNoticeDays || documentType.defaultNoticeDays);
  const { entityType, entityId } = parseEntityKey(formString(formData, 'entityKey'));
  const entityLabel = await getEntityTitleLabel(entityType, entityId);
  const generatedTitle = `${documentType.name} - ${entityLabel}`.slice(0, 180);

  return documentMetadataSchema.parse({
    title: optionalFormString(formData, 'title') || generatedTitle,
    documentTypeId,
    entityType,
    entityId,
    issueDate: parseDate(formString(formData, 'issueDate'), false),
    expiryDate: parseDate(formString(formData, 'expiryDate'), true),
    noticeDays: noticeDaysValue,
    amountCents: parseAmountCents(formData),
    notes: optionalFormString(formData, 'notes'),
    status: formString(formData, 'status') || DocumentStatus.VALID
  });
}

export async function resolveDocumentStatusForEntity(
  entityType: EntityType,
  entityId: string,
  requestedStatus: DocumentStatus
): Promise<DocumentStatus> {
  if (entityType === EntityType.TRACTOR) {
    const tractor = await prisma.tractor.findUnique({ where: { id: entityId }, select: { lifecycleStatus: true } });
    if (tractor && isDisposedVehicleStatus(tractor.lifecycleStatus)) return DocumentStatus.ARCHIVED;
  }
  if (entityType === EntityType.TRAILER) {
    const trailer = await prisma.trailer.findUnique({ where: { id: entityId }, select: { lifecycleStatus: true } });
    if (trailer && isDisposedVehicleStatus(trailer.lifecycleStatus)) return DocumentStatus.ARCHIVED;
  }
  return requestedStatus;
}

function getOptionalPdf(formData: FormData): File | null {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size <= 0 || !file.name) return null;
  return file;
}

async function storeOptionalPdf(formData: FormData): Promise<NullableStoredPdf> {
  const file = getOptionalPdf(formData);
  if (!file) return emptyStoredPdf();
  return storePdfFile(file);
}

export async function createDocumentFromForm(formData: FormData) {
  const metadata = await parseDocumentMetadata(formData);
  const status = await resolveDocumentStatusForEntity(metadata.entityType, metadata.entityId, metadata.status);
  const storedPdf = await storeOptionalPdf(formData);

  try {
    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          title: metadata.title,
          documentTypeId: metadata.documentTypeId,
          entityType: metadata.entityType,
          ...buildEntityRelation(metadata.entityType, metadata.entityId),
          issueDate: metadata.issueDate,
          expiryDate: metadata.expiryDate,
          noticeDays: metadata.noticeDays,
          amountCents: metadata.amountCents,
          notes: metadata.notes,
          status,
          ...storedPdf
        }
      });
      if (storedPdf.filePath) {
        await enqueueDocumentMirrorSync(tx, { documentId: created.id, uploadRequired: true });
      }
      return created;
    });
    await alignLibrettoExpiryToBarratoRosa(document.id);
    return document;
  } catch (error) {
    await removeUploadedPdfAfterFailure(storedPdf);
    throw error;
  }
}

export async function createDocumentWithStoredPdfFromForm(formData: FormData, storedPdf: StoredPdf) {
  const metadata = await parseDocumentMetadata(formData);
  const status = await resolveDocumentStatusForEntity(metadata.entityType, metadata.entityId, metadata.status);

  const document = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        title: metadata.title,
        documentTypeId: metadata.documentTypeId,
        entityType: metadata.entityType,
        ...buildEntityRelation(metadata.entityType, metadata.entityId),
        issueDate: metadata.issueDate,
        expiryDate: metadata.expiryDate,
        noticeDays: metadata.noticeDays,
        amountCents: metadata.amountCents,
        notes: metadata.notes,
        status,
        ...storedPdf
      }
    });
    await enqueueDocumentMirrorSync(tx, { documentId: created.id, uploadRequired: true });
    return created;
  });
  await alignLibrettoExpiryToBarratoRosa(document.id);
  return document;
}

export async function updateDocumentFromForm(id: string, formData: FormData) {
  const current = await getMirrorDocumentById(id);
  if (!current) throw new Error('Documento non trovato.');

  const metadata = await parseDocumentMetadata(formData, current.noticeDays);
  const status = await resolveDocumentStatusForEntity(metadata.entityType, metadata.entityId, metadata.status);
  const uploadedPdf = getOptionalPdf(formData);
  const storedPdf = uploadedPdf ? await storePdfFile(uploadedPdf) : null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id },
        data: {
          title: metadata.title,
          documentTypeId: metadata.documentTypeId,
          entityType: metadata.entityType,
          ...buildEntityRelation(metadata.entityType, metadata.entityId),
          issueDate: metadata.issueDate,
          expiryDate: metadata.expiryDate,
          noticeDays: metadata.noticeDays,
          amountCents: metadata.amountCents,
          notes: metadata.notes,
          status,
          ...(storedPdf ? storedPdf : {})
        }
      });
      await enqueueDocumentMirrorSync(tx, {
        documentId: id,
        previousDocument: current,
        uploadRequired: Boolean(storedPdf)
      });
    });
  } catch (error) {
    await removeUploadedPdfAfterFailure(storedPdf);
    throw error;
  }

  if (storedPdf && current.filePath) {
    try {
      await removeStoredPdf(current.filePath);
    } catch (error) {
      console.error('Impossibile eliminare il vecchio PDF dal filesystem.', {
        documentId: id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export async function renewDocumentFromForm(id: string, formData: FormData) {
  const oldDocument = await getMirrorDocumentById(id);
  if (!oldDocument) throw new Error('Documento da rinnovare non trovato.');

  const metadata = await parseDocumentMetadata(formData, oldDocument.noticeDays);
  const status = await resolveDocumentStatusForEntity(metadata.entityType, metadata.entityId, metadata.status);
  const storedPdf = await storeOptionalPdf(formData);

  try {
    const newDocument = await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id },
        data: { status: DocumentStatus.RENEWED }
      });

      const created = await tx.document.create({
        data: {
          title: metadata.title,
          documentTypeId: metadata.documentTypeId,
          entityType: metadata.entityType,
          ...buildEntityRelation(metadata.entityType, metadata.entityId),
          issueDate: metadata.issueDate,
          expiryDate: metadata.expiryDate,
          noticeDays: metadata.noticeDays,
          amountCents: metadata.amountCents,
          notes: metadata.notes,
          status,
          renewedFromId: id,
          ...storedPdf
        }
      });
      await enqueueDocumentMirrorSync(tx, {
        documentId: id,
        previousDocument: oldDocument,
        uploadRequired: false
      });
      if (storedPdf.filePath) {
        await enqueueDocumentMirrorSync(tx, { documentId: created.id, uploadRequired: true });
      }
      return created;
    });
    await alignLibrettoExpiryToBarratoRosa(newDocument.id);
    return newDocument;
  } catch (error) {
    await removeUploadedPdfAfterFailure(storedPdf);
    throw error;
  }
}
