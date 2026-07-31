import { describe, expect, it } from 'vitest';
import {
  inboxPageFileName,
  isInboxPageBatchCandidate,
  shouldAutoSplitInboxPageAnalyses,
  shouldSplitInboxPdfByPage
} from '@/lib/inbox-batch';

describe('separazione upload estintori in massa', () => {
  it('riconosce un fascicolo estintori indipendentemente da maiuscole e accenti', () => {
    expect(isInboxPageBatchCandidate('ESTINTORI IN MASSA.pdf')).toBe(true);
    expect(isInboxPageBatchCandidate('Certificati-estintore-luglio.pdf')).toBe(true);
  });

  it('separa solo fascicoli estintori realmente multipagina', () => {
    expect(shouldSplitInboxPdfByPage('ESTINTORI IN MASSA.pdf', 10)).toBe(true);
    expect(shouldSplitInboxPdfByPage('ESTINTORI IN MASSA.pdf', 1)).toBe(false);
    expect(shouldSplitInboxPdfByPage('libretto camion.pdf', 4)).toBe(false);
  });

  it('consente lo split esplicito quando lo scanner produce un nome generico', () => {
    expect(shouldSplitInboxPdfByPage('scan001.pdf', 10, true)).toBe(true);
    expect(shouldSplitInboxPdfByPage('scan001.pdf', 1, true)).toBe(false);
  });

  it('genera nomi autonomi e leggibili per ogni PDF pagina', () => {
    expect(inboxPageFileName('ESTINTORI IN MASSA.pdf', 7)).toBe('ESTINTORI IN MASSA-pagina-7.pdf');
  });

  it('riconosce automaticamente pagine riferite a mezzi diversi', () => {
    expect(shouldAutoSplitInboxPageAnalyses([
      {
        suggestedDocumentTypeId: 'estintori-trattore',
        suggestedEntityType: 'TRACTOR',
        suggestedEntityId: 'mezzo-1',
        suggestedIssueDate: new Date('2026-07-23'),
        suggestedExpiryDate: new Date('2027-01-31')
      },
      {
        suggestedDocumentTypeId: 'estintori-trattore',
        suggestedEntityType: 'TRACTOR',
        suggestedEntityId: 'mezzo-2',
        suggestedIssueDate: new Date('2026-07-23'),
        suggestedExpiryDate: new Date('2027-01-31')
      }
    ])).toBe(true);
  });

  it('mantiene unito un documento multipagina con la stessa identità', () => {
    const page = {
      suggestedDocumentTypeId: 'assicurazione-trattore',
      suggestedEntityType: 'TRACTOR',
      suggestedEntityId: 'mezzo-1',
      suggestedIssueDate: new Date('2026-06-01'),
      suggestedExpiryDate: new Date('2026-12-31')
    };

    expect(shouldAutoSplitInboxPageAnalyses([
      page,
      {
        ...page,
        suggestedIssueDate: null
      }
    ])).toBe(false);
  });

  it('non divide automaticamente se anche una sola pagina è ambigua', () => {
    expect(shouldAutoSplitInboxPageAnalyses([
      {
        suggestedDocumentTypeId: 'libretto',
        suggestedEntityType: 'TRACTOR',
        suggestedEntityId: 'mezzo-1',
        suggestedIssueDate: null,
        suggestedExpiryDate: new Date('2027-01-31')
      },
      {
        suggestedDocumentTypeId: null,
        suggestedEntityType: null,
        suggestedEntityId: null,
        suggestedIssueDate: null,
        suggestedExpiryDate: null
      }
    ])).toBe(false);
  });

  it('può separare targhe diverse anche prima dell’associazione anagrafica', () => {
    expect(shouldAutoSplitInboxPageAnalyses([
      {
        suggestedDocumentTypeId: 'estintori-trattore',
        suggestedEntityType: null,
        suggestedEntityId: null,
        suggestedIssueDate: new Date('2026-07-23'),
        suggestedExpiryDate: new Date('2027-01-31'),
        detectedPlate: 'AA111BB'
      },
      {
        suggestedDocumentTypeId: 'estintori-trattore',
        suggestedEntityType: null,
        suggestedEntityId: null,
        suggestedIssueDate: new Date('2026-07-23'),
        suggestedExpiryDate: new Date('2027-01-31'),
        detectedPlate: 'CC222DD'
      }
    ])).toBe(true);
  });
});
