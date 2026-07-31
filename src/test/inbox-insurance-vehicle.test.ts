import { describe, expect, it } from 'vitest';
import { EntityType } from '@prisma/client';
import {
  analyzeInboxPdfExtraction,
  findInboxFleetPlate,
  findInsuranceVehicleSuggestion,
  type ReferenceData
} from '@/lib/inbox-analysis';

describe('insurance vehicle detection', () => {
  it('detects one contextual plate even before it exists in the fleet registry', () => {
    expect(findInboxFleetPlate('Certificato revisione estintori\nTarga automezzo: ZZ 123 YY')).toBe('ZZ123YY');
    expect(findInboxFleetPlate('Fabbricante modello: ZZ123YY')).toBeNull();
  });

  it('detects an autocarro policy as a tractor', () => {
    const suggestion = findInsuranceVehicleSuggestion(`
      TIPO VEICOLO
      00000 CITTA DEMO (ZZ)                    AUTOCARRO
      TARGA VEICOLO
      ZZ 105 ZZ
    `);

    expect(suggestion).toEqual({
      plate: 'ZZ105ZZ',
      entityType: EntityType.TRACTOR,
      evidence: 'Tipo veicolo AUTOCARRO'
    });
  });

  it('detects a rimorchio policy as a trailer', () => {
    const suggestion = findInsuranceVehicleSuggestion(`
      %%COPY_1_S% ZZ 106 ZZ RIMORCHI DEMO SRL
      TIPO VEICOLO
      00184 ROMA (RM)                          RIMORCHIO
      TARGA VEICOLO
    `);

    expect(suggestion).toEqual({
      plate: 'ZZ106ZZ',
      entityType: EntityType.TRAILER,
      evidence: 'Tipo veicolo RIMORCHIO'
    });
  });

  it('detects a demo insurance certificate tractor from the green-card category context', () => {
    const suggestion = findInsuranceVehicleSuggestion(`
      CATEGORY OF VEHICLES CODE:
      A. CAR
      C. LORRY OR TRACTOR
      F. TRAILER
      Leasing Demo S.p.A.
      Trattore stradale con ralla
      VIA ESEMPIO 7 00000 CITTA DEMO ZZ
      05/06/2026
      30/11/2026
      CAMION DEMO
      C
      ZZ103ZZ
    `);

    expect(suggestion).toEqual({
      plate: 'ZZ103ZZ',
      entityType: EntityType.TRACTOR,
      evidence: 'Tipo veicolo TRATTORE STRADALE'
    });
  });

  it('selects tractor insurance for a demo certificate before vehicle autocreation', () => {
    const referenceData = {
      documentTypes: [
        {
          id: 'tractor-insurance',
          name: 'Assicurazione Trattore',
          suggestedEntityType: EntityType.TRACTOR,
          defaultNoticeDays: 30,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z')
        },
        {
          id: 'trailer-insurance',
          name: 'Assicurazione Semirimorchio',
          suggestedEntityType: EntityType.TRAILER,
          defaultNoticeDays: 30,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z')
        }
      ],
      drivers: [],
      tractors: [],
      trailers: [],
      otherEntities: [],
      barratoRosaExpiries: []
    } satisfies ReferenceData;

    const analysis = analyzeInboxPdfExtraction(
      { originalFileName: 'ZZ103ZZ_DEMO-POLIZZA.pdf' },
      {
        source: 'pdf-text',
        status: 'Testo PDF letto automaticamente.',
        text: `
          CERTIFICATO DI ASSICURAZIONE
          Decorrenza dalle ore del
          Scadenza alle ore del
          Assicurazioni Demo Due S.p.A. Societa Benefit
          CATEGORY OF VEHICLES CODE:
          C. LORRY OR TRACTOR
          F. TRAILER
          Leasing Demo S.p.A.
          Trattore stradale con ralla
          9000000000000000001
          05/06/2026
          30/11/2026
          CAMION DEMO
          C
          ZZ103ZZ
        `
      },
      referenceData
    );

    expect(analysis.suggestedDocumentTypeId).toBe('tractor-insurance');
    expect(analysis.suggestedEntityType).toBeNull();
    expect(analysis.suggestedEntityId).toBeNull();
    expect(analysis.suggestedIssueDate?.toISOString()).toBe('2026-06-05T00:00:00.000Z');
    expect(analysis.suggestedExpiryDate?.toISOString()).toBe('2026-11-30T00:00:00.000Z');
    expect(analysis.analysisNotes).toContain('Targa non in anagrafica: ZZ103ZZ');
  });

  it('does not return a suggestion without vehicle type context', () => {
    expect(findInsuranceVehicleSuggestion('Polizza generica ZZ 105 ZZ senza tipo veicolo chiaro')).toBeNull();
  });

  it('does not attach an insurance policy to a plate found in the opposite registry', () => {
    const referenceData = {
      documentTypes: [
        {
          id: 'tractor-insurance',
          name: 'Assicurazione Trattore',
          suggestedEntityType: EntityType.TRACTOR,
          defaultNoticeDays: 30,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z')
        },
        {
          id: 'trailer-insurance',
          name: 'Assicurazione Semirimorchio',
          suggestedEntityType: EntityType.TRAILER,
          defaultNoticeDays: 30,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z')
        }
      ],
      drivers: [],
      tractors: [],
      trailers: [
        {
          id: 'existing-trailer',
          plate: 'ZZ105ZZ',
          brand: null,
          model: null,
          notes: null,
          active: true,
          lifecycleStatus: 'ACTIVE',
          lifecycleEndedAt: null,
          assignedTractorId: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z')
        }
      ],
      otherEntities: [],
      barratoRosaExpiries: []
    } satisfies ReferenceData;

    const analysis = analyzeInboxPdfExtraction(
      { originalFileName: 'ZZ 105 ZZ CONTRASSEGNO DEMO.pdf' },
      {
        source: 'pdf-text',
        status: 'Testo PDF letto automaticamente.',
        text: `
          CERTIFICATO DI ASSICURAZIONE Assicurazioni Demo Uno
          PERIODO DI ASSICURAZIONE DALLE ORE 24 DEL 01/06/2026 ALLE ORE 24 DEL 01/06/2027
          TIPO VEICOLO
          00000 CITTA DEMO (ZZ)                    AUTOCARRO
          TARGA VEICOLO
          ZZ 105 ZZ
        `
      },
      referenceData
    );

    expect(analysis.suggestedDocumentTypeId).toBe('tractor-insurance');
    expect(analysis.suggestedEntityType).toBeNull();
    expect(analysis.suggestedEntityId).toBeNull();
    expect(analysis.analysisNotes).toContain('Targa non in anagrafica: ZZ105ZZ');
  });
});
