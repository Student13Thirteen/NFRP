import { computeLineVat } from '@/lib/expense-shared';
import type { ParsedImportLine, ParsedSupplierDetails } from '@/lib/expense-parser';

export type ExpenseLayoutProfileResult = {
  profileId: string;
  profileLabel: string;
  supplierName: string | null;
  supplierDetails: ParsedSupplierDetails | null;
  documentNumber: string | null;
  documentDate: Date | null;
  suggestedCategoryName: string | null;
  requiresVehicleAllocation: boolean;
  lines: ParsedImportLine[];
};

type ExpenseLayoutProfile = {
  id: string;
  label: string;
  version: number;
  matches: (text: string, normalizedText: string) => boolean;
  parse: (text: string) => Omit<ExpenseLayoutProfileResult, 'profileId' | 'profileLabel'> | null;
};

export type ExpenseLayoutProfileDescriptor = Pick<ExpenseLayoutProfile, 'id' | 'label' | 'version'>;

const DECIMAL_MONEY = String.raw`\d{1,3}(?:\.\d{3})*,\d{2,4}`;
const ITALIAN_DATE = String.raw`\d{1,2}[/-]\d{1,2}[/-]\d{2,4}`;
const LABELED_ITEM_LINE = new RegExp(
  String.raw`^([A-Z0-9][A-Z0-9._/-]{2,})\s+(.+?)\s+(?:NR|PZ|P|CAD|LT|KG)\s+(\d{1,3}(?:[.,]\d{1,3})?)\s+(${DECIMAL_MONEY})\s*€?\s+(?:\d{1,3}(?:,\d+)?%?\s+)?(I?22|122|I?10|110|I?5|105|I?4|104|I?0|100)\s+(${DECIMAL_MONEY})\s*€?\s*$`,
  'iu'
);

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function parseDecimal(value: string): number {
  const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMoneyCents(value: string): number {
  return Math.round(parseDecimal(value) * 100);
}

function parseQuantityMilli(value: string): number {
  return Math.round(parseDecimal(value) * 1000);
}

function parseVatRate(value: string): number {
  const digits = value.replace(/\D/g, '');
  const normalized = digits.length === 3 && digits.startsWith('1') ? digits.slice(1) : digits;
  const rate = Number(normalized);
  return [0, 4, 5, 10, 22].includes(rate) ? rate : 22;
}

function buildDate(value: string): Date | null {
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const month = Number(match[2]);
  const day = Number(match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null;
}

function parseLabeledItemLines(text: string): ParsedImportLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[|[\]{}()‘’“”]/g, ' ').replace(/\s+/g, ' ').trim())
    .flatMap((line): ParsedImportLine[] => {
      const match = LABELED_ITEM_LINE.exec(line);
      if (!match) return [];

      const quantityMilli = parseQuantityMilli(match[3]);
      const unitPriceCents = parseMoneyCents(match[4]);
      const vatRatePercent = parseVatRate(match[5]);
      const printedImponibileCents = parseMoneyCents(match[6]);
      const computedImponibileCents = Math.round((quantityMilli * unitPriceCents) / 1000);
      if (
        quantityMilli <= 0 ||
        unitPriceCents <= 0 ||
        printedImponibileCents <= 0 ||
        Math.abs(computedImponibileCents - printedImponibileCents) > 2
      ) {
        return [];
      }

      const { vatCents, totalCents } = computeLineVat(computedImponibileCents, vatRatePercent);
      return [{
        code: match[1].toLocaleUpperCase('it-IT'),
        description: match[2].replace(/\s+/g, ' ').trim(),
        quantityMilli,
        unitPriceCents,
        imponibileCents: computedImponibileCents,
        vatRatePercent,
        vatCents,
        totalCents,
        allocationType: 'GENERIC'
      }];
    });
}

function parseLabeledInvoiceIdentity(text: string): { documentNumber: string | null; documentDate: Date | null } {
  const match = new RegExp(
    String.raw`\bFATTURA\s*[|:]?\s*([A-Z0-9][A-Z0-9/_-]{1,30})\s+(${ITALIAN_DATE})\b`,
    'iu'
  ).exec(text);
  return {
    documentNumber: match?.[1]?.toLocaleUpperCase('it-IT') || null,
    documentDate: match?.[2] ? buildDate(match[2]) : null
  };
}

function hasLabeledItemTable(normalizedText: string): boolean {
  return (
    normalizedText.includes('articolo descrizione') &&
    /\budm\b/.test(normalizedText) &&
    /\b(?:qta|ata)\b/.test(normalizedText) &&
    normalizedText.includes('prezzo') &&
    normalizedText.includes('imponibile')
  );
}

function parseLabeledWorkshopInvoice(
  text: string,
  options: {
    supplierName: string | null;
    supplierDetails: ParsedSupplierDetails | null;
    suggestedCategoryName: string | null;
  }
): Omit<ExpenseLayoutProfileResult, 'profileId' | 'profileLabel'> | null {
  const lines = parseLabeledItemLines(text);
  if (lines.length === 0) return null;
  const identity = parseLabeledInvoiceIdentity(text);
  return {
    ...options,
    ...identity,
    requiresVehicleAllocation: true,
    lines
  };
}

const DEMO_TIRE_DETAILS: ParsedSupplierDetails = {
  phone: '+39 000 0000000',
  email: 'pneumatici@example.com',
  address: 'Via Esempio 1',
  postalCode: '00000',
  city: 'Citta Demo',
  province: 'ZZ',
  country: 'Italia'
};

const expenseLayoutProfiles: ExpenseLayoutProfile[] = [
  {
    id: 'demo-pneumatici-invoice',
    label: 'Fattura Pneumatici Demo',
    version: 1,
    matches: (_text, normalizedText) =>
      normalizedText.includes('00000000003') &&
      hasLabeledItemTable(normalizedText),
    parse: (text) => parseLabeledWorkshopInvoice(text, {
      supplierName: 'Pneumatici Demo S.R.L.',
      supplierDetails: DEMO_TIRE_DETAILS,
      suggestedCategoryName: 'Pneumatici'
    })
  },
  {
    id: 'italian-labeled-workshop-invoice',
    label: 'Fattura officina con tabella Articolo/Udm/Qtà',
    version: 1,
    matches: (_text, normalizedText) => hasLabeledItemTable(normalizedText),
    parse: (text) => parseLabeledWorkshopInvoice(text, {
      supplierName: null,
      supplierDetails: null,
      suggestedCategoryName: null
    })
  }
];

export function listExpenseLayoutProfiles(): ExpenseLayoutProfileDescriptor[] {
  return expenseLayoutProfiles.map(({ id, label, version }) => ({ id, label, version }));
}

export function parseRegisteredExpenseLayout(text: string): ExpenseLayoutProfileResult | null {
  const normalizedText = normalize(text);
  for (const profile of expenseLayoutProfiles) {
    if (!profile.matches(text, normalizedText)) continue;
    const parsed = profile.parse(text);
    if (parsed) {
      return {
        profileId: profile.id,
        profileLabel: profile.label,
        ...parsed
      };
    }
  }
  return null;
}
