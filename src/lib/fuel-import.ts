import 'server-only';

import { randomUUID } from 'node:crypto';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { FuelEntryStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { optionalFormString } from '@/lib/form';
import { readStoredPdf, removeStoredPdf, storePdfBuffer, storePdfFile, type StoredPdf } from '@/lib/files';
import {
  getFuelProductName,
  isFuelProductCode,
  parseFuelCoInvoiceText,
  type ParsedFuelInvoice,
  type ParsedFuelRow
} from '@/lib/fuel-parser';
import {
  calculateMetrics,
  estimateFullVolumeMilli,
  isMetricFuelProduct,
  isPartialFillVolume,
  type FuelMetricEntry,
  type FuelMetricsResult,
  type FuelSegmentContext
} from '@/lib/fuel-metrics';

type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

export type FuelImportSingleResult = {
  batchId: string;
  fileName: string;
  parsedRows: number;
  importedRows: number;
  duplicateRows: number;
  skippedRows: number;
  pendingRows: number;
  createdTractors: number;
};

export type FuelImportResult = {
  files: FuelImportSingleResult[];
  parsedRows: number;
  importedRows: number;
  duplicateRows: number;
  skippedRows: number;
  pendingRows: number;
  createdTractors: number;
  lastBatchId: string | null;
};

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function compactPlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function buildGrossPricePerLiterMilliEuro(row: ParsedFuelRow): number | null {
  if (row.volumeLitersMilli <= 0) return null;
  return Math.round((row.totalAmountCents * 10_000) / row.volumeLitersMilli);
}

function getFuelSupplierName(invoiceSupplierName: string | null): string {
  if (invoiceSupplierName && /fuelco/i.test(invoiceSupplierName)) return 'FuelCo';
  return invoiceSupplierName?.trim() || 'Distributore carburante';
}

async function ensureFuelSupplier(tx: PrismaClientOrTx, invoiceSupplierName: string | null) {
  const name = getFuelSupplierName(invoiceSupplierName);
  return tx.fuelSupplier.upsert({
    where: { name },
    create: {
      name,
      notes: invoiceSupplierName && invoiceSupplierName !== name ? invoiceSupplierName : null
    },
    update: {}
  });
}

async function extractPdfText(storedPdf: StoredPdf): Promise<string> {
  const { fileBuffer } = await readStoredPdf(storedPdf.filePath);
  const parsed = await pdfParse(fileBuffer);
  return parsed.text || '';
}

async function getTractorAssignments(tx: PrismaClientOrTx, plates: string[]) {
  const [tractors, trailers] = await Promise.all([
    tx.tractor.findMany({
      where: { plate: { in: plates, mode: 'insensitive' } },
      include: { assignedDriver: true }
    }),
    tx.trailer.findMany({
      where: { plate: { in: plates, mode: 'insensitive' } },
      include: { assignedTractor: { include: { assignedDriver: true } } }
    })
  ]);

  const assignments = new Map<string, { tractorId: string | null; driverId: string | null }>();

  for (const tractor of tractors) {
    assignments.set(compactPlate(tractor.plate), {
      tractorId: tractor.id,
      driverId: tractor.assignedDriverId || null
    });
  }

  for (const trailer of trailers) {
    const key = compactPlate(trailer.plate);
    if (assignments.has(key)) continue;
    assignments.set(key, {
      tractorId: trailer.assignedTractorId || null,
      driverId: trailer.assignedTractor?.assignedDriverId || null
    });
  }

  return assignments;
}

// Le targhe dei tabulati FuelCo sono trattori della flotta: quelle non ancora in
// anagrafica vengono create al volo come trattori minimali (solo targa), cosi'
// il rifornimento si collega subito e l'utente puo' completare marca, modello e
// autista dal menu Trattori. Restituisce le targhe effettivamente create.
async function ensureMissingTractors(
  tx: PrismaClientOrTx,
  plates: string[],
  assignments: Map<string, { tractorId: string | null; driverId: string | null }>
): Promise<string[]> {
  const missing = Array.from(new Set(plates.map(compactPlate).filter(Boolean))).filter(
    (plate) => !assignments.has(plate)
  );
  if (missing.length === 0) return [];

  await tx.tractor.createMany({
    data: missing.map((plate) => ({
      plate,
      notes: 'Aggiunto automaticamente dall import rifornimenti PDF.'
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
      driverId: tractor.assignedDriverId || null
    });
  }

  return missing;
}

async function getTripDriverAssignments(tx: PrismaClientOrTx, rows: ParsedFuelRow[], tractorByPlate: Map<string, { tractorId: string | null }>) {
  const dates = rows.map((row) => row.fuelDate);
  const tractorIds = Array.from(new Set(Array.from(tractorByPlate.values()).map((value) => value.tractorId).filter(Boolean))) as string[];
  if (dates.length === 0 || tractorIds.length === 0) return new Map<string, string>();

  const minDate = new Date(Math.min(...dates.map((date) => date.getTime())));
  const maxDate = addUtcDays(new Date(Math.max(...dates.map((date) => date.getTime()))), 1);
  const trips = await tx.trip.findMany({
    where: {
      tractorId: { in: tractorIds },
      driverId: { not: null },
      tripDate: { gte: minDate, lt: maxDate }
    },
    select: { tractorId: true, driverId: true, tripDate: true }
  });

  const driverSets = new Map<string, Set<string>>();
  for (const trip of trips) {
    if (!trip.tractorId || !trip.driverId) continue;
    const key = `${trip.tractorId}|${dateKey(trip.tripDate)}`;
    const set = driverSets.get(key) || new Set<string>();
    set.add(trip.driverId);
    driverSets.set(key, set);
  }

  const assignments = new Map<string, string>();
  for (const [key, values] of driverSets.entries()) {
    if (values.size === 1) assignments.set(key, Array.from(values)[0]);
  }

  return assignments;
}

async function ensureFuelCards(
  tx: PrismaClientOrTx,
  fuelSupplierId: string,
  rows: ParsedFuelRow[],
  tractorAssignments: Map<string, { tractorId: string | null; driverId: string | null }>
) {
  const cardRows = Array.from(
    rows
      .reduce((map, row) => {
        if (!row.cardNumber.trim()) return map;
        if (!map.has(row.cardNumber)) map.set(row.cardNumber, row);
        return map;
      }, new Map<string, ParsedFuelRow>())
      .values()
  );

  if (cardRows.length === 0) return new Map<string, string>();

  await tx.fuelCard.createMany({
    data: cardRows.map((row) => {
      const assignment = tractorAssignments.get(compactPlate(row.plate));
      return {
        fuelSupplierId,
        cardNumber: row.cardNumber,
        label: row.plate,
        assignedTractorId: assignment?.tractorId || null
      };
    }),
    skipDuplicates: true
  });

  let cards = await tx.fuelCard.findMany({
    where: {
      fuelSupplierId,
      cardNumber: { in: cardRows.map((row) => row.cardNumber) }
    },
    select: { id: true, cardNumber: true, assignedTractorId: true }
  });
  const cardsByNumber = new Map(cards.map((card) => [card.cardNumber, card]));

  for (const row of cardRows) {
    const card = cardsByNumber.get(row.cardNumber);
    const assignment = tractorAssignments.get(compactPlate(row.plate));
    if (!card || card.assignedTractorId || !assignment?.tractorId) continue;
    await tx.fuelCard.update({
      where: { id: card.id },
      data: { assignedTractorId: assignment.tractorId, label: row.plate }
    });
  }

  cards = await tx.fuelCard.findMany({
    where: {
      fuelSupplierId,
      cardNumber: { in: cardRows.map((row) => row.cardNumber) }
    },
    select: { id: true, cardNumber: true, assignedTractorId: true }
  });

  return new Map(cards.map((card) => [card.cardNumber, card.id]));
}

async function ensureFuelProducts(tx: PrismaClientOrTx, rows: ParsedFuelRow[]) {
  const productRows = Array.from(
    rows
      .reduce((map, row) => {
        if (!map.has(row.productCode)) map.set(row.productCode, row);
        return map;
      }, new Map<string, ParsedFuelRow>())
      .values()
  );

  await tx.fuelProduct.createMany({
    data: productRows.map((row) => ({
      code: row.productCode,
      name: row.productName || getFuelProductName(row.productCode),
      isFuel: isFuelProductCode(row.productCode)
    })),
    skipDuplicates: true
  });

  const products = await tx.fuelProduct.findMany({
    where: { code: { in: productRows.map((row) => row.productCode) } },
    select: { id: true, code: true }
  });

  return new Map(products.map((product) => [product.code, product.id]));
}

function buildEntryData(input: {
  row: ParsedFuelRow;
  batchId: string;
  invoice: ParsedFuelInvoice;
  fuelSupplierId: string | null;
  fuelCardId: string | null;
  fuelProductId: string | null;
  tractorId: string | null;
  driverId: string | null;
}): Prisma.FuelEntryCreateManyInput {
  return {
    // Le righe importate restano in attesa di conferma umana prima di entrare
    // nel centro costi e nella catena di calcolo km/euro.
    status: FuelEntryStatus.PENDING,
    sourceKey: input.row.sourceKey,
    importBatchId: input.batchId,
    fuelDate: input.row.fuelDate,
    fuelTime: input.row.fuelTime,
    fuelSupplierId: input.fuelSupplierId,
    fuelCardId: input.fuelCardId,
    supplierName: input.invoice.supplierName,
    invoiceNumber: input.invoice.invoiceNumber,
    invoiceDate: input.invoice.invoiceDate,
    cardNumber: input.row.cardNumber,
    ticketNumber: input.row.ticketNumber,
    fuelProductId: input.fuelProductId,
    productCode: input.row.productCode,
    productName: input.row.productName,
    plate: input.row.plate,
    tractorId: input.tractorId,
    driverId: input.driverId,
    odometerKm: input.row.odometerKm,
    stationCode: input.row.stationCode,
    stationName: input.row.stationName,
    serviceType: input.row.serviceType,
    amountCents: input.row.amountCents,
    totalAmountCents: input.row.totalAmountCents,
    volumeLitersMilli: input.row.volumeLitersMilli,
    finalPricePerLiterMilliEuro: input.row.finalPricePerLiterMilliEuro,
    grossPricePerLiterMilliEuro: buildGrossPricePerLiterMilliEuro(input.row),
    basePricePerLiterMilliEuro: input.row.basePricePerLiterMilliEuro,
    discountPerLiterMilliEuro: input.row.discountPerLiterMilliEuro,
    rawText: input.row.rawText
  };
}

function isPendingEntry(entry: FuelMetricEntry): boolean {
  return entry.status === FuelEntryStatus.PENDING;
}

function advancesChain(entry: FuelMetricEntry, previous: FuelMetricEntry | null): boolean {
  return Boolean(
    isMetricFuelProduct(entry) &&
      entry.odometerKm &&
      (!previous?.odometerKm || entry.odometerKm > previous.odometerKm)
  );
}

// `entries` e' la sequenza cronologica completa di una targa (confermate + in attesa).
// La catena metrica dei record confermati dipende SOLO dai record confermati, cosi'
// le righe in attesa non sporcano euro/km finche' non vengono validate. Per le righe
// in attesa calcoliamo comunque un'anteprima (delta/consumo/euro-km) lungo l'intera
// timeline, salvandola solo su di esse e mantenendo lo stato PENDING.
// Percorre una sequenza cronologica mantenendo due puntatori: `previous` (ultimo
// rifornimento valido, per i controlli sul salto km immediato, avanza su ogni
// rifornimento) e l'ancora di segmento = ultimo PIENO (per il consumo da pieno a
// pieno; i rabbocchi parziali accumulano litri/costo finche' un pieno chiude il
// segmento). `participates` decide chi entra nella catena, `writes` su chi
// salviamo le metriche, `statusFor` lo stato da scrivere.
async function runMetricChain(
  tx: PrismaClientOrTx,
  entries: FuelMetricEntry[],
  referenceFullVolumeMilli: number | null,
  options: {
    participates: (entry: FuelMetricEntry) => boolean;
    writes: (entry: FuelMetricEntry) => boolean;
    statusFor: (entry: FuelMetricEntry, metrics: FuelMetricsResult) => FuelEntryStatus;
  }
) {
  let previous: FuelMetricEntry | null = null;
  let anchorOdometerKm: number | null = null;
  let litersSinceAnchorMilli = 0;
  let costSinceAnchorCents = 0;

  for (const entry of entries) {
    if (!options.participates(entry)) continue;

    const isPartialFill = isPartialFillVolume(entry.volumeLitersMilli, referenceFullVolumeMilli);
    const segment: FuelSegmentContext = {
      anchorOdometerKm,
      litersSinceAnchorMilli,
      costSinceAnchorCents,
      isPartialFill
    };
    const metrics = calculateMetrics(entry, previous, segment);

    if (options.writes(entry)) {
      await tx.fuelEntry.update({
        where: { id: entry.id },
        data: {
          status: options.statusFor(entry, metrics),
          reviewReasons: metrics.reviewReasons || null,
          kmDelta: metrics.kmDelta,
          litersPer100KmTenths: metrics.litersPer100KmTenths,
          costPerKmMilliEuro: metrics.costPerKmMilliEuro
        }
      });
    }

    if (advancesChain(entry, previous)) {
      previous = entry;
      if (isPartialFill) {
        // Rabbocco: non chiude il segmento, i litri si sommano al pieno successivo.
        litersSinceAnchorMilli += entry.volumeLitersMilli;
        costSinceAnchorCents += entry.totalAmountCents;
      } else {
        // Pieno: chiude il segmento, l'ancora si sposta qui e gli accumulatori si azzerano.
        anchorOdometerKm = entry.odometerKm;
        litersSinceAnchorMilli = 0;
        costSinceAnchorCents = 0;
      }
    }
  }
}

async function recalculateFuelMetricsForGroup(tx: PrismaClientOrTx, entries: FuelMetricEntry[]) {
  // Pieno tipico del gruppo (targa + prodotto): serve a distinguere i rabbocchi
  // parziali dai pieni. Calcolato su tutte le righe (confermate + in attesa).
  const referenceFullVolumeMilli = estimateFullVolumeMilli(entries.map((entry) => entry.volumeLitersMilli));

  // Pass A: catena dei soli record confermati.
  await runMetricChain(tx, entries, referenceFullVolumeMilli, {
    participates: (entry) => !isPendingEntry(entry),
    writes: (entry) => !isPendingEntry(entry),
    statusFor: (_entry, metrics) => metrics.status
  });

  // Pass B: anteprima per le righe in attesa, concatenate sull'intera timeline
  // (confermate + in attesa) ma scritte solo sulle righe in attesa.
  await runMetricChain(tx, entries, referenceFullVolumeMilli, {
    participates: () => true,
    writes: (entry) => isPendingEntry(entry),
    statusFor: () => FuelEntryStatus.PENDING
  });
}

export async function recalculateFuelMetricsForPlates(tx: PrismaClientOrTx, plates: string[]) {
  const normalizedPlates = Array.from(new Set(plates.map(compactPlate).filter(Boolean)));
  if (normalizedPlates.length === 0) return;

  const entries = await tx.fuelEntry.findMany({
    where: { plate: { in: normalizedPlates } },
    orderBy: [{ plate: 'asc' }, { fuelDate: 'asc' }, { fuelTime: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      fuelDate: true,
      fuelTime: true,
      plate: true,
      tractorId: true,
      productCode: true,
      odometerKm: true,
      volumeLitersMilli: true,
      totalAmountCents: true,
      manuallyVerified: true,
      status: true,
      fuelProduct: { select: { isFuel: true } }
    }
  });

  // Catena km/consumo/euro-km separata per (targa + prodotto): il consumo del
  // gasolio si calcola solo tra rifornimenti di gasolio, quello dell'AdBlue solo
  // tra AdBlue, ecc. Cosi' i prodotti non interferiscono tra loro. Gli `entries`
  // arrivano gia' ordinati cronologicamente, quindi ogni sotto-gruppo resta in
  // ordine.
  const entriesByPlateProduct = new Map<string, FuelMetricEntry[]>();
  for (const entry of entries) {
    const key = `${compactPlate(entry.plate)}|${entry.productCode}`;
    const group = entriesByPlateProduct.get(key) || [];
    group.push(entry);
    entriesByPlateProduct.set(key, group);
  }

  for (const group of entriesByPlateProduct.values()) {
    await recalculateFuelMetricsForGroup(tx, group);
  }
}

async function createFuelEntriesFromStoredPdf(
  storedPdf: StoredPdf,
  providedInvoice?: ParsedFuelInvoice
): Promise<FuelImportSingleResult> {
  const parsedInvoice = providedInvoice || parseFuelCoInvoiceText(await extractPdfText(storedPdf));

  if (parsedInvoice.rows.length === 0) {
    throw new Error('Nel PDF non ho trovato righe rifornimento nel formato FuelCo atteso.');
  }

  return prisma.$transaction(async (tx) => {
    const plates = Array.from(new Set(parsedInvoice.rows.map((row) => row.plate)));
    const tractorAssignments = await getTractorAssignments(tx, plates);
    const createdTractorPlates = await ensureMissingTractors(tx, plates, tractorAssignments);
    const fuelSupplier = await ensureFuelSupplier(tx, parsedInvoice.supplierName);
    const fuelCardIds = await ensureFuelCards(tx, fuelSupplier.id, parsedInvoice.rows, tractorAssignments);
    const fuelProductIds = await ensureFuelProducts(tx, parsedInvoice.rows);
    const tripDriverAssignments = await getTripDriverAssignments(tx, parsedInvoice.rows, tractorAssignments);
    const totalVolumeLitersMilli = parsedInvoice.rows.reduce((sum, row) => sum + row.volumeLitersMilli, 0);
    const totalAmountCents = parsedInvoice.rows.reduce((sum, row) => sum + row.totalAmountCents, 0);

    const batch = await tx.fuelImportBatch.create({
      data: {
        ...storedPdf,
        fuelSupplierId: fuelSupplier.id,
        supplierName: parsedInvoice.supplierName,
        invoiceNumber: parsedInvoice.invoiceNumber,
        invoiceDate: parsedInvoice.invoiceDate,
        periodEndDate: parsedInvoice.periodEndDate,
        skippedRows: parsedInvoice.skippedLines,
        totalVolumeLitersMilli,
        totalAmountCents,
        notes: parsedInvoice.rows.some((row) => row.serviceType === 'WINSOFTWARE')
          ? 'Classificata automaticamente come rifornimento da fattura WinSoftware. Dati in attesa di conferma.'
          : null
      }
    });

    const entryData = parsedInvoice.rows.map((row) => {
      const assignment = tractorAssignments.get(compactPlate(row.plate));
      const tripDriverId = assignment?.tractorId
        ? tripDriverAssignments.get(`${assignment.tractorId}|${dateKey(row.fuelDate)}`) || null
        : null;

      return buildEntryData({
        row,
        batchId: batch.id,
        invoice: parsedInvoice,
        fuelSupplierId: fuelSupplier.id,
        fuelCardId: fuelCardIds.get(row.cardNumber) || null,
        fuelProductId: fuelProductIds.get(row.productCode) || null,
        tractorId: assignment?.tractorId || null,
        driverId: assignment?.driverId || tripDriverId
      });
    });

    const createResult = await tx.fuelEntry.createMany({ data: entryData, skipDuplicates: true });
    const duplicateRows = parsedInvoice.rows.length - createResult.count;
    const importedRows = await tx.fuelEntry.findMany({
      where: { importBatchId: batch.id },
      select: { plate: true }
    });

    await recalculateFuelMetricsForPlates(tx, importedRows.map((row) => row.plate));
    const pendingRows = await tx.fuelEntry.count({
      where: { importBatchId: batch.id, status: FuelEntryStatus.PENDING }
    });

    await tx.fuelImportBatch.update({
      where: { id: batch.id },
      data: {
        importedRows: createResult.count,
        duplicateRows,
        skippedRows: parsedInvoice.skippedLines
      }
    });

    return {
      batchId: batch.id,
      fileName: storedPdf.originalFileName,
      parsedRows: parsedInvoice.rows.length,
      importedRows: createResult.count,
      duplicateRows,
      skippedRows: parsedInvoice.skippedLines,
      pendingRows,
      createdTractors: createdTractorPlates.length
    };
  });
}

export async function importParsedFuelInvoiceBuffer(
  buffer: Buffer,
  fileName: string,
  parsedInvoice: ParsedFuelInvoice
): Promise<FuelImportSingleResult> {
  const storedPdf = await storePdfBuffer(buffer, fileName);
  try {
    return await createFuelEntriesFromStoredPdf(storedPdf, parsedInvoice);
  } catch (error) {
    await removeStoredPdf(storedPdf.filePath);
    throw error;
  }
}

export async function importFuelPdfFiles(files: File[]): Promise<FuelImportResult> {
  if (files.length === 0) throw new Error('Seleziona almeno un PDF rifornimenti.');

  const results: FuelImportSingleResult[] = [];

  for (const file of files) {
    const storedPdf = await storePdfFile(file);
    try {
      results.push(await createFuelEntriesFromStoredPdf(storedPdf));
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
    createdTractors: results.reduce((sum, result) => sum + result.createdTractors, 0),
    lastBatchId: results.length > 0 ? results[results.length - 1]!.batchId : null
  };
}

// --- Validazione righe importate (stato PENDING) -------------------------------

export async function assignFuelCardToPendingBatch(batchId: string, formData: FormData) {
  const requestedCardId = optionalFormString(formData, 'fuelCardId');
  const requestedLabel = optionalFormString(formData, 'fuelCardLabel')?.replace(/\s+/g, ' ').trim() || null;
  if (!requestedCardId && !requestedLabel) {
    throw new Error('Scegli una tessera registrata oppure inserisci un nome, ad esempio Energia Demo S.R.L.');
  }
  if (requestedLabel && requestedLabel.length > 100) {
    throw new Error('Il nome della tessera non può superare 100 caratteri.');
  }

  const batch = await prisma.fuelImportBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      fuelSupplierId: true,
      supplierName: true,
      entries: {
        where: { status: FuelEntryStatus.PENDING },
        select: { id: true, fuelSupplierId: true }
      }
    }
  });
  if (!batch) throw new Error('Fattura rifornimenti non trovata.');
  if (batch.entries.length === 0) throw new Error('La fattura non contiene righe in attesa.');

  let card: { id: string; cardNumber: string; fuelSupplierId: string | null } | null = null;
  if (requestedCardId) {
    card = await prisma.fuelCard.findFirst({
      where: { id: requestedCardId, active: true },
      select: { id: true, cardNumber: true, fuelSupplierId: true }
    });
    if (!card) throw new Error('La tessera selezionata non è disponibile.');
  } else if (requestedLabel) {
    let fuelSupplierId = batch.fuelSupplierId || batch.entries.find((entry) => entry.fuelSupplierId)?.fuelSupplierId || null;
    if (!fuelSupplierId) {
      const supplier = await ensureFuelSupplier(prisma, batch.supplierName || requestedLabel);
      fuelSupplierId = supplier.id;
    }

    card = await prisma.fuelCard.findFirst({
      where: {
        fuelSupplierId,
        cardNumber: { equals: requestedLabel, mode: 'insensitive' }
      },
      select: { id: true, cardNumber: true, fuelSupplierId: true }
    });
    if (!card) {
      card = await prisma.fuelCard.create({
        data: {
          fuelSupplierId,
          cardNumber: requestedLabel,
          label: requestedLabel,
          notes: 'Tessera/provenienza creata durante la validazione di una fattura rifornimenti.'
        },
        select: { id: true, cardNumber: true, fuelSupplierId: true }
      });
    } else {
      await prisma.fuelCard.update({ where: { id: card.id }, data: { active: true } });
    }
  }

  if (!card) throw new Error('Tessera carburante non valida.');
  const fuelSupplierId = card.fuelSupplierId || batch.fuelSupplierId || null;
  const updated = await prisma.fuelEntry.updateMany({
    where: { importBatchId: batch.id, status: FuelEntryStatus.PENDING },
    data: {
      fuelCardId: card.id,
      cardNumber: card.cardNumber,
      fuelSupplierId
    }
  });
  if (fuelSupplierId && fuelSupplierId !== batch.fuelSupplierId) {
    await prisma.fuelImportBatch.update({ where: { id: batch.id }, data: { fuelSupplierId } });
  }

  return { updatedRows: updated.count, cardNumber: card.cardNumber };
}

async function getPendingEntries(where: Prisma.FuelEntryWhereInput) {
  return prisma.fuelEntry.findMany({
    where: { ...where, status: FuelEntryStatus.PENDING },
    select: { id: true, plate: true, serviceType: true, fuelCardId: true, cardNumber: true }
  });
}

async function confirmPendingEntries(where: Prisma.FuelEntryWhereInput): Promise<number> {
  const entries = await getPendingEntries(where);
  if (entries.length === 0) return 0;
  const missingCardRows = entries.filter(
    (entry) => entry.serviceType === 'WINSOFTWARE' && !entry.fuelCardId && !entry.cardNumber.trim()
  );
  if (missingCardRows.length > 0) {
    throw new Error(
      `Associa una tessera o provenienza alle ${missingCardRows.length} righe WinSoftware prima di confermare.`
    );
  }
  // Le porto fuori dallo stato PENDING; il ricalcolo assegna OK/NEEDS_REVIEW finale
  // e le inserisce nella catena km della targa.
  await prisma.fuelEntry.updateMany({
    where: { id: { in: entries.map((entry) => entry.id) } },
    data: { status: FuelEntryStatus.OK }
  });
  await recalculateFuelMetricsForPlates(prisma, entries.map((entry) => entry.plate));
  return entries.length;
}

async function deletePendingEntries(where: Prisma.FuelEntryWhereInput): Promise<number> {
  const entries = await getPendingEntries(where);
  if (entries.length === 0) return 0;
  await prisma.fuelEntry.deleteMany({ where: { id: { in: entries.map((entry) => entry.id) } } });
  await recalculateFuelMetricsForPlates(prisma, entries.map((entry) => entry.plate));
  return entries.length;
}

export function confirmFuelEntry(id: string): Promise<number> {
  return confirmPendingEntries({ id });
}

export function confirmAllPendingForBatch(batchId: string): Promise<number> {
  return confirmPendingEntries({ importBatchId: batchId });
}

export function deletePendingFuelEntry(id: string): Promise<number> {
  return deletePendingEntries({ id });
}

export function deleteAllPendingForBatch(batchId: string): Promise<number> {
  return deletePendingEntries({ importBatchId: batchId });
}

// Tutte le righe in attesa, indipendentemente dal batch: usate dalla revisione
// aggregata quando si importano piu' fatture insieme.
export function confirmAllPending(): Promise<number> {
  return confirmPendingEntries({});
}

export function deleteAllPending(): Promise<number> {
  return deletePendingEntries({});
}

function parseOptionalOdometer(formData: FormData): number | null {
  const value = optionalFormString(formData, 'odometerKm');
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 9_999_999) {
    throw new Error('KM non validi.');
  }
  return parsed;
}

function parseManualDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error('Data rifornimento non valida.');

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
    throw new Error('Data rifornimento non valida.');
  }

  return date;
}

