import 'server-only';

import path from 'node:path';
import { importParsedExpenseDraft, parseMaintenanceExpensePage } from '@/lib/expense-import';
import {
  isConfidentMaintenanceExpense,
  parseExpenseDocument,
  splitOcrTextByPage
} from '@/lib/expense-parser';
import { importParsedFuelInvoiceBuffer } from '@/lib/fuel-import';
import { readPdfTextWithOcr } from '@/lib/inbox-ocr';
import { splitPdfPages, type PdfPage } from '@/lib/pdf-pages';
import { parseWinSoftwareDocument } from '@/lib/winsoftware-parser';

export type SmartInvoiceImportResult = {
  receivedFiles: number;
  analyzedPages: number;
  fuelDocuments: number;
  fuelRows: number;
  maintenanceDocuments: number;
  maintenanceLines: number;
  duplicateDocuments: number;
  duplicateRows: number;
  pendingItems: number;
  createdTractors: number;
  errors: string[];
};

function pageFileName(originalName: string, page: PdfPage): string {
  if (page.pageCount <= 1) return originalName || 'fattura.pdf';
  const extension = path.extname(originalName || '') || '.pdf';
  const base = path.basename(originalName || 'fattura', extension);
  return `${base}-pagina-${page.pageNumber}${extension}`;
}

async function readPageTexts(
  buffer: Buffer,
  pages: PdfPage[],
  options: { clean?: boolean; languages?: string; tesseractPageSegMode?: string } = {}
): Promise<string[]> {
  const fullOcr = await readPdfTextWithOcr(buffer, options);
  const chunks = splitOcrTextByPage(fullOcr.text || '');
  if (chunks.length === pages.length) return chunks;

  const texts: string[] = [];
  for (const page of pages) {
    const pageOcr = await readPdfTextWithOcr(page.buffer, options);
    texts.push(pageOcr.text || '');
  }
  return texts;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message.slice(0, 240) : 'Errore non identificato.';
}

export async function importSmartInvoicePdfFiles(files: File[]): Promise<SmartInvoiceImportResult> {
  if (files.length === 0) throw new Error('Seleziona almeno un PDF WinSoftware.');

  const result: SmartInvoiceImportResult = {
    receivedFiles: files.length,
    analyzedPages: 0,
    fuelDocuments: 0,
    fuelRows: 0,
    maintenanceDocuments: 0,
    maintenanceLines: 0,
    duplicateDocuments: 0,
    duplicateRows: 0,
    pendingItems: 0,
    createdTractors: 0,
    errors: []
  };

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const pages = await splitPdfPages(buffer);
      const texts = await readPageTexts(buffer, pages);
      let maintenanceTexts: string[] | null = null;

      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index]!;
        const text = texts[index] || '';
        const document = parseWinSoftwareDocument(text);
        const name = pageFileName(file.name || 'fattura.pdf', page);
        result.analyzedPages += 1;

        try {
          if (document.kind === 'FUEL' && document.fuelInvoice) {
            const imported = await importParsedFuelInvoiceBuffer(page.buffer, name, document.fuelInvoice);
            result.fuelDocuments += 1;
            result.fuelRows += imported.importedRows;
            result.duplicateRows += imported.duplicateRows;
            result.pendingItems += imported.pendingRows;
            result.createdTractors += imported.createdTractors;
            continue;
          }

          if (document.kind === 'MAINTENANCE') {
            const parsedExpense = parseExpenseDocument(text);
            const imported = await importParsedExpenseDraft(parsedExpense, page, file.name || 'fattura.pdf');
            if (imported.duplicate) {
              result.duplicateDocuments += 1;
            } else {
              result.maintenanceDocuments += 1;
              result.maintenanceLines += imported.lineCount;
              result.pendingItems += 1;
            }
            continue;
          }

          if (!document.isWinSoftware) {
            maintenanceTexts ??= await readPageTexts(buffer, pages, {
              clean: false,
              languages: 'eng',
              tesseractPageSegMode: '6'
            });
            const parsedExpense = await parseMaintenanceExpensePage(
              page,
              maintenanceTexts[index] || text,
              text
            );
            if (isConfidentMaintenanceExpense(parsedExpense)) {
              const imported = await importParsedExpenseDraft(parsedExpense, page, file.name || 'fattura.pdf');
              if (imported.duplicate) {
                result.duplicateDocuments += 1;
              } else {
                result.maintenanceDocuments += 1;
                result.maintenanceLines += imported.lineCount;
                result.pendingItems += 1;
              }
              continue;
            }
          }

          result.errors.push(`${name}: ${document.classificationReason}`);
        } catch (error) {
          result.errors.push(`${name}: ${errorMessage(error)}`);
        }
      }
    } catch (error) {
      result.errors.push(`${file.name || 'fattura.pdf'}: ${errorMessage(error)}`);
    }
  }

  return result;
}
