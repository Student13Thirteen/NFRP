import { createHash } from 'node:crypto';

export const TOLL_PROVIDER_NAME = 'Autostrade';

export type ParsedTollCsv = {
  providerName: string;
  invoiceNumber: string | null;
  customerCode: string | null;
  rows: ParsedTollRow[];
  skippedLines: number;
};

export type ParsedTollRow = {
  sourceKey: string;
  rawText: string;
  rowIndex: number;
  rowCounter: number | null;
  movementType: string | null;
  customerCode: string | null;
  supportType: string | null;
  cardNumber: string;
  entryDate: Date | null;
  entryTime: string | null;
  tollDate: Date;
  tollTime: string | null;
  motorwayCode: string | null;
  motorwayName: string | null;
  entryGateCode: string | null;
  entryGateName: string | null;
  exitGateCode: string | null;
  exitGateName: string | null;
  routeName: string;
  netAmountCents: number;
  grossAmountCents: number;
  vatAmountCents: number;
  exemptDiscountCents: number | null;
  taxableGrossDiscountCents: number | null;
  vatRatePercent: number | null;
  currency: string;
  vehicleClass: string | null;
  plateCountry: string | null;
  plate: string;
  secondaryPlateCountry: string | null;
  secondaryPlate: string | null;
  euroClass: string | null;
  secondaryEuroClass: string | null;
  authorizationCode: string | null;
  invoiceNumber: string | null;
  distanceKm: number | null;
  country: string | null;
};

type CsvRecord = {
  rawLine: string;
  rowIndex: number;
  values: string[];
  headerIndexes: Map<string, number>;
};

const REQUIRED_HEADERS = [
  'Data uscita',
  'Ora Uscita',
  'Descrizione Casello Ingresso',
  'Descrizione Casello Uscita',
  'Importo Esente Iva',
  'Importo Lordo Soggetto Iva',
  'Tessera Supporto Principale',
  'Targa Principale'
];

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
}

function compactPlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function optionalText(value: string | null | undefined): string | null {
  const trimmed = (value || '').trim();
  return trimmed === '' ? null : trimmed;
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === delimiter && !quoted) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function detectDelimiter(headerLine: string): string {
  const semicolonCount = parseCsvLine(headerLine, ';').length;
  const commaCount = parseCsvLine(headerLine, ',').length;
  return semicolonCount >= commaCount ? ';' : ',';
}

function getHeaderIndexes(headers: string[]): Map<string, number> {
  const indexes = new Map<string, number>();
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (!indexes.has(key)) indexes.set(key, index);
  });
  return indexes;
}

function recordValue(record: CsvRecord, header: string): string | null {
  const index = record.headerIndexes.get(normalizeHeader(header));
  if (index === undefined) return null;
  return optionalText(record.values[index]);
}

function parseInteger(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) return null;
  return Number(normalized);
}

