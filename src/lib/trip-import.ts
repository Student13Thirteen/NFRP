import 'server-only';

import { createHash } from 'node:crypto';
import {
  ContainerTripStatus,
  ContainerTripStopKind,
  Prisma,
  TripImportRowStatus,
  type Tractor,
  type Trailer,
  type TripImportRow
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { findDriverNameSuggestion, type DriverNameCandidate } from '@/lib/driver-name-match';
import { removeStoredPdf, type StoredPdf } from '@/lib/files';
import {
  extractTripImportDocumentText,
  storeTripImportDocument
} from '@/lib/trip-import-document';
import type { DetectedTripImportDocument } from '@/lib/trip-import-file-types';
import { detectTripImportDocument } from '@/lib/trip-import-file-types';
import {
  parseTripWaybillText,
  type ParsedTripStop,
  type ParsedTripWaybill
} from '@/lib/trip-import-parser';

type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

type TripImportSingleResult = {
  batchId: string;
  fileName: string;
  parsedRows: number;
  importedRows: number;
  duplicateRows: number;
  skippedRows: number;
  pendingRows: number;
  createdDrivers: number;
  createdTractors: number;
  createdTrailers: number;
  createdCustomers: number;
  createdLocations: number;
};

export type TripImportResult = {
  files: TripImportSingleResult[];
  parsedRows: number;
  importedRows: number;
  duplicateRows: number;
  skippedRows: number;
  pendingRows: number;
  createdDrivers: number;
  createdTractors: number;
  createdTrailers: number;
  createdCustomers: number;
  createdLocations: number;
  lastBatchId: string | null;
};

export const tripImportRowInclude = Prisma.validator<Prisma.TripImportRowInclude>()({
  batch: true,
  driver: true,
  tractor: true,
  trailer: true,
  customer: true,
  loadingBase: true,
  salesPoint: true,
  trip: true,
  containerTrip: true
});

export type TripImportRowWithRelations = Prisma.TripImportRowGetPayload<{ include: typeof tripImportRowInclude }>;

function compactPlate(value: string | null | undefined): string | null {
  const plate = value?.toLocaleUpperCase('it-IT').replace(/[^A-Z0-9]/g, '') || '';
  return /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(plate) ? plate : null;
}

function compactEntityName(value: string | null | undefined, fallback: string): string {
  const cleaned = (value || '').replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
}

function contentHash(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function sourceKeyFor(hash: string, index: number): string {
  return `trip-waybill:${hash}:${index}`;
}

async function findExistingTractor(tx: PrismaClientOrTx, plateValue: string | null): Promise<Tractor | null> {
  const plate = compactPlate(plateValue);
  if (!plate) return null;
  return tx.tractor.findFirst({ where: { plate: { equals: plate, mode: 'insensitive' } } });
}

async function findExistingTrailer(tx: PrismaClientOrTx, plateValue: string | null): Promise<Trailer | null> {
  const plate = compactPlate(plateValue);
  if (!plate) return null;
  return tx.trailer.findFirst({ where: { plate: { equals: plate, mode: 'insensitive' } } });
}

async function findExistingCustomer(tx: PrismaClientOrTx, row: ParsedTripWaybill) {
  const code = row.customerCode?.trim() || null;
  const name = compactEntityName(row.customerName, code ? `Committente ${code}` : '');
  if (!code && !name) return null;
  if (code) {
    return tx.customer.findUnique({ where: { code } });
  }
  return tx.customer.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
}

function rowReviewReasons(row: ParsedTripWaybill, additionalReasons: string[]): string | null {
  const reasons = Array.from(new Set([...row.reviewReasons, ...additionalReasons].filter(Boolean)));
  return reasons.length > 0 ? reasons.join(' ') : null;
}

function buildImportRowData(input: {
  batchId: string;
  row: ParsedTripWaybill;
  rowIndex: number;
  sourceKey: string;
  driver: DriverNameCandidate | null;
  tractor: Tractor | null;
  trailer: Trailer | null;
  customer: { id: string; name: string } | null;
  reviewReasons: string | null;
}): Prisma.TripImportRowCreateInput {
  return {
    batch: { connect: { id: input.batchId } },
    status: TripImportRowStatus.PENDING,
    sourceKey: input.sourceKey,
    rowIndex: input.rowIndex,
    documentFormat: input.row.documentFormat,
    documentNumber: input.row.documentNumber,
    documentDate: input.row.documentDate,
    tripDate: input.row.tripDate,
    driverName: input.row.driverName,
    driver: input.driver ? { connect: { id: input.driver.id } } : undefined,
    tractorPlate: input.row.tractorPlate,
    tractor: input.tractor ? { connect: { id: input.tractor.id } } : undefined,
    trailerPlate: input.row.trailerPlate,
    trailer: input.trailer ? { connect: { id: input.trailer.id } } : undefined,
    carrierName: input.row.carrierName,
    customerCode: input.row.customerCode,
    customerName: input.row.customerName || input.customer?.name || null,
    loadingBaseName: input.row.loadingBaseName,
    loadingTerminalName: input.row.loadingTerminalName,
    deliveryTerminalName: input.row.deliveryTerminalName,
    deliveryName: input.row.deliveryName,
    deliveryAddress: input.row.deliveryAddress,
    deliveryCity: input.row.deliveryCity,
    deliveryProvince: input.row.deliveryProvince,
    container1: input.row.container1,
    container1Type: input.row.container1Type,
    seal1: input.row.seal1,
    container2: input.row.container2,
    container2Type: input.row.container2Type,
    seal2: input.row.seal2,
    booking: input.row.booking,
    ship: input.row.ship,
    pickupCode: input.row.pickupCode,
    deliveryCode: input.row.deliveryCode,
    companyReference: input.row.companyReference,
    forwarder: input.row.forwarder,
    compilerName: input.row.compilerName,
    compilationPlace: input.row.compilationPlace,
    parsedStops: input.row.stops as Prisma.InputJsonValue,
    reviewReasons: input.reviewReasons,
    rawText: input.row.rawText
  };
}

// La chiave riga e legata all'impronta del file: un secondo file con la stessa LDV
// resta una proposta legittima, ma va segnalata perche puo essere un doppione.
async function buildDuplicateWaybillReasons(
  tx: PrismaClientOrTx,
  row: ParsedTripWaybill
): Promise<string[]> {
  const waybillNumber = row.documentNumber?.trim();
  if (!waybillNumber) return [];

  const existingTrip = await tx.containerTrip.findFirst({
    where: { waybillNumber },
    select: { tripNumber: true },
    orderBy: { tripNumber: 'asc' }
  });
  if (existingTrip) {
    return [`LDV ${waybillNumber} gia registrata nel viaggio ${existingTrip.tripNumber}: conferma solo se e davvero un trasporto diverso.`];
  }

  const existingPendingRow = await tx.tripImportRow.findFirst({
    where: { documentNumber: waybillNumber, status: TripImportRowStatus.PENDING },
    select: { id: true }
  });
  if (existingPendingRow) {
    return [`LDV ${waybillNumber} gia in attesa di conferma da un altro file: controlla prima di confermare.`];
  }

  return [];
}

async function createTripRowsFromStoredDocument(
  storedPdf: StoredPdf,
  fileBuffer: Buffer,
  detected: DetectedTripImportDocument,
  hash: string
): Promise<TripImportSingleResult> {
  const extraction = await extractTripImportDocumentText(fileBuffer, detected);
  const parsed = parseTripWaybillText(extraction.text || '');

  if (parsed.rows.length === 0) {
    throw new Error('Nel file non ho trovato una bolla viaggio nel formato atteso.');
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.tripImportBatch.create({
      data: {
        ...storedPdf,
        contentHash: hash,
        extractedText: extraction.text ? extraction.text.slice(0, 60000) : null,
        extractionStatus: extraction.status,
        parsedRows: parsed.rows.length,
        skippedRows: parsed.skippedSections
      }
    });

    let importedRows = 0;
    let duplicateRows = 0;
    const drivers = await tx.driver.findMany({
      select: { id: true, firstName: true, lastName: true, active: true }
    });

    for (const [index, row] of parsed.rows.entries()) {
      const sourceKey = sourceKeyFor(hash, index);
      const existing = await tx.tripImportRow.findUnique({ where: { sourceKey }, select: { id: true } });
      if (existing) {
        duplicateRows += 1;
        continue;
      }

      const additionalReviewReasons: string[] = [];
      const driver = findDriverNameSuggestion(row.driverName, drivers)?.driver || null;
      if (row.driverName && !driver) {
        additionalReviewReasons.push('Autista OCR non associato: selezionalo in revisione.');
      }
      const tractor = await findExistingTractor(tx, row.tractorPlate);
      const trailer = await findExistingTrailer(tx, row.trailerPlate);
      const customer = await findExistingCustomer(tx, row);
      if (row.tractorPlate && !tractor) {
        additionalReviewReasons.push(`Targa trattore ${row.tractorPlate} non associata: controllala nella scheda del viaggio.`);
      }
      if (row.trailerPlate && !trailer) {
        additionalReviewReasons.push(`Targa semirimorchio ${row.trailerPlate} non associata: controllala nella scheda del viaggio.`);
      }
      if ((row.customerCode || row.customerName) && !customer) {
        additionalReviewReasons.push('Committente non ancora in anagrafica: controllalo nella scheda del viaggio.');
      }
      if (detected.kind === 'image') {
        additionalReviewReasons.push('Dati letti da una fotografia: controlla tutti i campi e inserisci a mano i valori manoscritti non affidabili.');
      }
      for (const reason of await buildDuplicateWaybillReasons(tx, row)) {
        additionalReviewReasons.push(reason);
      }

      await tx.tripImportRow.create({
        data: buildImportRowData({
          batchId: batch.id,
          row,
          rowIndex: index,
          sourceKey,
          driver,
          tractor,
          trailer,
          customer,
          reviewReasons: rowReviewReasons(row, additionalReviewReasons)
        })
      });
      importedRows += 1;
    }

    const pendingRows = await tx.tripImportRow.count({
      where: { batchId: batch.id, status: TripImportRowStatus.PENDING }
    });

    await tx.tripImportBatch.update({
      where: { id: batch.id },
      data: {
        importedRows,
        duplicateRows,
        createdDrivers: 0,
        createdTractors: 0,
        createdTrailers: 0,
        createdCustomers: 0,
        createdLocations: 0
      }
    });

    return {
      batchId: batch.id,
      fileName: storedPdf.originalFileName,
      parsedRows: parsed.rows.length,
      importedRows,
      duplicateRows,
      skippedRows: parsed.skippedSections,
      pendingRows,
      createdDrivers: 0,
      createdTractors: 0,
      createdTrailers: 0,
      createdCustomers: 0,
      createdLocations: 0
    };
  });
}

async function duplicateImportResult(hash: string, fileName: string): Promise<TripImportSingleResult | null> {
  const existing = await prisma.tripImportBatch.findUnique({
    where: { contentHash: hash },
    include: { rows: { select: { status: true } } }
  });
  if (!existing) return null;
  return {
    batchId: existing.id,
    fileName,
    parsedRows: existing.parsedRows,
    importedRows: 0,
    duplicateRows: Math.max(1, existing.rows.length),
    skippedRows: existing.skippedRows,
    pendingRows: existing.rows.filter((row) => row.status === TripImportRowStatus.PENDING).length,
    createdDrivers: 0,
    createdTractors: 0,
    createdTrailers: 0,
    createdCustomers: 0,
    createdLocations: 0
  };
}

export async function importTripWaybillFiles(files: File[]): Promise<TripImportResult> {
  if (files.length === 0) throw new Error('Seleziona almeno un PDF o un’immagine del viaggio.');

  const results: TripImportSingleResult[] = [];

  for (const file of files) {
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const detectedBeforeStorage = detectTripImportDocument(fileBuffer);
    if (!detectedBeforeStorage) {
      throw new Error('Sono accettati soltanto PDF e immagini JPG, PNG o WebP valide.');
    }
    const hash = contentHash(fileBuffer);
    const duplicate = await duplicateImportResult(hash, file.name || 'bolla-container');
    if (duplicate) {
      results.push(duplicate);
      continue;
    }
    const { storedFile, detected } = await storeTripImportDocument(file, fileBuffer);
    try {
      results.push(await createTripRowsFromStoredDocument(storedFile, fileBuffer, detected, hash));
    } catch (error) {
      await removeStoredPdf(storedFile.filePath);
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
    createdDrivers: results.reduce((sum, result) => sum + result.createdDrivers, 0),
    createdTractors: results.reduce((sum, result) => sum + result.createdTractors, 0),
    createdTrailers: results.reduce((sum, result) => sum + result.createdTrailers, 0),
    createdCustomers: results.reduce((sum, result) => sum + result.createdCustomers, 0),
    createdLocations: results.reduce((sum, result) => sum + result.createdLocations, 0),
    lastBatchId: results.length > 0 ? results[results.length - 1]!.batchId : null
  };
}

function buildCustomerReference(row: TripImportRow): string | null {
  const parts = [
    row.documentNumber ? `LDV ${row.documentNumber}` : null,
    row.booking ? `Booking ${row.booking}` : null,
    row.companyReference || null
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' - ') : null;
}

// Il riquadro si chiama `DATI PRESA`, ma la bolla dichiara esplicitamente quando quel
// riquadro e invece la consegna: nel viaggio di importazione il terminal di consegna
// riporta `VEDI DELIVERY`, cioe rimanda proprio a quell'indirizzo. Non e una deduzione,
// e quello che c'e scritto sul documento; negli altri casi resta una presa.
function stopKindFromWaybill(deliveryTerminalName: string | null): ContainerTripStopKind {
  return deliveryTerminalName?.toLocaleUpperCase('it-IT').includes('VEDI DELIVERY')
    ? ContainerTripStopKind.DELIVERY
    : ContainerTripStopKind.PICKUP;
}

function buildRouteSequence(row: TripImportRow, stops: ParsedTripStop[]): string | null {
  const values = [
    row.loadingTerminalName || row.loadingBaseName,
    ...stops.map((stop) => stop.name),
    row.deliveryTerminalName?.toLocaleUpperCase('it-IT') === 'VEDI DELIVERY'
      ? null
      : row.deliveryTerminalName
  ].filter((value): value is string => Boolean(value?.trim()));
  return values.length > 0 ? Array.from(new Set(values)).join(' → ') : null;
}

function parsedStopsFromJson(value: Prisma.JsonValue | null): ParsedTripStop[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, Prisma.JsonValue>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) return [];
    const textOrNull = (field: string) => typeof record[field] === 'string' && record[field].trim()
      ? String(record[field]).trim()
      : null;
    return [{
      position: typeof record.position === 'number' ? Math.max(0, Math.trunc(record.position)) : index,
      name,
      address: textOrNull('address'),
      postalCode: textOrNull('postalCode'),
      city: textOrNull('city'),
      province: textOrNull('province'),
      plannedTime: textOrNull('plannedTime')
    }];
  });
}

