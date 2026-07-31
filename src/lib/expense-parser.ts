// Parser best-effort del testo OCR di una fattura/DDT di spesa.
// NON è la fonte di verità: produce una bozza che l'operatore corregge e valida
// nella pagina di revisione. Logica pura (niente prisma / server-only), testabile.

import { computeLineVat, imponibileCentsFromTotal, type AllocationKind } from '@/lib/expense-shared';
import { parseRegisteredExpenseLayout } from '@/lib/expense-layout-profiles';
import { parseWinSoftwareDocument } from '@/lib/winsoftware-parser';

export type ParsedImportLine = {
  code: string | null;
  description: string;
  quantityMilli: number;
  unitPriceCents: number;
  imponibileCents: number;
  vatRatePercent: number;
  vatCents: number;
  totalCents: number;
  allocationType: AllocationKind;
};

export type ParsedSupplierDetails = {
  phone: string | null;
  email: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
};

export type ParsedExpenseImport = {
  supplierName: string | null;
  supplierDetails: ParsedSupplierDetails | null;
  documentNumber: string | null;
  documentDate: Date | null;
  declaredTotalCents: number | null;
  suggestedCategoryName: string | null;
  requiresVehicleAllocation: boolean;
  lines: ParsedImportLine[];
};

function importLineIdentity(line: ParsedImportLine): string {
  if (line.code) {
    return [
      'code',
      normalize(line.code).replace(/[^a-z0-9]+/g, ''),
      line.quantityMilli,
      line.unitPriceCents,
      line.imponibileCents,
      line.vatRatePercent
    ].join(':');
  }
  return [
    'description',
    normalize(line.description).replace(/[^a-z0-9]+/g, ' ').trim(),
    line.quantityMilli,
    line.imponibileCents
  ].join(':');
}

function importDescriptionQuality(description: string): number {
  const trailingOcrNoise = /\s+[a-z]{1,2}$/.test(description) ? 1 : 0;
  const unusualCharacters = (description.match(/[^A-Za-zÀ-ÿ0-9.,/+()' -]/g) || []).length;
  return description.length - trailingOcrNoise * 1_000 - unusualCharacters * 100;
}

function shouldPreferImportedDescription(current: string, candidate: string): boolean {
  const currentCompact = normalize(current).replace(/[^a-z0-9]+/g, '');
  const candidateCompact = normalize(candidate).replace(/[^a-z0-9]+/g, '');
  if (
    candidateCompact.length >= 5 &&
    candidateCompact.length < currentCompact.length &&
    currentCompact.includes(candidateCompact)
  ) {
    return true;
  }
  return importDescriptionQuality(candidate) > importDescriptionQuality(current);
}

function compactImportCode(value: string | null): string {
  return normalize(value || '').replace(/[^a-z0-9]+/g, '');
}

function descriptionsOverlap(left: string, right: string): boolean {
  const leftWords = new Set(
    normalize(left)
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 4)
  );
  return normalize(right)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .some((word) => word.length >= 4 && leftWords.has(word));
}

function oneDescriptionContainsTheOther(left: string, right: string): boolean {
  const first = normalize(left).replace(/[^a-z0-9]+/g, '');
  const second = normalize(right).replace(/[^a-z0-9]+/g, '');
  return first.length >= 5 && second.length >= 5 && (first.includes(second) || second.includes(first));
}

function codesAreOcrVariants(left: string | null, right: string | null): boolean {
  const first = compactImportCode(left);
  const second = compactImportCode(right);
  if (!first || !second || first.length !== second.length) return false;
  if (first === second) return true;
  let differences = 0;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) differences += 1;
  }
  return differences === 1;
}

