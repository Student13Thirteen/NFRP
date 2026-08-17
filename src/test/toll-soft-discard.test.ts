import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TollEntryStatus } from '@prisma/client';
import { isReportableTollEntryStatus, REPORTABLE_TOLL_ENTRY_STATUSES } from '@/lib/tolls';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations))
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    tollEntry: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany
    },
    $transaction: mocks.transaction
  }
}));

import { confirmTollEntry, discardPendingTollEntry, restoreDiscardedTollEntry } from '@/lib/toll-import';

describe('soft-discard pedaggi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('esclude in modo esplicito pending e scartati da costi, report e assistente', () => {
    expect(REPORTABLE_TOLL_ENTRY_STATUSES).toEqual([
      TollEntryStatus.OK,
      TollEntryStatus.NEEDS_REVIEW,
      TollEntryStatus.VERIFIED
    ]);
    expect(isReportableTollEntryStatus(TollEntryStatus.PENDING)).toBe(false);
    expect(isReportableTollEntryStatus(TollEntryStatus.DISCARDED)).toBe(false);
  });

  it('sposta una riga pending nello stato scartato senza cancellarla', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'toll-1', reviewReasons: null }]);
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(discardPendingTollEntry('toll-1')).resolves.toBe(1);

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['toll-1'] }, status: TollEntryStatus.PENDING },
      data: { status: TollEntryStatus.DISCARDED }
    });
  });

  it('non sovrascrive una conferma concorrente e restituisce il numero realmente scartato', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'toll-1', reviewReasons: null }]);
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(discardPendingTollEntry('toll-1')).resolves.toBe(0);

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['toll-1'] }, status: TollEntryStatus.PENDING },
      data: { status: TollEntryStatus.DISCARDED }
    });
  });

  it('ripristina soltanto righe precedentemente scartate', async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(restoreDiscardedTollEntry('toll-1')).resolves.toBe(1);

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'toll-1', status: TollEntryStatus.DISCARDED },
      data: { status: TollEntryStatus.PENDING }
    });
  });

  it('non riconferma una riga che una richiesta concorrente ha gia spostato', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'toll-1', reviewReasons: null }]);
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(confirmTollEntry('toll-1')).resolves.toBe(0);

    expect(mocks.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ['toll-1'] }, status: TollEntryStatus.PENDING },
      data: { status: TollEntryStatus.OK }
    });
    expect(mocks.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: [] }, status: TollEntryStatus.PENDING },
      data: { status: TollEntryStatus.NEEDS_REVIEW }
    });
  });
});
