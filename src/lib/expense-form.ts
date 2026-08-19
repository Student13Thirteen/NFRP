import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { emptyStoredPdf, removeStoredPdf, storePdfFile, type NullableStoredPdf } from '@/lib/files';
import { formString, optionalFormString } from '@/lib/form';
import {
  allocationToDbFields,
  computeLineVat,
  imponibileCentsFromUnitMilliEuro,
  sumDocumentTotals
} from '@/lib/expense';
import { buildExpenseReviewReasons, type AnomalyLine } from '@/lib/expense-anomalies';
import { confirmExpenseDocumentInTransaction } from '@/lib/expense-confirm';
import { EXPENSE_DRIVER_AUTO, EXPENSE_DRIVER_NONE } from '@/lib/expense-driver';

const ALLOWED_VAT_RATES = new Set([0, 4, 5, 10, 22]);

export function getExpenseActionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    if (error.message.includes('Unique constraint failed')) return 'Esiste gia un record con questi dati.';
    if (error.message.includes('Foreign key constraint')) return 'Riferimento non valido (fornitore, categoria o mezzo).';
    return error.message.slice(0, 300);
  }
  return 'Operazione non riuscita. Riprova.';
}

function parseDate(value: string, required: boolean, label: string): Date | null {
  if (!value) {
    if (required) throw new Error(`${label} obbligatoria.`);
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
  if (!parts) throw new Error(`${label} non valida. Usa il formato gg/mm/aaaa.`);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    throw new Error(`${label} non valida. Usa il formato gg/mm/aaaa.`);
  }
  return date;
}

/** Input manuale come Rifornimenti: punto decimale, tre cifre, nessun separatore migliaia. */
function parsePriceToMilliEuro(value: string | null, label: string): number {
  if (value === null || value.trim() === '') return 0;
  const normalized = value.replace(',', '.').trim();
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) {
    throw new Error(`${label} non valido. Usa il punto e fino a tre decimali (es. 3.312).`);
  }
  return Math.round(Number(normalized) * 1000);
}

/** Quantità decimale con punto (la virgola resta tollerata per bozze precedenti) -> millesimi. */
function parseQuantityToMilli(value: string | null): number {
  if (value === null || value.trim() === '') return 1000;
  const normalized = value.replace(',', '.').trim();
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) {
    throw new Error('Quantità non valida. Usa il punto e fino a tre decimali.');
  }
  return Math.round(Number(normalized) * 1000);
}

function parseVatRate(value: string | null): number {
  if (value === null || value.trim() === '') return 22;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || !ALLOWED_VAT_RATES.has(parsed)) throw new Error('Aliquota IVA non valida.');
  return parsed;
}

