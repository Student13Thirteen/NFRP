import 'server-only';

import { createHash } from 'node:crypto';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { removeStoredPdf, storePdfBuffer } from '@/lib/files';
import { readMaintenanceTableTextWithoutBlueInk, readPdfTextWithOcr } from '@/lib/inbox-ocr';
import { sumDocumentTotals } from '@/lib/expense';
import { buildExpenseReviewReasons, type AnomalyLine } from '@/lib/expense-anomalies';
import {
  needsMaintenancePriceRecovery,
  parseExpenseDocument,
  splitOcrTextByPage,
  type ParsedExpenseImport,
  type ParsedSupplierDetails
} from '@/lib/expense-parser';
import { splitPdfPages, type PdfPage } from '@/lib/pdf-pages';

const IMPORT_INTRO =
  'Dati estratti automaticamente dal PDF: controlla righe, importi, IVA e allocazione prima di confermare.';
const MAINTENANCE_IMPORT_INTRO =
  'Manutenzione letta automaticamente: controlla le operazioni e assegna ogni riga al Magazzino oppure alla targa sulla quale il ricambio è già montato.';

export type ExpenseImportMode = 'EXPENSE' | 'MAINTENANCE';

export type ExpenseImportResult = {
  importedDocuments: number;
  duplicateDocuments: number;
  totalLines: number;
  lastDocumentId: string | null;
  errors: string[];
};

export function getExpenseImportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 300);
  return 'Import non riuscito. Riprova.';
}

function normalizeImportPart(value: string): string {
  return value
    .toLocaleUpperCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Z0-9]+/g, '-');
}

