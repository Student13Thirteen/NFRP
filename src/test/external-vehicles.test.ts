import { describe, expect, it } from 'vitest';
import { FuelEntryStatus } from '@prisma/client';
import { calculateMetrics, type FuelMetricEntry } from '@/lib/fuel-metrics';
import { filterFuelEntries } from '@/lib/fuel-filters';
import type { FuelEntryWithRelations } from '@/lib/fuel';

function metricEntry(overrides: Partial<FuelMetricEntry>): FuelMetricEntry {
  return {
    id: 'entry-1',
    fuelDate: new Date('2026-08-20T00:00:00.000Z'),
    fuelTime: '09:30',
    plate: 'AB123CD',
    tractorId: null,
    productCode: 'GLS',
    odometerKm: null,
    volumeLitersMilli: 60_000,
    totalAmountCents: 9000,
    manuallyVerified: false,
    externalVehicle: false,
    status: FuelEntryStatus.OK,
    fuelProduct: { isFuel: false },
    ...overrides
  };
}

describe('rifornimento a un mezzo non aziendale', () => {
  it('non segnala la targa mancante in anagrafica quando il mezzo e dichiarato esterno', () => {
    const result = calculateMetrics(metricEntry({ externalVehicle: true }), null);

    expect(result.reviewReasons).toBe('');
    expect(result.status).toBe(FuelEntryStatus.OK);
  });

  it('continua a segnalare una targa sconosciuta non dichiarata esterna', () => {
    const result = calculateMetrics(metricEntry({ externalVehicle: false }), null);

    expect(result.reviewReasons).toContain('Targa non ancora presente in anagrafica mezzi');
    expect(result.status).toBe(FuelEntryStatus.NEEDS_REVIEW);
  });
});

function fuelEntry(overrides: Partial<FuelEntryWithRelations>): FuelEntryWithRelations {
  return {
    id: 'fuel-1',
    fuelDate: new Date('2026-08-20T00:00:00.000Z'),
    plate: 'AB123CD',
    tractorId: null,
    driverId: null,
    fuelSupplierId: null,
    fuelCardId: null,
    fuelProductId: null,
    productCode: 'GLS',
    externalVehicle: false,
    vehicleOwnerId: null,
    status: FuelEntryStatus.OK,
    ...overrides
  } as unknown as FuelEntryWithRelations;
}

describe('filtri registro rifornimenti per mezzi di terzi', () => {
  const fleet = fuelEntry({ id: 'fleet', tractorId: 'tractor-1', plate: 'ZZ192ZZ' });
  const external = fuelEntry({ id: 'external', externalVehicle: true, vehicleOwnerId: 'owner-1' });
  const otherExternal = fuelEntry({ id: 'other', externalVehicle: true, vehicleOwnerId: 'owner-2' });
  const entries = [fleet, external, otherExternal];

  it('mostra tutto senza filtri', () => {
    expect(filterFuelEntries(entries, {}).map((entry) => entry.id)).toEqual(['fleet', 'external', 'other']);
  });

  it('isola i rifornimenti fatti a mezzi non nostri', () => {
    expect(filterFuelEntries(entries, { vehicleSource: 'external' }).map((entry) => entry.id)).toEqual([
      'external',
      'other'
    ]);
  });

  it('isola la sola flotta aziendale', () => {
    expect(filterFuelEntries(entries, { vehicleSource: 'fleet' }).map((entry) => entry.id)).toEqual(['fleet']);
  });

  it('filtra per singolo proprietario terzo', () => {
    expect(filterFuelEntries(entries, { ownerId: 'owner-1' }).map((entry) => entry.id)).toEqual(['external']);
  });

  it('non mostra mai le righe importate ancora da confermare', () => {
    const pending = fuelEntry({ id: 'pending', externalVehicle: true, status: FuelEntryStatus.PENDING });
    expect(filterFuelEntries([...entries, pending], { vehicleSource: 'external' }).map((entry) => entry.id)).toEqual([
      'external',
      'other'
    ]);
  });
});