async function getPendingRows(where: Prisma.TripImportRowWhereInput) {
  return prisma.tripImportRow.findMany({
    where: { ...where, status: TripImportRowStatus.PENDING },
    select: { id: true }
  });
}

export async function confirmTripImportRow(
  id: string,
  reviewedDriverId?: string | null
): Promise<{ tripId: string }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.tripImportRow.findUnique({
      where: { id },
      include: tripImportRowInclude
    });
    if (!row) throw new Error('Riga import viaggio non trovata.');
    if (row.status !== TripImportRowStatus.PENDING) throw new Error('Questa riga non e piu in attesa.');
    if (!row.tripDate && !row.documentDate) throw new Error('Riga incompleta: data viaggio non riconosciuta.');
    if (!row.customerCode && !row.customerName) throw new Error('Riga incompleta: committente non riconosciuto.');

    const selectedDriverId = reviewedDriverId === undefined ? row.driverId : reviewedDriverId;
    if (selectedDriverId) {
      const selectedDriver = await tx.driver.findUnique({ where: { id: selectedDriverId }, select: { id: true } });
      if (!selectedDriver) throw new Error('L’autista selezionato non esiste piu in anagrafica.');
    }

    const tripDate = row.tripDate || row.documentDate || new Date();
    const customer = row.customerCode
      ? await tx.customer.findUnique({ where: { code: row.customerCode } })
      : row.customerName
        ? await tx.customer.findFirst({ where: { name: { equals: row.customerName, mode: 'insensitive' } } })
        : null;
    const parsedStops = parsedStopsFromJson(row.parsedStops);
    const stops = parsedStops.length > 0
      ? parsedStops
      : row.deliveryName
        ? [{
            position: 0,
            name: row.deliveryName,
            address: row.deliveryAddress,
            postalCode: null,
            city: row.deliveryCity,
            province: row.deliveryProvince,
            plannedTime: null
          }]
        : [];
    const containers = [
      { containerNumber: row.container1, containerType: row.container1Type, sealNumber: row.seal1 },
      { containerNumber: row.container2, containerType: row.container2Type, sealNumber: row.seal2 }
    ].filter((container) => container.containerNumber || container.containerType || container.sealNumber);

    const trip = await tx.containerTrip.create({
      data: {
        tripDate,
        status: ContainerTripStatus.PLANNED,
        waybillNumber: row.documentNumber,
        waybillDate: row.documentDate,
        customerId: customer?.id,
        customerCode: row.customerCode,
        customerName: row.customerName || customer?.name || null,
        customerReference: buildCustomerReference(row),
        carrierName: row.carrierName,
        routeSequence: buildRouteSequence(row, stops),
        driverId: selectedDriverId,
        tractorId: row.tractorId,
        trailerId: row.trailerId,
        loadingTerminalName: row.loadingTerminalName || row.loadingBaseName,
        deliveryTerminalName: row.deliveryTerminalName?.toLocaleUpperCase('it-IT') === 'VEDI DELIVERY'
          ? null
          : row.deliveryTerminalName,
        booking: row.booking,
        ship: row.ship,
        pickupCode: row.pickupCode,
        deliveryCode: row.deliveryCode,
        shippingCompany: row.companyReference,
        forwarder: row.forwarder,
        compilerName: row.compilerName,
        compilationPlace: row.compilationPlace,
        notes: row.reviewReasons ? `Da verificare: ${row.reviewReasons}` : null,
        sourceType: row.batch.mimeType.startsWith('image/') ? 'IMAGE_WAYBILL' : 'PDF_WAYBILL',
        externalRecordId: row.sourceKey,
        containers: containers.length > 0
          ? {
              create: containers.map((container, position) => ({
                position,
                ...container
              }))
            }
          : undefined,
        stops: stops.length > 0
          ? {
              create: stops.map((stop, position) => ({
                position,
                kind: stopKindFromWaybill(row.deliveryTerminalName),
                name: stop.name,
                address: stop.address,
                postalCode: stop.postalCode,
                city: stop.city,
                province: stop.province,
                plannedTime: stop.plannedTime
              }))
            }
          : undefined
      }
    });

    await tx.tripImportRow.update({
      where: { id },
      data: {
        status: TripImportRowStatus.IMPORTED,
        driverId: selectedDriverId,
        containerTripId: trip.id
      }
    });

    return { tripId: trip.id };
  });
}

