export type DateFilterPrefix = 'from' | 'to';

export type DateFilterSearchParams = {
  from?: string;
  to?: string;
  fromDay?: string;
  fromMonth?: string;
  fromYear?: string;
  toDay?: string;
  toMonth?: string;
  toYear?: string;
};

function parseIsoFilterDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return createUtcDate(year, month, day);
}

function createUtcDate(year: number, month: number, day: number): Date | null {
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

export function parseFilterDateParts(searchParams: DateFilterSearchParams, prefix: DateFilterPrefix): Date | null {
  const dayValue = searchParams[`${prefix}Day`];
  const monthValue = searchParams[`${prefix}Month`];
  const yearValue = searchParams[`${prefix}Year`];

  if (!dayValue && !monthValue && !yearValue) return parseIsoFilterDate(searchParams[prefix]);
  if (!dayValue || !monthValue || !yearValue) return null;

  return createUtcDate(Number(yearValue), Number(monthValue), Number(dayValue));
}

export function getDatePartValue(date: Date | null, part: 'day' | 'month' | 'year'): string {
  if (!date) return '';
  if (part === 'day') return String(date.getUTCDate());
  if (part === 'month') return String(date.getUTCMonth() + 1);
  return String(date.getUTCFullYear());
}

export function buildDateFilterYears(dates: Date[]): number[] {
  const currentYear = new Date().getFullYear();
  const years = new Set<number>([currentYear, currentYear - 1]);
  for (const date of dates) years.add(date.getUTCFullYear());
  return Array.from(years).sort((a, b) => b - a);
}
