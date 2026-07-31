import 'server-only';

import { createHash } from 'node:crypto';
import { DocumentInboxStatus, DocumentStatus, EntityType, type DocumentInboxItem, type Prisma } from '@prisma/client';
import {
  analyzeInboxPdf,
  analyzeInboxPdfExtraction,
  extractInboxPdfTextFromBuffer,
  findInboxFleetPlate,
  findInsuranceVehicleSuggestion,
  type InboxAnalysis
} from '@/lib/inbox-analysis';
import { prisma } from '@/lib/db';
import { getInboxAnalysisConcurrency } from '@/lib/env';
import { getMirrorDocumentById } from '@/lib/document-mirror';
import { enqueueDocumentMirrorSync } from '@/lib/document-mirror-queue';
import {
  alignLibrettoExpiryToBarratoRosa,
  parseDocumentMetadata,
  removeUploadedPdfAfterFailure,
  resolveDocumentStatusForEntity
} from '@/lib/document-form';
import {
  buildEntityRelation,
  documentCanBeRenewalSource,
  documentMatchesTypeAndEntity
} from '@/lib/documents';
import type { BarratoRosaExpiryReference } from '@/lib/inbox-expiry';
import { readStoredPdf, removeStoredPdf, storePdfBuffer, storePdfFile, type StoredPdf } from '@/lib/files';
import { formString } from '@/lib/form';
import {
  inboxPageFileName,
  isInboxPageBatchCandidate,
  shouldAutoSplitInboxPageAnalyses,
  shouldSplitInboxPdfByPage
} from '@/lib/inbox-batch';
import { splitPdfPages, type PdfPage } from '@/lib/pdf-pages';
import { getFireExtinguisherRates } from '@/lib/fire-extinguisher-settings';

export const inboxInclude = {} as const;

export function inboxItemToStoredPdf(item: Pick<DocumentInboxItem, 'filePath' | 'originalFileName' | 'fileSize' | 'mimeType'>): StoredPdf {
  return {
    filePath: item.filePath,
    originalFileName: item.originalFileName,
    fileSize: item.fileSize,
    mimeType: item.mimeType
  };
}

export async function getInboxReferenceData() {
  const [documentTypes, drivers, tractors, trailers, otherEntities, barratoRosaDocuments, fireExtinguisherRates] = await Promise.all([
    prisma.documentType.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractor.findMany({ where: { active: true }, orderBy: { plate: 'asc' } }),
    prisma.trailer.findMany({ where: { active: true }, orderBy: { plate: 'asc' } }),
    prisma.otherEntity.findMany({ orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }] }),
    prisma.document.findMany({
      where: {
        status: { notIn: [DocumentStatus.ARCHIVED, DocumentStatus.RENEWED] },
        entityType: { in: [EntityType.TRACTOR, EntityType.TRAILER] },
        documentType: { name: { contains: 'Barrato rosa', mode: 'insensitive' } }
      },
      select: {
        entityType: true,
        expiryDate: true,
        tractorId: true,
        tractor: { select: { plate: true } },
        trailerId: true,
        trailer: { select: { plate: true } }
      },
      orderBy: [{ expiryDate: 'desc' }, { updatedAt: 'desc' }]
    }),
    getFireExtinguisherRates()
  ]);

  const barratoRosaExpiries = barratoRosaDocuments.flatMap((document): BarratoRosaExpiryReference[] => {
    if (document.entityType === EntityType.TRACTOR && document.tractorId && document.tractor) {
      return [{
        entityType: EntityType.TRACTOR,
        entityId: document.tractorId,
        label: document.tractor.plate,
        expiryDate: document.expiryDate
      }];
    }

    if (document.entityType === EntityType.TRAILER && document.trailerId && document.trailer) {
      return [{
        entityType: EntityType.TRAILER,
        entityId: document.trailerId,
        label: document.trailer.plate,
        expiryDate: document.expiryDate
      }];
    }

    return [];
  });

  // Includo anche i barrato rosa ancora in inbox (non ancora validati): così, caricando insieme barrato rosa
  // nuovo + libretto/revisione della stessa targa, la scadenza nuova allinea anche il libretto, senza dover
  // prima validare il barrato rosa. Richiede che il barrato rosa sia analizzato prima (coda FIFO per upload).
  const barratoRosaTypeIds = documentTypes
    .filter((type) => type.name.toLocaleLowerCase('it-IT').includes('barrato rosa'))
    .map((type) => type.id);

  const pendingBarratoRosaItems = barratoRosaTypeIds.length > 0
    ? await prisma.documentInboxItem.findMany({
        where: {
          status: DocumentInboxStatus.PENDING,
          suggestedExpiryDate: { not: null },
          suggestedEntityType: { in: [EntityType.TRACTOR, EntityType.TRAILER] },
          suggestedDocumentTypeId: { in: barratoRosaTypeIds }
        },
        select: { suggestedEntityType: true, suggestedEntityId: true, suggestedExpiryDate: true }
      })
    : [];

  const tractorPlateById = new Map(tractors.map((tractor) => [tractor.id, tractor.plate]));
  const trailerPlateById = new Map(trailers.map((trailer) => [trailer.id, trailer.plate]));

  const pendingBarratoRosaExpiries = pendingBarratoRosaItems.flatMap((item): BarratoRosaExpiryReference[] => {
    if (!item.suggestedEntityId || !item.suggestedExpiryDate) return [];
    if (item.suggestedEntityType === EntityType.TRACTOR) {
      const plate = tractorPlateById.get(item.suggestedEntityId);
      return plate ? [{ entityType: EntityType.TRACTOR, entityId: item.suggestedEntityId, label: plate, expiryDate: item.suggestedExpiryDate }] : [];
    }
    if (item.suggestedEntityType === EntityType.TRAILER) {
      const plate = trailerPlateById.get(item.suggestedEntityId);
      return plate ? [{ entityType: EntityType.TRAILER, entityId: item.suggestedEntityId, label: plate, expiryDate: item.suggestedExpiryDate }] : [];
    }
    return [];
  });

  return {
    documentTypes,
    drivers,
    tractors,
    trailers,
    otherEntities,
    barratoRosaExpiries: [...barratoRosaExpiries, ...pendingBarratoRosaExpiries],
    fireExtinguisherRates
  };
}

