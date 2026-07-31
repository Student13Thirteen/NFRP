import { FuelEntryStatus, Prisma } from '@prisma/client';
import { formatDate } from '@/lib/dates';
import { getDriverLabel, getVehicleLabel } from '@/lib/trips';

export const fuelEntryInclude = Prisma.validator<Prisma.FuelEntryInclude>()({
  tractor: { include: { assignedDriver: true } },
  driver: true,
  fuelSupplier: true,
  fuelCard: { include: { fuelSupplier: true } },
  fuelProduct: true,
  importBatch: true
});

export type FuelEntryWithRelations = Prisma.FuelEntryGetPayload<{ include: typeof fuelEntryInclude }>;

export function getFuelEntryStatusLabel(status: FuelEntryStatus): string {
  switch (status) {
    case FuelEntryStatus.PENDING:
      return 'In attesa';
    case FuelEntryStatus.OK:
      return 'OK';
    case FuelEntryStatus.NEEDS_REVIEW:
      return 'Da verificare';
    case FuelEntryStatus.VERIFIED:
      return 'Verificato';
    default:
      return status;
  }
}

export function formatFuelMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value / 100);
}

export function formatFuelLiters(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 1000);
}

export function formatFuelPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  }).format(value / 1000)} €/L`;
}

export function formatFuelCostPerKm(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  }).format(value / 1000)} €/km`;
}

export function formatFuelConsumption(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value / 10)} L/100 km`;
}

export function getFuelDriverLabel(entry: Pick<FuelEntryWithRelations, 'driver' | 'tractor'>): string {
  if (entry.driver) return getDriverLabel(entry.driver);
  if (entry.tractor?.assignedDriver) return getDriverLabel(entry.tractor.assignedDriver);
  return '-';
}

export function getFuelVehicleLabel(entry: Pick<FuelEntryWithRelations, 'tractor' | 'plate'>): string {
  return entry.tractor ? getVehicleLabel(entry.tractor) : entry.plate;
}

function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function fuelEntryMatchesSearch(entry: FuelEntryWithRelations, query: string | undefined): boolean {
  const tokens = normalizeSearch(query || '')
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return true;

  const searchableText = normalizeSearch(
    [
      formatDate(entry.fuelDate),
      entry.fuelTime || '',
      entry.invoiceNumber || '',
      entry.cardNumber,
      entry.ticketNumber,
      entry.productCode,
      entry.productName || '',
      entry.fuelProduct?.name || '',
      entry.fuelSupplier?.name || '',
      entry.fuelCard?.cardNumber || '',
      entry.fuelCard?.fuelSupplier?.name || '',
      entry.plate,
      getFuelVehicleLabel(entry),
      getFuelDriverLabel(entry),
      entry.stationCode || '',
      entry.stationName || '',
      entry.serviceType || '',
      entry.odometerKm ? `${entry.odometerKm} km` : '',
      entry.kmDelta ? `${entry.kmDelta} km` : '',
      formatFuelMoney(entry.totalAmountCents),
      formatFuelLiters(entry.volumeLitersMilli),
      getFuelEntryStatusLabel(entry.status),
      entry.reviewReasons || '',
      entry.notes || '',
      entry.importBatch?.originalFileName || ''
    ].join(' ')
  );

  return tokens.every((token) => searchableText.includes(token));
}
