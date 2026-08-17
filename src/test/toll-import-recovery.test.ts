import { describe, expect, it } from 'vitest';
import { TollEntryStatus } from '@prisma/client';
import { summarizeTollDuplicateRecovery } from '@/lib/toll-import-recovery';

describe('recupero reimport pedaggi scartati', () => {
  it('rimanda ai file originali quando tutte le righe erano gia presenti', () => {
    expect(summarizeTollDuplicateRecovery(
      ['source-1', 'source-2'],
      [
        { sourceKey: 'source-1', status: TollEntryStatus.DISCARDED, importBatchId: 'batch-1' },
        { sourceKey: 'source-2', status: TollEntryStatus.DISCARDED, importBatchId: 'batch-1' }
      ]
    )).toEqual({
      allRowsAlreadyPresent: true,
      recoverableBatchIds: ['batch-1'],
      recoverableDiscardedRows: 2
    });
  });

  it('distingue duplicati confermati e righe nuove da quelle recuperabili', () => {
    expect(summarizeTollDuplicateRecovery(
      ['source-1', 'source-2', 'source-3'],
      [
        { sourceKey: 'source-1', status: TollEntryStatus.OK, importBatchId: 'batch-1' },
        { sourceKey: 'source-2', status: TollEntryStatus.DISCARDED, importBatchId: 'batch-2' }
      ]
    )).toEqual({
      allRowsAlreadyPresent: false,
      recoverableBatchIds: ['batch-2'],
      recoverableDiscardedRows: 1
    });
  });
});
