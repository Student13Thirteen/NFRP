import 'server-only';

import { prisma } from '@/lib/db';
import { emptyStoredPdf, removeStoredPdf, storePdfFile, type NullableStoredPdf } from '@/lib/files';
import { formString, optionalFormString } from '@/lib/form';
import {
  allocationToDbFields,
  computeLineVat,
  imponibileCentsFromUnit,
  sumDocumentTotals
} from '@/lib/expense';
import { buildExpenseReviewReasons, type AnomalyLine } from '@/lib/expense-anomalies';
import { confirmExpenseDocument } from '@/lib/expense-confirm';

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

/** "1.234,56" / "1234,56" / "12.50" -> centesimi. Convenzione italiana come le altre sezioni. */
function parseAmountToCents(value: string | null, label: string): number {
  if (value === null || value.trim() === '') return 0;
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error(`${label} non valido.`);
  return Math.round(Number(normalized) * 100);
}

/** Quantità decimale ("0,5", "5", "2,5") -> millesimi. */
function parseQuantityToMilli(value: string | null): number {
  if (value === null || value.trim() === '') return 1000;
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) throw new Error('Quantità non valida.');
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

async function storeOptionalPdf(formData: FormData): Promise<NullableStoredPdf> {
  const file = getOptionalPdf(formData);
  if (!file) return emptyStoredPdf();
  return storePdfFile(file);
}

export type ParsedExpenseLine = {
  position: number;
  code: string | null;
  description: string;
  quantityMilli: number;
  unit: string;
  unitPriceCents: number;
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
};

function cell(values: string[], index: number): string | null {
  const value = (values[index] ?? '').trim();
  return value === '' ? null : value;
}

export function parseExpenseLines(formData: FormData): ParsedExpenseLine[] {
  const descriptions = formData.getAll('lineDescription').map(String);
  const codes = formData.getAll('lineCode').map(String);
  const quantities = formData.getAll('lineQuantity').map(String);
  const units = formData.getAll('lineUnit').map(String);
  const unitPrices = formData.getAll('lineUnitPrice').map(String);
  const vatRates = formData.getAll('lineVatRate').map(String);
  const allocationKeys = formData.getAll('lineAllocationKey').map(String);
  const categoryIds = formData.getAll('lineCategoryId').map(String);
  const odometerKms = formData.getAll('lineOdometerKm').map(String);
  const lineNotes = formData.getAll('lineNotes').map(String);

  const lines: ParsedExpenseLine[] = [];
  for (let i = 0; i < descriptions.length; i += 1) {
    const description = (descriptions[i] ?? '').trim();
    if (!description) continue; // riga vuota, ignorata

    const quantityMilli = parseQuantityToMilli(cell(quantities, i));
    const unitPriceCents = parseAmountToCents(cell(unitPrices, i), 'Prezzo unitario');
    const vatRatePercent = parseVatRate(cell(vatRates, i));
    const imponibileCents = imponibileCentsFromUnit(quantityMilli, unitPriceCents);
    const { vatCents, totalCents } = computeLineVat(imponibileCents, vatRatePercent);
    const allocation = allocationToDbFields(cell(allocationKeys, i));

    lines.push({
      position: lines.length,
      code: cell(codes, i),
      description: description.slice(0, 400),
      quantityMilli,
      unit: cell(units, i) || 'pz',
      unitPriceCents,
      imponibileCents,
      vatRatePercent,
      vatCents,
      totalCents,
      categoryId: cell(categoryIds, i),
      allocationType: allocation.allocationType,
      tractorId: allocation.tractorId,
      trailerId: allocation.trailerId,
      odometerKm: parseOptionalOdometer(cell(odometerKms, i)),
      notes: cell(lineNotes, i)
    });
  }

  return lines;
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

  const storedPdf = await storeOptionalPdf(formData);

  let documentId: string;
  try {
    const created = await prisma.expenseDocument.create({
      data: {
        status: 'PENDING',
        source: 'MANUAL',
        supplierId,
        supplierName,
        documentNumber: optionalFormString(formData, 'documentNumber'),
        documentDate,
        registeredAt,
        notes: optionalFormString(formData, 'notes'),
        reviewReasons,
        ...totals,
        ...storedPdf,
        lines: {
          create: lines.map((line) => ({
            position: line.position,
            code: line.code,
            description: line.description,
            quantityMilli: line.quantityMilli,
            unit: line.unit,
            unitPriceCents: line.unitPriceCents,
            imponibileCents: line.imponibileCents,
            vatRatePercent: line.vatRatePercent,
            vatCents: line.vatCents,
            totalCents: line.totalCents,
            categoryId: line.categoryId,
            allocationType: line.allocationType,
            tractorId: line.tractorId,
            trailerId: line.trailerId,
            odometerKm: line.odometerKm,
            notes: line.notes
          }))
        }
      }
    });
    documentId = created.id;
  } catch (error) {
    if (storedPdf.filePath) {
      await removeStoredPdf(storedPdf.filePath).catch(() => undefined);
    }
    throw error;
  }

  if (!saveAsPending) {
    await confirmExpenseDocument(documentId);
  }

  return documentId;
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
      select: { status: true, source: true }
    });
    if (!doc) throw new Error('Documento di spesa non trovato.');
    if (doc.status !== 'PENDING') throw new Error('Il documento è già stato confermato.');
    if (
      doc.source === 'MAINTENANCE_IMPORT' &&
      lines.some((line) => !['WAREHOUSE', 'TRACTOR', 'TRAILER'].includes(line.allocationType))
    ) {
      throw new Error('Assegna ogni riga al Magazzino oppure a una targa valida prima di confermare.');
    }
    if (
      doc.source === 'LEASE_INVOICE_IMPORT' &&
      lines.some((line) => line.allocationType !== 'TRACTOR' && line.allocationType !== 'TRAILER')
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
          create: lines.map((line) => ({
            position: line.position,
            code: line.code,
            description: line.description,
            quantityMilli: line.quantityMilli,
            unit: line.unit,
            unitPriceCents: line.unitPriceCents,
            imponibileCents: line.imponibileCents,
            vatRatePercent: line.vatRatePercent,
            vatCents: line.vatCents,
            totalCents: line.totalCents,
            categoryId: line.categoryId,
            allocationType: line.allocationType,
            tractorId: line.tractorId,
            trailerId: line.trailerId,
            odometerKm: line.odometerKm,
            notes: line.notes
          }))
        }
      }
    });
  });
}
