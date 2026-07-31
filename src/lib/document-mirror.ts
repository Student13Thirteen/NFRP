import 'server-only';

import path from 'node:path';
import { DocumentStatus, EntityType, VehicleLifecycleStatus, type Document, type DocumentType, type Driver, type OtherEntity, type Tractor, type Trailer } from '@prisma/client';
import {
  getDocumentMirrorEnabled,
  getDocumentMirrorNextcloudBaseUrl,
  getDocumentMirrorNextcloudFolder,
  getDocumentMirrorNextcloudPassword,
  getDocumentMirrorNextcloudUser
} from '@/lib/env';
import { prisma } from '@/lib/db';
import { documentInclude } from '@/lib/documents';
import { readStoredPdf } from '@/lib/files';
import { deleteNextcloudFile, moveNextcloudFile, uploadNextcloudFile } from '@/lib/nextcloud-webdav';

export type MirrorDocument = Document & {
  documentType: DocumentType;
  driver: Driver | null;
  tractor: Tractor | null;
  trailer: Trailer | null;
  otherEntity: OtherEntity | null;
};

function cleanPathSegment(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 110) || 'Senza nome';
}

function cleanFileName(value: string): string {
  const extension = path.extname(value).toLowerCase() || '.pdf';
  const nameWithoutExtension = extension && value.toLowerCase().endsWith(extension)
    ? value.slice(0, -extension.length)
    : value;
  const base = cleanPathSegment(nameWithoutExtension).slice(0, 100);
  return `${base}${extension}`;
}

function formatDatePart(date: Date | null): string {
  if (!date) return 'senza-data';
  return date.toISOString().slice(0, 10);
}

function entityFolder(document: MirrorDocument): { category: string; entityName: string } {
  if (document.entityType === EntityType.TRACTOR) {
    const lifecycleCategory = document.tractor?.lifecycleStatus === VehicleLifecycleStatus.SOLD
      ? 'Trattori venduti'
      : document.tractor?.lifecycleStatus === VehicleLifecycleStatus.SCRAPPED
        ? 'Trattori rottamati'
        : 'Documenti trattori';
    return {
      category: lifecycleCategory,
      entityName: document.tractor?.plate || 'Trattore senza targa'
    };
  }

  if (document.entityType === EntityType.TRAILER) {
    const lifecycleCategory = document.trailer?.lifecycleStatus === VehicleLifecycleStatus.SOLD
      ? 'Semirimorchi venduti'
      : document.trailer?.lifecycleStatus === VehicleLifecycleStatus.SCRAPPED
        ? 'Semirimorchi rottamati'
        : 'Documenti semirimorchi';
    return {
      category: lifecycleCategory,
      entityName: document.trailer?.plate || 'Semirimorchio senza targa'
    };
  }

  if (document.entityType === EntityType.DRIVER) {
    return {
      category: 'Documenti autisti',
      entityName: document.driver ? `${document.driver.lastName} ${document.driver.firstName}` : 'Autista eliminato'
    };
  }

  return {
    category: 'Documenti altri',
    entityName: document.otherEntity ? `${document.otherEntity.category} - ${document.otherEntity.name}` : 'Altro eliminato'
  };
}

function statusRoot(document: MirrorDocument): string {
  const disposedVehicle =
    document.tractor?.lifecycleStatus === VehicleLifecycleStatus.SOLD ||
    document.tractor?.lifecycleStatus === VehicleLifecycleStatus.SCRAPPED ||
    document.trailer?.lifecycleStatus === VehicleLifecycleStatus.SOLD ||
    document.trailer?.lifecycleStatus === VehicleLifecycleStatus.SCRAPPED;
  if (disposedVehicle) return 'Documenti vecchi (mezzi venduti o rottamati)';

  return document.status === DocumentStatus.ARCHIVED || document.status === DocumentStatus.RENEWED
    ? 'Documenti vecchi (storico)'
    : 'Documenti attivi';
}

function cleanRootFolder(value: string): string {
  return value
    .split('/')
    .map(cleanPathSegment)
    .filter(Boolean)
    .join('/');
}