function parseOptionalInt(value: string | null, label: string): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label}: inserisci solo numeri interi.`);
  return parsed;
}

function parseOptionalOdometer(value: string | null): number | null {
  const parsed = parseOptionalInt(value, 'Km');
  if (parsed !== null && (parsed < 0 || parsed > 9_999_999)) {
    throw new Error('Km: inserisci un valore tra 0 e 9.999.999.');
  }
  return parsed;
}

function getOptionalPdf(formData: FormData): File | null {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size <= 0 || !file.name) return null;
  return file;
}

async function storeOptionalPdf(file: File | null): Promise<NullableStoredPdf> {
  if (!file) return emptyStoredPdf();
  return storePdfFile(file);
}

async function getFileDigest(file: File | null): Promise<string | null> {
  if (!file) return null;
  return createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex');
}

export type ParsedExpenseLine = {
  position: number;
  code: string | null;
  description: string;
  quantityMilli: number;
  unit: string;
  unitPriceCents: number;
  unitPriceMilliEuro: number;
  imponibileCents: number;
  vatRatePercent: number;
  vatCents: number;
  totalCents: number;
  categoryId: string | null;
  allocationType: 'TRACTOR' | 'TRAILER' | 'WAREHOUSE' | 'GENERIC';
  tractorId: string | null;
  trailerId: string | null;
  odometerKm: number | null;
  notes: string | null;
  allocations: ParsedExpenseAllocation[];
};

export type ParsedExpenseAllocation = {
  position: number;
  quantityMilli: number;
  allocationType: 'TRACTOR' | 'TRAILER' | 'WAREHOUSE' | 'GENERIC';
  tractorId: string | null;
  trailerId: string | null;
  odometerKm: number | null;
  driverSelection: string;
  driverId: string | null;
};

export type ParsedConfirmedExpenseDetails = {
  expectedUpdatedAt: Date;
  notes: string | null;
  lines: Array<{
    id: string;
    description: string;
    code: string | null;
    notes: string | null;
  }>;
  allocations: Array<{
    id: string;
    driverSelection: string;
  }>;
};

type ExpenseDriverDbClient = Pick<Prisma.TransactionClient, 'driver' | 'trailer' | 'tractorDriverAssignment'>;

type DriverResolvableAllocation = Pick<
  ParsedExpenseAllocation,
  'allocationType' | 'tractorId' | 'trailerId' | 'driverSelection'
>;

export async function resolveExpenseAllocationDriverIds(
  allocations: DriverResolvableAllocation[],
  allocationDate: Date,
  client: ExpenseDriverDbClient
): Promise<Array<string | null>> {
  const manualDriverIds = Array.from(new Set(
    allocations
      .map((allocation) => allocation.driverSelection)
      .filter((selection) => selection !== EXPENSE_DRIVER_AUTO && selection !== EXPENSE_DRIVER_NONE)
  ));
  if (manualDriverIds.length > 0) {
    const existingDrivers = await client.driver.findMany({
      where: { id: { in: manualDriverIds } },
      select: { id: true }
    });
    if (existingDrivers.length !== manualDriverIds.length) throw new Error('Autista selezionato non valido.');
  }

  const automaticTrailerIds = Array.from(new Set(
    allocations
      .filter((allocation) => allocation.driverSelection === EXPENSE_DRIVER_AUTO && allocation.allocationType === 'TRAILER')
      .map((allocation) => allocation.trailerId)
      .filter((id): id is string => Boolean(id))
  ));
  const trailers = automaticTrailerIds.length > 0
    ? await client.trailer.findMany({
        where: { id: { in: automaticTrailerIds } },
        select: { id: true, assignedTractorId: true }
      })
    : [];
  const tractorByTrailerId = new Map(trailers.map((trailer) => [trailer.id, trailer.assignedTractorId]));
  const automaticTractorIds = Array.from(new Set(
    allocations
      .filter((allocation) => allocation.driverSelection === EXPENSE_DRIVER_AUTO)
      .map((allocation) => allocation.tractorId || (allocation.trailerId ? tractorByTrailerId.get(allocation.trailerId) : null))
      .filter((id): id is string => Boolean(id))
  ));
  const assignments = automaticTractorIds.length > 0
    ? await client.tractorDriverAssignment.findMany({
        where: {
          tractorId: { in: automaticTractorIds },
          validFrom: { lte: allocationDate },
          OR: [{ validTo: null }, { validTo: { gte: allocationDate } }]
        },
        orderBy: { validFrom: 'desc' },
        select: { tractorId: true, driverId: true }
      })
    : [];
  const driverByTractorId = new Map<string, string>();
  for (const assignment of assignments) {
    if (!driverByTractorId.has(assignment.tractorId)) {
      driverByTractorId.set(assignment.tractorId, assignment.driverId);
    }
  }

  return allocations.map((allocation) => {
    if (allocation.allocationType !== 'TRACTOR' && allocation.allocationType !== 'TRAILER') return null;
    if (allocation.driverSelection === EXPENSE_DRIVER_NONE) return null;
    if (allocation.driverSelection !== EXPENSE_DRIVER_AUTO) return allocation.driverSelection;
    const tractorId = allocation.tractorId || (allocation.trailerId ? tractorByTrailerId.get(allocation.trailerId) : null);
    return tractorId ? driverByTractorId.get(tractorId) || null : null;
  });
}

async function resolveExpenseLineDrivers(
  lines: ParsedExpenseLine[],
  allocationDate: Date,
  client: ExpenseDriverDbClient
): Promise<ParsedExpenseLine[]> {
  const flatAllocations = lines.flatMap((line) => line.allocations);
  const driverIds = await resolveExpenseAllocationDriverIds(flatAllocations, allocationDate, client);
  let driverIndex = 0;
  return lines.map((line) => ({
    ...line,
    allocations: line.allocations.map((allocation) => ({
      ...allocation,
      driverId: driverIds[driverIndex++] ?? null
    }))
  }));
}

function cell(values: string[], index: number): string | null {
  const value = (values[index] ?? '').trim();
  return value === '' ? null : value;
}

export function parseExpenseLines(formData: FormData): ParsedExpenseLine[] {
  const lineKeys = formData.getAll('lineKey').map(String);
  const descriptions = formData.getAll('lineDescription').map(String);
  const codes = formData.getAll('lineCode').map(String);
  const quantities = formData.getAll('lineQuantity').map(String);
  const units = formData.getAll('lineUnit').map(String);
  const unitPrices = formData.getAll('lineUnitPrice').map(String);
  const vatRates = formData.getAll('lineVatRate').map(String);
  const categoryIds = formData.getAll('lineCategoryId').map(String);
  const lineNotes = formData.getAll('lineNotes').map(String);
  const allocationLineKeys = formData.getAll('lineAllocationLineKey').map(String);
  const allocationQuantities = formData.getAll('lineAllocationQuantity').map(String);
  const allocationKeys = formData.getAll('lineAllocationKey').map(String);
  const allocationOdometerKms = formData.getAll('lineAllocationOdometerKm').map(String);
  const allocationDriverSelections = formData.getAll('lineAllocationDriverSelection').map(String);
  const legacyOdometerKms = formData.getAll('lineOdometerKm').map(String);

  const allocationsByLine = new Map<string, ParsedExpenseAllocation[]>();
  if (allocationLineKeys.length > 0) {
    for (let index = 0; index < allocationLineKeys.length; index += 1) {
      const lineKey = allocationLineKeys[index];
      const quantityMilli = parseQuantityToMilli(cell(allocationQuantities, index));
      if (quantityMilli <= 0) throw new Error('Ogni quantità assegnata deve essere maggiore di zero.');
      const allocation = allocationToDbFields(cell(allocationKeys, index));
      const current = allocationsByLine.get(lineKey) ?? [];
      current.push({
        position: current.length,
        quantityMilli,
        allocationType: allocation.allocationType,
        tractorId: allocation.tractorId,
        trailerId: allocation.trailerId,
        odometerKm: parseOptionalOdometer(cell(allocationOdometerKms, index)),
        driverSelection: cell(allocationDriverSelections, index) || EXPENSE_DRIVER_AUTO,
        driverId: null
      });
      allocationsByLine.set(lineKey, current);
    }
  }

  const lines: ParsedExpenseLine[] = [];
  for (let i = 0; i < descriptions.length; i += 1) {
    const description = (descriptions[i] ?? '').trim();
    if (!description) continue; // riga vuota, ignorata

    const quantityMilli = parseQuantityToMilli(cell(quantities, i));
    const unitPriceMilliEuro = parsePriceToMilliEuro(cell(unitPrices, i), 'Prezzo unitario');
    const unitPriceCents = Math.round(unitPriceMilliEuro / 10);
    const vatRatePercent = parseVatRate(cell(vatRates, i));
    const imponibileCents = imponibileCentsFromUnitMilliEuro(quantityMilli, unitPriceMilliEuro);
    const { vatCents, totalCents } = computeLineVat(imponibileCents, vatRatePercent);
    const lineKey = (lineKeys[i] || `line-${i}`).trim();
    const parsedAllocations = allocationsByLine.get(lineKey);
    const lineAllocations = parsedAllocations?.length
      ? parsedAllocations
      : (() => {
          const allocation = allocationToDbFields(cell(allocationKeys, i));
          return [{
            position: 0,
            quantityMilli,
            allocationType: allocation.allocationType,
            tractorId: allocation.tractorId,
            trailerId: allocation.trailerId,
            odometerKm: parseOptionalOdometer(cell(legacyOdometerKms, i)),
            driverSelection: cell(allocationDriverSelections, i) || EXPENSE_DRIVER_AUTO,
            driverId: null
          }];
        })();
    const assignedQuantityMilli = lineAllocations.reduce((sum, allocation) => sum + allocation.quantityMilli, 0);
    if (assignedQuantityMilli !== quantityMilli) {
      throw new Error(
        `Operazione ${lines.length + 1}: la somma delle quantità assegnate deve coincidere con la quantità fatturata.`
      );
    }
    const singleAllocation = lineAllocations.length === 1 ? lineAllocations[0] : null;

    lines.push({
      position: lines.length,
      code: cell(codes, i),
      description: description.slice(0, 400),
      quantityMilli,
      unit: cell(units, i) || 'pz',
      unitPriceCents,
      unitPriceMilliEuro,
      imponibileCents,
      vatRatePercent,
      vatCents,
      totalCents,
      categoryId: cell(categoryIds, i),
      allocationType: singleAllocation?.allocationType ?? 'GENERIC',
      tractorId: singleAllocation?.tractorId ?? null,
      trailerId: singleAllocation?.trailerId ?? null,
      odometerKm: singleAllocation?.odometerKm ?? null,
      notes: cell(lineNotes, i),
      allocations: lineAllocations
    });
  }

  return lines;
}

function optionalBoundedText(value: string, maxLength: number, label: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new Error(`${label}: massimo ${maxLength} caratteri.`);
  return normalized;
}

/**
 * I documenti confermati possono ricevere integrazioni descrittive e il PDF,
 * ma non modifiche a importi, IVA, quantità o allocazioni già contabilizzate.
 */
export function parseConfirmedExpenseDetails(formData: FormData): ParsedConfirmedExpenseDetails {
  const expectedUpdatedAtValue = formString(formData, 'expectedUpdatedAt');
  const expectedUpdatedAt = new Date(expectedUpdatedAtValue);
  if (!expectedUpdatedAtValue || Number.isNaN(expectedUpdatedAt.getTime())) {
    throw new Error('Versione del documento non valida. Ricarica la pagina e riprova.');
  }

  const lineIds = formData.getAll('lineId').map((value) => String(value).trim());
  const descriptions = formData.getAll('lineDescription').map(String);
  const codes = formData.getAll('lineCode').map(String);
  const lineNotes = formData.getAll('lineNotes').map(String);
  const allocationIds = formData.getAll('allocationId').map((value) => String(value).trim());
  const allocationDriverSelections = formData.getAll('allocationDriverSelection').map((value) => String(value).trim());
  if (
    lineIds.length === 0 ||
    descriptions.length !== lineIds.length ||
    codes.length !== lineIds.length ||
    lineNotes.length !== lineIds.length ||
    lineIds.some((id) => !id) ||
    new Set(lineIds).size !== lineIds.length
  ) {
    throw new Error('Le righe del documento non sono complete. Ricarica la pagina e riprova.');
  }
  if (
    allocationIds.length !== allocationDriverSelections.length ||
    allocationIds.some((id) => !id) ||
    new Set(allocationIds).size !== allocationIds.length
  ) {
    throw new Error('Le assegnazioni degli autisti non sono complete. Ricarica la pagina e riprova.');
  }

  return {
    expectedUpdatedAt,
    notes: optionalBoundedText(formString(formData, 'notes'), 4000, 'Note documento'),
    lines: lineIds.map((id, index) => {
      const description = descriptions[index].trim();
      if (!description) throw new Error(`Operazione ${index + 1}: descrizione obbligatoria.`);
      if (description.length > 400) throw new Error(`Operazione ${index + 1}: descrizione troppo lunga.`);
      return {
        id,
        description,
        code: optionalBoundedText(codes[index], 120, `Operazione ${index + 1}, codice`),
        notes: optionalBoundedText(lineNotes[index], 2000, `Operazione ${index + 1}, note`)
      };
    }),
    allocations: allocationIds.map((id, index) => ({
      id,
      driverSelection: allocationDriverSelections[index] || EXPENSE_DRIVER_AUTO
    }))
  };
}

async function getSupplierName(supplierId: string | null): Promise<string | null> {
  if (!supplierId) return null;
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { name: true } });
  if (!supplier) throw new Error('Fornitore non valido.');
  return supplier.name;
}

async function findSupplierIdByName(name: string | null): Promise<string | null> {
  if (!name) return null;
  const supplier = await prisma.supplier.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true }
  });
  return supplier?.id ?? null;
}

export async function createExpenseDocumentFromForm(formData: FormData): Promise<string> {
  const registeredAt = parseDate(formString(formData, 'registeredAt'), true, 'Data registrazione');
  if (!registeredAt) throw new Error('Data registrazione obbligatoria.');
  const documentDate = parseDate(formString(formData, 'documentDate'), false, 'Data documento');
  const supplierId = optionalFormString(formData, 'supplierId');
  const supplierName = await getSupplierName(supplierId);
  const lines = parseExpenseLines(formData);
  if (lines.length === 0) throw new Error('Aggiungi almeno una riga di spesa.');

  const totals = sumDocumentTotals(lines);
  const saveAsPending = formData.get('saveAsPending') === 'on';
  const anomalyLines: AnomalyLine[] = lines.map((line) => ({
    description: line.description,
    imponibileCents: line.imponibileCents,
    vatCents: line.vatCents,
    totalCents: line.totalCents,
    vatRatePercent: line.vatRatePercent,
    quantityMilli: line.quantityMilli,
    allocationType: line.allocationType
  }));
  const reviewReasons = saveAsPending ? buildExpenseReviewReasons(anomalyLines) : null;
  const documentNumber = optionalFormString(formData, 'documentNumber');
  const notes = optionalFormString(formData, 'notes');
  const optionalPdf = getOptionalPdf(formData);
  const fileDigest = await getFileDigest(optionalPdf);
  const submittedKey = optionalFormString(formData, 'submissionKey');
  const submissionKey = submittedKey && /^[a-z0-9-]{16,80}$/i.test(submittedKey) ? submittedKey : randomUUID();
  const payloadDigest = createHash('sha256')
    .update(JSON.stringify({
      supplierId,
      supplierName,
      documentNumber,
      documentDate: documentDate?.toISOString() || null,
      registeredAt: registeredAt.toISOString(),
      notes,
      reviewReasons,
      saveAsPending,
      totals,
      lines,
      fileDigest
    }))
    .digest('hex')
    .slice(0, 32);
  const importKey = `manual:${submissionKey}:${payloadDigest}`;

  const existingDocument = await prisma.expenseDocument.findUnique({ where: { importKey }, select: { id: true } });
  if (existingDocument) return existingDocument.id;

  const storedPdf = await storeOptionalPdf(optionalPdf);

  try {
    return await prisma.$transaction(async (tx) => {
      const resolvedLines = await resolveExpenseLineDrivers(lines, documentDate ?? registeredAt, tx);
      const created = await tx.expenseDocument.create({
        data: {
          status: 'PENDING',
          source: 'MANUAL',
          importKey,
          supplierId,
          supplierName,
          documentNumber,
          documentDate,
          registeredAt,
          notes,
          reviewReasons,
          ...totals,
          ...storedPdf,
          lines: {
            create: resolvedLines.map((line) => ({
              position: line.position,
              code: line.code,
              description: line.description,
              quantityMilli: line.quantityMilli,
              unit: line.unit,
              unitPriceCents: line.unitPriceCents,
              unitPriceMilliEuro: line.unitPriceMilliEuro,
              imponibileCents: line.imponibileCents,
              vatRatePercent: line.vatRatePercent,
              vatCents: line.vatCents,
              totalCents: line.totalCents,
              categoryId: line.categoryId,
              allocationType: line.allocationType,
              tractorId: line.tractorId,
              trailerId: line.trailerId,
              odometerKm: line.odometerKm,
              notes: line.notes,
              allocations: {
                create: line.allocations.map((allocation) => ({
                  position: allocation.position,
                  quantityMilli: allocation.quantityMilli,
                  allocationType: allocation.allocationType,
                  tractorId: allocation.tractorId,
                  trailerId: allocation.trailerId,
                  driverId: allocation.driverId,
                  odometerKm: allocation.odometerKm
                }))
              }
            }))
          }
        }
      });

      if (!saveAsPending) {
        await confirmExpenseDocumentInTransaction(tx, created.id);
      }

      return created.id;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.expenseDocument.findUnique({ where: { importKey }, select: { id: true } });
      if (existing) {
        if (storedPdf.filePath) await removeStoredPdf(storedPdf.filePath).catch(() => undefined);
        return existing.id;
      }
    }
    if (storedPdf.filePath) {
      await removeStoredPdf(storedPdf.filePath).catch(() => undefined);
    }
    throw error;
  }
}

/** Sostituisce le righe di un documento PENDING con quelle del form (usata in revisione). */
export async function updateExpenseDocumentLines(documentId: string, formData: FormData): Promise<void> {
  const lines = parseExpenseLines(formData);
  if (lines.length === 0) throw new Error('Aggiungi almeno una riga di spesa.');
  const totals = sumDocumentTotals(lines);
  const hasDocumentMetadata = formData.has('reviewDocumentNumber');
  const supplierName = hasDocumentMetadata ? optionalFormString(formData, 'reviewSupplierName') : null;
  const documentDate = hasDocumentMetadata
    ? parseDate(formString(formData, 'reviewDocumentDate'), false, 'Data documento')
    : null;
  const supplierId = hasDocumentMetadata ? await findSupplierIdByName(supplierName) : null;

  await prisma.$transaction(async (tx) => {
    const doc = await tx.expenseDocument.findUnique({
      where: { id: documentId },
      select: { status: true, source: true, documentDate: true, registeredAt: true }
    });
    if (!doc) throw new Error('Documento di spesa non trovato.');
    if (doc.status !== 'PENDING') throw new Error('Il documento è già stato confermato.');
    if (
      doc.source === 'MAINTENANCE_IMPORT' &&
      lines.some((line) => line.allocations.some(
        (allocation) => !['WAREHOUSE', 'TRACTOR', 'TRAILER'].includes(allocation.allocationType)
      ))
    ) {
      throw new Error('Assegna ogni riga al Magazzino oppure a una targa valida prima di confermare.');
    }
    const resolvedLines = await resolveExpenseLineDrivers(
      lines,
      documentDate ?? doc.documentDate ?? doc.registeredAt,
      tx
    );
    if (
      doc.source === 'LEASE_INVOICE_IMPORT' &&
      lines.some((line) => line.allocations.some(
        (allocation) => allocation.allocationType !== 'TRACTOR' && allocation.allocationType !== 'TRAILER'
      ))
    ) {
      throw new Error('Assegna una targa valida a ogni riga prima di confermare.');
    }
    await tx.expenseLine.deleteMany({ where: { documentId } });
    await tx.expenseDocument.update({
      where: { id: documentId },
      data: {
        ...(hasDocumentMetadata
          ? {
              supplierId,
              supplierName,
              documentNumber: optionalFormString(formData, 'reviewDocumentNumber'),
              documentDate,
              registeredAt: documentDate ?? undefined
            }
          : {}),
        ...totals,
        lines: {
          create: resolvedLines.map((line) => ({
            position: line.position,
            code: line.code,
            description: line.description,
            quantityMilli: line.quantityMilli,
            unit: line.unit,
            unitPriceCents: line.unitPriceCents,
            unitPriceMilliEuro: line.unitPriceMilliEuro,
            imponibileCents: line.imponibileCents,
            vatRatePercent: line.vatRatePercent,
            vatCents: line.vatCents,
            totalCents: line.totalCents,
            categoryId: line.categoryId,
            allocationType: line.allocationType,
            tractorId: line.tractorId,
            trailerId: line.trailerId,
            odometerKm: line.odometerKm,
            notes: line.notes,
            allocations: {
              create: line.allocations.map((allocation) => ({
                position: allocation.position,
                quantityMilli: allocation.quantityMilli,
                allocationType: allocation.allocationType,
                tractorId: allocation.tractorId,
                trailerId: allocation.trailerId,
                driverId: allocation.driverId,
                odometerKm: allocation.odometerKm
              }))
            }
          }))
        }
      }
    });
  });
}

export async function updateConfirmedExpenseDocumentDetails(documentId: string, formData: FormData): Promise<void> {
  const details = parseConfirmedExpenseDetails(formData);
  const uploadedPdf = getOptionalPdf(formData);
  const storedPdf = uploadedPdf ? await storePdfFile(uploadedPdf) : null;
  let previousFilePath: string | null = null;

  try {
    previousFilePath = await prisma.$transaction(async (tx) => {
      const current = await tx.expenseDocument.findUnique({
        where: { id: documentId },
        select: {
          status: true,
          updatedAt: true,
          filePath: true,
          documentDate: true,
          registeredAt: true,
          lines: {
            select: {
              id: true,
              allocations: {
                select: {
                  id: true,
                  allocationType: true,
                  tractorId: true,
                  trailerId: true
                }
              }
            }
          }
        }
      });
      if (!current) throw new Error('Documento di spesa non trovato.');
      if (current.status !== 'CONFIRMED') {
        throw new Error('Il documento è ancora da validare: modificalo dalla coda di revisione.');
      }

      const currentLineIds = current.lines.map((line) => line.id).sort();
      const submittedLineIds = details.lines.map((line) => line.id).sort();
      if (
        currentLineIds.length !== submittedLineIds.length ||
        currentLineIds.some((id, index) => id !== submittedLineIds[index])
      ) {
        throw new Error('Le righe del documento sono cambiate. Ricarica la pagina prima di salvare.');
      }
      const currentAllocations = current.lines.flatMap((line) => line.allocations ?? []);
      const currentAllocationIds = currentAllocations.map((allocation) => allocation.id).sort();
      const submittedAllocationIds = details.allocations.map((allocation) => allocation.id).sort();
      if (
        currentAllocationIds.length !== submittedAllocationIds.length ||
        currentAllocationIds.some((id, index) => id !== submittedAllocationIds[index])
      ) {
        throw new Error('Le destinazioni del documento sono cambiate. Ricarica la pagina prima di salvare.');
      }
      const driverSelectionByAllocationId = new Map(
        details.allocations.map((allocation) => [allocation.id, allocation.driverSelection])
      );
      const resolvedDriverIds = await resolveExpenseAllocationDriverIds(
        currentAllocations.map((allocation) => ({
          ...allocation,
          driverSelection: driverSelectionByAllocationId.get(allocation.id) || EXPENSE_DRIVER_AUTO
        })),
        current.documentDate ?? current.registeredAt,
        tx
      );

      const claimed = await tx.expenseDocument.updateMany({
        where: {
          id: documentId,
          status: 'CONFIRMED',
          updatedAt: details.expectedUpdatedAt
        },
        data: {
          notes: details.notes,
          ...(storedPdf ? storedPdf : {})
        }
      });
      if (claimed.count !== 1) {
        throw new Error('Il documento è stato aggiornato da un’altra pagina. Ricaricalo e riprova.');
      }

      for (const line of details.lines) {
        await tx.expenseLine.update({
          where: { id: line.id },
          data: {
            description: line.description,
            code: line.code,
            notes: line.notes
          }
        });
      }
      for (let index = 0; index < currentAllocations.length; index += 1) {
        await tx.expenseLineAllocation.update({
          where: { id: currentAllocations[index].id },
          data: { driverId: resolvedDriverIds[index] }
        });
      }

      return current.filePath;
    });
  } catch (error) {
    if (storedPdf?.filePath) await removeStoredPdf(storedPdf.filePath).catch(() => undefined);
    throw error;
  }

  if (storedPdf && previousFilePath) {
    try {
      await removeStoredPdf(previousFilePath);
    } catch (error) {
      console.error('Impossibile eliminare il vecchio PDF del documento di spesa.', {
        documentId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
