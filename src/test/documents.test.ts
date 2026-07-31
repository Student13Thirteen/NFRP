import { describe, expect, it } from 'vitest';
import { DocumentStatus, EntityType } from '@prisma/client';
import {
  documentCanBeRenewalSource,
  documentMatchesStatusFilter,
  documentMatchesTypeAndEntity,
  documentMatchesPdfFilter,
  getDocumentEntityKey
} from '@/lib/documents';

describe('document filters', () => {
  const documentWithPdf = { filePath: 'document.pdf' };
  const documentWithoutPdf = { filePath: null };

  it('matches documents without a PDF when filtering missing attachments', () => {
    expect(documentMatchesPdfFilter(documentWithoutPdf, 'missing')).toBe(true);
    expect(documentMatchesPdfFilter(documentWithPdf, 'missing')).toBe(false);
  });

  it('matches documents with a PDF when filtering present attachments', () => {
    expect(documentMatchesPdfFilter(documentWithPdf, 'present')).toBe(true);
    expect(documentMatchesPdfFilter(documentWithoutPdf, 'present')).toBe(false);
  });

  it('builds entity keys from the entity-specific relation', () => {
    expect(getDocumentEntityKey({
      entityType: EntityType.TRACTOR,
      driverId: 'driver-1',
      tractorId: 'tractor-1',
      trailerId: null,
      otherEntityId: null
    })).toBe('TRACTOR:tractor-1');
  });

  it('matches replacement candidates by type and exact entity', () => {
    const document = {
      documentTypeId: 'type-1',
      entityType: EntityType.TRAILER,
      driverId: null,
      tractorId: null,
      trailerId: 'trailer-1',
      otherEntityId: null
    };

    expect(documentMatchesTypeAndEntity(document, 'type-1', EntityType.TRAILER, 'trailer-1')).toBe(true);
    expect(documentMatchesTypeAndEntity(document, 'type-1', EntityType.TRAILER, 'other-trailer')).toBe(false);
    expect(documentMatchesTypeAndEntity(document, 'type-2', EntityType.TRAILER, 'trailer-1')).toBe(false);
  });

  it('treats archived and renewed documents as historical renewal sources', () => {
    expect(documentCanBeRenewalSource({ status: DocumentStatus.VALID })).toBe(true);
    expect(documentCanBeRenewalSource({ status: DocumentStatus.RENEWED })).toBe(false);
    expect(documentCanBeRenewalSource({ status: DocumentStatus.ARCHIVED })).toBe(false);
  });

  it('filters historical documents by concrete status', () => {
    const renewedDocument = {
      expiryDate: new Date('2026-01-01T00:00:00.000Z'),
      noticeDays: 30,
      status: DocumentStatus.RENEWED
    };

    expect(documentMatchesStatusFilter(renewedDocument, DocumentStatus.RENEWED)).toBe(true);
    expect(documentMatchesStatusFilter(renewedDocument, DocumentStatus.ARCHIVED)).toBe(false);
  });
});
