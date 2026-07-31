import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findFuelEntry: vi.fn(),
  deleteFuelEntry: vi.fn(),
  recalculateFuelMetrics: vi.fn(),
  revalidatePath: vi.fn(),
  setFlashMessage: vi.fn(),
  redirect: vi.fn()
}));

vi.mock('@/lib/auth', () => ({
  requireUser: mocks.requireUser
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    fuelEntry: {
      findUnique: mocks.findFuelEntry,
      delete: mocks.deleteFuelEntry
    }
  }
}));

vi.mock('@/lib/fuel-import', () => ({
  recalculateFuelMetricsForPlates: mocks.recalculateFuelMetrics
}));

vi.mock('@/lib/flash', () => ({
  setFlashMessage: mocks.setFlashMessage
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect
}));

import { deleteFuelEntryAction } from '@/app/(protected)/fuel/actions';

describe('Server Action authentication boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  it('stops a direct anonymous invocation before any protected read or mutation', async () => {
    mocks.requireUser.mockRejectedValue(new Error('AUTH_REQUIRED'));

    await expect(deleteFuelEntryAction('synthetic-entry')).rejects.toThrow('AUTH_REQUIRED');

    expect(mocks.findFuelEntry).not.toHaveBeenCalled();
    expect(mocks.deleteFuelEntry).not.toHaveBeenCalled();
    expect(mocks.recalculateFuelMetrics).not.toHaveBeenCalled();
  });

  it('preserves the operation for an authenticated user', async () => {
    mocks.requireUser.mockResolvedValue({
      id: 'synthetic-user',
      email: 'user@example.invalid',
      role: 'ADMIN'
    });
    mocks.findFuelEntry.mockResolvedValue({
      id: 'synthetic-entry',
      plate: 'TEST-PLATE'
    });
    mocks.deleteFuelEntry.mockResolvedValue({ id: 'synthetic-entry' });

    await expect(deleteFuelEntryAction('synthetic-entry')).rejects.toThrow('NEXT_REDIRECT');

    expect(mocks.deleteFuelEntry).toHaveBeenCalledWith({ where: { id: 'synthetic-entry' } });
    expect(mocks.recalculateFuelMetrics).toHaveBeenCalledOnce();
    expect(mocks.setFlashMessage).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/fuel');
  });
});
