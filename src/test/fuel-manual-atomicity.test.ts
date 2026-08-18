import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  tractorFindUnique: vi.fn(),
  driverFindUnique: vi.fn(),
  productFindUnique: vi.fn(),
  sourceFindUnique: vi.fn(),
  create: vi.fn(),
  metricFindMany: vi.fn()
}));

const tx = {
  fuelEntry: {
    findUnique: mocks.sourceFindUnique,
    create: mocks.create,
    findMany: mocks.metricFindMany,
    update: vi.fn()
  }
};

vi.mock('@/lib/db', () => ({
  prisma: {
    tractor: { findUnique: mocks.tractorFindUnique },
    driver: { findUnique: mocks.driverFindUnique },
    fuelProduct: { findUnique: mocks.productFindUnique },
    fuelSupplier: { findUnique: vi.fn() },
    fuelCard: { findUnique: vi.fn() },
    fuelEntry: { findUnique: mocks.sourceFindUnique },
    $transaction: mocks.transaction
  }
}));

import { createManualFuelEntryFromForm } from '@/lib/fuel-import';

function manualFuelForm(volumeLiters = '100'): FormData {
  const formData = new FormData();
  formData.set('submissionKey', '11111111-1111-4111-8111-111111111111');
  formData.set('fuelDate', '2026-08-17');
  formData.set('tractorId', 'tractor-1');
  formData.set('driverId', 'driver-1');
  formData.set('fuelProductId', 'product-1');
  formData.set('volumeLiters', volumeLiters);
  formData.set('grossPricePerLiter', '1.8');
  return formData;
}

describe('rifornimento manuale atomico e idempotente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.tractorFindUnique.mockResolvedValue({ id: 'tractor-1', plate: 'AA000AA' });
    mocks.driverFindUnique.mockResolvedValue({ id: 'driver-1' });
    mocks.productFindUnique.mockResolvedValue({ id: 'product-1', code: 'GLS', name: 'Gasolio' });
    mocks.metricFindMany.mockResolvedValue([]);
  });

  it('crea e ricalcola dentro la stessa transazione', async () => {
    const entry = { id: 'fuel-1', sourceKey: 'manual:11111111-1111-4111-8111-111111111111' };
    mocks.sourceFindUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue(entry);

    await expect(createManualFuelEntryFromForm(manualFuelForm())).resolves.toBe(entry);

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.metricFindMany).toHaveBeenCalledOnce();
  });

  it('riusa il record dello stesso invio invece di duplicarlo', async () => {
    const existing = { id: 'fuel-existing', sourceKey: 'manual:11111111-1111-4111-8111-111111111111' };
    mocks.sourceFindUnique.mockResolvedValue(existing);

    await expect(createManualFuelEntryFromForm(manualFuelForm())).resolves.toBe(existing);

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.metricFindMany).not.toHaveBeenCalled();
  });

  it('crea una chiave diversa se la pagina torna indietro con dati modificati', async () => {
    mocks.sourceFindUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValueOnce({ id: 'fuel-1' }).mockResolvedValueOnce({ id: 'fuel-2' });

    await createManualFuelEntryFromForm(manualFuelForm('100'));
    await createManualFuelEntryFromForm(manualFuelForm('120'));

    const sourceKeys = mocks.create.mock.calls.map(([input]) => input.data.sourceKey);
    expect(sourceKeys[0]).not.toBe(sourceKeys[1]);
    expect(sourceKeys.every((key) => key.startsWith('manual:11111111-1111-4111-8111-111111111111:'))).toBe(true);
  });
});
