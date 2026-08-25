import Link from 'next/link';
import { History } from 'lucide-react';
import { DocumentTable } from '@/components/DocumentTable';
import { type DocumentWithRelations, splitDocumentsByLifecycle } from '@/lib/documents';

type EntityDocumentSectionsProps = {
  documents: DocumentWithRelations[];
  /** Chiave `TIPO:id` usata per aprire lo storico completo gia filtrato. */
  entityKey: string;
  title?: string;
  currentEmptyText?: string;
  historyTitle?: string;
  historyDescription?: string;
};

/**
 * Documenti di un'anagrafica divisi in due blocchi distinti: prima quelli in
 * vigore, poi lo storico dei sostituiti/archiviati, chiuso di default. Prima
 * comparivano mescolati e un mezzo con molti rinnovi rendeva illeggibile
 * l'elenco reale delle scadenze attive.
 */
export function EntityDocumentSections({
  documents,
  entityKey,
  title = 'Documenti targa',
  currentEmptyText = 'Nessun documento in vigore.',
  historyTitle = 'Documenti sostituiti e archiviati',
  historyDescription = 'Rinnovi precedenti e documenti archiviati. Non incidono su scadenze, notifiche e checklist.'
}: EntityDocumentSectionsProps) {
  const { current, historical } = splitDocumentsByLifecycle(documents);

  return (
    <>
      <section className="detail-section">
        <div className="section-heading-inline">
          <h2>
            {title} <span className="section-count">({current.length})</span>
          </h2>
          <span className="muted">Documenti attualmente in vigore, scaduti compresi finche non vengono rinnovati.</span>
        </div>
        <DocumentTable documents={current} emptyText={currentEmptyText} />
      </section>

      <DocumentHistorySection
        documents={historical}
        entityKey={entityKey}
        title={historyTitle}
        description={historyDescription}
      />
    </>
  );
}

type DocumentHistorySectionProps = {
  documents: DocumentWithRelations[];
  entityKey: string;
  title?: string;
  description?: string;
};

/** Solo il blocco storico, per le schede che dividono gia i documenti correnti. */
export function DocumentHistorySection({
  documents,
  entityKey,
  title = 'Documenti sostituiti e archiviati',
  description = 'Rinnovi precedenti e documenti archiviati. Non incidono su scadenze, notifiche e checklist.'
}: DocumentHistorySectionProps) {
  if (documents.length === 0) return null;

  return (
    <section className="detail-section document-history-section">
      <details>
        <summary>
          <span className="document-history-summary">
            <History size={16} aria-hidden />
            <strong>{title}</strong>
            <span className="badge inactive">{documents.length}</span>
          </span>
          <span className="muted">{description}</span>
        </summary>
        <div className="document-history-body">
          <DocumentTable documents={documents} emptyText="Nessun documento storico." />
          <Link className="secondary-button" href={`/documents/history?entityKey=${encodeURIComponent(entityKey)}`}>
            <History size={16} aria-hidden />
            Apri lo storico completo
          </Link>
        </div>
      </details>
    </section>
  );
}
