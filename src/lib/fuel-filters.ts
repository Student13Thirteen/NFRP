import { FuelEntryStatus } from '@prisma/client';
import { parseFilterDateParts, type DateFilterSearchParams } from '@/lib/date-filters';
import { fuelEntryMatchesSearch, type FuelEntryWithRelations } from '@/lib/fuel';

export type FuelSearchParams = DateFilterSearchParams & {
  q?: string;
  tractorId?: string;
  driverId?: string;
  fuelSupplierId?: string;
  fuelCardId?: string;
  fuelProductId?: string;
  productCode?: string;
  review?: string;
  page?: string;
  pageSize?: string;
};

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function filterFuelEntries(entries: FuelEntryWithRelations[], params: FuelSearchParams): FuelEntryWithRelations[] {
  const fromDate = parseFilterDateParts(params, 'from');
  const toDate = parseFilterDateParts(params, 'to');

  return entries.filter((entry) => {
    if (entry.status === FuelEntryStatus.PENDING) return false;
    if (params.tractorId && entry.tractorId !== params.tractorId) return false;
    if (params.driverId && entry.driverId !== params.driverId && entry.tractor?.assignedDriverId !== params.driverId) return false;
    if (params.fuelSupplierId && entry.fuelSupplierId !== params.fuelSupplierId) return false;
    if (params.fuelCardId && entry.fuelCardId !== params.fuelCardId) return false;
    if (params.fuelProductId && entry.fuelProductId !== params.fuelProductId && entry.productCode !== params.productCode) return false;
    if (!params.fuelProductId && params.productCode && entry.productCode !== params.productCode) return false;
    if (params.review === 'needs_review' && entry.status !== FuelEntryStatus.NEEDS_REVIEW) return false;
    if (params.review === 'verified' && entry.status !== FuelEntryStatus.VERIFIED) return false;
    if (params.review === 'ok' && entry.status !== FuelEntryStatus.OK) return false;
    if (fromDate && entry.fuelDate < fromDate) return false;
    if (toDate && entry.fuelDate >= addUtcDays(toDate, 1)) return false;
    return fuelEntryMatchesSearch(entry, params.q);
  });
}