function analysisToItemData(analysis: InboxAnalysis) {
  return {
    extractedText: analysis.extractedText,
    extractionStatus: analysis.extractionStatus,
    suggestedTitle: analysis.suggestedTitle,
    suggestedDocumentTypeId: analysis.suggestedDocumentTypeId,
    suggestedEntityType: analysis.suggestedEntityType,
    suggestedEntityId: analysis.suggestedEntityId,
    suggestedIssueDate: analysis.suggestedIssueDate,
    suggestedExpiryDate: analysis.suggestedExpiryDate,
    suggestedNoticeDays: analysis.suggestedNoticeDays,
    suggestedNotes: analysis.suggestedNotes,
    suggestedAmountCents: analysis.suggestedAmountCents,
    confidence: analysis.confidence,
    analysisNotes: analysis.analysisNotes
  };
}

async function runInboxAnalysis(
  storedPdf: StoredPdf,
  referenceData: Awaited<ReturnType<typeof getInboxReferenceData>>
): Promise<InboxAnalysis> {
  return ensureMissingInsuranceVehicleEntity(storedPdf, await analyzeInboxPdf(storedPdf, referenceData), referenceData);
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

// Caricamenti dello stesso contenuto in corso nello stesso processo (doppio invio / due schede aperte).
const inFlightUploadHashes = new Set<string>();

// Esiste già un PDF identico (stesso contenuto) ancora in attesa nella inbox? Filtro prima per dimensione
// (indicizzata/cheap), poi confermo con l'hash del contenuto. Evita doppioni anche su retry o due tab.
async function findPendingDuplicateId(fileSize: number, hash: string, excludeId?: string): Promise<string | null> {
  const candidates = await prisma.documentInboxItem.findMany({
    where: {
      status: DocumentInboxStatus.PENDING,
      fileSize,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { id: true, filePath: true }
  });

  for (const candidate of candidates) {
    try {
      const { fileBuffer } = await readStoredPdf(candidate.filePath);
      if (hashBuffer(fileBuffer) === hash) return candidate.id;
    } catch {
      // Un candidato non leggibile non deve bloccare l'import: lo ignoro.
    }
  }

  return null;
}

// Upload multiplo dalla inbox: salva il file, crea subito la riga "in analisi" e mette l'OCR in coda.
// Non blocca la richiesta con l'OCR (lento su questo hardware), così niente attese e niente doppi invii.
export type InboxUploadResult = {
  items: DocumentInboxItem[];
  duplicateItems: number;
  sourceFiles: number;
  expandedPages: number;
};

export type InboxUploadOptions = {
  splitEveryPage?: boolean;
};

type InboxUploadUnit = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

async function expandInboxUpload(file: File, options: InboxUploadOptions): Promise<InboxUploadUnit[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name || 'documento.pdf';
  const mimeType = file.type || 'application/pdf';
  if (!options.splitEveryPage && !isInboxPageBatchCandidate(fileName)) return [{ buffer, fileName, mimeType }];

  const pages = await splitPdfPages(buffer);
  if (!shouldSplitInboxPdfByPage(fileName, pages.length, options.splitEveryPage)) {
    return [{ buffer, fileName, mimeType }];
  }
  return pages.map((page) => ({
    buffer: page.buffer,
    fileName: inboxPageFileName(fileName, page.pageNumber),
    mimeType
  }));
}

export async function createInboxItemsFromFiles(
  files: File[],
  options: InboxUploadOptions = {}
): Promise<InboxUploadResult> {
  const created: DocumentInboxItem[] = [];
  let duplicateItems = 0;
  let expandedPages = 0;

  for (const file of files) {
    const units = await expandInboxUpload(file, options);
    expandedPages += units.length;

    for (const unit of units) {
      const hash = hashBuffer(unit.buffer);

      if (inFlightUploadHashes.has(hash)) {
        duplicateItems += 1;
        continue;
      }
      if (await findPendingDuplicateId(unit.buffer.length, hash)) {
        duplicateItems += 1;
        continue;
      }

      inFlightUploadHashes.add(hash);
      try {
        const storedPdf = await storePdfBuffer(unit.buffer, unit.fileName, { mimeType: unit.mimeType });
        try {
          const item = await prisma.documentInboxItem.create({
            data: {
              ...storedPdf,
              extractionStatus: 'In analisi automatica (lettura PDF/OCR in corso).',
              analysisNotes: 'Analisi automatica in coda: i suggerimenti compaiono appena pronti.',
              confidence: 0,
              analyzedAt: null
            }
          });
          created.push(item);
          enqueueInboxAnalysis(item.id);
        } catch (error) {
          await removeStoredPdf(storedPdf.filePath).catch(() => undefined);
          throw error;
        }
      } finally {
        inFlightUploadHashes.delete(hash);
      }
    }
  }

  return {
    items: created,
    duplicateItems,
    sourceFiles: files.length,
    expandedPages
  };
}

function isInsuranceDocumentTypeName(value: string): boolean {
  return value.toLocaleLowerCase('it-IT').normalize('NFD').replace(/\p{Diacritic}/gu, '').includes('assicurazione');
}

async function ensureMissingInsuranceVehicleEntity(
  storedPdf: StoredPdf,
  analysis: InboxAnalysis,
  referenceData: Awaited<ReturnType<typeof getInboxReferenceData>>
): Promise<InboxAnalysis> {
  if (analysis.suggestedEntityId || !analysis.suggestedDocumentTypeId) return analysis;

  const documentType = referenceData.documentTypes.find((type) => type.id === analysis.suggestedDocumentTypeId);
  if (!documentType || !isInsuranceDocumentTypeName(documentType.name)) return analysis;

  const suggestion = findInsuranceVehicleSuggestion(`${storedPdf.originalFileName}\n${analysis.extractedText || ''}`);
  if (!suggestion || documentType.suggestedEntityType !== suggestion.entityType) return analysis;

  const [existingTractor, existingTrailer] = await Promise.all([
    prisma.tractor.findFirst({ where: { plate: { equals: suggestion.plate, mode: 'insensitive' } }, select: { id: true } }),
    prisma.trailer.findFirst({ where: { plate: { equals: suggestion.plate, mode: 'insensitive' } }, select: { id: true } })
  ]);

  if (suggestion.entityType === EntityType.TRACTOR && existingTrailer) {
    return {
      ...analysis,
      analysisNotes: `${analysis.analysisNotes} Targa ${suggestion.plate} gia presente come semirimorchio: autocreazione trattore non eseguita.`
    };
  }

  if (suggestion.entityType === EntityType.TRAILER && existingTractor) {
    return {
      ...analysis,
      analysisNotes: `${analysis.analysisNotes} Targa ${suggestion.plate} gia presente come trattore: autocreazione semirimorchio non eseguita.`
    };
  }

  const note = `Aggiunto automaticamente da Inbox PDF polizza assicurativa (${suggestion.evidence}).`;
  const entity =
    suggestion.entityType === EntityType.TRACTOR
      ? existingTractor || (await prisma.tractor.create({ data: { plate: suggestion.plate, notes: note }, select: { id: true } }))
      : existingTrailer || (await prisma.trailer.create({ data: { plate: suggestion.plate, notes: note }, select: { id: true } }));

  const entityKind = suggestion.entityType === EntityType.TRACTOR ? 'trattore' : 'semirimorchio';
  return {
    ...analysis,
    suggestedTitle: `${documentType.name} - ${suggestion.plate}`.slice(0, 180),
    suggestedEntityType: suggestion.entityType,
    suggestedEntityId: entity.id,
    confidence: Math.max(analysis.confidence, 82),
    analysisNotes: `${analysis.analysisNotes} Targa ${suggestion.plate} collegata automaticamente a nuovo ${entityKind} minimale.`
  };
}

// Percorso del rinnovo da dettaglio documento: deve restituire i suggerimenti già pronti perché apre subito
// la revisione precompilata. Qui l'analisi resta SINCRONA (un solo file), così la pagina non si apre vuota.
export async function createInboxItemFromFile(file: File) {
  const referenceData = await getInboxReferenceData();
  const storedPdf = await storePdfFile(file);

  try {
    const analysis = await runInboxAnalysis(storedPdf, referenceData);
    return await prisma.documentInboxItem.create({
      data: {
        ...storedPdf,
        ...analysisToItemData(analysis),
        analyzedAt: new Date()
      }
    });
  } catch (error) {
    await removeUploadedPdfAfterFailure(storedPdf);
    throw error;
  }
}

type AnalyzedInboxPage = {
  page: PdfPage;
  fileName: string;
  analysis: InboxAnalysis;
  detectedPlate: string | null;
};

async function findAutomaticInboxSplit(
  item: DocumentInboxItem,
  referenceData: Awaited<ReturnType<typeof getInboxReferenceData>>
): Promise<AnalyzedInboxPage[] | null> {
  const { fileBuffer } = await readStoredPdf(item.filePath);
  const pages = await splitPdfPages(fileBuffer);
  if (pages.length <= 1) return null;

  const analyzedPages: AnalyzedInboxPage[] = [];
  for (const page of pages) {
    const fileName = inboxPageFileName(item.originalFileName, page.pageNumber);
    const extraction = await extractInboxPdfTextFromBuffer(page.buffer);
    analyzedPages.push({
      page,
      fileName,
      detectedPlate: findInboxFleetPlate(extraction.text),
      analysis: analyzeInboxPdfExtraction({ originalFileName: fileName }, extraction, referenceData)
    });
  }

  return shouldAutoSplitInboxPageAnalyses(
    analyzedPages.map(({ analysis, detectedPlate }) => ({ ...analysis, detectedPlate }))
  )
    ? analyzedPages
    : null;
}

async function replaceInboxItemWithAnalyzedPages(
  item: DocumentInboxItem,
  analyzedPages: AnalyzedInboxPage[],
  referenceData: Awaited<ReturnType<typeof getInboxReferenceData>>
): Promise<void> {
  const prepared: Array<{ storedPdf: StoredPdf; analysis: InboxAnalysis; pageNumber: number }> = [];
  const batchHashes = new Set<string>();
  let duplicatePages = 0;

  try {
    for (const { page, fileName, analysis } of analyzedPages) {
      const hash = hashBuffer(page.buffer);
      if (batchHashes.has(hash) || await findPendingDuplicateId(page.buffer.length, hash, item.id)) {
        duplicatePages += 1;
        continue;
      }
      batchHashes.add(hash);

      const storedPdf = await storePdfBuffer(page.buffer, fileName, { mimeType: item.mimeType });
      const completedAnalysis = await ensureMissingInsuranceVehicleEntity(storedPdf, analysis, referenceData);
      prepared.push({
        storedPdf,
        pageNumber: page.pageNumber,
        analysis: {
          ...completedAnalysis,
          analysisNotes: [
            completedAnalysis.analysisNotes,
            `Pagina ${page.pageNumber} di ${analyzedPages.length} separata automaticamente dal PDF combinato.`
          ].filter(Boolean).join(' ')
        }
      });
    }

    if (prepared.length === 0) {
      await prisma.documentInboxItem.update({
        where: { id: item.id },
        data: {
          status: DocumentInboxStatus.DISCARDED,
          analyzedAt: new Date(),
          confidence: 0,
          extractionStatus: 'PDF combinato riconosciuto: tutte le pagine erano già presenti in inbox.',
          analysisNotes: 'Nessun doppione aggiunto durante la separazione automatica.'
        }
      });
      await removeStoredPdf(item.filePath).catch(() => undefined);
      return;
    }

    const [first, ...remaining] = prepared;
    await prisma.$transaction(async (tx) => {
      await tx.documentInboxItem.update({
        where: { id: item.id },
        data: {
          status: DocumentInboxStatus.PENDING,
          documentId: null,
          ...first.storedPdf,
          ...analysisToItemData(first.analysis),
          analyzedAt: new Date()
        }
      });

      for (const entry of remaining) {
        await tx.documentInboxItem.create({
          data: {
            ...entry.storedPdf,
            ...analysisToItemData(entry.analysis),
            analyzedAt: new Date()
          }
        });
      }
    });

    await removeStoredPdf(item.filePath).catch((error) => {
      console.error('Rimozione PDF combinato dopo separazione automatica fallita.', {
        inboxItemId: item.id,
        error: error instanceof Error ? error.message : String(error)
      });
    });

    console.info('PDF inbox separato automaticamente dopo il riconoscimento.', {
      inboxItemId: item.id,
      sourcePages: analyzedPages.length,
      createdPages: prepared.length,
      duplicatePages
    });
  } catch (error) {
    await Promise.all(prepared.map(({ storedPdf }) => removeStoredPdf(storedPdf.filePath).catch(() => undefined)));
    throw error;
  }
}

// Analisi di un singolo item della inbox (usata dalla coda in background). Idempotente: se l'item è già
// stato analizzato o non è più in attesa, esce. In caso di errore segna comunque analyzedAt così non resta
// "in analisi" all'infinito e l'utente può completare a mano.
export async function analyzeInboxItemById(id: string): Promise<void> {
  const item = await prisma.documentInboxItem.findUnique({ where: { id } });
  if (!item) return;
  if (item.status !== DocumentInboxStatus.PENDING) return;
  if (item.analyzedAt) return;

  const referenceData = await getInboxReferenceData();
  const storedPdf = inboxItemToStoredPdf(item);

  try {
    try {
      const automaticSplit = await findAutomaticInboxSplit(item, referenceData);
      if (automaticSplit) {
        await replaceInboxItemWithAnalyzedPages(item, automaticSplit, referenceData);
        return;
      }
    } catch (error) {
      console.warn('Riconoscimento automatico PDF combinato non disponibile: proseguo con il fascicolo integro.', {
        inboxItemId: item.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const analysis = await runInboxAnalysis(storedPdf, referenceData);
    await prisma.documentInboxItem.update({
      where: { id },
      data: { ...analysisToItemData(analysis), analyzedAt: new Date() }
    });
  } catch (error) {
    await prisma.documentInboxItem.update({
      where: { id },
      data: {
        analyzedAt: new Date(),
        confidence: 0,
        extractionStatus: `Analisi automatica non riuscita: ${
          error instanceof Error ? error.message : String(error)
        }`.slice(0, 500),
        analysisNotes: 'Lettura automatica non riuscita: apri la revisione e compila i dati manualmente.'
      }
    });
  }
}

// Coda in-process per l'analisi OCR: serializzata (default 1 alla volta) per non saturare la CPU su hardware
// modesto e tenere il server reattivo. Vive nel processo `app`, l'unico che gestisce gli upload inbox.
const analysisQueue: string[] = [];
const queuedAnalysisIds = new Set<string>();
let activeAnalysisWorkers = 0;
let recoveryStarted = false;

function resolveAnalysisConcurrency(): number {
  return Math.min(Math.max(1, getInboxAnalysisConcurrency()), 4);
}

function enqueueInboxAnalysis(id: string): void {
  if (queuedAnalysisIds.has(id)) return;
  queuedAnalysisIds.add(id);
  analysisQueue.push(id);
  void pumpAnalysisQueue();
}

async function pumpAnalysisQueue(): Promise<void> {
  const concurrency = resolveAnalysisConcurrency();

  while (activeAnalysisWorkers < concurrency && analysisQueue.length > 0) {
    const id = analysisQueue.shift();
    if (!id) break;
    activeAnalysisWorkers += 1;

    void (async () => {
      try {
        await analyzeInboxItemById(id);
      } catch (error) {
        console.error('Analisi inbox in background fallita.', {
          inboxItemId: id,
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        queuedAnalysisIds.delete(id);
        activeAnalysisWorkers -= 1;
        void pumpAnalysisQueue();
      }
    })();
  }
}

// Da chiamare al primo accesso (pagina inbox / upload): recupera eventuali item rimasti "in analisi" dopo un
// riavvio del processo e li rimette in coda. Idempotente e a prova di errore (riprova al prossimo accesso).
export async function ensureInboxQueueStarted(): Promise<void> {
  if (recoveryStarted) return;
  recoveryStarted = true;

  try {
    const pending = await prisma.documentInboxItem.findMany({
      where: { status: DocumentInboxStatus.PENDING, analyzedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' }
    });
    for (const item of pending) enqueueInboxAnalysis(item.id);
  } catch (error) {
    recoveryStarted = false;
    console.error('Recupero coda analisi inbox fallito.', error);
  }
}

type SuggestedInboxItem = Pick<
  DocumentInboxItem,
  | 'id'
  | 'status'
  | 'suggestedTitle'
  | 'suggestedDocumentTypeId'
  | 'suggestedEntityType'
  | 'suggestedEntityId'
  | 'suggestedIssueDate'
  | 'suggestedExpiryDate'
  | 'suggestedNoticeDays'
  | 'suggestedNotes'
  | 'suggestedAmountCents'
>;

const suggestedInboxSelect = {
  id: true,
  status: true,
  suggestedTitle: true,
  suggestedDocumentTypeId: true,
  suggestedEntityType: true,
  suggestedEntityId: true,
  suggestedIssueDate: true,
  suggestedExpiryDate: true,
  suggestedNoticeDays: true,
  suggestedNotes: true,
  suggestedAmountCents: true
} satisfies Prisma.DocumentInboxItemSelect;

function isoDateValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : '';
}

function suggestionKey(item: SuggestedInboxItem): string | null {
  if (!item.suggestedDocumentTypeId || !item.suggestedEntityType || !item.suggestedEntityId) return null;
  return `${item.suggestedDocumentTypeId}:${item.suggestedEntityType}:${item.suggestedEntityId}`;
}

function getSuggestedImportBlockers(item: SuggestedInboxItem): string[] {
  const blockers: string[] = [];
  if (!item.suggestedDocumentTypeId) blockers.push('tipo documento mancante');
  if (!item.suggestedEntityType || !item.suggestedEntityId) blockers.push('associazione mancante');
  if (!item.suggestedExpiryDate) blockers.push('scadenza mancante');
  return blockers;
}

function suggestedEntityWhere(entityType: EntityType, entityId: string): Prisma.DocumentWhereInput {
  if (entityType === EntityType.DRIVER) return { driverId: entityId };
  if (entityType === EntityType.TRACTOR) return { tractorId: entityId };
  if (entityType === EntityType.TRAILER) return { trailerId: entityId };
  return { otherEntityId: entityId };
}

async function findSuggestedReplacementDocumentId(item: SuggestedInboxItem): Promise<string | null> {
  const blockers = getSuggestedImportBlockers(item);
  if (blockers.length > 0 || !item.suggestedDocumentTypeId || !item.suggestedEntityType || !item.suggestedEntityId) {
    throw new Error(`Suggerimenti incompleti: ${blockers.join(', ')}.`);
  }

  const candidates = await prisma.document.findMany({
    where: {
      status: { notIn: [DocumentStatus.ARCHIVED, DocumentStatus.RENEWED] },
      documentTypeId: item.suggestedDocumentTypeId,
      entityType: item.suggestedEntityType,
      ...suggestedEntityWhere(item.suggestedEntityType, item.suggestedEntityId)
    },
    select: { id: true },
    take: 2
  });

  if (candidates.length > 1) {
    throw new Error('Trovati piu documenti attivi compatibili: apri la revisione manuale.');
  }

  return candidates[0]?.id || null;
}

function activeDocumentSuggestionKey(document: {
  documentTypeId: string;
  entityType: EntityType;
  driverId: string | null;
  tractorId: string | null;
  trailerId: string | null;
  otherEntityId: string | null;
}): string | null {
  const entityId =
    document.entityType === EntityType.DRIVER
      ? document.driverId
      : document.entityType === EntityType.TRACTOR
        ? document.tractorId
        : document.entityType === EntityType.TRAILER
          ? document.trailerId
          : document.otherEntityId;
  return entityId ? `${document.documentTypeId}:${document.entityType}:${entityId}` : null;
}

async function getBulkValidationCandidates() {
  const items = await prisma.documentInboxItem.findMany({
    where: { status: DocumentInboxStatus.PENDING },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: suggestedInboxSelect
  });
  const keyCounts = new Map<string, number>();
  for (const item of items) {
    const key = suggestionKey(item);
    if (key) keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  }

  const completeUniqueItems = items.filter((item) => {
    const key = suggestionKey(item);
    return getSuggestedImportBlockers(item).length === 0 && Boolean(key) && (keyCounts.get(key || '') || 0) === 1;
  });
  const replacementWhere = completeUniqueItems.flatMap((item): Prisma.DocumentWhereInput[] => {
    if (!item.suggestedDocumentTypeId || !item.suggestedEntityType || !item.suggestedEntityId) return [];
    return [{
      documentTypeId: item.suggestedDocumentTypeId,
      entityType: item.suggestedEntityType,
      ...suggestedEntityWhere(item.suggestedEntityType, item.suggestedEntityId)
    }];
  });
  const activeDocuments = replacementWhere.length > 0
    ? await prisma.document.findMany({
        where: {
          status: { notIn: [DocumentStatus.ARCHIVED, DocumentStatus.RENEWED] },
          OR: replacementWhere
        },
        select: {
          documentTypeId: true,
          entityType: true,
          driverId: true,
          tractorId: true,
          trailerId: true,
          otherEntityId: true
        }
      })
    : [];
  const replacementCounts = new Map<string, number>();
  for (const document of activeDocuments) {
    const key = activeDocumentSuggestionKey(document);
    if (key) replacementCounts.set(key, (replacementCounts.get(key) || 0) + 1);
  }

  const eligibleItems = completeUniqueItems.filter((item) => {
    const key = suggestionKey(item);
    return Boolean(key) && (replacementCounts.get(key || '') || 0) <= 1;
  });
  return { eligibleItems, pendingCount: items.length };
}

export async function getReadyInboxSuggestionCount(): Promise<number> {
  const { eligibleItems } = await getBulkValidationCandidates();
  return eligibleItems.length;
}

function buildSuggestedDocumentFormData(item: SuggestedInboxItem, replacementDocumentId: string | null): FormData {
  if (!item.suggestedDocumentTypeId || !item.suggestedEntityType || !item.suggestedEntityId || !item.suggestedExpiryDate) {
    throw new Error('Suggerimenti incompleti.');
  }

  const formData = new FormData();
  if (item.suggestedTitle) formData.set('title', item.suggestedTitle);
  formData.set('documentTypeId', item.suggestedDocumentTypeId);
  formData.set('entityKey', `${item.suggestedEntityType}:${item.suggestedEntityId}`);
  formData.set('issueDate', isoDateValue(item.suggestedIssueDate));
  formData.set('expiryDate', isoDateValue(item.suggestedExpiryDate));
  if (item.suggestedNoticeDays) formData.set('noticeDays', String(item.suggestedNoticeDays));
  if (item.suggestedNotes) formData.set('notes', item.suggestedNotes);
  if (item.suggestedAmountCents !== null) {
    formData.set('amount', (item.suggestedAmountCents / 100).toFixed(2));
  }
  formData.set('status', DocumentStatus.VALID);
  formData.set('replacementMode', replacementDocumentId ? 'replace' : 'keep');
  if (replacementDocumentId) formData.set('replacementDocumentId', replacementDocumentId);
  return formData;
}

export async function createDocumentFromInboxSuggestions(id: string) {
  const item = await prisma.documentInboxItem.findUnique({ where: { id } });
  if (!item) throw new Error('Elemento inbox non trovato.');
  if (item.status !== DocumentInboxStatus.PENDING) throw new Error('Questo elemento inbox e gia stato gestito.');

  const replacementDocumentId = await findSuggestedReplacementDocumentId(item);
  return createDocumentFromInboxItem(id, buildSuggestedDocumentFormData(item, replacementDocumentId));
}

export type InboxBulkValidationProgress = {
  imported: number;
  processed: number;
  skipped: number;
  total: number;
};

type InboxBulkValidationOptions = {
  onProgress?: (progress: InboxBulkValidationProgress) => Promise<void> | void;
};

export async function createAllReadyDocumentsFromInboxSuggestions(options: InboxBulkValidationOptions = {}) {
  const { eligibleItems, pendingCount } = await getBulkValidationCandidates();

  let imported = 0;
  let processed = 0;
  let skipped = pendingCount - eligibleItems.length;
  await options.onProgress?.({ imported, processed, skipped, total: eligibleItems.length });

  for (const item of eligibleItems) {
    try {
      await createDocumentFromInboxSuggestions(item.id);
      imported += 1;
    } catch (error) {
      skipped += 1;
      console.warn('Import automatico inbox saltato.', {
        inboxItemId: item.id,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      processed += 1;
      await options.onProgress?.({ imported, processed, skipped, total: eligibleItems.length });
    }
  }

  return { imported, skipped };
}

export async function createDocumentFromInboxItem(id: string, formData: FormData) {
  const item = await prisma.documentInboxItem.findUnique({ where: { id } });
  if (!item) throw new Error('Elemento inbox non trovato.');
  if (item.status !== DocumentInboxStatus.PENDING) throw new Error('Questo elemento inbox e gia stato gestito.');

  const metadata = await parseDocumentMetadata(formData, item.suggestedNoticeDays || undefined);
  const documentStatus = await resolveDocumentStatusForEntity(metadata.entityType, metadata.entityId, metadata.status);
  const storedPdf = inboxItemToStoredPdf(item);
  const replacementMode = formString(formData, 'replacementMode');
  const replacementDocumentId = formString(formData, 'replacementDocumentId');
  const shouldReplace = replacementMode === 'replace' && Boolean(replacementDocumentId);
  const previousReplacementDocument = shouldReplace && replacementDocumentId
    ? await getMirrorDocumentById(replacementDocumentId)
    : null;

  const document = await prisma.$transaction(async (tx) => {
    if (shouldReplace) {
      const replacementDocument = await tx.document.findUnique({
        where: { id: replacementDocumentId },
        select: {
          id: true,
          status: true,
          documentTypeId: true,
          entityType: true,
          driverId: true,
          tractorId: true,
          trailerId: true,
          otherEntityId: true
        }
      });
      if (!replacementDocument) throw new Error('Documento da sostituire non trovato.');
      if (!documentCanBeRenewalSource(replacementDocument)) {
        throw new Error('Il documento selezionato e gia nello storico.');
      }
      if (!documentMatchesTypeAndEntity(replacementDocument, metadata.documentTypeId, metadata.entityType, metadata.entityId)) {
        throw new Error('Il documento da sostituire non corrisponde a tipo documento e associato selezionati.');
      }

      await tx.document.update({
        where: { id: replacementDocument.id },
        data: { status: DocumentStatus.RENEWED }
      });
    }

    const document = await tx.document.create({
      data: {
        title: metadata.title,
        documentTypeId: metadata.documentTypeId,
        entityType: metadata.entityType,
        ...buildEntityRelation(metadata.entityType, metadata.entityId),
        issueDate: metadata.issueDate,
        expiryDate: metadata.expiryDate,
        noticeDays: metadata.noticeDays,
        amountCents: metadata.amountCents,
        notes: metadata.notes,
        status: documentStatus,
        renewedFromId: shouldReplace ? replacementDocumentId : undefined,
        ...storedPdf
      }
    });

    await tx.documentInboxItem.update({
      where: { id },
      data: {
        status: DocumentInboxStatus.IMPORTED,
        documentId: document.id
      }
    });

    if (shouldReplace && replacementDocumentId && previousReplacementDocument) {
      await enqueueDocumentMirrorSync(tx, {
        documentId: replacementDocumentId,
        previousDocument: previousReplacementDocument,
        uploadRequired: false
      });
    }
    await enqueueDocumentMirrorSync(tx, { documentId: document.id, uploadRequired: true });

    return document;
  });
  await alignLibrettoExpiryToBarratoRosa(document.id);

  return document;
}

export async function discardInboxItem(id: string) {
  const item = await prisma.documentInboxItem.findUnique({ where: { id } });
  if (!item) throw new Error('Elemento inbox non trovato.');
  if (item.status === DocumentInboxStatus.IMPORTED) throw new Error('Un PDF gia importato non puo essere eliminato dalla inbox.');

  await removeStoredPdf(item.filePath);
  await prisma.documentInboxItem.delete({ where: { id } });
}

export async function discardAllPendingInboxItems() {
  const items = await prisma.documentInboxItem.findMany({
    where: { status: DocumentInboxStatus.PENDING },
    select: { id: true, filePath: true }
  });

  for (const item of items) {
    await removeStoredPdf(item.filePath);
  }

  if (items.length > 0) {
    await prisma.documentInboxItem.deleteMany({
      where: { id: { in: items.map((item) => item.id) } }
    });
  }

  return items.length;
}
