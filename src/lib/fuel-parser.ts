import { createHash } from 'node:crypto';

export type ParsedFuelInvoice = {
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  periodEndDate: Date | null;
  rows: ParsedFuelRow[];
  skippedLines: number;
};

export type ParsedFuelRow = {
  sourceKey: string;
  rawText: string;
  rowIndex: number;
  cardNumber: string;
  ticketNumber: string;
  fuelDate: Date;
  fuelTime: string;
  productCode: string;
  productName: string;
  vehicleCode: string;
  odometerKm: number | null;
  stationCode: string;
  stationName: string;
  serviceType: string;
  plate: string;
  amountCents: number | null;
  totalAmountCents: number;
  volumeLitersMilli: number;
  finalPricePerLiterMilliEuro: number | null;
  basePricePerLiterMilliEuro: number | null;
  discountPerLiterMilliEuro: number | null;
};

type PendingFuelRow = Omit<ParsedFuelRow, 'sourceKey' | 'plate'>;

const PRODUCT_LABELS: Record<string, string> = {
  ADB: 'AdBlue',
  ADC: 'AdBlue tanica',
  ALT: 'Altro',
  BWR: 'Benzina WR 100',
  CNG: 'Metano CNG',
  CRE: 'Costo R.E.',
  CWS: 'Car wash',
  GEC: 'Gasolio Ecoplus',
  GLS: 'Gasolio',
  GPL: 'GPL',
  HBZ: 'FuelCo Hi Perform 100 ottani',
  HGL: 'FuelCo Hi Perform Diesel',
  HVO: 'HVO',
  LNG: 'Metano LNG',
  MTN: 'Metano CNG',
  PEN: 'Penalty R.E.',
  PRE: 'Prenotazione R.E.',
  RET: 'Ricarica elettrica',
  SSP: 'Super senza piombo'
};

const ADBLUE_CODES = ['ADB', 'ADC'];

export const DEFAULT_FUEL_PRODUCTS = Object.entries(PRODUCT_LABELS).map(([code, name]) => ({
  code,
  name,
  isFuel: isPerKmConsumableCode(code)
}));

export function getFuelProductName(productCode: string): string {
  return PRODUCT_LABELS[productCode] || productCode;
}

// Carburanti di trazione: da soli coprono l'intera distanza percorsa, quindi
// determinano i km e l'euro/km "principale" della targa.
export function isDefaultFuelProductCode(productCode: string): boolean {
  return ['BWR', 'CNG', 'GEC', 'GLS', 'GPL', 'HBZ', 'HGL', 'HVO', 'LNG', 'MTN', 'SSP'].includes(productCode);
}

// AdBlue: additivo consumato proporzionalmente ai km, ma non e' carburante di
// trazione (non determina da solo la distanza).
export function isAdBlueProductCode(productCode: string): boolean {
  return ADBLUE_CODES.includes(productCode);
}

// "A consumo": consumato in proporzione ai km percorsi (carburanti di trazione +
// AdBlue). Per questi ha senso calcolare €/km e consumo, ciascuno sulla propria
// catena di rifornimenti. Esclude i servizi una tantum (autolavaggio, penali,
// prenotazioni, ricariche) che un €/km non ce l'hanno.
export function isPerKmConsumableCode(productCode: string): boolean {
  return isDefaultFuelProductCode(productCode) || isAdBlueProductCode(productCode);
}

const TRANSACTION_LINE_PATTERN =
  /^\s*(\d{18,20})\s+(\d{5})\s+(\d{2}\/\d{2}\/(?:\d{4}|\d{2}))\s+(\d{4})\s+([A-Z0-9]{3})\s+(\d{4})\s+(\d{1,7})\s+(\d{3,4})\s+(.+?)\s+(SF|SV|PP)\s+(.+?)\s*$/;

const TOTAL_LINE_PATTERN = /TOTALE\s+PAN\s+(\d{18,20})\s+TARGA\/NOME\s+([A-Z0-9]{5,10})/i;

const NUMBER_PATTERN = /\d{1,3}(?:\.\d{3})*,\d{2,3}|\d+,\d{2,3}/g;

function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseItalianNumber(value: string): number {
  return Number(value.replace(/\./g, '').replace(',', '.'));
}

function parseMoneyCents(value: string): number {
  return Math.round(parseItalianNumber(value) * 100);
}

function parseLitersMilli(value: string): number {
  return Math.round(parseItalianNumber(value) * 1000);
}

function parsePriceMilliEuro(value: string | undefined): number | null {
  if (!value) return null;
  return Math.round(parseItalianNumber(value) * 1000);
}

