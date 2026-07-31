import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Prisma, TollEntryStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getMaxUploadBytes, getUploadDir } from '@/lib/env';
import { sanitizeFileName } from '@/lib/files';
import {
  isCoherentTollAdjustment,
  parseTollCsvText,
  TOLL_PROVIDER_NAME,
  type ParsedTollRow
} from '@/lib/toll-parser';

type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

export type StoredTollCsv = {
  filePath: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
};

type TollImportSingleResult = {
  batchId: string;
  fileName: string;
  parsedRows: number;
  importedRows: number;
  duplicateRows: number;
  skippedRows: number;
  pendingRows: number;
  createdTractors: number;
  createdCards: number;
  assignedCards: number;
  reviewRows: number;
};

export type TollImportResult = {
  files: TollImportSingleResult[];
  parsedRows: number;
  importedRows: number;
  duplicateRows: number;
  skippedRows: number;
  pendingRows: number;
  createdTractors: number;
  createdCards: number;
  assignedCards: number;
  reviewRows: number;
  lastBatchId: string | null;
};

function compactPlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function sanitizeCsvFileName(fileName: string): string {
  const sanitized = sanitizeFileName(fileName || 'pedaggi.csv');
  return sanitized.toLocaleLowerCase('it-IT').endsWith('.csv') ? sanitized : `${sanitized.replace(/\.pdf$/i, '')}.csv`;
}

function isCsvLike(fileName: string, mimeType: string): boolean {
  const lowerName = fileName.toLocaleLowerCase('it-IT');
  return lowerName.endsWith('.csv') || ['text/csv', 'text/plain', 'application/vnd.ms-excel'].includes(mimeType);
}

function decodeCsvBuffer(buffer: Buffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes('\uFFFD')) return utf8;
  return new TextDecoder('iso-8859-1').decode(buffer);
}

async function storeTollCsvFile(file: File): Promise<StoredTollCsv> {
  const maxUploadBytes = getMaxUploadBytes();
  const originalFileName = sanitizeCsvFileName(file.name || 'pedaggi.csv');
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileSize = buffer.length;

  if (fileSize <= 0) throw new Error('Il file CSV e vuoto.');
  if (fileSize > maxUploadBytes) {
    throw new Error(`Il file supera il limite di ${Math.round(maxUploadBytes / 1024 / 1024)} MB.`);
  }
  if (!isCsvLike(originalFileName, file.type || '')) {
    throw new Error('Sono accettati solo file CSV autostrade.');
  }

  const uploadDir = getUploadDir();
  await mkdir(uploadDir, { recursive: true });

  const storedName = `${Date.now()}-${randomUUID()}.csv`;
  await writeFile(path.join(uploadDir, storedName), buffer, { flag: 'wx' });

  return {
    filePath: storedName,
    originalFileName,
    fileSize,
    mimeType: 'text/csv'
  };
}

export async function readStoredTollCsv(relativePath: string) {
  const uploadDir = getUploadDir();
  const absolutePath = path.resolve(uploadDir, relativePath);
  const resolvedUploadDir = path.resolve(uploadDir);

  if (!absolutePath.startsWith(resolvedUploadDir + path.sep)) {
    throw new Error('Percorso file non valido.');
  }

  const [fileBuffer, fileStat] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
  return { fileBuffer, fileStat };
}

