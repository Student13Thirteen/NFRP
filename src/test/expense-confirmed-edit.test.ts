import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUnique: vi.fn(),
  updateDocument: vi.fn(),
  updateLine: vi.fn(),
  updateAllocation: vi.fn(),
  findDrivers: vi.fn(),
  findTrailers: vi.fn(),
  findAssignments: vi.fn(),
  storePdf: vi.fn(),
  removePdf: vi.fn()
}));

const tx = {
  expenseDocument: {
    findUnique: mocks.findUnique,
    updateMany: mocks.updateDocument
  },
  expenseLine: {
    update: mocks.updateLine
  },
  expenseLineAllocation: {
    update: mocks.updateAllocation
  },
  driver: {
    findMany: mocks.findDrivers
  },
  trailer: {
    findMany: mocks.findTrailers
  },
  tractorDriverAssignment: {
    findMany: mocks.findAssignments
  }
};

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: mocks.transaction
  }
}));

vi.mock('@/lib/files', () => ({
  emptyStoredPdf: () => ({ filePath: null, originalFileName: null, fileSize: null, mimeType: null }),
  removeStoredPdf: mocks.removePdf,
  storePdfFile: mocks.storePdf
}));

import { updateConfirmedExpenseDocumentDetails } from '@/lib/expense-form';

function editForm(file?: File): FormData {
  const formData = new FormData();
  formData.set('expectedUpdatedAt', '2026-08-18T08:30:00.000Z');
  formData.set('notes', 'Documento completato');
  formData.append('lineId', 'line-a');
  formData.append('lineDescription', 'Sostituzione filtro olio');
  formData.append('lineCode', 'FO-1');
  formData.append('lineNotes', 'Ricambio verificato');
  formData.append('lineId', 'line-b');
  formData.append('lineDescription', 'Manodopera officina');
  formData.append('lineCode', '');
  formData.append('lineNotes', '');
  formData.append('allocationId', 'allocation-a');
  formData.append('allocationDriverSelection', 'driver-manual');
  if (file) formData.set('file', file);
  return formData;
}

describe('modifica sicura di una manutenzione confermata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.findUnique.mockResolvedValue({
      status: 'CONFIRMED',
      updatedAt: new Date('2026-08-18T08:30:00.000Z'),
      filePath: 'vecchio.pdf',
      documentDate: new Date('2026-08-15T00:00:00.000Z'),
      registeredAt: new Date('2026-08-18T00:00:00.000Z'),
      lines: [
        {
          id: 'line-a',
          allocations: [{
            id: 'allocation-a',
            allocationType: 'TRACTOR',
            tractorId: 'tractor-1',
            trailerId: null
          }]
        },
        { id: 'line-b', allocations: [] }
      ]
    });
    mocks.updateDocument.mockResolvedValue({ count: 1 });
    mocks.updateLine.mockResolvedValue({});
    mocks.updateAllocation.mockResolvedValue({});
    mocks.findDrivers.mockResolvedValue([{ id: 'driver-manual' }]);
    mocks.findTrailers.mockResolvedValue([]);
    mocks.findAssignments.mockResolvedValue([]);
    mocks.storePdf.mockResolvedValue({
      filePath: 'nuovo.pdf',
      originalFileName: 'fattura.pdf',
      fileSize: 42,
      mimeType: 'application/pdf'
    });
    mocks.removePdf.mockResolvedValue(undefined);
  });

  it('salva descrizioni e note senza esporre campi contabili alla mutazione', async () => {
    await updateConfirmedExpenseDocumentDetails('expense-1', editForm());

    expect(mocks.updateDocument).toHaveBeenCalledWith({
      where: {
        id: 'expense-1',
        status: 'CONFIRMED',
        updatedAt: new Date('2026-08-18T08:30:00.000Z')
      },
      data: { notes: 'Documento completato' }
    });
    expect(mocks.updateLine).toHaveBeenNthCalledWith(1, {
      where: { id: 'line-a' },
      data: {
        description: 'Sostituzione filtro olio',
        code: 'FO-1',
        notes: 'Ricambio verificato'
      }
    });
    expect(mocks.updateLine).toHaveBeenNthCalledWith(2, {
      where: { id: 'line-b' },
      data: {
        description: 'Manodopera officina',
        code: null,
        notes: null
      }
    });
    expect(mocks.updateAllocation).toHaveBeenCalledWith({
      where: { id: 'allocation-a' },
      data: { driverId: 'driver-manual' }
    });
    expect(mocks.storePdf).not.toHaveBeenCalled();
    expect(mocks.removePdf).not.toHaveBeenCalled();
  });

  it('aggiunge o sostituisce il PDF e rimuove il vecchio solo dopo il salvataggio', async () => {
    const pdf = new File([Buffer.from('%PDF-1.4 test')], 'fattura.pdf', { type: 'application/pdf' });

    await updateConfirmedExpenseDocumentDetails('expense-1', editForm(pdf));

    expect(mocks.storePdf).toHaveBeenCalledWith(pdf);
    expect(mocks.updateDocument).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        filePath: 'nuovo.pdf',
        originalFileName: 'fattura.pdf'
      })
    }));
    expect(mocks.removePdf).toHaveBeenCalledWith('vecchio.pdf');
  });

  it('non sovrascrive una versione aggiornata altrove e pulisce il nuovo file', async () => {
    mocks.updateDocument.mockResolvedValue({ count: 0 });
    const pdf = new File([Buffer.from('%PDF-1.4 test')], 'fattura.pdf', { type: 'application/pdf' });

    await expect(updateConfirmedExpenseDocumentDetails('expense-1', editForm(pdf))).rejects.toThrow(
      'aggiornato da un’altra pagina'
    );

    expect(mocks.updateLine).not.toHaveBeenCalled();
    expect(mocks.updateAllocation).not.toHaveBeenCalled();
    expect(mocks.removePdf).toHaveBeenCalledWith('nuovo.pdf');
    expect(mocks.removePdf).not.toHaveBeenCalledWith('vecchio.pdf');
  });
});
