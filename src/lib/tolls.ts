import { Prisma, TollEntryStatus } from '@prisma/client';
import { formatDate } from '@/lib/dates';
import { getVehicleLabel } from '@/lib/trips';

export const tollEntryInclude = Prisma.validator<Prisma.TollEntryInclude>()({
  tractor: { include: { assignedDriver: true } },
  card: { include: { assignedTractor: true } },
  importBatch: true
});

export const tollCardInclude = Prisma.validator<Prisma.TollCardInclude>()({
  assignedTractor: true,
  _count: { select: { entries: true } }
});

export type TollEntryWithRelations = Prisma.TollEntryGetPayload<{ include: typeof tollEntryInclude }>;
export type TollCardWithRelations = Prisma.TollCardGetPayload<{ include: typeof tollCardInclude }>;

export function getTollEntryStatusLabel(status: TollEntryStatus): string {
  switch (status) {
    case TollEntryStatus.PENDING:
      return 'In attesa';
    case TollEntryStatus.OK:
      return 'OK';
    case TollEntryStatus.NEEDS_REVIEW:
      return 'Da verificare';
    case TollEntryStatus.VERIFIED:
      return 'Verificato';
    default:
      return status;
  }
}

export function formatTollMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value / 100);
}

export function formatTollDistance(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${new Intl.NumberFormat('it-IT').format(value)} km`;
}

export function getTollVehicleLabel(entry: Pick<TollEntryWithRelations, 'tractor' | 'plate'>): string {
  return entry.tractor ? getVehicleLabel(entry.tractor) : entry.plate;
}

function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function tollEntryMatchesSearch(entry: TollEntryWithRelations, query: string | undefined): boolean {
  const tokens = normalizeSearch(query || '')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const searchableText = normalizeSearch(
    [
      formatDate(entry.tollDate),
      entry.tollTime || '',
      entry.invoiceNumber || '',
      entry.providerName,
      entry.cardNumber,
      entry.card?.cardNumber || '',
      entry.plate,
      getTollVehicleLabel(entry),
      entry.routeName,
      entry.motorwayName || '',
      entry.entryGateName || '',
      entry.exitGateName || '',
      entry.vehicleClass || '',
      entry.euroClass || '',
      entry.authorizationCode || '',
      formatTollMoney(entry.grossAmountCents),
      getTollEntryStatusLabel(entry.status),
      entry.reviewReasons || '',
      entry.importBatch?.originalFileName || ''
    ].join(' ')
  );

  return tokens.every((token) => searchableText.includes(token));
}
