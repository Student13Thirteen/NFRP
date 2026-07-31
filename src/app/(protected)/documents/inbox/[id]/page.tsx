import { requireUser } from '@/lib/auth';
import { DocumentInboxStatus, DocumentStatus } from '@prisma/client';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, Trash2, Wand2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { InboxAutoRefresh } from '@/components/InboxAutoRefresh';
import { InboxDocumentReviewForm } from '@/components/InboxDocumentReviewForm';
import { PageHeader } from '@/components/PageHeader';
import { formatDate, toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { documentCanBeRenewalSource, documentInclude, getDocumentEntityKey, getEntityLabel, getStatusLabel } from '@/lib/documents';
import { buildEntityKey, buildEntityOptions } from '@/lib/entities';
import { formatEuroCents } from '@/lib/expense-shared';

function amountInputValue(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : (value / 100).toFixed(2).replace('.', ',');
}

type InboxDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; replaceDocumentId?: string }>;
};

export default async function InboxDetailPage({ params, searchParams }: InboxDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const item = await prisma.documentInboxItem.findUnique({ where: { id } });
  if (!item) notFound();

  const [documentTypes, drivers, tractors, trailers, otherEntities, replacementDocuments] = await Promise.all([
    prisma.documentType.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.driver.findMany({ where: { active: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractor.findMany({ where: { active: true }, orderBy: { plate: 'asc' } }),
    prisma.trailer.findMany({ where: { active: true }, orderBy: { plate: 'asc' } }),
    prisma.otherEntity.findMany({ where: { active: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
    prisma.document.findMany({
      where: { status: { notIn: [DocumentStatus.ARCHIVED, DocumentStatus.RENEWED] } },
      include: documentInclude,
      orderBy: [{ expiryDate: 'desc' }, { updatedAt: 'desc' }]
    })
  ]);

  const entityOptions = buildEntityOptions({ drivers, tractors, trailers, otherEntities });
  const preferredReplacementDocument =
    replacementDocuments.find((document) => document.id === resolvedSearchParams.replaceDocumentId) || null;
  const defaultDocumentTypeId = preferredReplacementDocument?.documentTypeId || item.suggestedDocumentTypeId || '';
  const selectedDocumentType = documentTypes.find((documentType) => documentType.id === defaultDocumentTypeId) || null;
  const isFireExtinguisherDocument = Boolean(
    selectedDocumentType?.name.toLocaleLowerCase('it-IT').includes('estintor')
  );
  const defaultEntityKey =
    preferredReplacementDocument
      ? getDocumentEntityKey(preferredReplacementDocument)
      : item.suggestedEntityType && item.suggestedEntityId
        ? buildEntityKey(item.suggestedEntityType, item.suggestedEntityId)
        : '';
  const replacementCandidates = replacementDocuments.filter(documentCanBeRenewalSource).map((document) => ({
    id: document.id,
    title: document.title,
    documentTypeId: document.documentTypeId,
    entityKey: getDocumentEntityKey(document),
    entityLabel: getEntityLabel(document),
    expiryDateLabel: formatDate(document.expiryDate),
    issueDateLabel: formatDate(document.issueDate),
    fileName: document.originalFileName
  }));
  const statusOptions = [DocumentStatus.VALID, DocumentStatus.EXPIRING, DocumentStatus.EXPIRED, DocumentStatus.ARCHIVED].map((status) => ({
    value: status,
    label: getStatusLabel(status)
  }));
  const canImport = item.status === DocumentInboxStatus.PENDING;
  const analyzing = canImport && item.analyzedAt === null;

  return (
    <>
      <PageHeader
        title="Revisione inbox"
        description={item.originalFileName}
        action={
          <Link className="secondary-button" href={`/api/document-inbox/${item.id}/file`} target="_blank">
            <Download size={16} aria-hidden />
            Apri PDF
          </Link>
        }
      />

      <InboxAutoRefresh pendingCount={analyzing ? 1 : 0} />

      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}
      {analyzing ? (
        <div className="feedback-banner info" role="status" style={{ marginBottom: 18 }}>
          <Wand2 size={18} aria-hidden />
          <div>
            <strong>Analisi automatica in corso</strong>
            <span>
              Sto leggendo il PDF (testo/OCR). I campi suggeriti compaiono tra pochi secondi: la pagina si
              aggiorna da sola. Puoi comunque compilare i dati a mano e confermare.
            </span>
          </div>
        </div>
      ) : null}

      <div className="grid two">
        <section className="detail-section">
          <h2>Analisi automatica</h2>
          <dl className="detail-list">
            <div>
              <dt>Stato</dt>
              <dd>{canImport ? 'Da revisionare' : item.status === DocumentInboxStatus.IMPORTED ? 'Importato' : 'Scartato'}</dd>
            </div>
            <div>
              <dt>Affidabilita</dt>
              <dd>
                <span className={`confidence-pill ${item.confidence >= 70 ? 'high' : item.confidence >= 40 ? 'medium' : 'low'}`}>
                  <Wand2 size={13} aria-hidden />
                  {item.confidence}%
                </span>
              </dd>
            </div>
            <div>
              <dt>File</dt>
              <dd>{item.originalFileName}</dd>
            </div>
            <div>
              <dt>Dimensione</dt>
              <dd>{Math.round(item.fileSize / 1024)} KB</dd>
            </div>
            <div>
              <dt>Emissione suggerita</dt>
              <dd>{formatDate(item.suggestedIssueDate)}</dd>
            </div>
            <div>
              <dt>Scadenza suggerita</dt>
              <dd>{formatDate(item.suggestedExpiryDate)}</dd>
            </div>
            <div>
              <dt>Costo suggerito</dt>
              <dd>{formatEuroCents(item.suggestedAmountCents)}</dd>
            </div>
          </dl>
          <p className="muted">{item.analysisNotes || item.extractionStatus || 'Nessuna nota di analisi.'}</p>
          {item.extractedText ? (
            <details className="inbox-text-preview">
              <summary>Testo letto dal PDF</summary>
              <p>{item.extractedText.slice(0, 3500)}</p>
            </details>
          ) : null}
          {!canImport && item.documentId ? (
            <Link className="primary-button" href={`/documents/${item.documentId}`}>
              Apri documento importato
            </Link>
          ) : null}
        </section>

        <section className="panel">
          <h2>Conferma dati documento</h2>
          {canImport ? (
            <InboxDocumentReviewForm
              action={`/api/document-inbox/${item.id}/create-document`}
              documentTypes={documentTypes}
              entityOptions={entityOptions}
              defaultValues={{
                title: item.suggestedTitle || preferredReplacementDocument?.title || '',
                documentTypeId: defaultDocumentTypeId,
                entityKey: defaultEntityKey,
                issueDate: toDateInputValue(item.suggestedIssueDate),
                expiryDate: toDateInputValue(item.suggestedExpiryDate),
                noticeDays: item.suggestedNoticeDays || preferredReplacementDocument?.noticeDays || selectedDocumentType?.defaultNoticeDays || 30,
                amount: amountInputValue(item.suggestedAmountCents),
                status: DocumentStatus.VALID,
                notes: item.suggestedNotes || (isFireExtinguisherDocument ? '' : preferredReplacementDocument?.notes || '')
              }}
              statusOptions={statusOptions}
              replacementCandidates={replacementCandidates}
              defaultReplacementDocumentId={preferredReplacementDocument?.id}
            />
          ) : (
            <p className="muted">Questo elemento inbox e gia stato gestito.</p>
          )}
          {canImport ? (
            <form action={`/api/document-inbox/${item.id}/discard`} method="post" className="actions-row" style={{ marginTop: 12 }}>
              <ConfirmSubmitButton className="danger-button" message="Eliminare definitivamente questo PDF dalla inbox?">
                <Trash2 size={16} aria-hidden />
                Elimina
              </ConfirmSubmitButton>
            </form>
          ) : null}
        </section>
      </div>
    </>
  );
}