function buildImportKey(parsed: ParsedExpenseImport, buffer: Buffer): string {
  if (parsed.supplierName && parsed.documentNumber) {
    return `expense:${normalizeImportPart(parsed.supplierName)}:${normalizeImportPart(parsed.documentNumber)}`;
  }
  return `expense:sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function pageFileName(originalName: string, pageNumber: number, pageCount: number): string {
  if (pageCount <= 1) return originalName || 'documento.pdf';
  const extension = path.extname(originalName || '') || '.pdf';
  const base = path.basename(originalName || 'documento', extension);
  return `${base}-pagina-${pageNumber}${extension}`;
}

async function ensureSupplierId(
  name: string | null,
  details: ParsedSupplierDetails | null
): Promise<string | null> {
  if (!name) return null;
  const existing = await prisma.supplier.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true, active: true }
  });
  if (existing) {
    if (!existing.active) {
      await prisma.supplier.update({ where: { id: existing.id }, data: { active: true } });
    }
    return existing.id;
  }

  try {
    const created = await prisma.supplier.create({
      data: {
        name,
        phone: details?.phone,
        email: details?.email,
        address: details?.address,
        postalCode: details?.postalCode,
        city: details?.city,
        province: details?.province,
        country: details?.country,
        notes: 'Aggiunto automaticamente durante import documento di spesa.'
      },
      select: { id: true }
    });
    return created.id;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const concurrent = await prisma.supplier.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true }
    });
    if (concurrent) return concurrent.id;
    throw error;
  }
}

async function ensureCategoryId(name: string | null): Promise<string | null> {
  if (!name) return null;
  const existing = await prisma.category.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true, active: true }
  });
  if (existing) {
    if (!existing.active) await prisma.category.update({ where: { id: existing.id }, data: { active: true } });
    return existing.id;
  }
  const created = await prisma.category.create({ data: { name }, select: { id: true } });
  return created.id;
}

function buildReviewReasons(parsed: ParsedExpenseImport, page: PdfPage): string {
  const anomalyLines: AnomalyLine[] = parsed.lines.map((line) => ({
    description: line.description,
    imponibileCents: line.imponibileCents,
    vatCents: line.vatCents,
    totalCents: line.totalCents,
    vatRatePercent: line.vatRatePercent,
    quantityMilli: line.quantityMilli,
    allocationType: line.allocationType
  }));
  const ruleReasons = buildExpenseReviewReasons(anomalyLines, {
    requireAllocation: true,
    declaredTotalCents: parsed.declaredTotalCents
  });
  const intro = parsed.requiresVehicleAllocation ? MAINTENANCE_IMPORT_INTRO : IMPORT_INTRO;
  const pageNote = page.pageCount > 1 ? `Pagina ${page.pageNumber} di ${page.pageCount} importata come documento autonomo.` : '';
  return [intro, pageNote, ruleReasons].filter(Boolean).join(' ');
}

export async function importParsedExpenseDraft(
  parsed: ParsedExpenseImport,
  page: PdfPage,
  originalName: string
): Promise<{ documentId: string | null; lineCount: number; duplicate: boolean }> {
  const importKey = buildImportKey(parsed, page.buffer);
  const duplicate = await prisma.expenseDocument.findUnique({ where: { importKey }, select: { id: true } });
  if (duplicate) return { documentId: duplicate.id, lineCount: 0, duplicate: true };

  const [supplierId, categoryId] = await Promise.all([
    ensureSupplierId(parsed.supplierName, parsed.supplierDetails),
    ensureCategoryId(parsed.suggestedCategoryName)
  ]);
  const totals = sumDocumentTotals(parsed.lines);
  const stored = await storePdfBuffer(page.buffer, pageFileName(originalName, page.pageNumber, page.pageCount));

  try {
    const created = await prisma.expenseDocument.create({
      data: {
        status: 'PENDING',
        source: parsed.requiresVehicleAllocation ? 'MAINTENANCE_IMPORT' : 'IMPORT',
        importKey,
        sourcePage: page.pageNumber,
        sourcePageCount: page.pageCount,
        supplierId,
        supplierName: parsed.supplierName,
        documentNumber: parsed.documentNumber,
        documentDate: parsed.documentDate,
        registeredAt: parsed.documentDate ?? new Date(),
        reviewReasons: buildReviewReasons(parsed, page),
        ...totals,
        filePath: stored.filePath,
        originalFileName: stored.originalFileName,
        fileSize: stored.fileSize,
        mimeType: stored.mimeType,
        lines: {
          create: parsed.lines.map((line, index) => ({
            position: index,
            code: line.code,
            description: line.description,
            quantityMilli: line.quantityMilli,
            unit: 'pz',
            unitPriceCents: line.unitPriceCents,
            imponibileCents: line.imponibileCents,
            vatRatePercent: line.vatRatePercent,
            vatCents: line.vatCents,
            totalCents: line.totalCents,
            categoryId,
            allocationType: line.allocationType
          }))
        }
      }
    });
    return { documentId: created.id, lineCount: parsed.lines.length, duplicate: false };
  } catch (error) {
    await removeStoredPdf(stored.filePath).catch(() => undefined);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { documentId: null, lineCount: 0, duplicate: true };
    }
    throw error;
  }
}

async function readPageTexts(
  buffer: Buffer,
  pages: PdfPage[],
  mode: ExpenseImportMode
): Promise<string[]> {
  const ocrOptions = mode === 'MAINTENANCE'
    ? { clean: false, languages: 'eng', tesseractPageSegMode: '6' }
    : {};
  const fullOcr = await readPdfTextWithOcr(buffer, ocrOptions);
  const chunks = splitOcrTextByPage(fullOcr.text || '');
  if (chunks.length === pages.length) return chunks;

  const texts: string[] = [];
  for (const page of pages) {
    const pageOcr = await readPdfTextWithOcr(page.buffer, ocrOptions);
    texts.push(pageOcr.text || '');
  }
  return texts;
}

function forceMaintenanceDraft(parsed: ParsedExpenseImport): ParsedExpenseImport {
  return {
    ...parsed,
    suggestedCategoryName: parsed.suggestedCategoryName || 'Manutenzioni',
    requiresVehicleAllocation: true
  };
}

export async function parseMaintenanceExpensePage(
  page: PdfPage,
  primaryText: string,
  fallbackText?: string
): Promise<ParsedExpenseImport> {
  const primary = parseExpenseDocument(primaryText);
  const primaryNeedsRecovery = needsMaintenancePriceRecovery(primary);
  const isDemoPartsSupplier = primary.supplierName === 'Ricambi Demo Delta';
  if (!primaryNeedsRecovery && !isDemoPartsSupplier) return forceMaintenanceDraft(primary);

  // Le note a penna blu possono attraversare descrizione e colonne numeriche.
  // Rileggiamo la sola tabella senza i pixel blu, ma non usiamo mai questo
  // passaggio per targa, km o allocazione automatica.
  const withoutBlueInkText = (await readMaintenanceTableTextWithoutBlueInk(page.buffer)).text;
  const withoutBlueInk = parseExpenseDocument(
    [primaryText, withoutBlueInkText].filter(Boolean).join('\n')
  );
  if (!needsMaintenancePriceRecovery(withoutBlueInk)) {
    return forceMaintenanceDraft(withoutBlueInk);
  }
  if (!primaryNeedsRecovery && !withoutBlueInkText) return forceMaintenanceDraft(primary);

  // I documenti d'officina hanno spesso una riga tabellare che PSM 6 legge
  // bene, ma qualche scansione richiede il layout automatico standard.
  const standardText = fallbackText ?? (await readPdfTextWithOcr(page.buffer)).text;
  const combined = parseExpenseDocument(
    [primaryText, withoutBlueInkText, standardText].filter(Boolean).join('\n')
  );
  if (!needsMaintenancePriceRecovery(combined)) return forceMaintenanceDraft(combined);

  // Alcune griglie Ricambi Demo Delta molto inclinate perdono la riga articolo con il
  // profilo rapido. Il vecchio profilo ita+eng con pulizia e PSM 6 e piu lento,
  // quindi viene eseguito soltanto sulla singola pagina ancora vuota.
  const legacyTableText = (
    await readPdfTextWithOcr(page.buffer, {
      clean: true,
      languages: 'ita+eng',
      tesseractPageSegMode: '6'
    })
  ).text;
  return forceMaintenanceDraft(
    parseExpenseDocument(
      [primaryText, withoutBlueInkText, standardText, legacyTableText].filter(Boolean).join('\n')
    )
  );
}

async function importSinglePdf(file: File, mode: ExpenseImportMode): Promise<{
  documents: number;
  lines: number;
  duplicates: number;
  lastDocumentId: string | null;
}> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const pages = await splitPdfPages(buffer);
  const pageTexts = await readPageTexts(buffer, pages, mode);
  let fallbackPageTexts: string[] | undefined;
  if (
    mode === 'MAINTENANCE' &&
    pageTexts.some((text) => needsMaintenancePriceRecovery(parseExpenseDocument(text)))
  ) {
    // Il layout automatico sull'intero fascicolo mantiene meglio l'ordine e i
    // riferimenti pagina rispetto a piu OCR separati eseguiti in parallelo.
    fallbackPageTexts = await readPageTexts(buffer, pages, 'EXPENSE');
  }
  const parsedPages = mode === 'MAINTENANCE'
    ? await Promise.all(
        pages.map((page, index) =>
          parseMaintenanceExpensePage(page, pageTexts[index] || '', fallbackPageTexts?.[index])
        )
      )
    : pageTexts.map(parseExpenseDocument);
  const splitAsDocuments =
    pages.length > 1 &&
    (
      mode === 'MAINTENANCE' ||
      (
        parsedPages.length === pages.length &&
        parsedPages.every((parsed) => parsed.requiresVehicleAllocation && Boolean(parsed.documentNumber))
      )
    );

  const drafts = splitAsDocuments
    ? pages.map((page, index) => ({ page, parsed: parsedPages[index] }))
    : [{
        page: { pageNumber: 1, pageCount: 1, buffer },
        parsed: pages.length === 1
          ? parsedPages[0]
          : mode === 'MAINTENANCE'
            ? forceMaintenanceDraft(parseExpenseDocument(pageTexts.join('\n')))
            : parseExpenseDocument(pageTexts.join('\n'))
      }];

  let documents = 0;
  let lines = 0;
  let duplicates = 0;
  let lastDocumentId: string | null = null;
  for (const draft of drafts) {
    const imported = await importParsedExpenseDraft(draft.parsed, draft.page, file.name || 'documento.pdf');
    if (imported.duplicate) {
      duplicates += 1;
      continue;
    }
    documents += 1;
    lines += imported.lineCount;
    lastDocumentId = imported.documentId;
  }

  return { documents, lines, duplicates, lastDocumentId };
}

export async function importExpensePdfFiles(
  files: File[],
  mode: ExpenseImportMode = 'EXPENSE'
): Promise<ExpenseImportResult> {
  const result: ExpenseImportResult = {
    importedDocuments: 0,
    duplicateDocuments: 0,
    totalLines: 0,
    lastDocumentId: null,
    errors: []
  };

  for (const file of files) {
    try {
      const imported = await importSinglePdf(file, mode);
      result.importedDocuments += imported.documents;
      result.duplicateDocuments += imported.duplicates;
      result.totalLines += imported.lines;
      result.lastDocumentId = imported.lastDocumentId ?? result.lastDocumentId;
    } catch (error) {
      console.error('Import documento di spesa fallito.', {
        fileName: file.name,
        error: error instanceof Error ? error.message : String(error)
      });
      result.errors.push(`${file.name}: ${getExpenseImportErrorMessage(error)}`);
    }
  }

  return result;
}
