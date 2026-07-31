import Link from 'next/link';
import { Download } from 'lucide-react';
import { daysUntil, formatDate } from '@/lib/dates';
import { type DocumentWithRelations, getEntityLabel } from '@/lib/documents';
import { StatusBadge } from '@/components/StatusBadge';

type DocumentTableProps = {
  documents: DocumentWithRelations[];
  emptyText?: string;
};

export function DocumentTable({ documents, emptyText = 'Nessun documento trovato.' }: DocumentTableProps) {
  if (documents.length === 0) {
    return <div className="empty-state">{emptyText}</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Titolo</th>
            <th>Tipo</th>
            <th>Associato a</th>
            <th>Scadenza</th>
            <th>Stato</th>
            <th>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => {
            const documentHref = `/documents/${document.id}`;

            return (
              <tr className="clickable-row" key={document.id}>
                <td className="click-cell">
                  <Link className="table-cell-link" href={documentHref} prefetch={false}>
                    <strong>{document.title}</strong>
                    <div className="muted">{document.originalFileName || 'PDF non ancora caricato'}</div>
                  </Link>
                </td>
                <td className="click-cell">
                  <Link className="table-cell-link" href={documentHref} prefetch={false}>
                    {document.documentType.name}
                  </Link>
                </td>
                <td className="click-cell">
                  <Link className="table-cell-link" href={documentHref} prefetch={false}>
                    {getEntityLabel(document)}
                  </Link>
                </td>
                <td className="click-cell">
                  <Link className="table-cell-link" href={documentHref} prefetch={false}>
                    {formatDate(document.expiryDate)}
                    <div className="muted">{daysUntil(document.expiryDate)} giorni</div>
                  </Link>
                </td>
                <td className="click-cell">
                  <Link className="table-cell-link" href={documentHref} prefetch={false}>
                    <StatusBadge document={document} />
                  </Link>
                </td>
                <td className="actions-cell">
                  <div className="actions-row">
                    {document.filePath ? (
                      <Link className="secondary-button" href={`/api/documents/${document.id}/file`} target="_blank" prefetch={false}>
                        <Download size={16} aria-hidden />
                        PDF
                      </Link>
                    ) : (
                      <span className="file-missing-pill">No PDF</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
