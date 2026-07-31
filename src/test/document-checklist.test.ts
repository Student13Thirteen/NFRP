import { describe, expect, it } from 'vitest';
import { buildDocumentChecklist } from '@/lib/document-checklist';

describe('document checklist', () => {
  const firstExpiry = new Date('2026-06-21T00:00:00.000Z');
  const secondExpiry = new Date('2027-06-21T00:00:00.000Z');
  const documentTypes = [
    { id: 'insurance', name: 'Assicurazione' },
    { id: 'port-permit', name: 'Permesso porto' },
    { id: 'inspection', name: 'Revisione' }
  ];

  it('counts inserted, missing and excluded document types', () => {
    const checklist = buildDocumentChecklist(
      documentTypes,
      [
        { id: 'old-insurance', documentTypeId: 'insurance', expiryDate: firstExpiry, filePath: 'old.pdf' },
        { id: 'new-insurance', documentTypeId: 'insurance', expiryDate: secondExpiry, filePath: null }
      ],
      [{ documentTypeId: 'port-permit' }]
    );

    expect(checklist).toMatchObject({
      total: 3,
      inserted: 1,
      missing: 1,
      excluded: 1
    });
    expect(checklist.items).toEqual([
      {
        id: 'insurance',
        name: 'Assicurazione',
        insertedCount: 2,
        latestDocument: {
          id: 'new-insurance',
          expiryDate: secondExpiry,
          hasFile: false
        },
        status: 'inserted'
      },
      { id: 'port-permit', name: 'Permesso porto', insertedCount: 0, latestDocument: null, status: 'excluded' },
      { id: 'inspection', name: 'Revisione', insertedCount: 0, latestDocument: null, status: 'missing' }
    ]);
  });

  it('treats an inserted document as present even if it had been excluded before', () => {
    const checklist = buildDocumentChecklist(
      [{ id: 'adr', name: 'Barrato rosa' }],
      [{ id: 'adr-document', documentTypeId: 'adr', expiryDate: firstExpiry, filePath: 'adr.pdf' }],
      [{ documentTypeId: 'adr' }]
    );

    expect(checklist.items[0]).toMatchObject({
      insertedCount: 1,
      latestDocument: {
        id: 'adr-document',
        hasFile: true
      },
      status: 'inserted'
    });
    expect(checklist.excluded).toBe(0);
  });
});