export function getDocumentMirrorRemotePath(document: MirrorDocument): string {
  const rootFolder = cleanRootFolder(getDocumentMirrorNextcloudFolder());
  const { category, entityName } = entityFolder(document);
  const fileName = cleanFileName([
    formatDatePart(document.expiryDate),
    document.documentType.name,
    document.originalFileName || document.title || 'documento.pdf'
  ].join(' - '));

  return [
    rootFolder,
    statusRoot(document),
    cleanPathSegment(category),
    cleanPathSegment(entityName),
    fileName
  ].join('/');
}

function getMirrorConfig() {
  if (!getDocumentMirrorEnabled()) return null;

  const config = {
    baseUrl: getDocumentMirrorNextcloudBaseUrl(),
    user: getDocumentMirrorNextcloudUser(),
    password: getDocumentMirrorNextcloudPassword()
  };

  if (!config.baseUrl || !config.user || !config.password) return null;
  return config;
}

export async function mirrorDocumentPdfToNextcloud(document: MirrorDocument): Promise<void> {
  const config = getMirrorConfig();
  if (!config || !document.filePath) return;

  try {
    const { fileBuffer } = await readStoredPdf(document.filePath);
    await uploadNextcloudFile(config, getDocumentMirrorRemotePath(document), fileBuffer, document.mimeType || 'application/pdf');
  } catch (error) {
    console.error('Mirror documento su Nextcloud fallito.', {
      documentId: document.id,
      title: document.title,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function deleteDocumentPdfMirrorFromNextcloud(document: MirrorDocument): Promise<void> {
  const config = getMirrorConfig();
  if (!config || !document.filePath) return;

  try {
    await deleteNextcloudFile(config, getDocumentMirrorRemotePath(document));
  } catch (error) {
    console.error('Rimozione mirror documento da Nextcloud fallita.', {
      documentId: document.id,
      title: document.title,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function getMirrorDocumentById(id: string): Promise<MirrorDocument | null> {
  return prisma.document.findUnique({
    where: { id },
    include: documentInclude
  });
}

export async function syncDocumentPdfMirrorById(id: string, previousDocument?: MirrorDocument | null): Promise<void> {
  const document = await getMirrorDocumentById(id);
  if (!document) return;

  if (
    previousDocument &&
    previousDocument.filePath &&
    getDocumentMirrorRemotePath(previousDocument) !== getDocumentMirrorRemotePath(document)
  ) {
    await deleteDocumentPdfMirrorFromNextcloud(previousDocument);
  }

  await mirrorDocumentPdfToNextcloud(document);
}

type QueuedMirrorOperation = {
  documentId: string | null;
  operation: 'SYNC' | 'DELETE';
  previousRemotePath: string | null;
  uploadRequired: boolean;
};

export async function executeQueuedDocumentMirrorOperation(job: QueuedMirrorOperation): Promise<void> {
  const config = getMirrorConfig();
  if (!config) throw new Error('Mirror Nextcloud non configurato nel worker.');

  if (job.operation === 'DELETE') {
    if (job.previousRemotePath) await deleteNextcloudFile(config, job.previousRemotePath);
    return;
  }

  const document = job.documentId ? await getMirrorDocumentById(job.documentId) : null;
  if (!document?.filePath) {
    if (job.previousRemotePath) await deleteNextcloudFile(config, job.previousRemotePath);
    return;
  }

  const targetRemotePath = getDocumentMirrorRemotePath(document);
  let moved = false;
  if (job.previousRemotePath && job.previousRemotePath !== targetRemotePath) {
    moved = await moveNextcloudFile(config, job.previousRemotePath, targetRemotePath);
  }

  const mustUpload = job.uploadRequired || !job.previousRemotePath || (!moved && job.previousRemotePath !== targetRemotePath);
  if (!mustUpload) return;

  const { fileBuffer } = await readStoredPdf(document.filePath);
  await uploadNextcloudFile(config, targetRemotePath, fileBuffer, document.mimeType || 'application/pdf');
}
