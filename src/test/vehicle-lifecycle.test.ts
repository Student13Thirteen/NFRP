import { VehicleLifecycleStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  getDisposedFleetDocumentWhere,
  getOperationalFleetDocumentWhere,
  getVehicleLifecycleLabel,
  isDisposedVehicleStatus,
  parseVehicleLifecycleEndedAt
} from '@/lib/vehicle-lifecycle';

describe('vehicle lifecycle', () => {
  it('distinguishes vehicles that left the fleet from temporary inactivity', () => {
    expect(isDisposedVehicleStatus(VehicleLifecycleStatus.SOLD)).toBe(true);
    expect(isDisposedVehicleStatus(VehicleLifecycleStatus.SCRAPPED)).toBe(true);
    expect(isDisposedVehicleStatus(VehicleLifecycleStatus.INACTIVE)).toBe(false);
    expect(isDisposedVehicleStatus(VehicleLifecycleStatus.ACTIVE)).toBe(false);
  });

  it('provides clear Italian labels', () => {
    expect(getVehicleLifecycleLabel(VehicleLifecycleStatus.ACTIVE)).toBe('In flotta');
    expect(getVehicleLifecycleLabel(VehicleLifecycleStatus.SOLD)).toBe('Venduto');
    expect(getVehicleLifecycleLabel(VehicleLifecycleStatus.SCRAPPED)).toBe('Rottamato');
  });

  it('keeps the exit date optional and clears it outside disposed statuses', () => {
    expect(parseVehicleLifecycleEndedAt('', VehicleLifecycleStatus.SOLD)).toBeNull();
    expect(parseVehicleLifecycleEndedAt('2026-07-21', VehicleLifecycleStatus.SCRAPPED)?.toISOString()).toBe(
      '2026-07-21T00:00:00.000Z'
    );
    expect(parseVehicleLifecycleEndedAt('2026-07-21', VehicleLifecycleStatus.ACTIVE)).toBeNull();
  });

  it('builds separate Prisma scopes for operational and disposed documents', () => {
    expect(getOperationalFleetDocumentWhere()).toHaveProperty('NOT');
    expect(getDisposedFleetDocumentWhere()).toHaveProperty('OR');
    expect(getDisposedFleetDocumentWhere(VehicleLifecycleStatus.SOLD)).toEqual({
      OR: [
        {
          entityType: 'TRACTOR',
          tractor: { lifecycleStatus: { in: ['SOLD'] } }
        },
        {
          entityType: 'TRAILER',
          trailer: { lifecycleStatus: { in: ['SOLD'] } }
        }
      ]
    });
  });
});
