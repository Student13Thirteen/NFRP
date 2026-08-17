import { DocumentStatus, EntityType, type Prisma } from '@prisma/client';

export const TACHOGRAPH_UPDATE_DOCUMENT_TYPE_NAME = 'Aggiornamento tachigrafo digitale';

export const activeTachographUpdateDocumentWhere = {
  entityType: EntityType.TRACTOR,
  status: { notIn: [DocumentStatus.ARCHIVED, DocumentStatus.RENEWED] },
  filePath: { not: null },
  documentType: { name: TACHOGRAPH_UPDATE_DOCUMENT_TYPE_NAME }
} satisfies Prisma.DocumentWhereInput;

export function isTachographUpdateDocumentTypeName(name: string | null | undefined): boolean {
  return (name || '').localeCompare(TACHOGRAPH_UPDATE_DOCUMENT_TYPE_NAME, 'it-IT', { sensitivity: 'base' }) === 0;
}
