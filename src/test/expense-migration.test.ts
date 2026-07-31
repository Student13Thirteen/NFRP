import { describe, expect, it } from 'vitest';
import {
  mapMaintenanceToExpense,
  mapWarehouseItemToExpense,
  type LegacyMaintenance,
  type LegacyWarehouseItem
} from '@/lib/expense-migration';

function maintenance(overrides: Partial<LegacyMaintenance> = {}): LegacyMaintenance {
  return {
    description: 'Sostituzione radiatore',
    title: 'Radiatore ZZ103ZZ',
    amountCents: 172020,
    categoryId: 'cat-1',
    supplierId: 'sup-1',
    documentNumber: 'FT-100',
    documentDate: new Date('2026-03-01T00:00:00.000Z'),
    maintenanceDate: new Date('2026-03-02T00:00:00.000Z'),
    odometerKm: 200000,
    notes: 'iva 22 segnata a mano',
    tractorId: 'tr-1',
    trailerId: null,
    filePath: 'file.pdf',
    originalFileName: 'fattura.pdf',
    fileSize: 1234,
    mimeType: 'application/pdf',
    ...overrides
  };
}

describe('mapMaintenanceToExpense', () => {
  it('usa l’importo come totale ivato e scorpora l’imponibile al 22%', () => {
    const doc = mapMaintenanceToExpense(maintenance());
    expect(doc.totalAmountCents).toBe(172020);
    expect(doc.totalImponibileCents).toBe(141000); // 172020 / 1.22
    expect(doc.totalVatCents).toBe(172020 - 141000);
    expect(doc.line.vatRatePercent).toBe(22);
  });

  it('alloca al trattore quando presente', () => {
    const doc = mapMaintenanceToExpense(maintenance());
    expect(doc.line.allocationType).toBe('TRACTOR');
    expect(doc.line.tractorId).toBe('tr-1');
  });

  it('alloca al semirimorchio quando presente', () => {
    const doc = mapMaintenanceToExpense(maintenance({ tractorId: null, trailerId: 'rim-1' }));
    expect(doc.line.allocationType).toBe('TRAILER');
    expect(doc.line.trailerId).toBe('rim-1');
  });

  it('senza mezzo resta GENERIC e copia le note verbatim', () => {
    const doc = mapMaintenanceToExpense(maintenance({ tractorId: null, trailerId: null }));
    expect(doc.line.allocationType).toBe('GENERIC');
    expect(doc.notes).toBe('iva 22 segnata a mano');
  });

  it('segnala IVA ipotizzata e allocazione mancante nel banner', () => {
    const doc = mapMaintenanceToExpense(maintenance({ tractorId: null, trailerId: null }));
    expect(doc.reviewReasons).toContain('IVA non registrata');
    expect(doc.reviewReasons).toContain('senza allocazione');
  });

  it('è PENDING source MIGRATION', () => {
    const doc = mapMaintenanceToExpense(maintenance());
    expect(doc.status).toBe('PENDING');
    expect(doc.source).toBe('MIGRATION');
  });
});

function warehouseItem(overrides: Partial<LegacyWarehouseItem> = {}): LegacyWarehouseItem {
  return {
    id: 'wh-1',
    title: 'Filtro olio',
    description: 'Filtro olio motore',
    code: 'FO-123',
    quantity: 6,
    unit: 'pz',
    amountCents: 12200,
    categoryId: 'cat-2',
    supplierId: 'sup-2',
    documentNumber: 'DDT-9',
    documentDate: new Date('2026-02-01T00:00:00.000Z'),
    stockedAt: new Date('2026-02-02T00:00:00.000Z'),
    notes: null,
    filePath: null,
    originalFileName: null,
    fileSize: null,
    mimeType: null,
    ...overrides
  };
}

describe('mapWarehouseItemToExpense', () => {
  it('alloca a magazzino e aggancia l’articolo esistente (niente ricarico)', () => {
    const doc = mapWarehouseItemToExpense(warehouseItem());
    expect(doc.line.allocationType).toBe('WAREHOUSE');
    expect(doc.line.warehouseItemId).toBe('wh-1');
  });

  it('mantiene quantità e codice', () => {
    const doc = mapWarehouseItemToExpense(warehouseItem());
    expect(doc.line.quantityMilli).toBe(6000);
    expect(doc.line.code).toBe('FO-123');
    expect(doc.totalAmountCents).toBe(12200);
    expect(doc.totalImponibileCents).toBe(10000); // 12200 / 1.22
  });
});
