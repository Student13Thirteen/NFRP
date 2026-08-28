import Link from 'next/link';
import { ArrowRight, CarFront, FileText } from 'lucide-react';
import { formatDate } from '@/lib/dates';
import { getRoadAccidentStatusLabel, getRoadFineStatusLabel } from '@/lib/road-events';

type FineRow = {
  id: string;
  violationDate: Date | null;
  noticeNumber: string | null;
  authority: string | null;
  status: string;
};

type AccidentRow = {
  id: string;
  accidentDate: Date;
  claimNumber: string | null;
  location: string;
  status: string;
};

type Props = { fines: FineRow[]; accidents: AccidentRow[] };

function badgeClass(status: string) {
  if (status === 'PAID' || status === 'CLOSED') return 'fuel-status-ok';
  if (status === 'CANCELLED') return 'fuel-status-verified';
  return 'fuel-status-review';
}

export function EntityRoadEventsPanel({ fines, accidents }: Props) {
  return (
    <section className="detail-section">
      <div className="section-heading-inline">
        <div>
          <span className="section-kicker">Costi e controllo</span>
          <h2>Verbali e sinistri</h2>
        </div>
        <span>{fines.length + accidents.length} registrazioni</span>
      </div>
      {fines.length === 0 && accidents.length === 0 ? (
        <p className="empty-state">Nessun verbale o sinistro collegato.</p>
      ) : (
        <div className="timeline-list">
          {fines.map((fine) => (
            <article key={`fine-${fine.id}`}>
              <span className="actions-row">
                <FileText size={16} aria-hidden />
                <span>
                  <strong>{fine.noticeNumber || fine.authority || 'Verbale da controllare'}</strong>
                  <small className="muted">Verbale · {formatDate(fine.violationDate)}</small>
                </span>
              </span>
              <span className="actions-row">
                <span className={`badge ${badgeClass(fine.status)}`}>{getRoadFineStatusLabel(fine.status)}</span>
                <Link className="table-cell-link" href={`/fines/${fine.id}`} aria-label={`Apri verbale ${fine.noticeNumber || fine.authority || 'da controllare'}`}>
                  Apri <ArrowRight size={14} aria-hidden />
                </Link>
              </span>
            </article>
          ))}
          {accidents.map((accident) => (
            <article key={`accident-${accident.id}`}>
              <span className="actions-row">
                <CarFront size={16} aria-hidden />
                <span>
                  <strong>{accident.claimNumber || accident.location}</strong>
                  <small className="muted">Sinistro · {formatDate(accident.accidentDate)}</small>
                </span>
              </span>
              <span className="actions-row">
                <span className={`badge ${badgeClass(accident.status)}`}>{getRoadAccidentStatusLabel(accident.status)}</span>
                <Link className="table-cell-link" href={`/road-accidents/${accident.id}`} aria-label={`Apri sinistro ${accident.claimNumber || accident.location}`}>
                  Apri <ArrowRight size={14} aria-hidden />
                </Link>
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