async function removeStoredTollCsv(relativePath: string) {
  const uploadDir = getUploadDir();
  const absolutePath = path.resolve(uploadDir, relativePath);
  const resolvedUploadDir = path.resolve(uploadDir);

  if (!absolutePath.startsWith(resolvedUploadDir + path.sep)) {
    throw new Error('Percorso file non valido.');
  }

  try {
    await unlink(absolutePath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
}

function parseInvoiceDateFromFileName(fileName: string): Date | null {
  const match = /FSIT(\d{4})(\d{2})(\d{2})/i.exec(fileName);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

async function getTractorAssignments(tx: PrismaClientOrTx, plates: string[]) {
  const normalizedPlates = Array.from(new Set(plates.map(compactPlate).filter(Boolean)));
  const [tractors, trailers] = await Promise.all([
    tx.tractor.findMany({
      where: { plate: { in: normalizedPlates, mode: 'insensitive' } },
      include: { assignedDriver: true }
    }),
    tx.trailer.findMany({
      where: { plate: { in: normalizedPlates, mode: 'insensitive' } },
      include: { assignedTractor: { include: { assignedDriver: true } } }
    })
  ]);

  const assignments = new Map<string, { tractorId: string | null; driverId: string | null; sourcePlate: string }>();

  for (const tractor of tractors) {
    assignments.set(compactPlate(tractor.plate), {
      tractorId: tractor.id,
      driverId: tractor.assignedDriverId || null,
      sourcePlate: compactPlate(tractor.plate)
    });
  }

  for (const trailer of trailers) {
    const key = compactPlate(trailer.plate);
    if (assignments.has(key)) continue;
    assignments.set(key, {
      tractorId: trailer.assignedTractorId || null,
      driverId: trailer.assignedTractor?.assignedDriverId || null,
      sourcePlate: key
    });
  }

  return assignments;
}

async function ensureMissingTractors(
  tx: PrismaClientOrTx,
  plates: string[],
  assignments: Map<string, { tractorId: string | null; driverId: string | null; sourcePlate: string }>
): Promise<string[]> {
  const missing = Array.from(new Set(plates.map(compactPlate).filter(Boolean))).filter((plate) => !assignments.has(plate));
  if (missing.length === 0) return [];

  await tx.tractor.createMany({
    data: missing.map((plate) => ({
      plate,
      notes: 'Aggiunto automaticamente dall import autostrade.'
    })),
    skipDuplicates: true
  });

  const created = await tx.tractor.findMany({
    where: { plate: { in: missing, mode: 'insensitive' } },
    select: { id: true, plate: true, assignedDriverId: true }
  });

  for (const tractor of created) {
    assignments.set(compactPlate(tractor.plate), {
      tractorId: tractor.id,
      driverId: tractor.assignedDriverId || null,
      sourcePlate: compactPlate(tractor.plate)
    });
  }

  return missing;
}

function groupRowsByCard(rows: ParsedTollRow[]) {
  const groups = new Map<string, { rows: ParsedTollRow[]; plates: Set<string> }>();
  for (const row of rows) {
    const group = groups.get(row.cardNumber) || { rows: [], plates: new Set<string>() };
    group.rows.push(row);
    group.plates.add(compactPlate(row.plate));
    groups.set(row.cardNumber, group);
  }
  return groups;
}

async function ensureTollCards(
  tx: PrismaClientOrTx,
  rows: ParsedTollRow[],
  tractorAssignments: Map<string, { tractorId: string | null; driverId: string | null; sourcePlate: string }>
) {
  const cardGroups = groupRowsByCard(rows);
  const cardNumbers = Array.from(cardGroups.keys());
  const existingBefore = await tx.tollCard.findMany({
    where: { providerName: TOLL_PROVIDER_NAME, cardNumber: { in: cardNumbers } },
    select: { cardNumber: true }
  });
  const existingNumbers = new Set(existingBefore.map((card) => card.cardNumber));

  await tx.tollCard.createMany({
    data: cardNumbers.map((cardNumber) => {
      const group = cardGroups.get(cardNumber)!;
      const singlePlate = group.plates.size === 1 ? Array.from(group.plates)[0] : null;
      const assignment = singlePlate ? tractorAssignments.get(singlePlate) : null;
      return {
        providerName: TOLL_PROVIDER_NAME,
        cardNumber,
        label: singlePlate,
        assignedTractorId: assignment?.tractorId || null
      };
    }),
    skipDuplicates: true
  });

  let cards = await tx.tollCard.findMany({
    where: { providerName: TOLL_PROVIDER_NAME, cardNumber: { in: cardNumbers } },
    include: { assignedTractor: true }
  });

  let assignedCards = 0;
  for (const card of cards) {
    const group = cardGroups.get(card.cardNumber);
    if (!group || card.assignedTractorId || group.plates.size !== 1) continue;
    const plate = Array.from(group.plates)[0];
    const assignment = tractorAssignments.get(plate);
    if (!assignment?.tractorId) continue;
    await tx.tollCard.update({
      where: { id: card.id },
      data: { assignedTractorId: assignment.tractorId, label: plate }
    });
    assignedCards += 1;
  }

  cards = await tx.tollCard.findMany({
    where: { providerName: TOLL_PROVIDER_NAME, cardNumber: { in: cardNumbers } },
    include: { assignedTractor: true }
  });

  return {
    cardsByNumber: new Map(cards.map((card) => [card.cardNumber, card])),
    cardGroups,
    createdCards: cardNumbers.filter((cardNumber) => !existingNumbers.has(cardNumber)).length,
    assignedCards
  };
}

function getRowReviewReasons(input: {
  row: ParsedTollRow;
  cardGroup: { plates: Set<string> } | undefined;
  card: { assignedTractorId: string | null; assignedTractor: { plate: string } | null } | undefined;
  tractorId: string | null;
}) {
  const reasons: string[] = [];
  if (input.row.grossAmountCents === 0) {
    reasons.push('Importo lordo pari a zero');
  } else if (input.row.grossAmountCents < 0 && !isCoherentTollAdjustment(input.row)) {
    reasons.push('Rettifica negativa non coerente con netto e IVA');
  }
  if (!input.tractorId) reasons.push(`Targa ${input.row.plate} non collegata a un trattore`);
  if (input.cardGroup && input.cardGroup.plates.size > 1) {
    reasons.push(`Tessera ${input.row.cardNumber} presente su piu targhe nello stesso CSV`);
  }
  if (input.card?.assignedTractorId && input.tractorId && input.card.assignedTractorId !== input.tractorId) {
    reasons.push(`Tessera associata a ${input.card.assignedTractor?.plate || 'altra targa'}, riga CSV su ${input.row.plate}`);
  }
  return reasons.join('; ') || null;
}

function buildEntryData(input: {
  row: ParsedTollRow;
  batchId: string;
  cardId: string | null;
  tractorId: string | null;
  reviewReasons: string | null;
}): Prisma.TollEntryCreateManyInput {
  return {
    sourceKey: input.row.sourceKey,
    importBatchId: input.batchId,
    status: TollEntryStatus.PENDING,
    reviewReasons: input.reviewReasons,
    tollDate: input.row.tollDate,
    tollTime: input.row.tollTime,
    entryDate: input.row.entryDate,
    entryTime: input.row.entryTime,
    providerName: TOLL_PROVIDER_NAME,
    customerCode: input.row.customerCode,
    invoiceNumber: input.row.invoiceNumber,
    cardId: input.cardId,
    cardNumber: input.row.cardNumber,
    supportType: input.row.supportType,
    rowCounter: input.row.rowCounter,
    movementType: input.row.movementType,
    motorwayCode: input.row.motorwayCode,
    motorwayName: input.row.motorwayName,
    entryGateCode: input.row.entryGateCode,
    entryGateName: input.row.entryGateName,
    exitGateCode: input.row.exitGateCode,
    exitGateName: input.row.exitGateName,
    routeName: input.row.routeName,
    netAmountCents: input.row.netAmountCents,
    grossAmountCents: input.row.grossAmountCents,
    vatAmountCents: input.row.vatAmountCents,
    vatRatePercent: input.row.vatRatePercent,
    exemptDiscountCents: input.row.exemptDiscountCents,
    taxableGrossDiscountCents: input.row.taxableGrossDiscountCents,
    currency: input.row.currency,
    vehicleClass: input.row.vehicleClass,
    plateCountry: input.row.plateCountry,
    plate: input.row.plate,
    tractorId: input.tractorId,
    secondaryPlateCountry: input.row.secondaryPlateCountry,
    secondaryPlate: input.row.secondaryPlate,
    secondaryEuroClass: input.row.secondaryEuroClass,
    euroClass: input.row.euroClass,
    authorizationCode: input.row.authorizationCode,
    distanceKm: input.row.distanceKm,
    country: input.row.country,
    rawText: input.row.rawText
  };
}

async function createTollEntriesFromStoredCsv(storedCsv: StoredTollCsv): Promise<TollImportSingleResult> {
  const { fileBuffer } = await readStoredTollCsv(storedCsv.filePath);
  const parsedCsv = parseTollCsvText(decodeCsvBuffer(fileBuffer));
  if (parsedCsv.rows.length === 0) {
    throw new Error('Nel CSV non ho trovato righe pedaggio nel formato Autostrade atteso.');
  }

  return prisma.$transaction(async (tx) => {
    const plates = Array.from(new Set(parsedCsv.rows.map((row) => row.plate)));
    const tractorAssignments = await getTractorAssignments(tx, plates);
    const createdTractorPlates = await ensureMissingTractors(tx, plates, tractorAssignments);
    const { cardsByNumber, cardGroups, createdCards, assignedCards } = await ensureTollCards(
      tx,
      parsedCsv.rows,
      tractorAssignments
    );
    const totalNetCents = parsedCsv.rows.reduce((sum, row) => sum + row.netAmountCents, 0);
    const totalGrossCents = parsedCsv.rows.reduce((sum, row) => sum + row.grossAmountCents, 0);
    const totalVatCents = parsedCsv.rows.reduce((sum, row) => sum + row.vatAmountCents, 0);

    const batch = await tx.tollImportBatch.create({
      data: {
        ...storedCsv,
        providerName: parsedCsv.providerName,
        customerCode: parsedCsv.customerCode,
        invoiceNumber: parsedCsv.invoiceNumber,
        invoiceDate: parseInvoiceDateFromFileName(storedCsv.originalFileName),
        skippedRows: parsedCsv.skippedLines,
        totalNetCents,
        totalVatCents,
        totalGrossCents
      }
    });

    const entryData = parsedCsv.rows.map((row) => {
      const assignment = tractorAssignments.get(compactPlate(row.plate));
      const card = cardsByNumber.get(row.cardNumber);
      const reviewReasons = getRowReviewReasons({
        row,
        cardGroup: cardGroups.get(row.cardNumber),
        card,
        tractorId: assignment?.tractorId || null
      });

      return buildEntryData({
        row,
        batchId: batch.id,
        cardId: card?.id || null,
        tractorId: assignment?.tractorId || null,
        reviewReasons
      });
    });

    const createResult = await tx.tollEntry.createMany({ data: entryData, skipDuplicates: true });
    const duplicateRows = parsedCsv.rows.length - createResult.count;
    const pendingRows = await tx.tollEntry.count({
      where: { importBatchId: batch.id, status: TollEntryStatus.PENDING }
    });
    const reviewRows = await tx.tollEntry.count({
      where: { importBatchId: batch.id, reviewReasons: { not: null } }
    });

    await tx.tollImportBatch.update({
      where: { id: batch.id },
      data: {
        importedRows: createResult.count,
        duplicateRows,
        skippedRows: parsedCsv.skippedLines
      }
    });

    return {
      batchId: batch.id,
      fileName: storedCsv.originalFileName,
      parsedRows: parsedCsv.rows.length,
      importedRows: createResult.count,
      duplicateRows,
      skippedRows: parsedCsv.skippedLines,
      pendingRows,
      createdTractors: createdTractorPlates.length,
      createdCards,
      assignedCards,
      reviewRows
    };
  });
}

export async function importTollCsvFiles(files: File[]): Promise<TollImportResult> {
  if (files.length === 0) throw new Error('Seleziona almeno un CSV autostrade.');

  const results: TollImportSingleResult[] = [];

  for (const file of files) {
    const storedCsv = await storeTollCsvFile(file);
    try {
      results.push(await createTollEntriesFromStoredCsv(storedCsv));
    } catch (error) {
      await removeStoredTollCsv(storedCsv.filePath);
      throw error;
    }
  }

  return {
    files: results,
    parsedRows: results.reduce((sum, result) => sum + result.parsedRows, 0),
    importedRows: results.reduce((sum, result) => sum + result.importedRows, 0),
    duplicateRows: results.reduce((sum, result) => sum + result.duplicateRows, 0),
    skippedRows: results.reduce((sum, result) => sum + result.skippedRows, 0),
    pendingRows: results.reduce((sum, result) => sum + result.pendingRows, 0),
    createdTractors: results.reduce((sum, result) => sum + result.createdTractors, 0),
    createdCards: results.reduce((sum, result) => sum + result.createdCards, 0),
    assignedCards: results.reduce((sum, result) => sum + result.assignedCards, 0),
    reviewRows: results.reduce((sum, result) => sum + result.reviewRows, 0),
    lastBatchId: results.length > 0 ? results[results.length - 1]!.batchId : null
  };
}

async function getPendingEntries(where: Prisma.TollEntryWhereInput) {
  return prisma.tollEntry.findMany({
    where: { ...where, status: TollEntryStatus.PENDING },
    select: { id: true, reviewReasons: true }
  });
}

async function confirmPendingEntries(where: Prisma.TollEntryWhereInput): Promise<number> {
  const entries = await getPendingEntries(where);
  if (entries.length === 0) return 0;

  const cleanIds = entries.filter((entry) => !entry.reviewReasons).map((entry) => entry.id);
  const reviewIds = entries.filter((entry) => entry.reviewReasons).map((entry) => entry.id);

  await prisma.$transaction([
    cleanIds.length
      ? prisma.tollEntry.updateMany({ where: { id: { in: cleanIds } }, data: { status: TollEntryStatus.OK } })
      : prisma.tollEntry.count({ where: { id: '__never__' } }),
    reviewIds.length
      ? prisma.tollEntry.updateMany({ where: { id: { in: reviewIds } }, data: { status: TollEntryStatus.NEEDS_REVIEW } })
      : prisma.tollEntry.count({ where: { id: '__never__' } })
  ]);

  return entries.length;
}

async function deletePendingEntries(where: Prisma.TollEntryWhereInput): Promise<number> {
  const entries = await getPendingEntries(where);
  if (entries.length === 0) return 0;
  await prisma.tollEntry.deleteMany({ where: { id: { in: entries.map((entry) => entry.id) } } });
  return entries.length;
}

export function confirmTollEntry(id: string): Promise<number> {
  return confirmPendingEntries({ id });
}

export function confirmAllPendingTollsForBatch(batchId: string): Promise<number> {
  return confirmPendingEntries({ importBatchId: batchId });
}

export function confirmAllPendingTolls(): Promise<number> {
  return confirmPendingEntries({});
}

export function deletePendingTollEntry(id: string): Promise<number> {
  return deletePendingEntries({ id });
}

export function deleteAllPendingTollsForBatch(batchId: string): Promise<number> {
  return deletePendingEntries({ importBatchId: batchId });
}

export function deleteAllPendingTolls(): Promise<number> {
  return deletePendingEntries({});
}

export function getTollActionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    if (error.message.includes('Unique constraint failed')) return 'Alcune righe risultano gia importate.';
    return error.message.slice(0, 300);
  }

  return 'Operazione non riuscita. Riprova.';
}
