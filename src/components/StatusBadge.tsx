import { DocumentStatus, type Document } from '@prisma/client';
import { getDocumentVisualStatus, getStatusLabel } from '@/lib/documents';

type StatusBadgeProps = {
  document?: Pick<Document, 'expiryDate' | 'noticeDays' | 'status'>;
  status?: ReturnType<typeof getDocumentVisualStatus>;
};

export function StatusBadge({ document, status }: StatusBadgeProps) {
  const visualStatus = status ?? (document ? getDocumentVisualStatus(document) : 'inactive');
  if (document?.status === DocumentStatus.ARCHIVED || document?.status === DocumentStatus.RENEWED) {
    return <span className="badge inactive">{getStatusLabel(document.status)}</span>;
  }

  return <span className={`badge ${visualStatus}`}>{getStatusLabel(visualStatus)}</span>;
}
