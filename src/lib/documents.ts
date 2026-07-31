import { DocumentStatus, EntityType, type Document, type DocumentType, type Driver, type OtherEntity, type Tractor, type Trailer } from '@prisma/client';
import { daysUntil, formatDate } from '@/lib/dates';

export type DocumentWithRelations = Document & {
  documentType: DocumentType;
  driver: Driver | null;
  tractor: Tractor | null;
  trailer: Trailer | null;
  otherEntity: OtherEntity | null;
};

export const documentInclude = {
  documentType: true,
  driver: true,
  tractor: true,
  trailer: true,
  otherEntity: true
} as const;

export type VisualStatus = 'expired' | 'sevenDays' | 'thirtyDays' | 'valid' | 'inactive';
export type DocumentStatusFilter = VisualStatus | 'within30';
export type DocumentPdfFilter = 'missing' | 'present';

export function getDocumentRuntimeStatus(document: Pick<Document, 'expiryDate' | 'noticeDays' | 'status'>): DocumentStatus {
  if (document.status === DocumentStatus.ARCHIVED || document.status === DocumentStatus.RENEWED) {
    return document.status;
  }

  const remaining = daysUntil(document.expiryDate);
  if (remaining < 0) return DocumentStatus.EXPIRED;
  if (remaining <= document.noticeDays) return DocumentStatus.EXPIRING;
  return DocumentStatus.VALID;
}

export function getDocumentVisualStatus(document: Pick<Document, 'expiryDate' | 'noticeDays' | 'status'>): VisualStatus {
  if (document.status === DocumentStatus.ARCHIVED || document.status === DocumentStatus.RENEWED) return 'inactive';
  const remaining = daysUntil(document.expiryDate);
  if (remaining < 0) return 'expired';
  if (remaining <= 7) return 'sevenDays';
  if (remaining <= 30) return 'thirtyDays';
  return 'valid';
}

export function getStatusLabel(status: DocumentStatus | VisualStatus): string {
  const labels: Record<string, string> = {
    [DocumentStatus.VALID]: 'Valido',
    [DocumentStatus.EXPIRING]: 'In scadenza',
    [DocumentStatus.EXPIRED]: 'Scaduto',
    [DocumentStatus.RENEWED]: 'Rinnovato',
    [DocumentStatus.ARCHIVED]: 'Archiviato',
    expired: 'Scaduto',
    sevenDays: 'Entro 7 giorni',
    thirtyDays: 'Entro 30 giorni',
    within30: 'Entro 30 giorni',
    valid: 'Valido',
    inactive: 'Archiviato/Rinnovato'
  };
  return labels[status] || status;
}

export function documentMatchesStatusFilter(
  document: Pick<Document, 'expiryDate' | 'noticeDays' | 'status'>,
  statusFilter?: string
): boolean {
  if (!statusFilter) return true;

  if (statusFilter === DocumentStatus.RENEWED || statusFilter === DocumentStatus.ARCHIVED) {
    return document.status === statusFilter;
  }

  if (statusFilter === 'within30') {
    const visualStatus = getDocumentVisualStatus(document);
    const remaining = daysUntil(document.expiryDate);
    return visualStatus !== 'inactive' && remaining >= 0 && remaining <= 30;
  }

  return getDocumentVisualStatus(document) === statusFilter;
}

export function documentMatchesPdfFilter(document: Pick<Document, 'filePath'>, pdfFilter?: string): boolean {
  if (!pdfFilter) return true;
  if (pdfFilter === 'missing') return !document.filePath;
  if (pdfFilter === 'present') return Boolean(document.filePath);
  return true;
}

export function getEntityLabel(document: DocumentWithRelations): string {
  switch (document.entityType) {
    case EntityType.DRIVER:
      return document.driver ? `${document.driver.firstName} ${document.driver.lastName}` : 'Autista eliminato';
    case EntityType.TRACTOR:
      return document.tractor ? `Trattore ${document.tractor.plate}` : 'Trattore eliminato';
    case EntityType.TRAILER:
      return document.trailer ? `Semirimorchio ${document.trailer.plate}` : 'Semirimorchio eliminato';
    case EntityType.OTHER:
      return document.otherEntity ? `${document.otherEntity.category}: ${document.otherEntity.name}` : 'Entità eliminata';
    default:
      return 'Non associato';
  }
}

export function getEntityTypeLabel(entityType: EntityType): string {
  const labels: Record<EntityType, string> = {
    DRIVER: 'Autista',
    TRACTOR: 'Trattore',
    TRAILER: 'Semirimorchio',
    OTHER: 'Altro'
  };
  return labels[entityType];
}

export function buildEntityRelation(entityType: EntityType, entityId: string) {
  return {
    driverId: entityType === EntityType.DRIVER ? entityId : null,
    tractorId: entityType === EntityType.TRACTOR ? entityId : null,
    trailerId: entityType === EntityType.TRAILER ? entityId : null,
    otherEntityId: entityType === EntityType.OTHER ? entityId : null
  };
}

export function getDocumentEntityId(
  document: Pick<Document, 'entityType' | 'driverId' | 'tractorId' | 'trailerId' | 'otherEntityId'>
): string {
  switch (document.entityType) {
    case EntityType.DRIVER:
      return document.driverId || '';
    case EntityType.TRACTOR:
      return document.tractorId || '';
    case EntityType.TRAILER:
      return document.trailerId || '';
    case EntityType.OTHER:
      return document.otherEntityId || '';
    default:
      return '';
  }
}

export function getDocumentEntityKey(document: Pick<Document, 'entityType' | 'driverId' | 'tractorId' | 'trailerId' | 'otherEntityId'>): string {
  return `${document.entityType}:${getDocumentEntityId(document)}`;
}

export function documentCanBeRenewalSource(document: Pick<Document, 'status'>): boolean {
  return document.status !== DocumentStatus.ARCHIVED && document.status !== DocumentStatus.RENEWED;
}

export function documentMatchesTypeAndEntity(
  document: Pick<Document, 'documentTypeId' | 'entityType' | 'driverId' | 'tractorId' | 'trailerId' | 'otherEntityId'>,
  documentTypeId: string,
  entityType: EntityType,
  entityId: string
): boolean {
  return document.documentTypeId === documentTypeId && getDocumentEntityKey(document) === `${entityType}:${entityId}`;
}

function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function documentMatchesSearch(document: DocumentWithRelations, query?: string): boolean {
  const tokens = normalizeSearch(query || '')
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return true;

  const status = getDocumentVisualStatus(document);
  const searchableText = normalizeSearch(
    [
      document.title,
      document.documentType.name,
      getEntityLabel(document),
      document.originalFileName || '',
      document.mimeType || '',
      document.notes || '',
      getStatusLabel(status),
      getStatusLabel(document.status),
      formatDate(document.issueDate),
      formatDate(document.expiryDate),
      `${daysUntil(document.expiryDate)} giorni`
    ].join(' ')
  );

  return tokens.every((token) => searchableText.includes(token));
}
