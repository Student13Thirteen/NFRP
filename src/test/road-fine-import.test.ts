import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  roadFineFindUnique: vi.fn(),
  roadFineFindFirst: vi.fn(),
  roadFineCreate: vi.fn(),
  roadFineUpdate: vi.fn(),
  attachmentFindUnique: vi.fn(),
  tractorFindFirst: vi.fn(),
  trailerFindFirst: vi.fn(),
  driverFindMany: vi.fn(),
  extract: vi.fn(),
  store: vi.fn(),
  remove: vi.fn()
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    roadFine: {
      findUnique: mocks.roadFineFindUnique,
      findFirst: mocks.roadFineFindFirst,
      create: mocks.roadFineCreate,
      update: mocks.roadFineUpdate
    },
    roadEventAttachment: { findUnique: mocks.attachmentFindUnique },
    tractor: { findFirst: mocks.tractorFindFirst },
    trailer: { findFirst: mocks.trailerFindFirst },
    driver: { findMany: mocks.driverFindMany }
  }
}));

vi.mock('@/lib/inbox-analysis', () => ({ extractInboxPdfTextFromBuffer: mocks.extract }));
vi.mock('@/lib/files', () => ({ storePdfBuffer: mocks.store, removeStoredPdf: mocks.remove }));

import { buildRoadFineImportKey, importRoadFinePdfFiles } from '@/lib/road-fine-import';

const fineText = `
  COMUNE DI RIVAFORTE SERVIZIO POLIZIA LOCALE VERBALE DI CONTESTAZIONE AL CODICE DELLA STRADA
  Verbale n° V/120AB/2026. Il giorno 20/07/2026 alle ore 13:34 in SP 12 Km 2 direzione Sud
  il conducente del veicolo RIMORCHIO targa ZZ123YY ha violato l'art. 142/7 del C.d.S. poichè:
  circolava oltre il limite consentito. Non è stato possibile contestare immediatamente.
  Sanzione più spese totale € 63,80 entro 5 gg. Sanzione più spese totale € 89,00 entro 60 gg.
`;

describe('acquisizione verbali PDF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.roadFineFindUnique.mockResolvedValue(null);
    mocks.roadFineFindFirst.mockResolvedValue(null);
    mocks.attachmentFindUnique.mockResolvedValue(null);
    mocks.tractorFindFirst.mockResolvedValue(null);
    mocks.trailerFindFirst.mockResolvedValue({ id: 'trailer-1' });
    mocks.driverFindMany.mockResolvedValue([]);
    mocks.extract.mockResolvedValue({ text: fineText, status: 'Testo PDF letto automaticamente.', source: 'pdf-text' });
    mocks.store.mockResolvedValue({
      filePath: 'stored.pdf',
      originalFileName: 'verbale.pdf',
      fileSize: 100,
      mimeType: 'application/pdf'
    });
    mocks.roadFineCreate.mockResolvedValue({ id: 'fine-1' });
    mocks.roadFineUpdate.mockResolvedValue({ id: 'fine-existing' });
  });

  it('usa una impronta stabile per impedire il reinvio dello stesso PDF', () => {
    expect(buildRoadFineImportKey(Buffer.from('documento'))).toBe(buildRoadFineImportKey(Buffer.from('documento')));
    expect(buildRoadFineImportKey(Buffer.from('documento'))).not.toBe(buildRoadFineImportKey(Buffer.from('altro')));
  });

  it('crea una bozza non contabile, collega soltanto il rimorchio esistente e conserva il PDF', async () => {
    const result = await importRoadFinePdfFiles([new File([Buffer.from('%PDF-test')], 'verbale.pdf', { type: 'application/pdf' })]);
    expect(result).toMatchObject({ importedDocuments: 1, supplementalDocuments: 0, duplicateDocuments: 0, errors: [], importedIds: ['fine-1'] });
    expect(mocks.tractorFindFirst).not.toHaveBeenCalled();
    expect(mocks.trailerFindFirst).toHaveBeenCalledOnce();
    expect(mocks.trailerFindFirst).toHaveBeenCalledWith({
      where: { plate: { equals: 'ZZ123YY', mode: 'insensitive' }, active: true, lifecycleStatus: 'ACTIVE' },
      select: { id: true }
    });
    expect(mocks.driverFindMany).not.toHaveBeenCalled();
    expect(mocks.roadFineCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'TO_REVIEW',
        responsibility: 'TO_ASSESS',
        source: 'IMPORT',
        trailerId: 'trailer-1',
        tractorId: null,
        driverId: null,
        notificationDate: null,
        discountedPaymentDueDate: null,
        paymentDueDate: null,
        appealDueDate: null,
        paidAmountCents: null,
        paymentDate: null,
        reducedAmountCents: 6380,
        standardAmountCents: 8900,
        attachments: { create: expect.objectContaining({ kind: 'NOTICE', filePath: 'stored.pdf', contentHash: expect.stringMatching(/^road-fine:sha256:/) }) }
      }),
      select: { id: true }
    });
  });

  it('ignora un duplicato per hash prima di estrarre o salvare il PDF', async () => {
    mocks.roadFineFindUnique.mockResolvedValue({ id: 'fine-existing' });
    const result = await importRoadFinePdfFiles([new File([Buffer.from('%PDF-test')], 'verbale.pdf', { type: 'application/pdf' })]);
    expect(result).toMatchObject({ importedDocuments: 0, duplicateDocuments: 1, importedIds: ['fine-existing'] });
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.roadFineCreate).not.toHaveBeenCalled();
  });

  it('conserva un PDF diverso riferito allo stesso verbale come allegato supplementare', async () => {
    mocks.roadFineFindFirst.mockResolvedValue({ id: 'fine-existing' });
    const result = await importRoadFinePdfFiles([new File([Buffer.from('%PDF-new-scan')], 'integrazione.pdf', { type: 'application/pdf' })]);
    expect(result).toMatchObject({
      importedDocuments: 0,
      supplementalDocuments: 1,
      duplicateDocuments: 0,
      importedIds: ['fine-existing']
    });
    expect(mocks.roadFineCreate).not.toHaveBeenCalled();
    expect(mocks.roadFineUpdate).toHaveBeenCalledWith({
      where: { id: 'fine-existing' },
      data: {
        attachments: { create: expect.objectContaining({ filePath: 'stored.pdf', kind: 'NOTICE', contentHash: expect.stringMatching(/^road-fine:sha256:/) }) },
        revisions: { create: expect.objectContaining({ event: 'ATTACHMENT_IMPORTED' }) }
      },
      select: { id: true }
    });
  });

  it('mantiene vuoti i campi non letti e crea comunque una bozza validabile', async () => {
    mocks.extract.mockResolvedValue({
      text: 'VERBALE DI VIOLAZIONE AL CODICE DELLA STRADA. Verbale n° X/12/2026. Violazione da controllare.',
      status: 'OCR parziale.',
      source: 'ocr'
    });
    const result = await importRoadFinePdfFiles([new File([Buffer.from('%PDF-partial')], 'parziale.pdf', { type: 'application/pdf' })]);
    expect(result.importedDocuments).toBe(1);
    expect(mocks.roadFineCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'TO_REVIEW',
        authority: null,
        violationDate: null,
        location: null,
        description: null
      }),
      select: { id: true }
    });
  });
});
