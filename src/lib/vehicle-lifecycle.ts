import { EntityType, VehicleLifecycleStatus, type Prisma } from '@prisma/client';

export const DISPOSED_VEHICLE_STATUSES = [
  VehicleLifecycleStatus.SOLD,
  VehicleLifecycleStatus.SCRAPPED
] as const;

export function isDisposedVehicleStatus(status: VehicleLifecycleStatus): boolean {
  return status === VehicleLifecycleStatus.SOLD || status === VehicleLifecycleStatus.SCRAPPED;
}

export function getVehicleLifecycleLabel(status: VehicleLifecycleStatus): string {
  const labels: Record<VehicleLifecycleStatus, string> = {
    ACTIVE: 'In flotta',
    INACTIVE: 'Non attivo',
    SOLD: 'Venduto',
    SCRAPPED: 'Rottamato'
  };
  return labels[status];
}

export function getVehicleLifecycleBadgeClass(status: VehicleLifecycleStatus): string {
  if (status === VehicleLifecycleStatus.ACTIVE) return 'fuel-status-ok';
  if (status === VehicleLifecycleStatus.SOLD) return 'vehicle-status-sold';
  if (status === VehicleLifecycleStatus.SCRAPPED) return 'vehicle-status-scrapped';
  return 'inactive';
}

export function parseVehicleLifecycleEndedAt(value: string, status: VehicleLifecycleStatus): Date | null {
  if (!isDisposedVehicleStatus(status)) return null;
  if (!value) return null;
  const candidate = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(candidate.getTime())) throw new Error('Data uscita flotta non valida.');
  return new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth(), candidate.getUTCDate()));
}

export function getOperationalFleetDocumentWhere(): Prisma.DocumentWhereInput {
  return {
    NOT: [
      {
        entityType: EntityType.TRACTOR,
        tractor: { lifecycleStatus: { in: [...DISPOSED_VEHICLE_STATUSES] } }
      },
      {
        entityType: EntityType.TRAILER,
        trailer: { lifecycleStatus: { in: [...DISPOSED_VEHICLE_STATUSES] } }
      }
    ]
  };
}

export function getDisposedFleetDocumentWhere(status?: VehicleLifecycleStatus): Prisma.DocumentWhereInput {
  const statuses = status && isDisposedVehicleStatus(status) ? [status] : [...DISPOSED_VEHICLE_STATUSES];
  return {
    OR: [
      {
        entityType: EntityType.TRACTOR,
        tractor: { lifecycleStatus: { in: statuses } }
      },
      {
        entityType: EntityType.TRAILER,
        trailer: { lifecycleStatus: { in: statuses } }
      }
    ]
  };
}