function parseManualTime(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Ora rifornimento non valida.');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('Ora rifornimento non valida.');
  return value;
}

// Input manuale: il PUNTO e' il separatore decimale e non si usa il separatore
// di migliaia (es. 1.3, 130000). Tolleriamo anche la virgola come decimale. Il
// parsing dei PDF e' separato (in fuel-parser.ts) e mantiene il formato italiano
// con punto migliaia + virgola decimale.
function parseManualDecimal(value: string | null, label: string): number | null {
  if (!value) return null;
  const normalized = value.replace(',', '.').trim();
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) throw new Error(`${label} non valido.`);
  return Number(normalized);
}

function parseManualLitersMilli(formData: FormData): number {
  const value = parseManualDecimal(optionalFormString(formData, 'volumeLiters'), 'Litri');
  if (value === null || value <= 0 || value > 9999) throw new Error('Litri obbligatori e non validi.');
  return Math.round(value * 1000);
}

function parseManualMoneyCents(formData: FormData, key: string, label: string): number | null {
  const value = parseManualDecimal(optionalFormString(formData, key), label);
  if (value === null) return null;
  if (value < 0 || value > 999999) throw new Error(`${label} non valido.`);
  return Math.round(value * 100);
}

function parseManualPriceMilliEuro(formData: FormData, key: string, label: string): number | null {
  const value = parseManualDecimal(optionalFormString(formData, key), label);
  if (value === null) return null;
  if (value <= 0 || value > 20) throw new Error(`${label} non valido.`);
  return Math.round(value * 1000);
}

