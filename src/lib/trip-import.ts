import 'server-only';

import { createHash } from 'node:crypto';
import {
  ContainerTripStatus,
  Prisma,
  TripImportRowStatus,
  type ContainerCustomer,
  type Tractor,
  type Trailer,
  type TripImportRow
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { extractInboxPdfTextFromBuffer } from '@/lib/inbox-analysis';
import { removeStoredPdf, storePdfFile, type StoredPdf } from '@/lib/files';
import {
  buildTripWaybillSourceKey,
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

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function sourceKeyFor(row: ParsedTripWaybill, index: number): string {
  return `trip-waybill:${shortHash(buildTripWaybillSourceKey(row, index))}`;
}

async function ensureTractor(
  tx: PrismaClientOrTx,
  plateValue: string | null,
  createdTractorIds: Set<string>
): Promise<Tractor | null> {
  const plate = compactPlate(plateValue);
  if (!plate) return null;

  let tractor = await tx.tractor.findFirst({ where: { plate: { equals: plate, mode: 'insensitive' } } });
  if (!tractor) {
    tractor = await tx.tractor.create({
      data: {
        plate,
        notes: 'Aggiunto automaticamente dall import bolle viaggio.'
      }
    });
    createdTractorIds.add(tractor.id);
    return tractor;
  }

  return tractor;
}

async function ensureTrailer(
  tx: PrismaClientOrTx,
  plateValue: string | null,
  tractorId: string | null,
  createdTrailerIds: Set<string>
): Promise<Trailer | null> {
  const plate = compactPlate(plateValue);
  if (!plate) return null;

  let trailer = await tx.trailer.findFirst({ where: { plate: { equals: plate, mode: 'insensitive' } } });
  if (!trailer) {
    trailer = await tx.trailer.create({
      data: {
        plate,
        assignedTractorId: tractorId || undefined,
        notes: 'Aggiunto automaticamente dall import bolle viaggio.'
      }
    });
    createdTrailerIds.add(trailer.id);
    return trailer;
  }

  if (tractorId && !trailer.assignedTractorId) {
    trailer = await tx.trailer.update({ where: { id: trailer.id }, data: { assignedTractorId: tractorId } });
  }

  return trailer;
}

async function ensureCustomer(
  tx: PrismaClientOrTx,
  row: ParsedTripWaybill,
  createdCustomerIds: Set<string>
): Promise<ContainerCustomer | null> {
  const code = row.customerCode?.trim() || null;
  const name = compactEntityName(row.customerName, code ? `Committente ${code}` : '');
  if (!code && !name) return null;

  if (code) {
    const existing = await tx.containerCustomer.findUnique({ where: { code } });
    if (existing) return existing;

    const created = await tx.containerCustomer.create({
      data: {
        code,
        name,
        notes: 'Aggiunto automaticamente dall import bolle viaggio.'
      }
    });
    createdCustomerIds.add(created.id);
    return created;
  }

  const existingByName = await tx.containerCustomer.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  if (existingByName) return existingByName;

  const created = await tx.containerCustomer.create({
    data: {
      name,
      notes: 'Aggiunto automaticamente dall import bolle viaggio.'
    }
  });
  createdCustomerIds.add(created.id);
  return created;
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
  tractor: Tractor | null;
  trailer: Trailer | null;
  customer: ContainerCustomer | null;
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

async function createTripRowsFromStoredPdf(storedPdf: StoredPdf, fileBuffer: Buffer): Promise<TripImportSingleResult> {
  const extraction = await extractInboxPdfTextFromBuffer(fileBuffer);
  const parsed = parseTripWaybillText(extraction.text || '');

  if (parsed.rows.length === 0) {
    throw new Error('Nel PDF non ho trovato bolle viaggio nel formato atteso.');
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.tripImportBatch.create({
      data: {
        ...storedPdf,
        extractedText: extraction.text ? extraction.text.slice(0, 60000) : null,
        extractionStatus: extraction.status,
        parsedRows: parsed.rows.length,
        skippedRows: parsed.skippedSections
      }
    });

    const createdTractorIds = new Set<string>();
    const createdTrailerIds = new Set<string>();
    const createdCustomerIds = new Set<string>();
    const createdLocationIds = new Set<string>();
    let importedRows = 0;
    let duplicateRows = 0;

    for (const [index, row] of parsed.rows.entries()) {
      const sourceKey = sourceKeyFor(row, index);
      const existing = await tx.tripImportRow.findUnique({ where: { sourceKey }, select: { id: true } });
      if (existing) {
        duplicateRows += 1;
        continue;
      }

      const additionalReviewReasons: string[] = [];
      const tractor = await ensureTractor(tx, row.tractorPlate, createdTractorIds);
      const trailer = await ensureTrailer(tx, row.trailerPlate, tractor?.id || null, createdTrailerIds);
      const customer = await ensureCustomer(tx, row, createdCustomerIds);

      await tx.tripImportRow.create({
        data: buildImportRowData({
          batchId: batch.id,
          row,
          rowIndex: index,
          sourceKey,
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
        createdTractors: createdTractorIds.size,
        createdTrailers: createdTrailerIds.size,
        createdCustomers: createdCustomerIds.size,
        createdLocations: createdLocationIds.size
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
      createdTractors: createdTractorIds.size,
      createdTrailers: createdTrailerIds.size,
      createdCustomers: createdCustomerIds.size,
      createdLocations: createdLocationIds.size
    };
  });
}

export async function importTripWaybillPdfFiles(files: File[]): Promise<TripImportResult> {
  if (files.length === 0) throw new Error('Seleziona almeno un PDF viaggio.');

  const results: TripImportSingleResult[] = [];

  for (const file of files) {
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const storedPdf = await storePdfFile(file);
    try {
      results.push(await createTripRowsFromStoredPdf(storedPdf, fileBuffer));
    } catch (error) {
      await removeStoredPdf(storedPdf.filePath);
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

export async function confirmTripImportRow(id: string): Promise<{ tripId: string }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.tripImportRow.findUnique({
      where: { id },
      include: tripImportRowInclude
    });
    if (!row) throw new Error('Riga import viaggio non trovata.');
    if (row.status !== TripImportRowStatus.PENDING) throw new Error('Questa riga non e piu in attesa.');
    if (!row.tripDate && !row.documentDate) throw new Error('Riga incompleta: data viaggio non riconosciuta.');
    if (!row.customerCode && !row.customerName) throw new Error('Riga incompleta: committente non riconosciuto.');

    const tripDate = row.tripDate || row.documentDate || new Date();
    const customer = row.customerCode
      ? await tx.containerCustomer.findUnique({ where: { code: row.customerCode } })
      : row.customerName
        ? await tx.containerCustomer.findFirst({ where: { name: { equals: row.customerName, mode: 'insensitive' } } })
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
        // L'autista resta sempre una scelta manuale, anche per vecchie righe
        // pending che potrebbero avere ancora un driverId valorizzato.
        driverId: null,
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
        sourceType: 'PDF_WAYBILL',
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
                kind: 'PICKUP',
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
        containerTripId: trip.id
      }
    });

    return { tripId: trip.id };
  });
}

async function confirmPendingTripImportRows(where: Prisma.TripImportRowWhereInput): Promise<number> {
  const rows = await getPendingRows(where);
  let confirmed = 0;
  for (const row of rows) {
    await confirmTripImportRow(row.id);
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

export function confirmAllPendingTripImportsForBatch(batchId: string): Promise<number> {
  return confirmPendingTripImportRows({ batchId });
}

export function confirmAllPendingTripImports(): Promise<number> {
  return confirmPendingTripImportRows({});
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
