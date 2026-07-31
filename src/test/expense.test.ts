import { describe, expect, it } from 'vitest';
import {
  allocationKeyFor,
  buildAllocationOptions,
  computeLineVat,
  filterAndSortExpenseDocuments,
  imponibileCentsFromTotal,
  imponibileCentsFromUnit,
  normalizeExpenseDocumentListFilters,
  parseAllocationKey,
  sumDocumentTotals
} from '@/lib/expense';

describe('computeLineVat', () => {
  it('applica IVA 22% con arrotondamento al centesimo', () => {
    expect(computeLineVat(10000, 22)).toEqual({ imponibileCents: 10000, vatCents: 2200, totalCents: 12200 });
  });

  it('applica IVA 10%', () => {
    expect(computeLineVat(5000, 10)).toEqual({ imponibileCents: 5000, vatCents: 500, totalCents: 5500 });
  });

  it('IVA 4% arrotonda correttamente', () => {
    // 12345 * 4% = 493.8 -> 494
    expect(computeLineVat(12345, 4)).toEqual({ imponibileCents: 12345, vatCents: 494, totalCents: 12839 });
  });

  it('IVA 0% lascia il totale uguale all’imponibile', () => {
    expect(computeLineVat(7300, 0)).toEqual({ imponibileCents: 7300, vatCents: 0, totalCents: 7300 });
  });

  it('non genera importi negativi', () => {
    expect(computeLineVat(-100, 22)).toEqual({ imponibileCents: 0, vatCents: 0, totalCents: 0 });
  });
});

describe('imponibileCentsFromTotal', () => {
  it('scorpora l’imponibile da un totale ivato 22% (es. 1720,20 -> 1410,00)', () => {
    // 172020 / 1.22 = 141000
    expect(imponibileCentsFromTotal(172020, 22)).toBe(141000);
  });

  it('IVA 0% restituisce il totale invariato', () => {
    expect(imponibileCentsFromTotal(73000, 0)).toBe(73000);
  });

  it('round-trip coerente: scorporo poi riapplico l’IVA e torno al totale (al centesimo)', () => {
    const total = 12200;
    const imponibile = imponibileCentsFromTotal(total, 22);
    expect(computeLineVat(imponibile, 22).totalCents).toBe(total);
  });
});

describe('imponibileCentsFromUnit', () => {
  it('quantità ×1000 per prezzo unitario netto', () => {
    // 5 pezzi a 35,00 = 175,00
    expect(imponibileCentsFromUnit(5000, 3500)).toBe(17500);
  });

  it('gestisce quantità frazionarie (0,5 lt a 2,00 = 1,00)', () => {
    expect(imponibileCentsFromUnit(500, 200)).toBe(100);
  });
});

describe('sumDocumentTotals', () => {
  it('somma imponibile, IVA e totale di tutte le righe', () => {
    const totals = sumDocumentTotals([
      { imponibileCents: 10000, vatCents: 2200, totalCents: 12200 },
      { imponibileCents: 5000, vatCents: 500, totalCents: 5500 },
      { imponibileCents: 7300, vatCents: 0, totalCents: 7300 }
    ]);
    expect(totals).toEqual({ totalImponibileCents: 22300, totalVatCents: 2700, totalAmountCents: 25000 });
  });

  it('documento vuoto somma a zero', () => {
    expect(sumDocumentTotals([])).toEqual({ totalImponibileCents: 0, totalVatCents: 0, totalAmountCents: 0 });
  });
});

describe('parseAllocationKey / allocationKeyFor', () => {
  it('riconosce trattore, semirimorchio, magazzino e generico', () => {
    expect(parseAllocationKey('TRACTOR:abc')).toEqual({ kind: 'TRACTOR', id: 'abc' });
    expect(parseAllocationKey('TRAILER:xyz')).toEqual({ kind: 'TRAILER', id: 'xyz' });
    expect(parseAllocationKey('WAREHOUSE')).toEqual({ kind: 'WAREHOUSE' });
    expect(parseAllocationKey('')).toEqual({ kind: 'GENERIC' });
    expect(parseAllocationKey('GENERIC')).toEqual({ kind: 'GENERIC' });
    expect(parseAllocationKey('TRACTOR:')).toEqual({ kind: 'GENERIC' });
  });

  it('ricostruisce la chiave dai campi DB della riga', () => {
    expect(allocationKeyFor({ allocationType: 'TRACTOR', tractorId: 'abc', trailerId: null })).toBe('TRACTOR:abc');
    expect(allocationKeyFor({ allocationType: 'TRAILER', tractorId: null, trailerId: 'xyz' })).toBe('TRAILER:xyz');
    expect(allocationKeyFor({ allocationType: 'WAREHOUSE', tractorId: null, trailerId: null })).toBe('WAREHOUSE');
    expect(allocationKeyFor({ allocationType: 'GENERIC', tractorId: null, trailerId: null })).toBe('GENERIC');
  });
});