function calculateManualAmounts(formData: FormData, volumeLitersMilli: number) {
  const providedTotalAmountCents = parseManualMoneyCents(formData, 'totalAmount', 'Totale scontrino');
  const providedGrossPrice = parseManualPriceMilliEuro(formData, 'grossPricePerLiter', 'Prezzo ivato al litro');

  if (providedTotalAmountCents === null && providedGrossPrice === null) {
    throw new Error('Inserisci il totale scontrino oppure il prezzo ivato al litro.');
  }

  const totalAmountCents =
    providedTotalAmountCents ?? Math.round((volumeLitersMilli * Number(providedGrossPrice)) / 10_000);
  const grossPricePerLiterMilliEuro =
    providedGrossPrice ?? Math.round((totalAmountCents * 10_000) / volumeLitersMilli);

  return { totalAmountCents, grossPricePerLiterMilliEuro };
}

async function assertDriver(driverId: string | null) {
  if (!driverId) return;
  const driver = await prisma.driver.findUnique({ where: { id: driverId }, select: { id: true } });
  if (!driver) throw new Error('Autista non valido.');
}

async function getFuelProductFromForm(formData: FormData) {
  const fuelProductId = optionalFormString(formData, 'fuelProductId');
  if (!fuelProductId) throw new Error('Prodotto obbligatorio.');

  const product = await prisma.fuelProduct.findUnique({
    where: { id: fuelProductId },
    select: { id: true, code: true, name: true }
  });
  if (!product) throw new Error('Prodotto non valido.');
  return product;
}