function parseDecimal(value: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/\+/g, '').replace(/\s+/g, '').trim();
  if (!cleaned) return null;

  const commaIndex = cleaned.lastIndexOf(',');
  const dotIndex = cleaned.lastIndexOf('.');
  let normalized = cleaned;

  if (commaIndex !== -1 && dotIndex !== -1) {
    normalized =
      commaIndex > dotIndex
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (commaIndex !== -1) {
    normalized = cleaned.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMoneyCents(value: string | null): number | null {
  const parsed = parseDecimal(value);
  return parsed === null ? null : Math.round(parsed * 100);
}

export function isCoherentTollAdjustment(input: {
  grossAmountCents: number;
  netAmountCents: number;
  vatRatePercent: number | null;
}): boolean {
  if (input.grossAmountCents >= 0 || input.netAmountCents >= 0) return false;
  if (input.grossAmountCents === input.netAmountCents) {
    return input.vatRatePercent === null || input.vatRatePercent === 0;
  }
  if (input.vatRatePercent === null || input.vatRatePercent < 0 || input.vatRatePercent > 100) return false;

  const expectedGrossCents = Math.round(
    Math.abs(input.netAmountCents) * (1 + input.vatRatePercent / 100)
  );
  return Math.abs(Math.abs(input.grossAmountCents) - expectedGrossCents) <= 1;
}

function parseDate(value: string | null): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}|\d{2})$/.exec((value || '').trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = match[3].length === 2 ? 2000 + rawYear : rawYear;
  if (day === 0 || month === 0 || year === 0) return null;

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

function parseTime(value: string | null): string | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec((value || '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || '0');
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${match[1]}:${match[2]}:${String(second).padStart(2, '0')}`;
}

function getDateKey(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : '';
}

function buildRouteName(entryGateName: string | null, exitGateName: string | null): string {
  return [entryGateName, exitGateName].filter(Boolean).join(' - ') || 'Tratta non indicata';
}

function buildSourceKey(row: Omit<ParsedTollRow, 'sourceKey'>): string {
  return createHash('sha256')
    .update(
      [
        TOLL_PROVIDER_NAME,
        row.invoiceNumber || '',
        row.rowCounter ?? row.rowIndex,
        row.cardNumber,
        row.plate,
        getDateKey(row.tollDate),
        row.tollTime || '',
        row.entryGateCode || '',
        row.exitGateCode || '',
        row.grossAmountCents
      ].join('|')
    )
    .digest('hex');
}

function parseRecord(record: CsvRecord): ParsedTollRow | null {
  const tollDate = parseDate(recordValue(record, 'Data uscita'));
  if (!tollDate) return null;

  const cardNumber = optionalText(recordValue(record, 'Tessera Supporto Principale')) || optionalText(recordValue(record, 'Tessera Supporto Secondario'));
  if (!cardNumber) return null;

  const plate = compactPlate(recordValue(record, 'Targa Principale') || '');
  if (!plate) return null;

  const netAmountCents = parseMoneyCents(recordValue(record, 'Importo Esente Iva'));
  const grossAmountCents = parseMoneyCents(recordValue(record, 'Importo Lordo Soggetto Iva'));
  if (netAmountCents === null && grossAmountCents === null) return null;

  const entryGateName = optionalText(recordValue(record, 'Descrizione Casello Ingresso'));
  const exitGateName = optionalText(recordValue(record, 'Descrizione Casello Uscita'));
  const net = netAmountCents ?? grossAmountCents ?? 0;
  const gross = grossAmountCents ?? net;
  const vatRate = parseDecimal(recordValue(record, 'Aliquota Iva'));
  const distanceKm = parseDecimal(recordValue(record, 'Distanza'));

  const parsedRow = {
    rawText: record.rawLine,
    rowIndex: record.rowIndex,
    rowCounter: parseInteger(recordValue(record, 'Contatore Riga')),
    movementType: optionalText(recordValue(record, 'Tipo Movimento')),
    customerCode: optionalText(recordValue(record, 'Codice Cliente FAI Service')),
    supportType: optionalText(recordValue(record, 'Tipo Supporto Principale')),
    cardNumber,
    entryDate: parseDate(recordValue(record, 'Data Ingresso')),
    entryTime: parseTime(recordValue(record, 'Ora Ingresso')),
    tollDate,
    tollTime: parseTime(recordValue(record, 'Ora Uscita')),
    motorwayCode: optionalText(recordValue(record, 'Codice Autostrada')),
    motorwayName: optionalText(recordValue(record, 'Descrizione Autostrada')),
    entryGateCode: optionalText(recordValue(record, 'Codice Casello Ingresso')),
    entryGateName,
    exitGateCode: optionalText(recordValue(record, 'Codice Casello Uscita')),
    exitGateName,
    routeName: buildRouteName(entryGateName, exitGateName),
    netAmountCents: net,
    grossAmountCents: gross,
    vatAmountCents: gross - net,
    exemptDiscountCents: parseMoneyCents(recordValue(record, 'Sconto Maggiorazione Esente Iva')),
    taxableGrossDiscountCents: parseMoneyCents(recordValue(record, 'Sconto Maggiorazione Lordo Soggetto Iva')),
    vatRatePercent: vatRate === null ? null : Math.round(vatRate),
    currency: optionalText(recordValue(record, 'Valuta')) || 'EUR',
    vehicleClass: optionalText(recordValue(record, 'Classe Veicolo Principale')),
    plateCountry: optionalText(recordValue(record, 'Codice Nazione Targa Principale')),
    plate,
    secondaryPlateCountry: optionalText(recordValue(record, 'Codice Nazione Targa Secondaria')),
    secondaryPlate: compactPlate(recordValue(record, 'Targa Secondaria') || '') || null,
    euroClass: optionalText(recordValue(record, 'Classificazione Euro Principale')),
    secondaryEuroClass: optionalText(recordValue(record, 'Classificazione Euro Secondaria')),
    authorizationCode: optionalText(recordValue(record, 'Codice Autorizzazione')),
    invoiceNumber: optionalText(recordValue(record, 'Numero Fattura')),
    distanceKm: distanceKm === null ? null : Math.round(distanceKm),
    country: optionalText(recordValue(record, 'Nazione'))
  };

  return {
    ...parsedRow,
    sourceKey: buildSourceKey(parsedRow)
  };
}

export function parseTollCsvText(text: string): ParsedTollCsv {
  const normalizedText = text.replace(/^\uFEFF/, '');
  const lines = normalizedText.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) throw new Error('Il CSV autostrade e vuoto.');

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter);
  const headerIndexes = getHeaderIndexes(headers);
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headerIndexes.has(normalizeHeader(header)));
  if (missingHeaders.length > 0) {
    throw new Error(`CSV autostrade non riconosciuto. Mancano colonne: ${missingHeaders.join(', ')}.`);
  }

  const rows: ParsedTollRow[] = [];
  let skippedLines = 0;

  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index], delimiter);
    const row = parseRecord({ rawLine: lines[index], rowIndex: index + 1, values, headerIndexes });
    if (row) {
      rows.push(row);
    } else {
      skippedLines += 1;
    }
  }

  return {
    providerName: TOLL_PROVIDER_NAME,
    invoiceNumber: rows.find((row) => row.invoiceNumber)?.invoiceNumber || null,
    customerCode: rows.find((row) => row.customerCode)?.customerCode || null,
    rows,
    skippedLines
  };
}