function shouldMergeOcrVariant(existing: ParsedImportLine, candidate: ParsedImportLine): boolean {
  const sameCode = compactImportCode(existing.code) === compactImportCode(candidate.code);
  const fuzzyCode =
    codesAreOcrVariants(existing.code, candidate.code) &&
    descriptionsOverlap(existing.description, candidate.description);
  if (existing.imponibileCents <= 0 || candidate.imponibileCents <= 0) {
    return sameCode || fuzzyCode;
  }
  if (!sameCode && !(fuzzyCode && oneDescriptionContainsTheOther(existing.description, candidate.description))) {
    return false;
  }
  return (
    existing.quantityMilli === candidate.quantityMilli &&
    existing.unitPriceCents === candidate.unitPriceCents &&
    existing.imponibileCents === candidate.imponibileCents &&
    existing.vatRatePercent === candidate.vatRatePercent
  );
}

function mergeOcrVariant(existing: ParsedImportLine, candidate: ParsedImportLine): ParsedImportLine {
  if (candidate.imponibileCents > 0 && existing.imponibileCents <= 0) {
    return {
      ...candidate,
      // Il codice del primo OCR a pagina intera è spesso più stabile; il
      // secondo passaggio serve soprattutto a recuperare i numeri stampati.
      code: existing.code || candidate.code
    };
  }
  if (existing.imponibileCents > 0 && candidate.imponibileCents <= 0) return existing;
  return shouldPreferImportedDescription(existing.description, candidate.description)
    ? { ...candidate, code: existing.code || candidate.code }
    : existing;
}

function addParsedImportLine(lines: ParsedImportLine[], parsed: ParsedImportLine): void {
  const key = importLineIdentity(parsed);
  const existingIndex = lines.findIndex((line) => importLineIdentity(line) === key);
  if (existingIndex >= 0) {
    const existing = lines[existingIndex]!;
    if (shouldPreferImportedDescription(existing.description, parsed.description)) {
      lines[existingIndex] = parsed;
    }
    return;
  }
  const ocrVariantIndex = lines.findIndex((line) => shouldMergeOcrVariant(line, parsed));
  if (ocrVariantIndex >= 0) {
    lines[ocrVariantIndex] = mergeOcrVariant(lines[ocrVariantIndex]!, parsed);
    return;
  }
  lines.push(parsed);
}

const MONEY = /\d{1,3}(?:\.\d{3})*,\d{2}/;
const MONEY_GLOBAL = /\d{1,3}(?:\.\d{3})*,\d{2}/g;
const ITEM_LINE = /^(.*?)\s+(\d+)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(.*?)\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+(22|10|5|4|0)\s*$/;
const DEMO_PARTS_ITEM_LINE = new RegExp(
  `^([A-Z0-9][A-Z0-9-]{1,})\\s+([A-Z0-9][A-Z0-9.-]{3,})\\s+(.+?)\\s+(${MONEY.source})\\s+(?:Netto|\\d{1,3},\\d+%)\\s+(${MONEY.source})\\s*[^0-9\\s]*\\s+(22|10|5|4|0)\\s*$`,
  'i'
);

type KnownSupplier = {
  matches: string[];
  name: string;
  details: ParsedSupplierDetails;
};