async function getFuelSupplierAndCardFromForm(formData: FormData) {
  const fuelSupplierId = optionalFormString(formData, 'fuelSupplierId');
  const fuelCardId = optionalFormString(formData, 'fuelCardId');
  const fuelSupplier = fuelSupplierId
    ? await prisma.fuelSupplier.findUnique({ where: { id: fuelSupplierId }, select: { id: true, name: true } })
    : null;
  if (fuelSupplierId && !fuelSupplier) throw new Error('Distributore non valido.');

  const fuelCard = fuelCardId
    ? await prisma.fuelCard.findUnique({
        where: { id: fuelCardId },
        select: { id: true, cardNumber: true, fuelSupplierId: true, fuelSupplier: { select: { id: true, name: true } } }
      })
    : null;
  if (fuelCardId && !fuelCard) throw new Error('Tessera carburante non valida.');
  if (fuelCard?.fuelSupplierId && fuelSupplier && fuelCard.fuelSupplierId !== fuelSupplier.id) {
    throw new Error('La tessera non appartiene al distributore selezionato.');
  }

  return {
    fuelSupplier: fuelSupplier || fuelCard?.fuelSupplier || null,
    fuelCard
  };
}

async function getTractorAndDriverFromForm(formData: FormData) {
  const tractorId = optionalFormString(formData, 'tractorId');
  if (!tractorId) throw new Error('Targa trattore obbligatoria.');

  const tractor = await prisma.tractor.findUnique({
    where: { id: tractorId },
    include: { assignedDriver: true }
  });
  if (!tractor) throw new Error('Targa trattore non valida.');

  const driverId = optionalFormString(formData, 'driverId') || tractor.assignedDriverId || null;
  await assertDriver(driverId);
  return { tractor, driverId };
}

