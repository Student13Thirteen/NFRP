import 'server-only';

import { createHash } from 'node:crypto';
import { Prisma, RoadFineSource, RoadFineStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { removeStoredPdf, storePdfBuffer } from '@/lib/files';
import { extractInboxPdfTextFromBuffer } from '@/lib/inbox-analysis';
import { findDriverNameSuggestion } from '@/lib/driver-name-match';
import { parseRoadFineText, type ParsedRoadFineVehicleKind } from '@/lib/road-fine-parser';

export type RoadFineImportResult = {
  importedDocuments: number;
  supplementalDocuments: number;
  duplicateDocuments: number;
  errors: string[];
  importedIds: string[];
};

type ResolvedVehicle = {
  tractorId: string | null;
  trailerId: string | null;
  reviewReason: string | null;
};

export function buildRoadFineImportKey(buffer: Buffer): string {
  return `road-fine:sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

export function getRoadFineImportErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message.slice(0, 300)
    : 'Acquisizione verbale non riuscita.';
}

async function resolveVehicle(plate: string | null, vehicleKind: ParsedRoadFineVehicleKind | null): Promise<ResolvedVehicle> {
  if (!plate) {
    return { tractorId: null, trailerId: null, reviewReason: 'Targa non riconosciuta: seleziona il mezzo durante il controllo.' };
  }

  const [tractor, trailer] = await Promise.all([
    vehicleKind === 'TRAILER'
      ? Promise.resolve(null)
      : prisma.tractor.findFirst({
          where: { plate: { equals: plate, mode: 'insensitive' }, active: true, lifecycleStatus: 'ACTIVE' },
          select: { id: true }
        }),
    vehicleKind === 'TRACTOR'
      ? Promise.resolve(null)
      : prisma.trailer.findFirst({
          where: { plate: { equals: plate, mode: 'insensitive' }, active: true, lifecycleStatus: 'ACTIVE' },
          select: { id: true }
        })
  ]);

  if (tractor && !trailer) return { tractorId: tractor.id, trailerId: null, reviewReason: null };
  if (trailer && !tractor) return { tractorId: null, trailerId: trailer.id, reviewReason: null };
  return {
    tractorId: null,
    trailerId: null,
    reviewReason: `Targa ${plate} non collegata in modo univoco a un mezzo ${vehicleKind === 'TRAILER' ? 'rimorchiato' : vehicleKind === 'TRACTOR' ? 'a motore' : 'esistente'}: selezionalo manualmente.`
  };
}

async function resolveDriver(driverName: string | null): Promise<{ driverId: string | null; reviewReason: string | null }> {
  if (!driverName) return { driverId: null, reviewReason: null };
  const drivers = await prisma.driver.findMany({
    where: { active: true },
    select: { id: true, firstName: true, lastName: true, active: true }
  });
  const suggestion = findDriverNameSuggestion(driverName, drivers);
  return suggestion
    ? { driverId: suggestion.driver.id, reviewReason: `Autista proposto dal nominativo esplicito “${driverName}”: conferma la corrispondenza.` }
    : { driverId: null, reviewReason: `Conducente “${driverName}” non associato in modo univoco: selezionalo manualmente.` };
}

function requireRoadFineDocument(parsed: ReturnType<typeof parseRoadFineText>) {
  if (!parsed.isRoadFine) throw new Error('Il PDF non sembra un verbale di violazione al Codice della Strada.');
}

async function findFineByHash(importKey: string) {
  const byHash = await prisma.roadFine.findUnique({ where: { importKey }, select: { id: true } });
  if (byHash) return byHash;
  const attachment = await prisma.roadEventAttachment.findUnique({
    where: { contentHash: importKey },
    select: { fineId: true }
  });
  return attachment?.fineId ? { id: attachment.fineId } : null;
}

async function findFineByBusinessKey(authority: string | null, noticeNumber: string | null) {
  if (!authority || !noticeNumber) return null;
  return prisma.roadFine.findFirst({
    where: {
      noticeNumber: { equals: noticeNumber, mode: 'insensitive' },
      authority: { equals: authority, mode: 'insensitive' }
    },
    select: { id: true }
  });
}

type ImportedRoadFinePdf = { id: string; outcome: 'IMPORTED' | 'SUPPLEMENTAL' | 'DUPLICATE' };

async function attachSupplementalPdf(
  fineId: string,
  file: File,
  buffer: Buffer,
  importKey: string
): Promise<ImportedRoadFinePdf> {
  const stored = await storePdfBuffer(buffer, file.name || 'verbale.pdf', { mimeType: file.type || 'application/pdf' });
  try {
    await prisma.roadFine.update({
      where: { id: fineId },
      data: {
        attachments: { create: { ...stored, kind: 'NOTICE', contentHash: importKey } },
        revisions: { create: { event: 'ATTACHMENT_IMPORTED', summary: 'Nuovo PDF acquisito e aggiunto al fascicolo del verbale esistente.' } }
      },
      select: { id: true }
    });
    return { id: fineId, outcome: 'SUPPLEMENTAL' };
  } catch (error) {
    await removeStoredPdf(stored.filePath).catch(() => undefined);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await findFineByHash(importKey);
      if (existing) return { id: existing.id, outcome: 'DUPLICATE' };
    }
    throw error;
  }
}

async function importRoadFinePdf(file: File): Promise<ImportedRoadFinePdf> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const importKey = buildRoadFineImportKey(buffer);
  const duplicateByHash = await findFineByHash(importKey);
  if (duplicateByHash) return { id: duplicateByHash.id, outcome: 'DUPLICATE' };

  const extraction = await extractInboxPdfTextFromBuffer(buffer);
  if (!extraction.text.trim()) throw new Error('Il PDF non contiene testo leggibile e l’OCR non ha prodotto risultati.');
  const parsed = parseRoadFineText(extraction.text);
  requireRoadFineDocument(parsed);
  const existingFine = await findFineByBusinessKey(parsed.authority, parsed.noticeNumber);
  if (existingFine) return attachSupplementalPdf(existingFine.id, file, buffer, importKey);

  const [vehicle, driver] = await Promise.all([
    resolveVehicle(parsed.plate, parsed.vehicleKind),
    resolveDriver(parsed.driverName)
  ]);
  const reviewReasons = Array.from(new Set([
    extraction.status,
    ...parsed.reviewReasons,
    vehicle.reviewReason,
    driver.reviewReason
  ].filter((reason): reason is string => Boolean(reason)))).join(' ');
  const stored = await storePdfBuffer(buffer, file.name || 'verbale.pdf', { mimeType: file.type || 'application/pdf' });

  try {
    const created = await prisma.roadFine.create({
      data: {
        status: RoadFineStatus.TO_REVIEW,
        responsibility: 'TO_ASSESS',
        source: RoadFineSource.IMPORT,
        importKey,
        extractionStatus: extraction.status,
        reviewReasons,
        extractedText: extraction.text.slice(0, 100_000),
        noticeNumber: parsed.noticeNumber,
        authority: parsed.authority,
        violationDate: parsed.violationDate,
        violationTime: parsed.violationTime,
        notificationDate: parsed.notificationDate,
        location: parsed.location,
        violationCode: parsed.violationCode,
        description: parsed.description,
        tractorId: vehicle.tractorId,
        trailerId: vehicle.trailerId,
        driverId: driver.driverId,
        pointsDeducted: parsed.pointsDeducted,
        reducedAmountCents: parsed.reducedAmountCents,
        standardAmountCents: parsed.standardAmountCents,
        discountedPaymentDueDate: parsed.discountedPaymentDueDate,
        paymentDueDate: parsed.paymentDueDate,
        appealDueDate: parsed.appealDueDate,
        paidAmountCents: null,
        paymentDate: null,
        paymentReference: null,
        driverChargeCents: null,
        attachments: { create: { ...stored, kind: 'NOTICE', contentHash: importKey } },
        revisions: { create: { event: 'IMPORTED', summary: 'Verbale acquisito da PDF e preparato per il controllo.' } }
      },
      select: { id: true }
    });
    return { id: created.id, outcome: 'IMPORTED' };
  } catch (error) {
    await removeStoredPdf(stored.filePath).catch(() => undefined);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await findFineByHash(importKey);
      if (existing) return { id: existing.id, outcome: 'DUPLICATE' };
    }
    throw error;
  }
}

export async function importRoadFinePdfFiles(files: File[]): Promise<RoadFineImportResult> {
  if (files.length === 0) throw new Error('Seleziona almeno un PDF verbale.');
  const result: RoadFineImportResult = {
    importedDocuments: 0,
    supplementalDocuments: 0,
    duplicateDocuments: 0,
    errors: [],
    importedIds: []
  };

  for (const file of files) {
    try {
      const imported = await importRoadFinePdf(file);
      result.importedIds.push(imported.id);
      if (imported.outcome === 'DUPLICATE') result.duplicateDocuments += 1;
      else if (imported.outcome === 'SUPPLEMENTAL') result.supplementalDocuments += 1;
      else result.importedDocuments += 1;
    } catch (error) {
      console.error('Acquisizione verbale fallita.', { fileName: file.name, error: getRoadFineImportErrorMessage(error) });
      result.errors.push(`${file.name}: ${getRoadFineImportErrorMessage(error)}`);
    }
  }
  return result;
}
