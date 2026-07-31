import { EntityType } from '@prisma/client';
import Link from 'next/link';
import { CircleCheckBig, CircleMinus, Download, FilePlus2, FileWarning, RotateCcw, XCircle } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { excludeChecklistDocumentAction, restoreChecklistDocumentAction } from '@/lib/document-checklist-actions';
import { type DocumentChecklist as DocumentChecklistData } from '@/lib/document-checklist';
import { formatDate } from '@/lib/dates';

type DocumentChecklistProps = {
  checklist: DocumentChecklistData;
  entityType: EntityType;
  entityId: string;
};

function getDocumentHref(entityType: EntityType, entityId: string, documentTypeId: string): string {
  const params = new URLSearchParams({
    entityType,
    entityId,
    documentTypeId
  });

  return `/documents/new?${params.toString()}`;
}

export function DocumentChecklist({ checklist, entityType, entityId }: DocumentChecklistProps) {
  return (
    <section className="detail-section document-checklist">
      <h2>Checklist documenti</h2>
      <dl className="checklist-summary">
        <div>
          <dt>Tipi categoria</dt>
          <dd>{checklist.total}</dd>
        </div>
        <div>
          <dt>Inseriti</dt>
          <dd>{checklist.inserted}</dd>
        </div>
        <div>
          <dt>Mancanti</dt>
          <dd>{checklist.missing}</dd>
        </div>
        <div>
          <dt>Non richiesti</dt>
          <dd>{checklist.excluded}</dd>
        </div>
      </dl>
      {checklist.items.length === 0 ? (
        <div className="empty-state">Nessun tipo documento attivo per questa categoria.</div>
      ) : (
        <ul className="checklist-list">
          {checklist.items.map((item) => (
            <li className="checklist-row" key={item.id}>
              <div className="checklist-main">
                {item.status === 'inserted' ? <CircleCheckBig className="checklist-icon inserted" size={18} aria-hidden /> : null}
                {item.status === 'missing' ? <XCircle className="checklist-icon missing" size={18} aria-hidden /> : null}
                {item.status === 'excluded' ? <CircleMinus className="checklist-icon excluded" size={18} aria-hidden /> : null}
                <div>
                  <strong>{item.name}</strong>
                  <div className="muted">
                    {item.status === 'inserted' ? (
                      <>
                        {item.insertedCount === 1 ? '1 inserito' : `${item.insertedCount} inseriti`}
                        {item.latestDocument ? ` - scadenza ${formatDate(item.latestDocument.expiryDate)}` : null}
                      </>
                    ) : null}
                    {item.status === 'missing' ? 'Mancante' : null}
                    {item.status === 'excluded' ? 'Non richiesto' : null}
                  </div>
                  {item.status === 'inserted' && item.latestDocument && !item.latestDocument.hasFile ? (
                    <div className="checklist-note missing-pdf">
                      <FileWarning size={14} aria-hidden />
                      Scadenza inserita, PDF da allegare appena disponibile.
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="actions-row">
                {item.status === 'inserted' && item.latestDocument?.hasFile ? (
                  <Link className="secondary-button" href={`/api/documents/${item.latestDocument.id}/file`} target="_blank">
                    <Download size={16} aria-hidden />
                    PDF
                  </Link>
                ) : null}
                {item.status === 'missing' ? (
                  <>
                    <Link className="primary-button" href={getDocumentHref(entityType, entityId, item.id)}>
                      <FilePlus2 size={16} aria-hidden />
                      Documento
                    </Link>
                    <form action={excludeChecklistDocumentAction.bind(null, entityType, entityId, item.id)}>
                      <ConfirmSubmitButton
                        className="secondary-button"
                        message={`Segnare "${item.name}" come non richiesto per questa targa? Potrai renderlo di nuovo richiesto dalla stessa checklist.`}
                      >
                        <CircleMinus size={16} aria-hidden />
                        Non richiesto
                      </ConfirmSubmitButton>
                    </form>
                  </>
                ) : null}
                {item.status === 'excluded' ? (
                  <form action={restoreChecklistDocumentAction.bind(null, entityType, entityId, item.id)}>
                    <button className="secondary-button" type="submit">
                      <RotateCcw size={16} aria-hidden />
                      Rendi richiesto
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