function getRecordCardNumber(formData: FormData, fuelCard: { cardNumber: string } | null): string {
  return fuelCard?.cardNumber || optionalFormString(formData, 'cardNumber') || 'MANUALE';
}

function getRecordTicketNumber(formData: FormData): string {
  return optionalFormString(formData, 'receiptNumber') || optionalFormString(formData, 'ticketNumber') || `manual-${Date.now()}`;
}

function buildFuelEntryWriteData(input: {
  formData: FormData;
  tractor: { id: string; plate: string };
  driverId: string | null;
  product: { id: string; code: string; name: string };
  fuelSupplier: { id: string; name: string } | null;
  fuelCard: { id: string; cardNumber: string } | null;
}) {
  const volumeLitersMilli = parseManualLitersMilli(input.formData);
  const { totalAmountCents, grossPricePerLiterMilliEuro } = calculateManualAmounts(input.formData, volumeLitersMilli);
  const ticketNumber = getRecordTicketNumber(input.formData);

  return {
    fuelDate: parseManualDate(String(input.formData.get('fuelDate') || '')),
    fuelTime: parseManualTime(optionalFormString(input.formData, 'fuelTime')),
    fuelSupplierId: input.fuelSupplier?.id || null,
    fuelCardId: input.fuelCard?.id || null,
    supplierName: input.fuelSupplier?.name || optionalFormString(input.formData, 'supplierName'),
    invoiceNumber: optionalFormString(input.formData, 'invoiceNumber') || ticketNumber,
    cardNumber: getRecordCardNumber(input.formData, input.fuelCard),
    ticketNumber,
    fuelProductId: input.product.id,
    productCode: input.product.code,
    productName: input.product.name,
    plate: compactPlate(input.tractor.plate),
    tractorId: input.tractor.id,
    driverId: input.driverId,
    odometerKm: parseOptionalOdometer(input.formData),
    stationName: optionalFormString(input.formData, 'stationName'),
    amountCents: totalAmountCents,
    totalAmountCents,
    volumeLitersMilli,
    finalPricePerLiterMilliEuro: grossPricePerLiterMilliEuro,
    grossPricePerLiterMilliEuro,
    basePricePerLiterMilliEuro: grossPricePerLiterMilliEuro,
    manuallyVerified: input.formData.get('manuallyVerified') === 'on',
    notes: optionalFormString(input.formData, 'notes')
  };
}

