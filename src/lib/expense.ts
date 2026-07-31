import { Prisma, type Driver, type Tractor, type Trailer } from '@prisma/client';
import { getVehicleLabel } from '@/lib/trips';
import { buildMaintenanceVehicleOptions } from '@/lib/maintenance';
import type { AllocationKind } from '@/lib/expense-shared';

export * from '@/lib/expense-shared';

export const expenseLineInclude = Prisma.validator<Prisma.ExpenseLineInclude>()({
  category: true,
  tractor: true,
  trailer: true,
  warehouseItem: true
});

export const expenseDocumentInclude = Prisma.validator<Prisma.ExpenseDocumentInclude>()({
  supplier: true,
  lines: {
    include: expenseLineInclude,
    orderBy: { position: 'asc' }
  }
});

export type ExpenseDocumentWithRelations = Prisma.ExpenseDocumentGetPayload<{ include: typeof expenseDocumentInclude }>;
export type ExpenseLineWithRelations = Prisma.ExpenseLineGetPayload<{ include: typeof expenseLineInclude }>;

export type ExpenseDocumentListFilters = {
  q: string;
  sort: 'activity' | 'documentDate';
  status: '' | 'PENDING' | 'CONFIRMED';
  vehicleKey: string;
};

export function normalizeExpenseDocumentListFilters(input: {
  q?: string | null;
  sort?: string | null;
  status?: string | null;
  vehicleKey?: string | null;
}): ExpenseDocumentListFilters {
  const rawVehicleKey = (input.vehicleKey || '').trim();
  const [vehicleType, vehicleId] = rawVehicleKey.split(':');
  const vehicleKey = vehicleId && (vehicleType === 'TRACTOR' || vehicleType === 'TRAILER')
    ? `${vehicleType}:${vehicleId}`
    : '';

  return {
    q: (input.q || '').trim(),
    sort: input.sort === 'documentDate' ? 'documentDate' : 'activity',
    status: input.status === 'PENDING' || input.status === 'CONFIRMED' ? input.status : '',
    vehicleKey
  };
}

export function filterAndSortExpenseDocuments(
  documents: ExpenseDocumentWithRelations[],
  filters: ExpenseDocumentListFilters
): ExpenseDocumentWithRelations[] {
  const [vehicleType, vehicleId] = filters.vehicleKey.split(':');
  const query = filters.q.toLocaleLowerCase('it');

  return documents
    .filter((doc) => {
      if (filters.status && doc.status !== filters.status) return false;
      if (
        vehicleType === 'TRACTOR' &&
        vehicleId &&
        !doc.lines.some((line) => line.tractorId === vehicleId)
      ) return false;
      if (
        vehicleType === 'TRAILER' &&
        vehicleId &&
        !doc.lines.some((line) => line.trailerId === vehicleId)
      ) return false;
      if (!query) return true;

      const searchable = [
        doc.supplier?.name,
        doc.supplierName,
        doc.documentNumber,
        doc.originalFileName,
        ...doc.lines.flatMap((line) => [
          line.code,
          line.description,
          line.tractor?.plate,
          line.trailer?.plate,
          line.odometerKm
        ])
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('it');
      return searchable.includes(query);
    })
    .sort((left, right) => {
      if (filters.sort === 'documentDate') {
        return right.registeredAt.getTime() - left.registeredAt.getTime()
          || right.createdAt.getTime() - left.createdAt.getTime();
      }
      return right.updatedAt.getTime() - left.updatedAt.getTime()
        || right.createdAt.getTime() - left.createdAt.getTime();
    });
}

export type DocumentTotals = {
  totalImponibileCents: number;
  totalVatCents: number;
  totalAmountCents: number;
};

export function sumDocumentTotals(
  lines: Array<{ imponibileCents: number; vatCents: number; totalCents: number }>
): DocumentTotals {
  return lines.reduce<DocumentTotals>(
    (acc, line) => ({
      totalImponibileCents: acc.totalImponibileCents + line.imponibileCents,
      totalVatCents: acc.totalVatCents + line.vatCents,
      totalAmountCents: acc.totalAmountCents + line.totalCents
    }),
    { totalImponibileCents: 0, totalVatCents: 0, totalAmountCents: 0 }
  );
}

export function getAllocationLabel(
  line: Pick<ExpenseLineWithRelations, 'allocationType' | 'tractor' | 'trailer'>
): string {
  switch (line.allocationType) {
    case 'TRACTOR':
      return line.tractor ? `Trattore ${getVehicleLabel(line.tractor)}` : 'Trattore';
    case 'TRAILER':
      return line.trailer ? `Semirimorchio ${getVehicleLabel(line.trailer)}` : 'Semirimorchio';
    case 'WAREHOUSE':
      return 'Magazzino';
    default:
      return 'Azienda / generico';
  }
}

export type AllocationOption = {
  value: string;
  label: string;
  active?: boolean;
};

/** Opzioni per la <select> di allocazione di una riga: Magazzino, Azienda, poi le targhe. */
export function buildAllocationOptions(
  tractors: Array<
    Pick<Tractor, 'id' | 'plate' | 'brand' | 'model' | 'active'> & {
      assignedDriver?: Pick<Driver, 'firstName' | 'lastName'> | null;
    }
  >,
  trailers: Array<Pick<Trailer, 'id' | 'plate' | 'brand' | 'model' | 'active'>>
): AllocationOption[] {
  const vehicles = buildMaintenanceVehicleOptions(tractors, trailers).map((vehicle) => ({
    value: vehicle.value,
    label: vehicle.label,
    active: vehicle.active
  }));

  return [
    { value: 'WAREHOUSE', label: 'Magazzino' },
    { value: 'GENERIC', label: 'Azienda / generico' },
    ...vehicles
  ];
}

/** Mappa un ParsedAllocation ai campi DB della riga. */
export function allocationToDbFields(value: string | null | undefined): {
  allocationType: AllocationKind;
  tractorId: string | null;
  trailerId: string | null;
} {
  const raw = (value || '').trim();
  if (raw === 'WAREHOUSE') return { allocationType: 'WAREHOUSE', tractorId: null, trailerId: null };
  const [type, id] = raw.split(':');
  if (type === 'TRACTOR' && id) return { allocationType: 'TRACTOR', tractorId: id, trailerId: null };
  if (type === 'TRAILER' && id) return { allocationType: 'TRAILER', tractorId: null, trailerId: id };
  return { allocationType: 'GENERIC', tractorId: null, trailerId: null };
}