describe('buildAllocationOptions', () => {
  it('mostra l’autista associato accanto alla targa senza assegnarlo automaticamente', () => {
    const options = buildAllocationOptions(
      [
        {
          id: 'tractor-1',
          plate: 'ZZ102ZZ',
          brand: 'Volvo',
          model: null,
          active: true,
          assignedDriver: { firstName: 'Mario', lastName: 'Rossi' }
        }
      ],
      []
    );

    expect(options.find((option) => option.value === 'TRACTOR:tractor-1')?.label).toBe(
      'Trattore ZZ102ZZ - Volvo · autista Rossi Mario'
    );
  });
});

describe('registro fatture e DDT', () => {
  type ListDocument = Parameters<typeof filterAndSortExpenseDocuments>[0][number];

  function documentFixture(input: {
    id: string;
    registeredAt: string;
    updatedAt: string;
    plate: string;
    tractorId: string;
    odometerKm?: number | null;
  }): ListDocument {
    const createdAt = new Date('2026-07-30T15:00:00.000Z');
    return {
      id: input.id,
      status: 'CONFIRMED',
      source: 'MAINTENANCE_IMPORT',
      importKey: null,
      sourcePage: null,
      sourcePageCount: null,
      supplierId: null,
      supplierName: 'Ricambi Demo Delta',
      leaseContractId: null,
      documentNumber: input.id,
      documentDate: new Date(input.registeredAt),
      registeredAt: new Date(input.registeredAt),
      totalImponibileCents: 1000,
      totalVatCents: 220,
      totalAmountCents: 1220,
      reviewReasons: null,
      notes: null,
      filePath: null,
      originalFileName: null,
      fileSize: null,
      mimeType: null,
      createdAt,
      updatedAt: new Date(input.updatedAt),
      supplier: null,
      lines: [
        {
          id: `${input.id}-line`,
          documentId: input.id,
          position: 0,
          code: null,
          description: 'Ricambio',
          quantityMilli: 1000,
          unit: 'pz',
          unitPriceCents: 1000,
          imponibileCents: 1000,
          vatRatePercent: 22,
          vatCents: 220,
          totalCents: 1220,
          categoryId: null,
          allocationType: 'TRACTOR',
          tractorId: input.tractorId,
          trailerId: null,
          warehouseItemId: null,
          odometerKm: input.odometerKm ?? null,
          notes: null,
          createdAt,
          updatedAt: new Date(input.updatedAt),
          category: null,
          tractor: {
            id: input.tractorId,
            plate: input.plate,
            brand: null,
            model: null,
            year: null,
            chassisNumber: null,
            note: null,
            active: true,
            assignedDriverId: null,
            lifecycleStatus: 'ACTIVE',
            lifecycleEndedAt: null,
            createdAt,
            updatedAt: createdAt
          },
          trailer: null,
          warehouseItem: null
        }
      ]
    };
  }

  it('mostra per prima una fattura appena validata anche se il DDT è più vecchio', () => {
    const justValidated = documentFixture({
      id: 'DDT-vecchio',
      registeredAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-07-31T07:24:15.000Z',
      plate: 'ZZ101ZZ',
      tractorId: 'tractor-fn'
    });
    const newerDocument = documentFixture({
      id: 'DDT-recente',
      registeredAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-30T16:00:00.000Z',
      plate: 'ZZ102ZZ',
      tractorId: 'tractor-fx'
    });

    const result = filterAndSortExpenseDocuments(
      [newerDocument, justValidated],
      normalizeExpenseDocumentListFilters({})
    );

    expect(result.map((document) => document.id)).toEqual(['DDT-vecchio', 'DDT-recente']);
  });

  it('trova fatture per targa e permette di tornare all’ordine contabile', () => {
    const fn = documentFixture({
      id: 'DDT-FN',
      registeredAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-07-31T07:24:15.000Z',
      plate: 'ZZ101ZZ',
      tractorId: 'tractor-fn'
    });
    const fx = documentFixture({
      id: 'DDT-FX',
      registeredAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-30T16:00:00.000Z',
      plate: 'ZZ102ZZ',
      tractorId: 'tractor-fx'
    });

    const searched = filterAndSortExpenseDocuments(
      [fn, fx],
      normalizeExpenseDocumentListFilters({ q: 'zz101zz' })
    );
    const accountingOrder = filterAndSortExpenseDocuments(
      [fn, fx],
      normalizeExpenseDocumentListFilters({ sort: 'documentDate' })
    );

    expect(searched.map((document) => document.id)).toEqual(['DDT-FN']);
    expect(accountingOrder.map((document) => document.id)).toEqual(['DDT-FX', 'DDT-FN']);
  });

  it('trova una manutenzione anche cercando i km del mezzo', () => {
    const document = documentFixture({
      id: 'DDT-KM',
      registeredAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-31T08:00:00.000Z',
      plate: 'ZZ104ZZ',
      tractorId: 'tractor-gk',
      odometerKm: 260778
    });

    const result = filterAndSortExpenseDocuments(
      [document],
      normalizeExpenseDocumentListFilters({ q: '260778' })
    );

    expect(result.map((item) => item.id)).toEqual(['DDT-KM']);
  });
});
