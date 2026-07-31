import { describe, expect, it } from 'vitest';
import { getTollBatchState, getTollBatchStateLabel, tollBatchMatchesSearch } from '@/lib/toll-batches';

describe('toll invoice summaries', () => {
  it('derives a clear workflow state from aggregate counts', () => {
    expect(getTollBatchState({ entryCount: 0, pendingCount: 0, reviewCount: 0 })).toBe('discarded');
    expect(getTollBatchState({ entryCount: 10, pendingCount: 2, reviewCount: 1 })).toBe('pending');
    expect(getTollBatchState({ entryCount: 10, pendingCount: 0, reviewCount: 1 })).toBe('needs_review');
    expect(getTollBatchState({ entryCount: 10, pendingCount: 0, reviewCount: 0 })).toBe('confirmed');
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
});
