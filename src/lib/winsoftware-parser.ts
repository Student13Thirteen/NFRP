import { createHash } from 'node:crypto';
import { getFuelProductName, type ParsedFuelInvoice, type ParsedFuelRow } from '@/lib/fuel-parser';

export type WinSoftwareDocumentKind = 'FUEL' | 'MAINTENANCE' | 'UNKNOWN';

export type ParsedWinSoftwareItem = {
  rawText: string;
  description: string;
  quantityMilli: number | null;
  unitPriceCents: number | null;
  imponibileCents: number | null;
  vatRatePercent: number;
};

export type ParsedWinSoftwareDocument = {
  isWinSoftware: boolean;
  kind: WinSoftwareDocumentKind;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  classificationReason: string;
  supplierName: string | null;
  supplierVatNumber: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  declaredTotalCents: number | null;
  itemCount: number;
  items: ParsedWinSoftwareItem[];
  fuelInvoice: ParsedFuelInvoice | null;
};

const ITALIAN_DECIMAL_GLOBAL = /\d{1,3}(?:\.\d{3})*,\d{2,5}/g;
const DOCUMENT_DATE = /\b(\d{2})[-/](\d{2})[-/](\d{4})\b/;
const DDT_GLOBAL = /^DDT\s+([A-Z0-9/-]+)\s+del\s+(\d{2}[-/]\d{2}[-/]\d{4})\s*$/gim;
const FUEL_LINE_GLOBAL = /(GASOLIO|AD[\s-]?BLUE)\s+Targa\s+([A-Z]{2})\s*(\d{3})\s*([A-Z]{2})([^\n]*)/gim;

type LocatedDdt = {
  index: number;
  number: string;
  date: Date;
};

function parseItalianNumber(value: string): number {
  return Number(value.replace(/\./g, '').replace(',', '.'));
}

function parseDate(value: string): Date | null {
  const match = DOCUMENT_DATE.exec(value);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCDate() !== day ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCFullYear() !== year
  ) {
    return null;
  }
  return date;
}

function extractSupplierName(text: string): string | null {
  const matches = Array.from(text.matchAll(/Denominazione:\s*([^\n]+?)(?:\s+Indirizzo:|$)/gi));
  const names = matches
    .map((match) => match[1].replace(/\s+/g, ' ').trim())
    .filter((name) => name && !/NET\s*FLEET/i.test(name));
  return names[0] || null;
}

function extractSupplierVatNumber(text: string): string | null {
  const supplierSection = text.split(/Cessionario\/committente/i)[0] || text;
  const match = /Identificativo fiscale ai fini IVA:\s*(IT\d{11})/i.exec(supplierSection)
    || /Identificativo fiscale ai fini IVA:\s*(IT\d{11})/i.exec(text);
  return match?.[1].toUpperCase() || null;
}

function extractInvoiceMetadata(text: string): { invoiceNumber: string | null; invoiceDate: Date | null } {
  const documentLine = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .find((line) => /^TD\d{2}\b/i.test(line));
  if (!documentLine) return { invoiceNumber: null, invoiceDate: null };

  const dateMatch = DOCUMENT_DATE.exec(documentLine);
  if (!dateMatch || dateMatch.index === undefined) return { invoiceNumber: null, invoiceDate: null };
  const beforeDate = documentLine.slice(0, dateMatch.index).trim().split(/\s+/);
  return {
    invoiceNumber: beforeDate.at(-1)?.replace(/[^A-Z0-9/-]/gi, '') || null,
    invoiceDate: parseDate(dateMatch[0])
  };
}

function extractDeclaredTotal(text: string): number | null {
  const direct = /Totale documento\s*\n\s*\|?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i.exec(text);
  if (direct) return Math.round(parseItalianNumber(direct[1]) * 100);
  return null;
}

function findDdtRows(text: string): LocatedDdt[] {
  return Array.from(text.matchAll(DDT_GLOBAL)).flatMap((match) => {
    const date = parseDate(match[2]);
    return date && match.index !== undefined
      ? [{ index: match.index, number: match[1].toUpperCase(), date }]
      : [];
  });
}

