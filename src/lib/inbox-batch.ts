import path from 'node:path';

function normalizeFileName(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/**
 * I certificati estintori vengono normalmente scannerizzati in sequenza:
 * ogni pagina rappresenta un documento destinato a una targa diversa.
 * Gli altri PDF inbox restano integri perché possono essere documenti
 * realmente multipagina (libretti, polizze, contratti, ecc.).
 */
export function isInboxPageBatchCandidate(fileName: string): boolean {
  return normalizeFileName(fileName).includes('estintor');
}

export function shouldSplitInboxPdfByPage(
  fileName: string,
  pageCount: number,
  splitEveryPage = false
): boolean {
  return pageCount > 1 && (splitEveryPage || isInboxPageBatchCandidate(fileName));
}

export type InboxPageAnalysisSignal = {
  suggestedDocumentTypeId: string | null;
  suggestedEntityType: string | null;
  suggestedEntityId: string | null;
  suggestedIssueDate: Date | null;
  suggestedExpiryDate: Date | null;
  detectedPlate?: string | null;
};

/**
 * Un PDF generico viene separato automaticamente solo quando ogni pagina è
 * riconosciuta come documento autonomo e almeno una delle identità proposte
 * differisce. In questo modo una polizza/libretto realmente multipagina, che
 * ripete la stessa identità, resta unito.
 */
export function shouldAutoSplitInboxPageAnalyses(pages: InboxPageAnalysisSignal[]): boolean {
  if (pages.length <= 1) return false;
  if (
    pages.some(
      (page) =>
        !page.suggestedDocumentTypeId ||
        !(
          (page.suggestedEntityType && page.suggestedEntityId) ||
          page.detectedPlate
        )
    )
  ) {
    return false;
  }

  const identities = new Set(
    pages.map((page) => {
      const entityIdentity =
        page.suggestedEntityType && page.suggestedEntityId
          ? `${page.suggestedEntityType}:${page.suggestedEntityId}`
          : `PLATE:${page.detectedPlate}`;
      return [
        page.suggestedDocumentTypeId,
        entityIdentity
      ].join(':');
    })
  );

  return identities.size > 1;
}

export function inboxPageFileName(fileName: string, pageNumber: number): string {
  const extension = path.extname(fileName || '') || '.pdf';
  const base = path.basename(fileName || 'documento', extension);
  return `${base}-pagina-${pageNumber}${extension}`;
}
