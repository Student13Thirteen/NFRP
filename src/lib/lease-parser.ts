import { computeLineVat, imponibileCentsFromTotal } from '@/lib/expense-shared';

export type ParsedLeaseContract = {
  kind: 'CONTRACT';
  lessorName: string | null;
  vehicleSupplierName: string | null;
  contractNumber: string | null;
  contractDate: Date | null;
  startDate: Date | null;
  durationMonths: number | null;
  installmentCount: number | null;
  recurringInstallmentCount: number | null;
  frequencyMonths: number;
  advancePaymentNetCents: number | null;
  recurringPaymentNetCents: number | null;
  totalInstallmentsNetCents: number | null;
  purchasePriceNetCents: number | null;
  buyoutNetCents: number | null;
  vatRatePercent: number;
  tanBasisPoints: number | null;
  leaseRateBasisPoints: number | null;
  plate: string | null;
  reviewReasons: string[];
};

export type ParsedLeaseInvoice = {
  kind: 'INVOICE';
  lessorName: string | null;
  documentNumber: string | null;
  documentDate: Date | null;
  contractNumber: string | null;
  plate: string | null;
  description: string;
  netAmountCents: number;
  vatRatePercent: number;
  vatCents: number;
  grossAmountCents: number;
  reviewReasons: string[];
};

export type ParsedLeaseDocument = ParsedLeaseContract | ParsedLeaseInvoice;

