import { requireUser } from '@/lib/auth';
import { DocumentStatus } from '@prisma/client';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Archive, Download, Plus, RotateCw, Save, Trash2, Wand2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { DatePartsInput } from '@/components/DatePartsInput';
import { DocumentTable } from '@/components/DocumentTable';
import { EntitySelect } from '@/components/EntitySelect';
import { FileUpload } from '@/components/FileUpload';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate, toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { documentCanBeRenewalSource, documentInclude, getDocumentEntityKey, getEntityLabel, getStatusLabel } from '@/lib/documents';
import { buildEntityOptions } from '@/lib/entities';
import { formatEuroCents } from '@/lib/expense-shared';
import { archiveDocumentAction, deleteDocumentAction } from '../actions';

function amountInputValue(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : (value / 100).toFixed(2).replace('.', ',');
}

type DocumentDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function DocumentDetailPage({ params, searchParams }: DocumentDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      ...documentInclude,
      renewedFrom: { include: documentInclude },
      renewals: { include: documentInclude, orderBy: { createdAt: 'desc' } },
      notifications: { orderBy: { sentAt: 'desc' }, take: 5 }
    }
  });
  if (!document) notFound();

  const [documentTypes, drivers, tractors, trailers, otherEntities] = await Promise.all([
    prisma.documentType.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.trailer.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.otherEntity.findMany({ orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }] })
  ]);

  const entityOptions = buildEntityOptions({ drivers, tractors, trailers, otherEntities });
  const currentEntityKey = getDocumentEntityKey(document);
  const canRenewDocument = documentCanBeRenewalSource(document);
  const documentEntityId =
    document.driverId || document.tractorId || document.trailerId || document.otherEntityId || undefined;
  const newDocumentParams = new URLSearchParams({
    documentTypeId: document.documentTypeId,
    entityType: document.entityType
  });
  if (documentEntityId) newDocumentParams.set('entityId', documentEntityId);
  const newDocumentHref = `/documents/new?${newDocumentParams.toString()}`;

  return (
    <>
      <PageHeader
        title={document.title}
        description={`${document.documentType.name} - ${getEntityLabel(document)}`}
        action={
          <div className="actions-row">
            {document.filePath ? (
              <Link className="secondary-button" href={`/api/documents/${document.id}/file`} target="_blank">
                <Download size={16} aria-hidden />
                Apri PDF
              </Link>
            ) : null}
            <Link className="primary-button" href={newDocumentHref}>
              <Plus size={16} aria-hidden />
              Nuovo documento
            </Link>
          </div>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <div className="grid two">
        <section className="detail-section">
          <h2>Scheda documento</h2>
          <dl className="detail-list">
            <div>
              <dt>Stato</dt>
              <dd>
                <StatusBadge document={document} />
              </dd>
            </div>
            <div>
              <dt>Scadenza</dt>
              <dd>{formatDate(document.expiryDate)}</dd>
            </div>
            <div>
              <dt>Emissione</dt>
              <dd>{formatDate(document.issueDate)}</dd>
            </div>
            <div>
              <dt>Preavviso</dt>
              <dd>{document.noticeDays} giorni</dd>
            </div>
            <div>
              <dt>Costo associato</dt>
              <dd>{formatEuroCents(document.amountCents)}</dd>
            </div>
            <div>
              <dt>File</dt>
              <dd>{document.originalFileName || 'PDF non ancora caricato'}</dd>
            </div>
            <div>
              <dt>Dimensione</dt>
              <dd>{document.fileSize ? `${Math.round(document.fileSize / 1024)} KB` : 'Non disponibile'}</dd>
            </div>
          </dl>
          {document.notes ? <p>{document.notes}</p> : null}
        </section>

        <section className="panel">
          <h2>Modifica metadati</h2>
          <form action={`/api/documents/${document.id}/update`} method="post" encType="multipart/form-data" className="form-stack" noValidate>
            <div className="form-grid">
              <label>
                Titolo
                <input name="title" defaultValue={document.title} required />
              </label>
              <label>
                Tipo documento
                <select name="documentTypeId" defaultValue={document.documentTypeId} required>
                  {documentTypes.map((documentType) => (
                    <option key={documentType.id} value={documentType.id}>
                      {documentType.name}
                      {documentType.active ? '' : ' (non attivo)'}
                    </option>
                  ))}
                </select>
              </label>
              <EntitySelect options={entityOptions} defaultValue={currentEntityKey} />
              <DatePartsInput label="Data emissione" name="issueDate" defaultValue={toDateInputValue(document.issueDate)} />
              <DatePartsInput label="Data scadenza" name="expiryDate" defaultValue={toDateInputValue(document.expiryDate)} required />
              <FileUpload label={document.filePath ? 'Sostituisci PDF' : 'Carica PDF'} name="file" />
              <label>
                Giorni preavviso
                <input name="noticeDays" type="number" min={1} defaultValue={document.noticeDays} required />
              </label>
              <label>
                Stato
                <select name="status" defaultValue={document.status}>
                  {Object.values(DocumentStatus).map((status) => (
                    <option key={status} value={status}>
                      {getStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Costo associato (€)
                <input
                  name="amount"
                  inputMode="decimal"
                  defaultValue={amountInputValue(document.amountCents)}
                  placeholder="Es. 13,00"
                />
              </label>
            </div>
            <label>
              Note
              <textarea name="notes" defaultValue={document.notes || ''} />
            </label>
            <div className="actions-row">
              <button className="primary-button" type="submit">
                <Save size={16} aria-hidden />
                Salva
              </button>
            </div>
          </form>
          <div className="record-actions">
            <form action={archiveDocumentAction.bind(null, document.id)}>
              <button className="secondary-button" type="submit">
                <Archive size={16} aria-hidden />
                Archivia
              </button>
            </form>
            <form action={deleteDocumentAction.bind(null, document.id)}>
              <ConfirmSubmitButton
                className="danger-button"
                message="Eliminare definitivamente questo documento e il PDF collegato? Questa operazione non si puo annullare."
              >
                <Trash2 size={16} aria-hidden />
                Elimina definitivamente
              </ConfirmSubmitButton>
            </form>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 18 }}>
        <h2>Rinnova documento</h2>
        {canRenewDocument ? (
          <div className="renewal-automation">
            <h3>Rinnovo automatico da PDF</h3>
            <form action={`/api/documents/${document.id}/renew-inbox`} method="post" encType="multipart/form-data" className="form-stack" noValidate>
              <FileUpload label="Nuovo PDF da analizzare" name="file" required />
              <button className="primary-button" type="submit">
                <Wand2 size={16} aria-hidden />
                Analizza PDF e prepara rinnovo
              </button>
            </form>
          </div>
        ) : (
          <p className="muted">Questo documento e gia nello storico.</p>
        )}
        {canRenewDocument ? (
          <div className="renewal-manual">
            <h3>Rinnovo manuale</h3>
            <form action={`/api/documents/${document.id}/renew`} method="post" encType="multipart/form-data" className="form-stack" noValidate>
              <div className="form-grid">
                <label>
                  Tipo documento
                  <select name="documentTypeId" defaultValue={document.documentTypeId} required>
                    {documentTypes.map((documentType) => (
                      <option key={documentType.id} value={documentType.id}>
                        {documentType.name}
                      </option>
                    ))}
                  </select>
                </label>
                <EntitySelect options={entityOptions} defaultValue={currentEntityKey} />
                <FileUpload label="Nuovo PDF opzionale" name="file" />
                <DatePartsInput label="Data emissione" name="issueDate" />
                <DatePartsInput label="Nuova scadenza" name="expiryDate" required />
                <label>
                  Giorni preavviso
                  <input name="noticeDays" type="number" min={1} defaultValue={document.noticeDays} required />
                </label>
                <label>
                  Costo associato (€)
                  <input
                    name="amount"
                    inputMode="decimal"
                    defaultValue={amountInputValue(document.amountCents)}
                    placeholder="Es. 13,00"
                  />
                </label>
                <input name="status" type="hidden" value={DocumentStatus.VALID} />
              </div>
              <label>
                Note
                <textarea name="notes" defaultValue={document.notes || ''} />
              </label>
              <button className="primary-button" type="submit">
                <RotateCw size={16} aria-hidden />
                Marca rinnovato e carica nuovo
              </button>
            </form>
          </div>
        ) : null}
      </section>

      <div className="grid two" style={{ marginTop: 18 }}>
        <section className="detail-section">
          <h2>Storico rinnovi</h2>
          {document.renewedFrom ? (
            <p>
              Rinnova il documento{' '}
              <Link href={`/documents/${document.renewedFrom.id}`}>
                <strong>{document.renewedFrom.title}</strong>
              </Link>
              .
            </p>
          ) : null}
          <DocumentTable documents={document.renewals} emptyText="Nessun rinnovo collegato." />
        </section>
        <section className="detail-section">
          <h2>Ultime notifiche</h2>
          {document.notifications.length === 0 ? (
            <p className="muted">Nessuna notifica registrata.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Esito</th>
                  </tr>
                </thead>
                <tbody>
                  {document.notifications.map((notification) => (
                    <tr key={notification.id}>
                      <td>{formatDate(notification.sentAt)}</td>
                      <td>{notification.type}</td>
                      <td>{notification.success ? 'OK' : notification.error || 'Errore'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
