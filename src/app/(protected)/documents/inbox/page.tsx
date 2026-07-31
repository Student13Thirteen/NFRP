import { requireUser } from '@/lib/auth';
import { DocumentInboxStatus, DocumentStatus, EntityType } from '@prisma/client';
import Link from 'next/link';
import { Check, CheckCircle2, FileSearch, Info, Loader2, Plus, Trash2, Wand2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { InboxAutoRefresh } from '@/components/InboxAutoRefresh';
import { InboxBulkValidateButton } from '@/components/InboxBulkValidateButton';
import { InboxUploadForm } from '@/components/InboxUploadForm';
import { PageHeader } from '@/components/PageHeader';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { ensureInboxQueueStarted, getReadyInboxSuggestionCount } from '@/lib/document-inbox';
import {
  discardAllPendingInboxItemsAction,
  discardInboxItemAction,
  validateAllReadyInboxItemsAction,
  validateInboxItemAction
} from './actions';

type InboxPageProps = {
  searchParams: Promise<{ error?: string }>;
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Rome'
  }).format(date);
}

function getEntityLabel(
  item: { suggestedEntityType: EntityType | null; suggestedEntityId: string | null },
  labels: Map<string, string>
) {
  if (!item.suggestedEntityType || !item.suggestedEntityId) return 'Non riconosciuto';
  return labels.get(`${item.suggestedEntityType}:${item.suggestedEntityId}`) || 'Non riconosciuto';
}

function canValidateFromSuggestions(item: {
  suggestedDocumentTypeId: string | null;
  suggestedEntityType: EntityType | null;
  suggestedEntityId: string | null;
  suggestedExpiryDate: Date | null;
}) {
  return Boolean(item.suggestedDocumentTypeId && item.suggestedEntityType && item.suggestedEntityId && item.suggestedExpiryDate);
}

function suggestedEntityWhere(entityType: EntityType, entityId: string) {
  if (entityType === EntityType.DRIVER) return { driverId: entityId };
  if (entityType === EntityType.TRACTOR) return { tractorId: entityId };
  if (entityType === EntityType.TRAILER) return { trailerId: entityId };
  return { otherEntityId: entityId };
}

function suggestedKey(item: {
  suggestedDocumentTypeId: string | null;
  suggestedEntityType: EntityType | null;
  suggestedEntityId: string | null;
}): string | null {
  if (!item.suggestedDocumentTypeId || !item.suggestedEntityType || !item.suggestedEntityId) return null;
  return `${item.suggestedDocumentTypeId}:${item.suggestedEntityType}:${item.suggestedEntityId}`;
}

