import { describe, expect, it } from 'vitest';
import { DocumentStatus } from '@prisma/client';
import { isHistoricalDocument, splitDocumentsByLifecycle } from '@/lib/documents';

function document(status: DocumentStatus, id: string) {
  return { id, status };
}

describe('separazione documenti correnti e storici nella scheda mezzo', () => {
  it('tiene fra i correnti anche i documenti scaduti non ancora rinnovati', () => {
    const { current, historical } = splitDocumentsByLifecycle([
      document(DocumentStatus.VALID, 'a'),
      document(DocumentStatus.EXPIRING, 'b'),
      document(DocumentStatus.EXPIRED, 'c'),
      document(DocumentStatus.RENEWED, 'd'),
      document(DocumentStatus.ARCHIVED, 'e')
    ]);

    expect(current.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(historical.map((item) => item.id)).toEqual(['d', 'e']);
  });

  it('considera storici solo rinnovati e archiviati', () => {
    expect(isHistoricalDocument({ status: DocumentStatus.RENEWED })).toBe(true);
    expect(isHistoricalDocument({ status: DocumentStatus.ARCHIVED })).toBe(true);
    expect(isHistoricalDocument({ status: DocumentStatus.EXPIRED })).toBe(false);
    expect(isHistoricalDocument({ status: DocumentStatus.VALID })).toBe(false);
  });

  it('conserva l ordine di partenza dentro i due gruppi', () => {
    const { current, historical } = splitDocumentsByLifecycle([
      document(DocumentStatus.RENEWED, '1'),
      document(DocumentStatus.VALID, '2'),
      document(DocumentStatus.RENEWED, '3'),
      document(DocumentStatus.VALID, '4')
    ]);

    expect(current.map((item) => item.id)).toEqual(['2', '4']);
    expect(historical.map((item) => item.id)).toEqual(['1', '3']);
  });

  it('non rompe una scheda senza documenti', () => {
    expect(splitDocumentsByLifecycle([])).toEqual({ current: [], historical: [] });
  });
});