// Firme deterministiche del dataset sintetico. L'identificativo demo viene usato
// quando la ragione sociale non e leggibile, senza affidarsi a somiglianze vaghe.
const KNOWN_SUPPLIERS: KnownSupplier[] = [
  {
    matches: [
      'ricambi demo delta',
      'demo ricambi delta',
      'demo-ricambi-delta.example.com',
      '00000000005',
      '00000000006',
      '00000000007'
    ],
    name: 'Ricambi Demo Delta',
    details: {
      phone: '+39 000 0000001',
      email: 'ricambi@example.com',
      address: 'Via Esempio 2',
      postalCode: '00000',
      city: 'Citta Demo',
      province: 'ZZ',
      country: 'Italia'
    }
  },
  {
    matches: ['Officina Demo Zeta'],
    name: 'Officina Demo Zeta Manutenzioni',
    details: {
      phone: null,
      email: null,
      address: null,
      postalCode: null,
      city: null,
      province: null,
      country: 'Italia'
    }
  },
  {
    matches: ['Officina Demo Beta', 'Officina Demo Beta s.r.l', '00000000004'],
    name: 'Officina Demo Beta S.R.L.',
    details: {
      phone: '+39 000 0000002',
      email: 'officina@example.com',
      address: 'Via Esempio 3',
      postalCode: null,
      city: 'Citta Demo',
      province: 'ZZ',
      country: 'Italia'
    }
  },
  {
    matches: ['Pneumatici Demo Gamma', 'sc pneumatici srl', '00000000008'],
    name: 'Pneumatici Demo Gamma Srl',
    details: {
      phone: '+39 000 0000003',
      email: 'amministrazione@example.com',
      address: 'Via Esempio 4',
      postalCode: '00000',
      city: 'Citta Demo',
      province: 'ZZ',
      country: 'Italia'
    }
  },
  {
    matches: ['officina demo epsilon', '00000000009'],
    name: 'Officina Demo Epsilon Srl',
    details: {
      phone: null,
      email: null,
      address: 'Via Esempio 5',
      postalCode: '00000',
      city: 'Citta Demo',
      province: 'ZZ',
      country: 'Italia'
    }
  }
];

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function parseItalianMoneyToCents(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function emptySupplierDetails(): ParsedSupplierDetails {
  return {
    phone: null,
    email: null,
    address: null,
    postalCode: null,
    city: null,
    province: null,
    country: null
  };
}

function cleanSupplierName(value: string): string | null {
  const cleaned = value
    .replace(/[|[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[^A-ZÀ-ÖØ-Ý0-9]+/iu, '')
    .trim();
  if (!cleaned || /NET\s*FLEET/iu.test(cleaned) || cleaned.length > 180) return null;
  return cleaned;
}

function detectGenericSupplier(text: string): { name: string; details: ParsedSupplierDetails } | null {
  const header = text.split(/\b(?:Spett\.?\s*le|Destinatario|Cessionario\/committente)\b/iu)[0] || text.slice(0, 1800);
  const lines = header
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const companyLine = lines.find((line) =>
    !/NET\s*FLEET/iu.test(line) &&
    /\b(?:S\.?\s*R\.?\s*L\.?|S\.?\s*P\.?\s*A\.?|S\.?\s*N\.?\s*C\.?|S\.?\s*A\.?\s*S\.?)\b/iu.test(line)
  );
  const name = companyLine ? cleanSupplierName(companyLine) : null;
  if (!name) return null;

  const details = emptySupplierDetails();
  const email = header.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu)?.[0] || null;
  if (email && !/nfrp/iu.test(email)) details.email = email.toLocaleLowerCase('it-IT');
  const phone = /\b(?:Tel\.?|Telefono)\s*[:.]?\s*(\+?\d[\d ./-]{5,20})/iu.exec(header)?.[1] || null;
  if (phone) details.phone = phone.replace(/\s+/g, ' ').trim();
  return { name, details };
}

function detectSupplier(text: string, normalizedText: string): { name: string; details: ParsedSupplierDetails } | null {
  const compactText = normalizedText.replace(/[^a-z0-9]+/g, '');
  for (const supplier of KNOWN_SUPPLIERS) {
    if (
      supplier.matches.some((match) => {
        const normalizedMatch = normalize(match);
        return (
          normalizedText.includes(normalizedMatch) ||
          compactText.includes(normalizedMatch.replace(/[^a-z0-9]+/g, ''))
        );
      })
    ) {
      return { name: supplier.name, details: supplier.details };
    }
  }
  return detectGenericSupplier(text);
}

function detectDocumentNumber(text: string): string | null {
  const demoPartsDdt = /\b(DDT\d+\/\d{4}\/\d+)\b/i.exec(text);
  if (demoPartsDdt) return demoPartsDdt[1].toUpperCase();

  const labeledInvoice = new RegExp(
    String.raw`\bFATTURA\s*[|:]?\s*([A-Z0-9][A-Z0-9/_-]{1,30})\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b`,
    'iu'
  ).exec(text);
  if (labeledInvoice) return labeledInvoice[1].toUpperCase();

  const numberedInvoice = /\bFattura\s*(?:nr\.?|n[°.]?)\s*[|:\s]*([A-Z0-9][A-Z0-9/_-]{1,30})\b/iu.exec(text);
  if (numberedInvoice) return numberedInvoice[1].toUpperCase();

  const datedInvoice =
    /\bFATTURA(?:\s+[A-ZÀ-ÖØ-Ý]+)*\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s+([A-Z0-9][A-Z0-9/_-]{1,30})\b/iu.exec(text);
  if (datedInvoice) return datedInvoice[1].toUpperCase();

  const numberBeforeDate = /\b([A-Z0-9]{2,}(?:\/[A-Z0-9]{1,})+)\s+[_|]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?=\D|$)/iu.exec(text);
  if (numberBeforeDate) return numberBeforeDate[1].toUpperCase();

  const ddt = /\bDDT[\s/]*([A-Za-z0-9/_-]+)/i.exec(text);
  if (ddt) return `DDT ${ddt[1]}`;
  const generic = /\b(?:numero\s+documento|documento\s+n[°.]?|fatt\.?\s+n[°.]?)\s*[:|]?\s*([A-Za-z0-9/_-]{3,})/i.exec(text);
  if (generic) return generic[1];
  return null;
}

function buildDate(day: number, month: number, yearValue: number): Date | null {
  const year = yearValue < 100 ? 2000 + yearValue : yearValue;
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

function detectDate(text: string): Date | null {
  const documentHeader = /\bDDT\d+\/\d{4}\/\d+\s+[|_]?\s*(?:del\s+)?(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/i.exec(text);
  const invoiceHeader =
    /\bFattura\s*(?:nr\.?|n[°.]?)[\s\S]{0,80}?\bdel\s*[|:\s]*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/iu.exec(text) ||
    /\bFATTURA(?:\s+[A-ZÀ-ÖØ-Ý]+)*\s+(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/iu.exec(text);
  const match =
    documentHeader ||
    invoiceHeader ||
    /\b[A-Z0-9]{2,}(?:\/[A-Z0-9]{1,})+\s+[_|]?\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?=\D|$)/iu.exec(text) ||
    /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/.exec(text);
  if (!match) return null;
  return buildDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function detectDeclaredTotal(lines: string[]): number | null {
  // Cerca una riga "TOTALE/Tot. documento ... <importo>" prendendo l'ultimo importo.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!/\btot(?:ale\b|\.)/i.test(lines[i])) continue;
    const moneys = lines[i].match(MONEY_GLOBAL);
    if (moneys && moneys.length > 0) return parseItalianMoneyToCents(moneys[moneys.length - 1]);
  }

  const joined = lines.join('\n');
  const followingTotal = /\bTOTALE\s+(?:DOCUMENTO|FATTURA)[^\n]*\n(?:[^\n]*\n){0,2}?[^\n]*?(\d{1,3}(?:\.\d{3})*,\d{2})/iu.exec(joined);
  if (followingTotal) return parseItalianMoneyToCents(followingTotal[1]);
  return null;
}

function stripCode(head: string): { code: string | null; description: string } {
  const tokens = head.trim().split(/\s+/);
  if (tokens.length >= 2 && /[0-9]/.test(tokens[0]) === false && /[A-Z]/.test(tokens[0]) && tokens[0].length <= 8) {
    // primo token "tipo codice articolo" (es. SPK-FAN) -> lo tengo come codice
    return { code: tokens[0], description: tokens.slice(1).join(' ').trim() };
  }
  return { code: null, description: head.trim() };
}

function parseItemLine(line: string): ParsedImportLine | null {
  const match = ITEM_LINE.exec(line.trim());
  if (!match) return null;

  const head = match[1].trim();
  const quantity = Number(match[2]);
  const totalToken = match[5];
  const vatRatePercent = Number(match[6]);
  if (!head || !Number.isFinite(quantity) || quantity <= 0) return null;

  const imponibileCents = parseItalianMoneyToCents(totalToken);
  if (imponibileCents <= 0) return null;

  const quantityMilli = quantity * 1000;
  const unitPriceCents = Math.round((imponibileCents * 1000) / quantityMilli);
  const { vatCents, totalCents } = computeLineVat(imponibileCents, vatRatePercent);
  const { code, description } = stripCode(head);

  return {
    code,
    description: description || head,
    quantityMilli,
    unitPriceCents,
    imponibileCents,
    vatRatePercent,
    vatCents,
    totalCents,
    allocationType: 'GENERIC'
  };
}

function cleanDemoPartsDescription(value: string): string {
  const tokens = value.trim().split(/\s+/);
  while (tokens.length > 1) {
    const token = tokens[tokens.length - 1].replace(/[^A-Za-z0-9-]/g, '');
    const upper = token.toUpperCase();
    if (upper === 'DX' || upper === 'SX' || upper === 'DX-SX' || upper === 'SX-DX') break;
    if (!token || /^\d{1,2}$/.test(token) || token.length <= 2) {
      tokens.pop();
      continue;
    }
    break;
  }
  return tokens.join(' ').trim();
}

/** Vecchio layout OCR Ricambi Demo Delta: testo già ordinato per riga. */
function parseLegacyDemoPartsItemLine(line: string): ParsedImportLine | null {
  const match = DEMO_PARTS_ITEM_LINE.exec(line.trim());
  if (!match) return null;

  const middleTokens = match[3].trim().split(/\s+/);
  let quantityIndex = -1;
  for (let index = middleTokens.length - 1; index >= 0; index -= 1) {
    if (/^\d{1,3}$/.test(middleTokens[index])) {
      quantityIndex = index;
      break;
    }
  }
  if (quantityIndex <= 0) return null;

  const quantity = Number(middleTokens[quantityIndex]);
  const description = cleanDemoPartsDescription(middleTokens.slice(0, quantityIndex).join(' '));
  const imponibileCents = parseItalianMoneyToCents(match[5]);
  const vatRatePercent = Number(match[6]);
  if (!description || !Number.isInteger(quantity) || quantity <= 0 || imponibileCents <= 0) return null;

  const quantityMilli = quantity * 1000;
  const unitPriceCents = Math.round((imponibileCents * 1000) / quantityMilli);
  const { vatCents, totalCents } = computeLineVat(imponibileCents, vatRatePercent);

  return {
    code: match[2].toUpperCase(),
    description,
    quantityMilli,
    unitPriceCents,
    imponibileCents,
    vatRatePercent,
    vatCents,
    totalCents,
    allocationType: 'GENERIC'
  };
}

function parsedLineFromNet(input: {
  code: string | null;
  description: string;
  quantityMilli: number;
  unitPriceCents: number;
  imponibileCents: number;
  vatRatePercent: number;
}): ParsedImportLine {
  const { vatCents, totalCents } = computeLineVat(input.imponibileCents, input.vatRatePercent);
  return {
    ...input,
    vatCents,
    totalCents,
    allocationType: 'GENERIC'
  };
}

function cleanTableLine(value: string): string {
  return value
    .replace(/[|[\]{}()‘’“”]/g, ' ')
    .replace(/[€]/g, ' € ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanImportedDescription(value: string): string {
  return value
    .replace(/^[^A-ZÀ-ÖØ-Ý0-9]+/iu, '')
    .replace(/\s+[bi]\s*$/iu, '')
    .replace(/\s*[:;,]+\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitDemoPartsCode(value: string): { code: string; body: string } | null {
  const match =
    /(?:^|\s)([A-Z0-9]{2,4}-[A-Z]{2,4})[.\s]*[#§]?\s*[/'‘’“”]*([A-Z0-9][A-Z0-9./-]{2,})\s+(.+)$/iu.exec(value);
  if (!match) return null;

  let code = match[2].toLocaleUpperCase('it-IT');
  let body = match[3].trim();
  const splitNumericCode = /^(\d{5,})\s+(.+)$/u.exec(body);
  if (/^\d+$/u.test(code) && splitNumericCode) {
    code += splitNumericCode[1];
    body = splitNumericCode[2];
  }
  return { code, body };
}

function parseOcrInteger(value: string): number {
  const normalized = value.trim();
  if (/^\d{1,3}$/u.test(normalized)) return Number(normalized);
  return /^[Iil|a]{1,2}$/u.test(normalized) ? 1 : 0;
}

/**
 * OCR tabellare Ricambi Demo Delta (PSM 6): ricostruisce la riga da quantità, listino e
 * sconto/netto. Se il totale è leggibile lo usa per correggere quantità OCR
 * come "21" che in realtà derivano da "2 |".
 */
function parseFlexibleDemoPartsItemLine(line: string): ParsedImportLine | null {
  if (/Ns\.?\s*rif|Pr\.?\s*Listino|Codice\s+Art|Causale\s+trasporto/iu.test(line)) return null;
  const split = splitDemoPartsCode(cleanTableLine(line));
  if (!split) return null;

  const priced =
    /^(.*?)\s+(\d{1,3}|[Iil|a]{1,2})[^A-Z0-9]+(\d{1,3}(?:\.\d{3})*,\d{2})[^A-Z0-9]*(Net[a-z0-9]{2,6}|\d{1,3},\d+%)(.*)$/iu.exec(
      split.body
    );
  if (priced) {
    const description = cleanImportedDescription(priced[1]);
    let quantity = parseOcrInteger(priced[2]);
    const listedUnitCents = parseItalianMoneyToCents(priced[3]);
    const condition = priced[4];
    const discount = normalize(condition).startsWith('net')
      ? 0
      : Number(condition.replace('%', '').replace(',', '.'));
    const effectiveUnitCents = Math.max(0, Math.round(listedUnitCents * (1 - discount / 100)));
    const parsedTotalToken = MONEY.exec(priced[5])?.[0] || null;
    const parsedTotalCents = parsedTotalToken ? parseItalianMoneyToCents(parsedTotalToken) : 0;

    if (parsedTotalCents > 0 && effectiveUnitCents > 0) {
      const inferredQuantity = Math.round(parsedTotalCents / effectiveUnitCents);
      if (
        inferredQuantity > 0 &&
        inferredQuantity <= 999 &&
        Math.abs(parsedTotalCents - inferredQuantity * effectiveUnitCents) <= 2
      ) {
        quantity = inferredQuantity;
      }
    }

    if (description && quantity > 0 && quantity <= 999 && effectiveUnitCents > 0) {
      return parsedLineFromNet({
        code: split.code,
        description,
        quantityMilli: quantity * 1000,
        unitPriceCents: effectiveUnitCents,
        imponibileCents: quantity * effectiveUnitCents,
        vatRatePercent: 22
      });
    }
  }

  // DDT senza prezzi: conserva almeno codice/descrizione e lascia l'importo a
  // zero da verificare. La quantità resta prudentemente 1 se l'OCR è ambiguo.
  const withoutVat = split.body
    .replace(/\s+\d{1,3}\s+[^A-Z0-9]{0,4}(?:22|29)\W*$/iu, '')
    .replace(/\s+(?:22|29)\W*$/iu, '')
    .replace(/\s+[bi]\s+\d{1,3}\W*$/iu, '')
    .replace(/\s+\d{1,3}\s+[bi]\W*$/iu, '')
    .replace(/\s+\d{1,3}\s*;\s*$/iu, '')
    .trim();
  const description = cleanImportedDescription(withoutVat);
  if (!description || description.length < 3) return null;
  return parsedLineFromNet({
    code: split.code,
    description,
    quantityMilli: 1000,
    unitPriceCents: 0,
    imponibileCents: 0,
    vatRatePercent: 22
  });
}

/** Layout Ricambi Demo Delta: prova prima il formato storico, poi l'OCR tabellare. */
function parseDemoPartsItemLine(line: string): ParsedImportLine | null {
  return parseLegacyDemoPartsItemLine(line) || parseFlexibleDemoPartsItemLine(line);
}

function parseQuantityMilli(value: string): number {
  const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) : 0;
}

/** Fatture officina/pneumatici con UM, quantità, prezzo, imponibile e IVA sulla stessa riga. */
function parseServiceItemLine(line: string): ParsedImportLine | null {
  const cleaned = cleanTableLine(line);
  const tail =
    /\s+(?:NR|PZ|P)\s+(\d{1,3}(?:,\d{1,3})?)\s+€?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+[^0-9]{0,4}(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:22|2200)\b/iu.exec(cleaned) ||
    /\s+(\d{1,3}(?:,\d{1,3})?)\s*(?:NR|PZ|P)\s+€?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+[^0-9]{0,4}(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:22|2200)\b/iu.exec(cleaned);
  if (!tail || tail.index === undefined) return null;

  const head = cleanImportedDescription(cleaned.slice(0, tail.index));
  if (!head) return null;
  const headTokens = head.split(/\s+/);
  const firstToken = headTokens[0] || '';
  const hasCode = headTokens.length > 1 && firstToken.length <= 8 && /^[A-Z0-9+./-]+$/iu.test(firstToken);
  const code = hasCode ? firstToken.toLocaleUpperCase('it-IT') : null;
  const description = cleanImportedDescription(hasCode ? headTokens.slice(1).join(' ') : head);
  const quantityMilli = parseQuantityMilli(tail[1]);
  const unitPriceCents = parseItalianMoneyToCents(tail[2]);
  const parsedImponibileCents = parseItalianMoneyToCents(tail[3]);
  if (!description || quantityMilli <= 0 || unitPriceCents <= 0 || parsedImponibileCents <= 0) return null;

  const computedImponibileCents = Math.round((quantityMilli * unitPriceCents) / 1000);
  const imponibileCents = Math.abs(computedImponibileCents - parsedImponibileCents) <= 2
    ? computedImponibileCents
    : parsedImponibileCents;
  return parsedLineFromNet({
    code,
    description,
    quantityMilli,
    unitPriceCents,
    imponibileCents,
    vatRatePercent: 22
  });
}

function detectSuggestedCategory(normalizedText: string, isDemoPartsSupplier: boolean): string | null {
  if (isDemoPartsSupplier) return 'Ricambi';
  if (/pneumatic|tubeless|gomma|gomme/.test(normalizedText)) return 'Pneumatici';
  if (/riparazione|officina|soccorso|sostituzione|lavoro eseguito/.test(normalizedText)) return 'Riparazioni';
  return null;
}

function parseWinSoftwareMaintenance(text: string): ParsedExpenseImport | null {
  const document = parseWinSoftwareDocument(text);
  if (!document.isWinSoftware || document.kind !== 'MAINTENANCE') return null;

  const lines = document.items.map((item) => {
    const quantityMilli = item.quantityMilli || 1000;
    const imponibileCents = item.imponibileCents || 0;
    const unitPriceCents = item.unitPriceCents || Math.round((imponibileCents * 1000) / quantityMilli);
    const { vatCents, totalCents } = computeLineVat(imponibileCents, item.vatRatePercent);
    return {
      code: null,
      description: item.description,
      quantityMilli,
      unitPriceCents,
      imponibileCents,
      vatRatePercent: item.vatRatePercent,
      vatCents,
      totalCents,
      allocationType: 'GENERIC' as const
    };
  });

  if (lines.length === 0) {
    const imponibileCents = document.declaredTotalCents !== null
      ? imponibileCentsFromTotal(document.declaredTotalCents, 22)
      : 0;
    const { vatCents, totalCents } = computeLineVat(imponibileCents, 22);
    lines.push({
      code: null,
      description: 'Voce manutenzione da compilare',
      quantityMilli: 1000,
      unitPriceCents: imponibileCents,
      imponibileCents,
      vatRatePercent: 22,
      vatCents,
      totalCents,
      allocationType: 'GENERIC'
    });
  }

  return {
    supplierName: document.supplierName,
    supplierDetails: null,
    documentNumber: document.invoiceNumber,
    documentDate: document.invoiceDate,
    declaredTotalCents: document.declaredTotalCents,
    suggestedCategoryName: 'Manutenzioni',
    requiresVehicleAllocation: true,
    lines
  };
}

export function parseExpenseDocument(text: string): ParsedExpenseImport {
  const winSoftwareMaintenance = parseWinSoftwareMaintenance(text);
  if (winSoftwareMaintenance) return winSoftwareMaintenance;

  const registeredLayout = parseRegisteredExpenseLayout(text);

  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
  const normalizedText = normalize(text);
  const detectedSupplier = detectSupplier(text, normalizedText);
  const supplier = registeredLayout?.supplierName
    ? { name: registeredLayout.supplierName, details: registeredLayout.supplierDetails }
    : detectedSupplier;
  const isDemoPartsSupplier = supplier?.name === 'Ricambi Demo Delta';

  const lines: ParsedImportLine[] = [];
  for (const parsed of registeredLayout?.lines || []) addParsedImportLine(lines, parsed);
  for (const rawLine of rawLines) {
    const parsed =
      (isDemoPartsSupplier ? parseDemoPartsItemLine(rawLine) : null) ||
      parseServiceItemLine(rawLine) ||
      parseItemLine(rawLine);
    if (!parsed) continue;
    addParsedImportLine(lines, parsed);
  }

  const declaredTotalCents = detectDeclaredTotal(rawLines);
  const suggestedCategoryName =
    registeredLayout?.suggestedCategoryName || detectSuggestedCategory(normalizedText, isDemoPartsSupplier);

  // Fallback: nessuna riga riconosciuta -> una riga unica da compilare con il totale (scorporato al 22%).
  if (lines.length === 0) {
    const imponibileCents = declaredTotalCents !== null ? imponibileCentsFromTotal(declaredTotalCents, 22) : 0;
    const { vatCents, totalCents } = computeLineVat(imponibileCents, 22);
    lines.push({
      code: null,
      description: 'Voce da compilare (estrazione automatica non riuscita)',
      quantityMilli: 1000,
      unitPriceCents: imponibileCents,
      imponibileCents,
      vatRatePercent: 22,
      vatCents,
      totalCents,
      allocationType: 'GENERIC'
    });
  }

  return {
    supplierName: supplier?.name || null,
    supplierDetails: supplier?.details || null,
    documentNumber: registeredLayout?.documentNumber || detectDocumentNumber(text),
    documentDate: registeredLayout?.documentDate || detectDate(text),
    declaredTotalCents,
    suggestedCategoryName,
    requiresVehicleAllocation:
      registeredLayout?.requiresVehicleAllocation || isDemoPartsSupplier || suggestedCategoryName !== null,
    lines
  };
}

export function isFallbackExpenseParse(parsed: ParsedExpenseImport): boolean {
  return parsed.lines.every((line) => line.description.startsWith('Voce da compilare'));
}

export function needsMaintenancePriceRecovery(parsed: ParsedExpenseImport): boolean {
  return (
    isFallbackExpenseParse(parsed) ||
    parsed.lines.some((line) => line.unitPriceCents <= 0 || line.imponibileCents <= 0)
  );
}

export function isConfidentMaintenanceExpense(parsed: ParsedExpenseImport): boolean {
  return (
    parsed.requiresVehicleAllocation &&
    !isFallbackExpenseParse(parsed) &&
    Boolean(parsed.supplierName || parsed.documentNumber)
  );
}

export function splitOcrTextByPage(text: string): string[] {
  return text
    .split(/\f+/)
    .map((page) => page.trim())
    .filter(Boolean);
}

export function hasMoney(line: string): boolean {
  return MONEY.test(line);
}