function nearestPreviousDdt(ddts: LocatedDdt[], index: number): LocatedDdt | null {
  let found: LocatedDdt | null = null;
  for (const ddt of ddts) {
    if (ddt.index > index) break;
    found = ddt;
  }
  return found;
}

function nextDdtIndex(ddts: LocatedDdt[], index: number, fallback: number): number {
  return ddts.find((ddt) => ddt.index > index)?.index ?? fallback;
}

function buildFuelRows(
  text: string,
  metadata: { supplierName: string | null; supplierVatNumber: string | null; invoiceNumber: string | null; invoiceDate: Date | null }
): ParsedFuelRow[] {
  const ddts = findDdtRows(text);
  const rows: ParsedFuelRow[] = [];

  for (const match of text.matchAll(FUEL_LINE_GLOBAL)) {
    if (match.index === undefined) continue;
    const ddt = nearestPreviousDdt(ddts, match.index);
    const fuelDate = ddt?.date || metadata.invoiceDate;
    if (!fuelDate) continue;

    const productCode = /AD[\s-]?BLUE/i.test(match[1]) ? 'ADB' : 'GLS';
    const productName = getFuelProductName(productCode);
    const plate = `${match[2]}${match[3]}${match[4]}`.toUpperCase();
    const tailNumbers = match[5].match(ITALIAN_DECIMAL_GLOBAL) || [];
    const quantity = tailNumbers[0] ? parseItalianNumber(tailNumbers[0]) : 0;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const blockEnd = nextDdtIndex(ddts, match.index, text.length);
    const block = text.slice(match.index, blockEnd);
    const grossPriceMatch = /Rif\.\s*numero:\s*(\d{1,2},\d{2,5})/i.exec(block);
    const grossPrice = grossPriceMatch ? parseItalianNumber(grossPriceMatch[1]) : null;
    const candidateNetPrice = tailNumbers[1] ? parseItalianNumber(tailNumbers[1]) : null;
    const netPrice = candidateNetPrice && candidateNetPrice > 0.1 && candidateNetPrice < 10
      ? candidateNetPrice
      : grossPrice
        ? grossPrice / 1.22
        : null;
    if (!netPrice && !grossPrice) continue;

    const finalGrossPrice = grossPrice || netPrice! * 1.22;
    const totalAmountCents = Math.round(quantity * finalGrossPrice * 100);
    const amountCents = Math.round(quantity * (netPrice || finalGrossPrice / 1.22) * 100);
    const volumeLitersMilli = Math.round(quantity * 1000);
    const finalPricePerLiterMilliEuro = Math.round(finalGrossPrice * 1000);
    const basePricePerLiterMilliEuro = Math.round((netPrice || finalGrossPrice / 1.22) * 1000);
    const ticketNumber = ddt?.number || metadata.invoiceNumber || `RIGA-${rows.length + 1}`;
    const sourceKey = createHash('sha256')
      .update([
        'WINSOFTWARE',
        metadata.supplierVatNumber || metadata.supplierName || '',
        metadata.invoiceNumber || '',
        ticketNumber,
        fuelDate.toISOString().slice(0, 10),
        productCode,
        plate,
        volumeLitersMilli,
        totalAmountCents
      ].join('|'))
      .digest('hex');

    rows.push({
      sourceKey,
      rawText: match[0].replace(/\s+/g, ' ').trim(),
      rowIndex: rows.length + 1,
      cardNumber: '',
      ticketNumber,
      fuelDate,
      fuelTime: '',
      productCode,
      productName,
      vehicleCode: plate,
      odometerKm: null,
      stationCode: metadata.supplierVatNumber || '',
      stationName: metadata.supplierName || 'Distributore carburante',
      serviceType: 'WINSOFTWARE',
      plate,
      amountCents,
      totalAmountCents,
      volumeLitersMilli,
      finalPricePerLiterMilliEuro,
      basePricePerLiterMilliEuro,
      discountPerLiterMilliEuro: null
    });
  }

  return rows;
}