export async function updateFuelEntryFromForm(id: string, formData: FormData) {
  const entry = await prisma.fuelEntry.findUnique({ where: { id }, select: { id: true, plate: true } });
  if (!entry) throw new Error('Rifornimento non trovato.');

  const [{ tractor, driverId }, product, { fuelSupplier, fuelCard }] = await Promise.all([
    getTractorAndDriverFromForm(formData),
    getFuelProductFromForm(formData),
    getFuelSupplierAndCardFromForm(formData)
  ]);

  await prisma.fuelEntry.update({
    where: { id },
    data: buildFuelEntryWriteData({ formData, tractor, driverId, product, fuelSupplier, fuelCard })
  });

  await recalculateFuelMetricsForPlates(prisma, [entry.plate, tractor.plate]);
  return prisma.fuelEntry.findUniqueOrThrow({ where: { id } });
}

export async function createManualFuelEntryFromForm(formData: FormData) {
  const [{ tractor, driverId }, product, { fuelSupplier, fuelCard }] = await Promise.all([
    getTractorAndDriverFromForm(formData),
    getFuelProductFromForm(formData),
    getFuelSupplierAndCardFromForm(formData)
  ]);

  const entry = await prisma.fuelEntry.create({
    data: {
      sourceKey: `manual:${randomUUID()}`,
      manualEntry: true,
      ...buildFuelEntryWriteData({ formData, tractor, driverId, product, fuelSupplier, fuelCard })
    }
  });

  await recalculateFuelMetricsForPlates(prisma, [tractor.plate]);
  return entry;
}

export function getFuelActionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    if (error.message.includes('Unique constraint failed')) return 'Alcune righe risultano gia importate.';
    return error.message.slice(0, 300);
  }

  return 'Operazione non riuscita. Riprova.';
}
