export type ChecklistDocumentType = {
  id: string;
  name: string;
};

export type ChecklistDocument = {
  id: string;
  documentTypeId: string;
  expiryDate: Date;
  filePath: string | null;
};

export type ChecklistExclusion = {
  documentTypeId: string;
};

export type DocumentChecklistItem = ChecklistDocumentType & {
  insertedCount: number;
  latestDocument: {
    id: string;
    expiryDate: Date;
    hasFile: boolean;
  } | null;
  status: 'inserted' | 'missing' | 'excluded';
};

export type DocumentChecklist = {
  total: number;
  inserted: number;
  missing: number;
  excluded: number;
  items: DocumentChecklistItem[];
};

export function buildDocumentChecklist(
  documentTypes: ChecklistDocumentType[],
  documents: ChecklistDocument[],
  exclusions: ChecklistExclusion[]
): DocumentChecklist {
  const insertedCounts = new Map<string, number>();
  const latestDocuments = new Map<string, ChecklistDocument>();
  for (const document of documents) {
    insertedCounts.set(document.documentTypeId, (insertedCounts.get(document.documentTypeId) || 0) + 1);

    const currentLatest = latestDocuments.get(document.documentTypeId);
    if (!currentLatest || document.expiryDate.getTime() > currentLatest.expiryDate.getTime()) {
      latestDocuments.set(document.documentTypeId, document);
    }
  }

  const excludedDocumentTypeIds = new Set(exclusions.map((exclusion) => exclusion.documentTypeId));
  const items = documentTypes.map((documentType) => {
    const insertedCount = insertedCounts.get(documentType.id) || 0;
    const latestDocument = latestDocuments.get(documentType.id);

    return {
      ...documentType,
      insertedCount,
      latestDocument: latestDocument
        ? {
            id: latestDocument.id,
            expiryDate: latestDocument.expiryDate,
            hasFile: Boolean(latestDocument.filePath)
          }
        : null,
      status: insertedCount > 0 ? 'inserted' : excludedDocumentTypeIds.has(documentType.id) ? 'excluded' : 'missing'
    } satisfies DocumentChecklistItem;
  });

  return {
    total: items.length,
    inserted: items.filter((item) => item.status === 'inserted').length,
    missing: items.filter((item) => item.status === 'missing').length,
    excluded: items.filter((item) => item.status === 'excluded').length,
    items
  };
}
