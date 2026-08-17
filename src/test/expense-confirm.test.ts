import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  findLines: vi.fn(),
  transaction: vi.fn()
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: mocks.transaction
  }
}));

vi.mock('@/lib/files', () => ({
  removeStoredPdf: vi.fn()
}));

import { confirmExpenseDocument } from '@/lib/expense-confirm';

describe('confirmExpenseDocument idempotente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback({
      expenseDocument: {
        updateMany: mocks.updateMany,
        findUnique: mocks.findUnique
      },
      expenseLine: {
        findMany: mocks.findLines
      }
    }));
  });

  it('non materializza di nuovo un documento già confermato', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue({ status: 'CONFIRMED' });

    await expect(confirmExpenseDocument('expense-confirmed')).resolves.toBeUndefined();

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'expense-confirmed', status: 'PENDING' },
      data: { status: 'CONFIRMED' }
    });
    expect(mocks.findLines).not.toHaveBeenCalled();
  });
});
