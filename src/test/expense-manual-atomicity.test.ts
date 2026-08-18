import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  existingFindUnique: vi.fn(),
  create: vi.fn(),
  confirmInTransaction: vi.fn()
}));

const tx = {
  expenseDocument: {
    create: mocks.create
  }
};

vi.mock('@/lib/db', () => ({
  prisma: {
    expenseDocument: { findUnique: mocks.existingFindUnique },
    $transaction: mocks.transaction
  }
}));

vi.mock('@/lib/expense-confirm', () => ({
  confirmExpenseDocumentInTransaction: mocks.confirmInTransaction
}));

import { createExpenseDocumentFromForm } from '@/lib/expense-form';

function manualExpenseForm(unitPrice = '100,00'): FormData {
  const formData = new FormData();
  formData.set('submissionKey', '22222222-2222-4222-8222-222222222222');
  formData.set('registeredAt', '2026-08-17');
  formData.append('lineKey', 'line-0');
  formData.append('lineDescription', 'Filtro olio');
  formData.append('lineCode', 'FO-1');
  formData.append('lineQuantity', '1');
  formData.append('lineUnit', 'pz');
  formData.append('lineUnitPrice', unitPrice);
  formData.append('lineVatRate', '22');
  formData.append('lineCategoryId', '');
  formData.append('lineAllocationLineKey', 'line-0');
  formData.append('lineAllocationQuantity', '1');
  formData.append('lineAllocationKey', 'GENERIC');
  formData.append('lineAllocationOdometerKm', '');
  return formData;
}

describe('fattura/DDT manuale atomica e idempotente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existingFindUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 'expense-1' });
    mocks.transaction.mockImplementation((callback) => callback(tx));
  });

  it('crea e conferma usando lo stesso client transazionale', async () => {
    await expect(createExpenseDocumentFromForm(manualExpenseForm())).resolves.toBe('expense-1');

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.confirmInTransaction).toHaveBeenCalledWith(tx, 'expense-1');
  });

  it('restituisce il record del medesimo invio senza crearne un altro', async () => {
    mocks.existingFindUnique.mockResolvedValue({ id: 'expense-existing' });

    await expect(createExpenseDocumentFromForm(manualExpenseForm())).resolves.toBe('expense-existing');

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('crea una chiave diversa se la pagina torna indietro con dati modificati', async () => {
    mocks.create.mockResolvedValueOnce({ id: 'expense-1' }).mockResolvedValueOnce({ id: 'expense-2' });

    await createExpenseDocumentFromForm(manualExpenseForm('100,00'));
    await createExpenseDocumentFromForm(manualExpenseForm('125,00'));

    const importKeys = mocks.create.mock.calls.map(([input]) => input.data.importKey);
    expect(importKeys[0]).not.toBe(importKeys[1]);
    expect(importKeys.every((key) => key.startsWith('manual:22222222-2222-4222-8222-222222222222:'))).toBe(true);
  });
});
