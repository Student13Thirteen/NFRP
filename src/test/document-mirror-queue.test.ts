import { EntityType, VehicleLifecycleStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createMany: vi.fn(),
  deleteFile: vi.fn(),
  findDocument: vi.fn(),
  moveFile: vi.fn(),
  readStoredPdf: vi.fn(),
  uploadFile: vi.fn()
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    document: { findUnique: mocks.findDocument },
    documentMirrorJob: {
      create: mocks.create,
      createMany: mocks.createMany
    }
  }
}));

vi.mock('@/lib/documents', () => ({ documentInclude: {} }));
vi.mock('@/lib/env', () => ({
  getDocumentMirrorEnabled: () => true,
  getDocumentMirrorNextcloudBaseUrl: () => 'https://cloud.example.test',
  getDocumentMirrorNextcloudFolder: () => 'NFRP',
  getDocumentMirrorNextcloudPassword: () => 'secret',
  getDocumentMirrorNextcloudUser: () => 'worker'
}));
vi.mock('@/lib/files', () => ({ readStoredPdf: mocks.readStoredPdf }));
vi.mock('@/lib/nextcloud-webdav', () => ({
  deleteNextcloudFile: mocks.deleteFile,
  moveNextcloudFile: mocks.moveFile,
  uploadNextcloudFile: mocks.uploadFile
}));

import {
  executeQueuedDocumentMirrorOperation,
  getDocumentMirrorRemotePath,
  type MirrorDocument
} from '@/lib/document-mirror';
import { enqueueDocumentMirrorSyncs } from '@/lib/document-mirror-queue';

const disposedTrailerDocument = {
  id: 'doc-1',
  title: 'Assicurazione XA040JV',
  documentTypeId: 'type-1',
  documentType: { id: 'type-1', name: 'Assicurazione' },
  entityType: EntityType.TRAILER,
  driverId: null,
  driver: null,
  tractorId: null,
  tractor: null,
  trailerId: 'trailer-1',
  trailer: { id: 'trailer-1', plate: 'XA040JV', lifecycleStatus: VehicleLifecycleStatus.SOLD },
  otherEntityId: null,
  otherEntity: null,
  issueDate: null,
  expiryDate: new Date('2026-12-31T00:00:00.000Z'),
  noticeDays: 30,
  notes: null,
  status: 'ARCHIVED',
  filePath: 'documents/doc-1.pdf',
  originalFileName: 'polizza.pdf',
  fileSize: 100,
  mimeType: 'application/pdf',
  renewedFromId: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-21T00:00:00.000Z')
} as MirrorDocument;

describe('document mirror queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findDocument.mockResolvedValue(disposedTrailerDocument);
    mocks.readStoredPdf.mockResolvedValue({ fileBuffer: Buffer.from('pdf') });
    mocks.createMany.mockResolvedValue({ count: 1 });
  });

  it('uses a WebDAV move without uploading the PDF when only its classification changes', async () => {
    mocks.moveFile.mockResolvedValue(true);

    await executeQueuedDocumentMirrorOperation({
      documentId: disposedTrailerDocument.id,
      operation: 'SYNC',
      previousRemotePath: 'NFRP/Documenti attivi/Documenti semirimorchi/XA040JV/polizza.pdf',
      uploadRequired: false
    });

    expect(mocks.moveFile).toHaveBeenCalledOnce();
    expect(mocks.readStoredPdf).not.toHaveBeenCalled();
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });

  it('uploads the current PDF when the source path is missing during a move', async () => {
    mocks.moveFile.mockResolvedValue(false);

    await executeQueuedDocumentMirrorOperation({
      documentId: disposedTrailerDocument.id,
      operation: 'SYNC',
      previousRemotePath: 'NFRP/Documenti attivi/Documenti semirimorchi/XA040JV/polizza.pdf',
      uploadRequired: false
    });

    expect(mocks.readStoredPdf).toHaveBeenCalledWith(disposedTrailerDocument.filePath);
    expect(mocks.uploadFile).toHaveBeenCalledOnce();
  });

  it('stores lightweight persistent jobs with the previous remote path', async () => {
    const client = {
      documentMirrorJob: { createMany: mocks.createMany }
    } as unknown as Parameters<typeof enqueueDocumentMirrorSyncs>[0];

    await enqueueDocumentMirrorSyncs(client, [{
      documentId: disposedTrailerDocument.id,
      previousDocument: disposedTrailerDocument,
      uploadRequired: false
    }]);

    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [{
        documentId: disposedTrailerDocument.id,
        operation: 'SYNC',
        previousRemotePath: getDocumentMirrorRemotePath(disposedTrailerDocument),
        uploadRequired: false
      }]
    });
  });
});