function parseItems(text: string): ParsedWinSoftwareItem[] {
  return text
    .split(/\r?\n/)
    .filter((line) => /\(AswArtFor\)/i.test(line))
    .map((line) => {
      const rawText = line.replace(/\s+/g, ' ').trim();
      const content = rawText.split(/\(AswArtFor\)/i)[1]?.trim() || rawText;
      const numbers = Array.from(content.matchAll(ITALIAN_DECIMAL_GLOBAL));
      const firstNumber = numbers[0];
      const quantity = firstNumber ? parseItalianNumber(firstNumber[0]) : null;
      const description = firstNumber && firstNumber.index !== undefined
        ? content.slice(0, firstNumber.index).replace(/^[\s|—-]+/, '').trim()
        : content.replace(/^[\s|—-]+/, '').trim();
      const vatIndex = numbers.findIndex((number, index) => index > 0 && /^(22|10|5|4|0),0+$/i.test(number[0]));
      const totalToken = vatIndex >= 0 ? numbers[vatIndex + 1]?.[0] : null;
      const unitPrice = numbers[1] ? parseItalianNumber(numbers[1][0]) : null;
      const imponibile = totalToken
        ? parseItalianNumber(totalToken)
        : quantity && unitPrice
          ? quantity * unitPrice
          : null;

      return {
        rawText,
        description: description || 'Voce da verificare',
        quantityMilli: quantity && quantity > 0 ? Math.round(quantity * 1000) : null,
        unitPriceCents: unitPrice && unitPrice > 0 ? Math.round(unitPrice * 100) : null,
        imponibileCents: imponibile && imponibile > 0 ? Math.round(imponibile * 100) : null,
        vatRatePercent: vatIndex >= 0 ? Math.round(parseItalianNumber(numbers[vatIndex][0])) : 22
      };
    });
}

export function parseWinSoftwareDocument(text: string): ParsedWinSoftwareDocument {
  const normalized = text.toLocaleLowerCase('it-IT');
  const markers = [
    'cedente/prestatore',
    'cessionario/committente',
    'tipologia documento',
    'cod. articolo',
    'riepiloghi iva'
  ];
  const markerCount = markers.filter((marker) => normalized.includes(marker)).length;
  const isWinSoftware = markerCount >= 4;
  const supplierName = extractSupplierName(text);
  const supplierVatNumber = extractSupplierVatNumber(text);
  const { invoiceNumber, invoiceDate } = extractInvoiceMetadata(text);
  const items = parseItems(text);
  const itemCount = (text.match(/\(AswArtFor\)/gi) || []).length;
  const fuelRows = buildFuelRows(text, { supplierName, supplierVatNumber, invoiceNumber, invoiceDate });

  let kind: WinSoftwareDocumentKind = 'UNKNOWN';
  let confidence: ParsedWinSoftwareDocument['confidence'] = 'LOW';
  let classificationReason = 'Formato WinSoftware non riconosciuto con sufficiente affidabilità.';

  if (isWinSoftware && fuelRows.length > 0 && fuelRows.length === itemCount) {
    kind = 'FUEL';
    confidence = invoiceNumber && invoiceDate ? 'HIGH' : 'MEDIUM';
    classificationReason = `${fuelRows.length} righe articolo su ${itemCount} contengono carburante/AdBlue, targa, quantità e prezzo.`;
  } else if (isWinSoftware && fuelRows.length === 0) {
    kind = 'MAINTENANCE';
    confidence = itemCount > 0 && invoiceNumber && invoiceDate ? 'HIGH' : 'MEDIUM';
    classificationReason = 'Formato WinSoftware riconosciuto senza righe carburante: bozza instradata alle manutenzioni.';
  } else if (isWinSoftware) {
    classificationReason = 'La fattura contiene righe miste: è richiesto un controllo manuale prima dell’importazione.';
  }

  const fuelInvoice = kind === 'FUEL'
    ? {
        supplierName,
        invoiceNumber,
        invoiceDate,
        periodEndDate: invoiceDate,
        rows: fuelRows,
        skippedLines: Math.max(0, itemCount - fuelRows.length)
      }
    : null;

  return {
    isWinSoftware,
    kind,
    confidence,
    classificationReason,
    supplierName,
    supplierVatNumber,
    invoiceNumber,
    invoiceDate,
    declaredTotalCents: extractDeclaredTotal(text) || (fuelRows.length > 0
      ? fuelRows.reduce((sum, row) => sum + row.totalAmountCents, 0)
      : null),
    itemCount,
    items,
    fuelInvoice
  };
}