const ITALIAN_MONEY_SOURCE = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}`;
const DATE_SOURCE = String.raw`(\d{1,2})[./-](\d{1,2})[./-](\d{4})`;

function compact(value: string | null | undefined): string | null {
  const result = (value || '').replace(/[ \t]+/g, ' ').replace(/[;,:.\s]+$/g, '').trim();
  return result || null;
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[ \t]+/g, ' ');
}

export function parseItalianMoneyToCents(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function parseDateMatch(match: RegExpMatchArray | RegExpExecArray | null): Date | null {
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year) ||
    date.getUTCDate() !== day ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCFullYear() !== year
  ) {
    return null;
  }
  return date;
}

function parseDateNear(text: string, label: RegExp): Date | null {
  const index = text.search(label);
  if (index < 0) return null;
  const nearby = text.slice(index, index + 180);
  return parseDateMatch(new RegExp(DATE_SOURCE).exec(nearby));
}

function captureLine(text: string, expression: RegExp): string | null {
  const match = expression.exec(text);
  return compact(match?.[1]);
}

function findLabeledMoney(text: string, labels: RegExp[]): number | null {
  for (const label of labels) {
    const index = text.search(label);
    if (index < 0) continue;
    const nearby = text.slice(index, index + 220);
    const values = nearby.match(new RegExp(ITALIAN_MONEY_SOURCE, 'g'));
    if (!values?.length) continue;
    const cents = parseItalianMoneyToCents(values[0]);
    if (cents !== null) return cents;
  }
  return null;
}

function detectLessor(text: string): string | null {
  return (
    captureLine(text, /(?:^|\n)\s*(?:I\.\s*)?LOCATORE\s*:\s*([^\n]+)/im) ||
    captureLine(text, /(?:^|\n)\s*(?:CEDENTE\s*\/?\s*PRESTATORE|FORNITORE\s+LEASING)\s*:?\s*([^\n]+)/im)
  );
}

function detectVehicleSupplier(text: string): string | null {
  return captureLine(text, /(?:^|\n)\s*(?:1[.)]\s*)?Fornitore\s*:?\s*([^\n]+)/im);
}

function detectContractNumber(text: string): string | null {
  const patterns = [
    /CONTRATTO\s+DI\s+LOCAZIONE[\s\S]{0,80}?\bN[°.]?\s*([A-Z0-9][A-Z0-9/_-]{2,})/i,
    /\b(?:CONTRATTO|LEASING)\s*(?:N(?:UMERO)?[°.]?|NR\.?)\s*[:.]?\s*([A-Z0-9][A-Z0-9/_-]{2,})/i
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return compact(match[1]);
  }
  return null;
}

function detectContractDate(text: string): Date | null {
  const header = /CONTRATTO\s+DI\s+LOCAZIONE[\s\S]{0,100}?\bN[°.]?\s*[A-Z0-9/_-]+\s+DEL\s+/i.exec(text);
  if (header?.index !== undefined) {
    const nearby = text.slice(header.index, header.index + 180);
    const date = parseDateMatch(new RegExp(DATE_SOURCE).exec(nearby));
    if (date) return date;
  }
  return parseDateNear(text, /data\s+(?:del\s+)?contratto/i);
}

function detectPlate(text: string): string | null {
  const match = /\b(?:targa|veicolo\s+targato|numero\s+di\s+immatricolazione)\s*[:.]?\s*([A-Z]{2}\s*\d{3}\s*[A-Z]{2})\b/i.exec(text);
  return match ? match[1].toUpperCase().replace(/\s+/g, '') : null;
}

function percentToBasisPoints(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function detectVatRate(text: string): number {
  const match = /\bIVA\s*(?:AL)?\s*(\d{1,2})(?:,\d+)?\s*%/i.exec(text);
  const rate = match ? Number(match[1]) : 22;
  return Number.isInteger(rate) && rate >= 0 && rate <= 100 ? rate : 22;
}

function detectFrequencyMonths(text: string): number {
  if (/\btrimestral[ei]\b/i.test(text)) return 3;
  if (/\bbimestral[ei]\b/i.test(text)) return 2;
  if (/\bsemestral[ei]\b/i.test(text)) return 6;
  if (/\bannual[ei]\b/i.test(text)) return 12;
  return 1;
}

function parseLeaseContract(text: string): ParsedLeaseContract {
  const normalized = normalize(text);
  const lessorName = detectLessor(text);
  const vehicleSupplierName = detectVehicleSupplier(text);
  const contractNumber = detectContractNumber(text);
  const contractDate = detectContractDate(text);
  const startDate = parseDateNear(text, /\bdecorrenza\b(?![\s\S]{0,100}data\s+di\s+sottoscrizione)/i);
  const durationMatch = /\b(?:durata|durata\s+contrattuale)[\s\S]{0,80}?(?:n[.°]?\s*)?(\d{1,3})\s*mesi\b/i.exec(text);
  const durationMonths = durationMatch ? Number(durationMatch[1]) : null;
  const vatRatePercent = detectVatRate(text);
  const frequencyMonths = detectFrequencyMonths(text);

  const groups: Array<{ count: number; amountCents: number }> = [];
  const groupPattern = new RegExp(
    String.raw`(\d{1,3})\s+canon(?:e|i)\s*(?:mensil[ei]|bimestral[ei]|trimestral[ei]|semestral[ei]|annual[ei])?\s*(?:da|di|pari\s+a)?\s*(?:EURO|€)\s*(${ITALIAN_MONEY_SOURCE})`,
    'gi'
  );
  for (const match of text.matchAll(groupPattern)) {
    const count = Number(match[1]);
    const amountCents = parseItalianMoneyToCents(match[2]);
    if (Number.isInteger(count) && count > 0 && amountCents && amountCents > 0) {
      groups.push({ count, amountCents });
    }
  }

  const maxicanone = findLabeledMoney(text, [/\bmaxi[\s-]*canone\b/i, /\bcanone\s+anticipato\b/i]);
  let advancePaymentNetCents: number | null = maxicanone;
  let recurringPaymentNetCents: number | null = null;
  let recurringInstallmentCount: number | null = null;
  let installmentCount: number | null = null;

  if (groups.length > 0) {
    installmentCount = groups.reduce((sum, group) => sum + group.count, 0);
    const firstIsAdvance = groups.length > 1 && groups[0].count === 1 && groups[0].amountCents !== groups[groups.length - 1].amountCents;
    if (advancePaymentNetCents === null && firstIsAdvance) advancePaymentNetCents = groups[0].amountCents;
    const recurringGroups = firstIsAdvance ? groups.slice(1) : groups;
    recurringInstallmentCount = recurringGroups.reduce((sum, group) => sum + group.count, 0);
    recurringPaymentNetCents = recurringGroups[recurringGroups.length - 1]?.amountCents ?? null;
  } else {
    const countMatch = /\b(?:n[.°]?\s*)?(\d{1,3})\s+canoni\b/i.exec(text);
    const recurringAmount = findLabeledMoney(text, [/\bcanone\s+(?:periodico|mensile)\b/i]);
    installmentCount = countMatch ? Number(countMatch[1]) : durationMonths;
    recurringInstallmentCount = installmentCount;
    recurringPaymentNetCents = recurringAmount;
  }

  const totalInstallmentsNetCents = findLabeledMoney(text, [/\bcorrispettivo\s+totale\b/i, /\btotale\s+canoni\b/i]);
  const purchasePriceNetCents = findLabeledMoney(text, [/\bprezzo\s+di\s+acquisto\b/i, /\bvalore\s+del\s+bene\b/i]);
  const buyoutNetCents = findLabeledMoney(text, [
    /\bprezzo\s+dell['’]opzione\s+finale\s+di\s+acquisto\b/i,
    /\b(?:opzione\s+di\s+)?riscatto\b/i,
    /\bvalore\s+residuo\b/i
  ]);
  const tanBasisPoints = percentToBasisPoints(
    /\bT\s*\.?\s*A\s*\.?\s*N\s*\.?\s*\)?\s*[:.]?\s*(\d{1,2}(?:[.,]\d{1,3})?)/i.exec(text)?.[1]
  );
  const leaseRateBasisPoints = percentToBasisPoints(/\btasso\s+leasing\s*\*?\s*[:.]?\s*(\d{1,2}(?:[.,]\d{1,3})?)/i.exec(text)?.[1]);

  const reviewReasons = [
    'Dati estratti automaticamente dal contratto: controlla condizioni economiche, IVA e piano prima di attivarlo.',
    !startDate ? 'La decorrenza dei canoni non è certa nel PDF: inserisci la data effettiva di consegna/inizio.' : '',
    !detectPlate(text) ? 'La targa non è presente o non è leggibile: assegnala manualmente.' : '',
    !lessorName ? 'Locatore non riconosciuto automaticamente.' : '',
    !contractNumber ? 'Numero contratto non riconosciuto automaticamente.' : '',
    !recurringPaymentNetCents || !recurringInstallmentCount ? 'Piano canoni incompleto: verifica numero e importo delle rate.' : ''
  ].filter(Boolean);

  if (!normalized.includes('locazione finanziaria') && !normalized.includes('leasing')) {
    reviewReasons.push('Il documento non contiene indicatori forti di leasing: verifica che sia il file corretto.');
  }

  return {
    kind: 'CONTRACT',
    lessorName,
    vehicleSupplierName,
    contractNumber,
    contractDate,
    startDate,
    durationMonths,
    installmentCount,
    recurringInstallmentCount,
    frequencyMonths,
    advancePaymentNetCents,
    recurringPaymentNetCents,
    totalInstallmentsNetCents,
    purchasePriceNetCents,
    buyoutNetCents,
    vatRatePercent,
    tanBasisPoints,
    leaseRateBasisPoints,
    plate: detectPlate(text),
    reviewReasons
  };
}

function parseInvoiceNumber(text: string): string | null {
  const patterns = [
    /\bFATTURA\s*(?:ELETTRONICA\s*)?(?:N(?:UMERO)?[°.]?|NR\.?)\s*[:.]?\s*([A-Z0-9][A-Z0-9/_-]{2,})/i,
    /\bNUMERO\s+DOCUMENTO\s*[:.]?\s*([A-Z0-9][A-Z0-9/_-]{2,})/i
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return compact(match[1]);
  }
  return null;
}

function parseLeaseInvoice(text: string): ParsedLeaseInvoice {
  const vatRatePercent = detectVatRate(text);
  const documentNumber = parseInvoiceNumber(text);
  const documentDate =
    parseDateNear(text, /\bdata\s+(?:documento|fattura)\b/i) ||
    parseDateNear(text, /\bfattura\b/i);
  const contractNumber = detectContractNumber(text);
  const netDetected = findLabeledMoney(text, [/\btotale\s+imponibile\b/i, /\bimponibile\b/i, /\bnetto\b/i]);
  const vatDetected = findLabeledMoney(text, [/\btotale\s+iva\b/i, /\biva\b/i]);
  const grossDetected = findLabeledMoney(text, [
    /\btotale\s+(?:documento|fattura|da\s+pagare)\b/i,
    /\bimporto\s+totale\b/i
  ]);

  let netAmountCents = netDetected ?? 0;
  let vatCents = vatDetected ?? 0;
  let grossAmountCents = grossDetected ?? 0;
  if (netAmountCents > 0 && grossAmountCents <= 0) {
    const computed = computeLineVat(netAmountCents, vatRatePercent);
    vatCents = vatCents || computed.vatCents;
    grossAmountCents = netAmountCents + vatCents;
  } else if (grossAmountCents > 0 && netAmountCents <= 0) {
    netAmountCents = imponibileCentsFromTotal(grossAmountCents, vatRatePercent);
    vatCents = grossAmountCents - netAmountCents;
  } else if (netAmountCents > 0 && grossAmountCents > 0 && vatCents <= 0) {
    vatCents = Math.max(0, grossAmountCents - netAmountCents);
  }

  const period = captureLine(text, /\b(?:periodo|competenza)\s*[:.]?\s*([^\n]+)/i);
  const reference = contractNumber ? `contratto ${contractNumber}` : null;
  const description = ['Canone leasing', period, reference].filter(Boolean).join(' · ');
  const plate = detectPlate(text);
  const lessorName = detectLessor(text);
  const reviewReasons = [
    'Fattura leasing letta automaticamente: controlla fornitore, importi, IVA e targa prima di registrarla.',
    !plate ? 'Targa non riconosciuta: assegnala manualmente.' : '',
    !documentNumber ? 'Numero fattura non riconosciuto.' : '',
    !documentDate ? 'Data fattura non riconosciuta.' : '',
    netAmountCents <= 0 || grossAmountCents <= 0 ? 'Totali non riconosciuti: compila imponibile e IVA dalla fattura.' : '',
    netDetected === null && grossDetected !== null ? `Imponibile stimato scorporando IVA ${vatRatePercent}% dal totale: verifica l'aliquota.` : ''
  ].filter(Boolean);

  return {
    kind: 'INVOICE',
    lessorName,
    documentNumber,
    documentDate,
    contractNumber,
    plate,
    description,
    netAmountCents,
    vatRatePercent,
    vatCents,
    grossAmountCents,
    reviewReasons
  };
}

export function parseLeaseDocument(text: string): ParsedLeaseDocument {
  const normalized = normalize(text);
  const strongContract =
    normalized.includes('contratto di locazione finanziaria') ||
    normalized.includes('documento di sintesi') ||
    (normalized.includes('durata') && normalized.includes('canoni') && normalized.includes('riscatto'));
  const invoice =
    /\bfattura\b/i.test(normalized) &&
    (normalized.includes('canone') || normalized.includes('leasing') || normalized.includes('locazione finanziaria'));

  return invoice && !strongContract ? parseLeaseInvoice(text) : parseLeaseContract(text);
}