function documentKey(document: {
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
  if (!entityId) return null;
  return `${document.documentTypeId}:${document.entityType}:${entityId}`;
}

export default async function DocumentInboxPage({ searchParams }: InboxPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  await ensureInboxQueueStarted();
  const [items, counts, documentTypes, drivers, tractors, trailers, otherEntities, readyCount] = await Promise.all([
    prisma.documentInboxItem.findMany({
      where: { status: DocumentInboxStatus.PENDING },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 120
    }),
    prisma.documentInboxItem.groupBy({
      by: ['status'],
      _count: { _all: true }
    }),
    prisma.documentType.findMany({ orderBy: { name: 'asc' } }),
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.trailer.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.otherEntity.findMany({ orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }] }),
    getReadyInboxSuggestionCount()
  ]);

  const documentTypeLabels = new Map(documentTypes.map((documentType) => [documentType.id, documentType.name]));
  const entityLabels = new Map<string, string>([
    ...drivers.map((driver) => [`${EntityType.DRIVER}:${driver.id}`, `${driver.lastName} ${driver.firstName}`] as const),
    ...tractors.map((tractor) => [`${EntityType.TRACTOR}:${tractor.id}`, tractor.plate] as const),
    ...trailers.map((trailer) => [`${EntityType.TRAILER}:${trailer.id}`, trailer.plate] as const),
    ...otherEntities.map((entity) => [`${EntityType.OTHER}:${entity.id}`, `${entity.category}: ${entity.name}`] as const)
  ]);
  const countMap = new Map(counts.map((entry) => [entry.status, entry._count._all]));
  const pendingCount = countMap.get(DocumentInboxStatus.PENDING) || 0;
  const importedCount = countMap.get(DocumentInboxStatus.IMPORTED) || 0;
  const analyzingCount = items.filter((item) => item.analyzedAt === null).length;
  const suggestedReadyItems = items.filter(canValidateFromSuggestions);
  const replacementWhere = suggestedReadyItems.flatMap((item) => {
    if (!item.suggestedDocumentTypeId || !item.suggestedEntityType || !item.suggestedEntityId) return [];
    return [{
      documentTypeId: item.suggestedDocumentTypeId,
      entityType: item.suggestedEntityType,
      ...suggestedEntityWhere(item.suggestedEntityType, item.suggestedEntityId)
    }];
  });
  const activeReplacementDocuments = replacementWhere.length > 0
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
  for (const document of activeReplacementDocuments) {
    const key = documentKey(document);
    if (key) replacementCounts.set(key, (replacementCounts.get(key) || 0) + 1);
  }
  return (
    <>
      <PageHeader
        title="Inbox documenti"
        description="Carica PDF non classificati; i fascicoli con documenti distinti vengono riconosciuti e separati automaticamente."
        action={
          <Link className="secondary-button" href="/documents/new">
            <Plus size={16} aria-hidden />
            Inserimento manuale
          </Link>
        }
      />

      <section className="metrics inbox-metrics" aria-label="Stato inbox">
        <div className="metric">
          <span>Da revisionare</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="metric">
          <span>Importati</span>
          <strong>{importedCount}</strong>
        </div>
      </section>

      <div className="feedback-banner info" role="status">
        <Info size={18} aria-hidden />
        <div>
          <strong>Nuovo mezzo: carica prima la polizza</strong>
          <span>
            La polizza puo creare la targa base quando il PDF riporta il tipo veicolo. Dopo questo primo inserimento,
            libretti, revisioni, estintori e altri documenti possono agganciarsi alla stessa anagrafica e usare
            `Sostituisci` quando trovano un documento attivo gia presente.
          </span>
        </div>
      </div>

      <InboxAutoRefresh pendingCount={analyzingCount} />

      <section className="panel">
        <h2>Carica PDF in inbox</h2>
        <p className="muted">
          Puoi caricare anche una scansione continua: quando ogni pagina viene riconosciuta come documento autonomo,
          il sistema la separa in un PDF apribile e associabile alla propria targa prima della sincronizzazione su Nextcloud.
          I veri documenti multipagina con la stessa identità restano uniti.
        </p>
        {resolvedSearchParams.error ? <p className="form-error">{resolvedSearchParams.error}</p> : null}
        <InboxUploadForm />
        {analyzingCount > 0 ? (
          <p className="muted" style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={14} aria-hidden className="spin" />
            {analyzingCount === 1
              ? '1 PDF in analisi automatica: i suggerimenti compaiono tra pochi secondi.'
              : `${analyzingCount} PDF in analisi automatica: i suggerimenti compaiono tra pochi secondi.`}
          </p>
        ) : null}
      </section>

      <section className="detail-section" style={{ marginTop: 18 }}>
        <div className="actions-row" style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>PDF da revisionare</h2>
          {items.length > 0 ? (
            <div className="actions-row">
              <form action={validateAllReadyInboxItemsAction}>
                <InboxBulkValidateButton
                  readyCount={readyCount}
                  confirmMessage={`Validare automaticamente i PDF riconosciuti (${readyCount})? Se un PDF corrisponde a un documento attivo esistente, quello vecchio verra sostituito e spostato nello storico. Quelli incompleti o ambigui resteranno in inbox.`}
                />
              </form>
              <form action={discardAllPendingInboxItemsAction}>
                <ConfirmSubmitButton
                  className="danger-button"
                  message={`Eliminare definitivamente TUTTI i ${items.length} PDF in attesa dalla inbox?`}
                >
                  <Trash2 size={16} aria-hidden />
                  Elimina tutti
                </ConfirmSubmitButton>
              </form>
            </div>
          ) : null}
        </div>
        {items.length === 0 ? (
          <div className="empty-state">Nessun PDF da revisionare.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Suggerimenti</th>
                  <th>Scadenza</th>
                  <th>Affidabilita</th>
                  <th>Stato</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isPending = item.status === DocumentInboxStatus.PENDING;
                  const analyzing = item.analyzedAt === null;
                  const canValidate = canValidateFromSuggestions(item);
                  const key = suggestedKey(item);
                  const replacementCount = key ? replacementCounts.get(key) || 0 : 0;
                  const willReplace = replacementCount === 1;
                  const hasAmbiguousReplacement = replacementCount > 1;
                  const canQuickValidate = canValidate && !hasAmbiguousReplacement;
                  const documentTypeLabel = item.suggestedDocumentTypeId
                    ? documentTypeLabels.get(item.suggestedDocumentTypeId) || 'Non riconosciuto'
                    : 'Non riconosciuto';

                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.originalFileName}</strong>
                        <div className="muted">{formatDateTime(item.createdAt)}</div>
                      </td>
                      <td>
                        {analyzing ? (
                          <div className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Loader2 size={14} aria-hidden className="spin" />
                            Lettura automatica in corso…
                          </div>
                        ) : (
                          <>
                            <div>{documentTypeLabel}</div>
                            <div className="muted">{getEntityLabel(item, entityLabels)}</div>
                            {willReplace ? (
                              <div className="muted">Documento attivo trovato: il vecchio andra nello storico.</div>
                            ) : null}
                            {hasAmbiguousReplacement ? (
                              <div className="muted">Piu documenti attivi compatibili: apri la revisione manuale.</div>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td>{analyzing ? '—' : formatDate(item.suggestedExpiryDate)}</td>
                      <td>
                        {analyzing ? (
                          <span className="confidence-pill low">
                            <Loader2 size={13} aria-hidden className="spin" />
                            …
                          </span>
                        ) : (
                          <span className={`confidence-pill ${item.confidence >= 70 ? 'high' : item.confidence >= 40 ? 'medium' : 'low'}`}>
                            <Wand2 size={13} aria-hidden />
                            {item.confidence}%
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`inbox-status ${analyzing ? 'analyzing' : item.status.toLowerCase()}`}>
                          {analyzing
                            ? 'In analisi'
                            : item.status === DocumentInboxStatus.PENDING
                              ? 'Da revisionare'
                              : item.status === DocumentInboxStatus.IMPORTED
                                ? 'Importato'
                                : 'Scartato'}
                        </span>
                      </td>
                      <td>
                        <div className="actions-row">
                          {isPending ? (
                            <form action={validateInboxItemAction.bind(null, item.id)}>
                              {willReplace ? (
                                <ConfirmSubmitButton
                                  className="primary-button compact-button"
                                  message="Validare questo PDF e sostituire il documento attivo esistente? Il vecchio verra spostato nello storico e non generera piu notifiche."
                                >
                                  <Check size={15} aria-hidden />
                                  Sostituisci
                                </ConfirmSubmitButton>
                              ) : (
                                <button className="primary-button compact-button" type="submit" disabled={!canQuickValidate}>
                                  <Check size={15} aria-hidden />
                                  Valida
                                </button>
                              )}
                            </form>
                          ) : null}
                          <Link className={isPending ? 'primary-button' : 'secondary-button'} href={isPending ? `/documents/inbox/${item.id}` : item.documentId ? `/documents/${item.documentId}` : `/api/document-inbox/${item.id}/file`} target={isPending ? undefined : item.documentId ? undefined : '_blank'}>
                            {isPending ? <FileSearch size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
                            {isPending ? 'Revisiona' : item.documentId ? 'Documento' : 'PDF'}
                          </Link>
                          {isPending ? (
                            <form action={discardInboxItemAction.bind(null, item.id)}>
                              <ConfirmSubmitButton className="danger-button" message="Eliminare definitivamente questo PDF dalla inbox?">
                                <Trash2 size={16} aria-hidden />
                                Elimina
                              </ConfirmSubmitButton>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