function parseInvoiceDate(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}|\d{2})$/.exec(value.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const yearValue = Number(match[3]);
  const year = match[3].length === 2 ? 2000 + yearValue : yearValue;
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

function getDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildSourceKey(row: Omit<ParsedFuelRow, 'sourceKey'>): string {
  return createHash('sha256')
    .update(
      [
        row.cardNumber,
        row.ticketNumber,
        getDateKey(row.fuelDate),
        row.fuelTime,
        row.productCode,
        row.plate,
        row.odometerKm ?? '',
        row.volumeLitersMilli,
        row.totalAmountCents
      ].join('|')
    )
    .digest('hex');
}

function parseInvoiceMetadata(text: string) {
  const invoiceMatch = text.match(/FATTURA\s+n\.\s*([A-Z0-9-]+)\s+del\s+(\d{2}\/\d{2}\/(?:\d{4}|\d{2}))/i);
  const periodMatch = text.match(/forniture\s+effettuate\s+fino\s+al\s+(\d{2}\/\d{2}\/(?:\d{4}|\d{2}))/i);
  const supplierName = /FuelCo\s+Italia\s+S\.p\.A\./i.test(text) ? 'FuelCo Italia S.p.A.' : null;

  return {
    supplierName,
    invoiceNumber: invoiceMatch?.[1] || null,
    invoiceDate: invoiceMatch?.[2] ? parseInvoiceDate(invoiceMatch[2]) : null,
    periodEndDate: periodMatch?.[1] ? parseInvoiceDate(periodMatch[1]) : null
  };
}

function parseTransactionLine(line: string, rowIndex: number): PendingFuelRow | null {
  const match = TRANSACTION_LINE_PATTERN.exec(line);
  if (!match) return null;

  const [
    ,
    cardNumber,
    ticketNumber,
    dateValue,
    timeValue,
    productCode,
    vehicleCode,
    odometerValue,
    stationCode,
    stationName,
    serviceType,
    numericTail
  ] = match;
  const fuelDate = parseInvoiceDate(dateValue);
  if (!fuelDate) return null;

  const numbers = numericTail.match(NUMBER_PATTERN) || [];
  if (numbers.length < 5) return null;

  // Colonne numeriche FuelCo (sinistra -> destra):
  // Importo(netto) | Volume | Prezzo base netto €/l | [Sconto/Premio €/l] | Prezzo finale ivato €/l | Importo Totale ivato
  // Lo sconto e' presente solo in alcune righe: 6 numeri con sconto, 5 senza.
  const amountCents = parseMoneyCents(numbers[0]!);
  const volumeLitersMilli = parseLitersMilli(numbers[1]!);
  const basePricePerLiterMilliEuro = parsePriceMilliEuro(numbers[2]);
  const hasDiscount = numbers.length >= 6;
  const discountPerLiterMilliEuro = hasDiscount ? parsePriceMilliEuro(numbers[3]) : null;
  const finalPricePerLiterMilliEuro = parsePriceMilliEuro(hasDiscount ? numbers[4] : numbers[3]);
  const totalAmountCents = parseMoneyCents((hasDiscount ? numbers[5] : numbers[4])!);

  return {
    rawText: line.trim(),
    rowIndex,
    cardNumber,
    ticketNumber,
    fuelDate,
    fuelTime: `${timeValue.slice(0, 2)}:${timeValue.slice(2)}`,
    productCode,
    productName: getFuelProductName(productCode),
    vehicleCode,
    odometerKm: Number(odometerValue) > 0 ? Number(odometerValue) : null,
    stationCode,
    stationName: stationName.replace(/\s+/g, ' ').trim(),
    serviceType,
    amountCents,
    totalAmountCents,
    volumeLitersMilli,
    finalPricePerLiterMilliEuro,
    basePricePerLiterMilliEuro,
    discountPerLiterMilliEuro
  };
}

export function parseFuelCoInvoiceText(text: string): ParsedFuelInvoice {
  const metadata = parseInvoiceMetadata(text);
  const rows: ParsedFuelRow[] = [];
  const pendingRowsByCard = new Map<string, PendingFuelRow[]>();
  let skippedLines = 0;

  text.split(/\r?\n/).forEach((line, index) => {
    const pendingRow = parseTransactionLine(line, index + 1);

    if (pendingRow) {
      const rowsForCard = pendingRowsByCard.get(pendingRow.cardNumber) || [];
      rowsForCard.push(pendingRow);
      pendingRowsByCard.set(pendingRow.cardNumber, rowsForCard);
      return;
    }

    const totalMatch = TOTAL_LINE_PATTERN.exec(line);
    if (!totalMatch) return;

    const [, cardNumber, rawPlate] = totalMatch;
    const plate = normalizePlate(rawPlate);
    const rowsForCard = pendingRowsByCard.get(cardNumber) || [];

    for (const row of rowsForCard) {
      const parsedRow = {
        ...row,
        plate
      };
      rows.push({
        ...parsedRow,
        sourceKey: buildSourceKey(parsedRow)
      });
    }

    pendingRowsByCard.delete(cardNumber);
  });

  for (const pendingRows of pendingRowsByCard.values()) {
    skippedLines += pendingRows.length;
  }

  return {
    ...metadata,
    rows,
    skippedLines
  };
}

export function isFuelProductCode(productCode: string): boolean {
  return isPerKmConsumableCode(productCode);
}
