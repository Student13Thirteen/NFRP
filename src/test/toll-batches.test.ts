import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TollEntryStatus } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  batchFindMany: vi.fn(),
  entryGroupBy: vi.fn()
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    tollImportBatch: { findMany: mocks.batchFindMany },
    tollEntry: { groupBy: mocks.entryGroupBy }
  }
}));

import {
  getTollBatchState,
  getTollBatchStateLabel,
  getTollBatchSummaries,
  tollBatchMatchesSearch
} from '@/lib/toll-batches';

describe('toll invoice summaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives a clear workflow state from aggregate counts', () => {
    expect(getTollBatchState({ confirmedCount: 0, entryCount: 0, pendingCount: 0, reviewCount: 0 })).toBe('discarded');
    expect(getTollBatchState({ confirmedCount: 7, entryCount: 10, pendingCount: 2, reviewCount: 1 })).toBe('pending');
    expect(getTollBatchState({ confirmedCount: 10, entryCount: 10, pendingCount: 0, reviewCount: 1 })).toBe('needs_review');
    expect(getTollBatchState({ confirmedCount: 10, entryCount: 10, pendingCount: 0, reviewCount: 0 })).toBe('confirmed');
    expect(getTollBatchState({ confirmedCount: 0, entryCount: 10, pendingCount: 0, reviewCount: 0 })).toBe('discarded');
  });

  it('uses user-facing Italian labels for every state', () => {
    expect(getTollBatchStateLabel('pending')).toBe('Da confermare');
    expect(getTollBatchStateLabel('needs_review')).toBe('Con avvisi');
    expect(getTollBatchStateLabel('confirmed')).toBe('Confermato');
    expect(getTollBatchStateLabel('discarded')).toBe('Scartato');
  });

  it('searches invoice metadata with accents and multiple tokens normalized', () => {
    const batch = {
      customerCode: 'Cliente 42',
      invoiceNumber: 'IT-VFS26051673',
      originalFileName: 'Giugno 2026.csv',
      providerName: 'Autostrade per l’Italia'
    };

    expect(tollBatchMatchesSearch(batch, 'giugno 26051673')).toBe(true);
    expect(tollBatchMatchesSearch(batch, 'ITALIA cliente')).toBe(true);
    expect(tollBatchMatchesSearch(batch, 'maggio')).toBe(false);
    expect(tollBatchMatchesSearch(batch, '')).toBe(true);
  });

  it('mantiene i totali originali del file ma separa importo e conteggio scartati', async () => {
    const now = new Date('2026-08-17T00:00:00.000Z');
    mocks.batchFindMany.mockResolvedValue([{
      id: 'batch-1',
      filePath: '/tmp/tolls.csv',
      originalFileName: 'tolls.csv',
      fileSize: 10,
      mimeType: 'text/csv',
      providerName: 'Autostrade',
      customerCode: null,
      invoiceNumber: 'F-1',
      invoiceDate: now,
      importedRows: 10,
      duplicateRows: 0,
      skippedRows: 0,
      totalNetCents: 1_000,
      totalVatCents: 220,
      totalGrossCents: 1_220,
      notes: null,
      createdAt: now,
      updatedAt: now
    }]);
    mocks.entryGroupBy
      .mockResolvedValueOnce([{
        importBatchId: 'batch-1',
        _count: { _all: 10 },
        _sum: { distanceKm: 100, netAmountCents: 1_000, vatAmountCents: 220, grossAmountCents: 1_220 },
        _min: { tollDate: now },
        _max: { tollDate: now }
      }])
      .mockResolvedValueOnce([
        { importBatchId: 'batch-1', status: TollEntryStatus.OK, _count: { _all: 6 }, _sum: { grossAmountCents: 732 } },
        { importBatchId: 'batch-1', status: TollEntryStatus.DISCARDED, _count: { _all: 4 }, _sum: { grossAmountCents: 488 } }
      ])
      .mockResolvedValueOnce([]);

    const [summary] = await getTollBatchSummaries();

    expect(summary).toMatchObject({
      entryCount: 10,
      storedGrossCents: 1_220,
      discardedCount: 4,
      discardedGrossCents: 488,
      confirmedCount: 6
    });
  });
});
