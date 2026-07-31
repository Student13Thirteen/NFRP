import {
  MaintenanceStatus,
  Prisma,
  type Category,
  type Driver,
  type Supplier,
  type Tractor,
  type Trailer
} from '@prisma/client';
import { formatDate } from '@/lib/dates';
import { getDriverLabel, getVehicleLabel } from '@/lib/trips';

export const maintenanceInclude = Prisma.validator<Prisma.MaintenanceInclude>()({
  category: true,
  supplier: true,
  driver: true,
  tractor: true,
  trailer: true
});

export type MaintenanceWithRelations = Prisma.MaintenanceGetPayload<{ include: typeof maintenanceInclude }>;

export type MaintenanceVehicleOption = {
  id: string;
  label: string;
  value: string;
  active?: boolean;
};

export type MaintenanceSelectOption = {
  id: string;
  label: string;
  active?: boolean;
};

export type MaintenanceVehicleKey =
  | {
      type: 'TRACTOR';
      id: string;
    }
  | {
      type: 'TRAILER';
      id: string;
    };

export function getMaintenanceStatusLabel(status: MaintenanceStatus): string {
  switch (status) {
    case MaintenanceStatus.OPEN:
      return 'Da fare';
    case MaintenanceStatus.IN_PROGRESS:
      return 'In lavorazione';
    case MaintenanceStatus.COMPLETED:
      return 'Completata';
    case MaintenanceStatus.INVOICED:
      return 'Fatturata';
    case MaintenanceStatus.ARCHIVED:
      return 'Archiviata';
    default:
      return status;
  }
}

export function getMaintenanceVehicleLabel(
  maintenance: Pick<MaintenanceWithRelations, 'tractor' | 'trailer'>
): string {
  if (maintenance.tractor) return `Trattore ${getVehicleLabel(maintenance.tractor)}`;
  if (maintenance.trailer) return `Semirimorchio ${getVehicleLabel(maintenance.trailer)}`;
  return 'Non associata';
}

export function getMaintenanceDriverLabel(
  maintenance: Pick<MaintenanceWithRelations, 'driver'>
): string {
  return maintenance.driver ? getDriverLabel(maintenance.driver) : '-';
}

export function getMaintenanceVehicleKey(maintenance: Pick<MaintenanceWithRelations, 'tractorId' | 'trailerId'>): string {
  if (maintenance.tractorId) return `TRACTOR:${maintenance.tractorId}`;
  if (maintenance.trailerId) return `TRAILER:${maintenance.trailerId}`;
  return '';
}

export function parseMaintenanceVehicleKey(value: string | null | undefined): MaintenanceVehicleKey | null {
  const [type, id] = (value || '').split(':');
  if (!id) return null;
  if (type === 'TRACTOR') return { type, id };
  if (type === 'TRAILER') return { type, id };
  return null;
}

export function buildMaintenanceCategoryOptions(
  categories: Array<Pick<Category, 'id' | 'name' | 'active'>>
): MaintenanceSelectOption[] {
  return categories.map((category) => ({
    id: category.id,
    label: category.name,
    active: category.active
  }));
}

export function buildMaintenanceSupplierOptions(
  suppliers: Array<Pick<Supplier, 'id' | 'name' | 'active'>>
): MaintenanceSelectOption[] {
  return suppliers.map((supplier) => ({
    id: supplier.id,
    label: supplier.name,
    active: supplier.active
  }));
}

export function buildMaintenanceDriverOptions(
  drivers: Array<Pick<Driver, 'id' | 'firstName' | 'lastName' | 'active'>>
): MaintenanceSelectOption[] {
  return drivers.map((driver) => ({
    id: driver.id,
    label: getDriverLabel(driver),
    active: driver.active
  }));
}

export function buildMaintenanceVehicleOptions(
  tractors: Array<
    Pick<Tractor, 'id' | 'plate' | 'brand' | 'model' | 'active'> & {
      assignedDriver?: Pick<Driver, 'firstName' | 'lastName'> | null;
    }
  >,
  trailers: Array<Pick<Trailer, 'id' | 'plate' | 'brand' | 'model' | 'active'>>
): MaintenanceVehicleOption[] {
  const tractorOptions = tractors.map((tractor) => ({
    id: tractor.id,
    value: `TRACTOR:${tractor.id}`,
    label: `Trattore ${getVehicleLabel(tractor)}${
      tractor.assignedDriver ? ` · autista ${getDriverLabel(tractor.assignedDriver)}` : ''
    }`,
    active: tractor.active
  }));
  const trailerOptions = trailers.map((trailer) => ({
    id: trailer.id,
    value: `TRAILER:${trailer.id}`,
    label: `Semirimorchio ${getVehicleLabel(trailer)}`,
    active: trailer.active
  }));

  return [...tractorOptions, ...trailerOptions].sort((a, b) => a.label.localeCompare(b.label, 'it'));
}

export function formatMoneyCents(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value / 100);
}

function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function maintenanceMatchesSearch(maintenance: MaintenanceWithRelations, query: string | undefined): boolean {
  const tokens = normalizeSearch(query || '')
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return true;

  const searchableText = normalizeSearch(
    [
      maintenance.title,
      maintenance.category.name,
      getMaintenanceStatusLabel(maintenance.status),
      getMaintenanceVehicleLabel(maintenance),
      getMaintenanceDriverLabel(maintenance),
      maintenance.supplier?.name || '',
      maintenance.supplier?.phone || '',
      maintenance.supplier?.email || '',
      maintenance.supplier?.address || '',
      maintenance.supplier?.postalCode || '',
      maintenance.supplier?.city || '',
      maintenance.supplier?.province || '',
      maintenance.supplier?.country || '',
      maintenance.documentNumber || '',
      maintenance.description,
      maintenance.notes || '',
      maintenance.originalFileName || '',
      formatDate(maintenance.maintenanceDate),
      formatDate(maintenance.documentDate),
      maintenance.odometerKm ? `${maintenance.odometerKm} km` : '',
      formatMoneyCents(maintenance.amountCents)
    ].join(' ')
  );

  return tokens.every((token) => searchableText.includes(token));
}
