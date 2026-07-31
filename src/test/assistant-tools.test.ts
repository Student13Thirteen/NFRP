import { DocumentStatus, EntityType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { buildDocumentFilterHref, buildSearchDocumentsWhere } from '@/lib/assistant-tools';
import { getOperationalFleetDocumentWhere } from '@/lib/vehicle-lifecycle';

describe('assistant document queries', () => {
  it('builds a controlled Prisma where clause for expiring tractor insurance without PDF', () => {
    const where = buildSearchDocumentsWhere(
      {
        plate: 'zz 101 zz',
        documentTypeName: 'Assicurazione',
        status: 'expiring',
        withinDays: 30,
        missingPdf: true,
        entityType: 'TRACTOR'
      },
      new Date('2026-05-25T12:00:00.000Z')
    );

    expect(where).toEqual({
      AND: [
        getOperationalFleetDocumentWhere(),
        { status: { notIn: [DocumentStatus.ARCHIVED, DocumentStatus.RENEWED] } },
        {
          expiryDate: {
            gte: new Date('2026-05-25T00:00:00.000Z'),
            lte: new Date('2026-06-24T00:00:00.000Z')
          }
        },
        { filePath: null },
        { entityType: EntityType.TRACTOR },
        {
          documentType: {
            name: {
              contains: 'Assicurazione',
              mode: 'insensitive'
            }
          }
        },
        {
          OR: [
            { tractor: { plate: { contains: 'ZZ101ZZ', mode: 'insensitive' } } },
            { trailer: { plate: { contains: 'ZZ101ZZ', mode: 'insensitive' } } }
          ]
        }
      ]
    });
  });

  it('keeps archived and renewed documents isolated when inactive status is requested', () => {
    expect(buildSearchDocumentsWhere({ status: 'inactive' }, new Date('2026-05-25T12:00:00.000Z'))).toEqual({
      AND: [
        getOperationalFleetDocumentWhere(),
        { status: { in: [DocumentStatus.ARCHIVED, DocumentStatus.RENEWED] } }
      ]
    });
  });

  it('builds document links with existing archive query parameters', () => {
    const href = buildDocumentFilterHref({
      plate: 'XA123XX',
      documentTypeName: 'Assicurazione',
      status: 'expiring',
      withinDays: 30,
      missingPdf: true,
      entityType: 'TRAILER'
    });

    expect(href).toBe('/documents?q=XA123XX+Assicurazione+Semirimorchio&status=within30&pdf=missing');
  });
});