async function confirmPendingTripImportRows(
  where: Prisma.TripImportRowWhereInput,
  driverSelections?: ReadonlyMap<string, string | null>
): Promise<number> {
  const rows = await getPendingRows(where);
  let confirmed = 0;
  for (const row of rows) {
    const reviewedDriverId = driverSelections?.has(row.id) ? driverSelections.get(row.id) : undefined;
    await confirmTripImportRow(row.id, reviewedDriverId);
    confirmed += 1;
  }
  return confirmed;
}

async function discardPendingRows(where: Prisma.TripImportRowWhereInput): Promise<number> {
  const rows = await getPendingRows(where);
  if (rows.length === 0) return 0;
  const result = await prisma.tripImportRow.updateMany({
    where: { id: { in: rows.map((row) => row.id) } },
    data: { status: TripImportRowStatus.DISCARDED }
  });
  return result.count;
}

export function confirmAllPendingTripImportsForBatch(
  batchId: string,
  driverSelections?: ReadonlyMap<string, string | null>
): Promise<number> {
  return confirmPendingTripImportRows({ batchId }, driverSelections);
}

export function confirmAllPendingTripImports(driverSelections?: ReadonlyMap<string, string | null>): Promise<number> {
  return confirmPendingTripImportRows({}, driverSelections);
}

export function discardPendingTripImportRow(id: string): Promise<number> {
  return discardPendingRows({ id });
}

export function discardAllPendingTripImportsForBatch(batchId: string): Promise<number> {
  return discardPendingRows({ batchId });
}

export function discardAllPendingTripImports(): Promise<number> {
  return discardPendingRows({});
}

export function getTripImportActionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    if (error.message.includes('Unique constraint failed')) return 'Questa bolla risulta gia importata.';
    return error.message.slice(0, 300);
  }
  return 'Import viaggi non riuscito. Riprova.';
}
