import { EntityType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { analyzeInboxPdfExtraction, type ReferenceData } from '@/lib/inbox-analysis';

const timestamp = new Date('2026-01-01T00:00:00.000Z');

function referenceData(): ReferenceData {
  return {
    documentTypes: [
      {
        id: 'tachograph-update',
        name: 'Aggiornamento tachigrafo digitale',
        suggestedEntityType: EntityType.TRACTOR,
        defaultNoticeDays: 30,
        expiryRequired: false,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: 'tachograph-inspection',
        name: 'Revisione cronotachigrafo',
        suggestedEntityType: EntityType.TRACTOR,
        defaultNoticeDays: 30,
        expiryRequired: true,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    drivers: [],
    tractors: [
      {
        id: 'tractor-demo',
        plate: 'ZZ105ZZ',
        brand: 'Mercedes',
        model: '1851',
        notes: null,
        active: true,
        lifecycleStatus: 'ACTIVE',
        lifecycleEndedAt: null,
        assignedDriverId: null,
        vehicleType: null,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    trailers: [],
    otherEntities: [],
    barratoRosaExpiries: []
  };
}

describe('inbox aggiornamento tachigrafo digitale', () => {
  it('riconosce una fattura sintetica come evidenza del trattore senza inventare una scadenza', () => {
    const analysis = analyzeInboxPdfExtraction(
      { originalFileName: 'COPIA FATTURA 712 NFRP SRL.PDF' },
      {
        source: 'pdf-text',
        status: 'Testo PDF letto automaticamente.',
        text: `
          FATTURAOFFICINA(IMMEDIATA)
          7123/07/20261
          Num. commessa 1444 del 3/07/26
          MERCEDES1851ZZ105ZZC07271579.208
          INTERVENTO A- AGGIORNAMENTO TACHIGRAFO
          DTCO1CAGGIORNAMENTO TACHIGRAFO N.1 85,00 22 Cliente
        `
      },
      referenceData()
    );

    expect(analysis.suggestedDocumentTypeId).toBe('tachograph-update');
    expect(analysis.suggestedEntityType).toBe(EntityType.TRACTOR);
    expect(analysis.suggestedEntityId).toBe('tractor-demo');
    expect(analysis.suggestedIssueDate?.toISOString()).toBe('2026-07-03T00:00:00.000Z');
    expect(analysis.suggestedExpiryDate).toBeNull();
    expect(analysis.analysisNotes).toContain('non prevede una scadenza');
  });

  it('non associa mai questo tipo a un semirimorchio con la stessa evidenza', () => {
    const data = referenceData();
    data.tractors = [];
    data.trailers = [
      {
        id: 'trailer-demo',
        plate: 'ZZ105ZZ',
        brand: null,
        model: null,
        notes: null,
        active: true,
        lifecycleStatus: 'ACTIVE',
        lifecycleEndedAt: null,
        assignedTractorId: null,
        bodyType: null,
        tankCargo: null,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ];

    const analysis = analyzeInboxPdfExtraction(
      { originalFileName: 'fattura.pdf' },
      {
        source: 'ocr',
        status: 'Testo OCR letto automaticamente.',
        text: 'TARGA ZZ105ZZ DTCO1C INTERVENTO A AGGIORNAMENTO TACHIGRAFO'
      },
      data
    );

    expect(analysis.suggestedDocumentTypeId).toBe('tachograph-update');
    expect(analysis.suggestedEntityType).toBeNull();
    expect(analysis.suggestedEntityId).toBeNull();
  });
});
