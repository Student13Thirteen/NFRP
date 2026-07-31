import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CreditCard, Download, Filter, UploadCloud } from 'lucide-react';
import { FilteredReportButton } from '@/components/FilteredReportButton';
import { PageHeader } from '@/components/PageHeader';
import { TablePagination } from '@/components/TablePagination';
import { formatDate } from '@/lib/dates';
import { paginateItems } from '@/lib/pagination';
import {
  getTollBatchState,
  getTollBatchStateLabel,
  getTollBatchSummaries,
  tollBatchMatchesSearch,
  type TollBatchState
} from '@/lib/toll-batches';
import { formatTollDistance, formatTollMoney } from '@/lib/tolls';

type TollsSearchParams = {
  page?: string;
  pageSize?: string;
  q?: string;
  status?: string;
};

type TollsPageProps = {
  searchParams: Promise<TollsSearchParams>;
};

const validStates: TollBatchState[] = ['pending', 'needs_review', 'confirmed', 'discarded'];

function statusClass(status: TollBatchState): string {
  if (status === 'pending') return 'fuel-status-pending';
  if (status === 'needs_review') return 'fuel-status-needs-review';
  if (status === 'confirmed') return 'fuel-status-ok';
  return 'inactive';
}

function formatPeriod(from: Date | null, to: Date | null): string {
  if (!from && !to) return '-';
  if (!from || !to || from.getTime() === to.getTime()) return formatDate(from || to);
  return `${formatDate(from)} - ${formatDate(to)}`;
}

export default async function TollsPage({ searchParams }: TollsPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const allBatches = await getTollBatchSummaries();
  const statusFilter = validStates.includes(resolvedSearchParams.status as TollBatchState)
    ? (resolvedSearchParams.status as TollBatchState)
    : null;
  const filteredBatches = allBatches.filter((batch) => {
    if (statusFilter && getTollBatchState(batch) !== statusFilter) return false;
    return tollBatchMatchesSearch(batch, resolvedSearchParams.q);
  });
  const pagination = paginateItems(filteredBatches, resolvedSearchParams.page, resolvedSearchParams.pageSize);
  const totalEntries = filteredBatches.reduce((sum, batch) => sum + batch.entryCount, 0);
  const totalGrossCents = filteredBatches.reduce((sum, batch) => sum + batch.storedGrossCents, 0);
  const totalNetCents = filteredBatches.reduce((sum, batch) => sum + batch.storedNetCents, 0);
  const totalDistanceKm = filteredBatches.reduce((sum, batch) => sum + batch.distanceKm, 0);
  const pendingBatches = allBatches.filter((batch) => batch.pendingCount > 0);
  const pendingRows = pendingBatches.reduce((sum, batch) => sum + batch.pendingCount, 0);
  const reviewBatches = allBatches.filter((batch) => getTollBatchState(batch) === 'needs_review').length;

  return (
    <>
      <PageHeader
        title="Fatture autostrade"
        description="Registro mensile dei file pedaggi importati."
        action={
          <div className="actions-row">
            <FilteredReportButton baseHref="/api/reports/tolls" label="Report confermati" />
            <Link className="secondary-button" href="/tolls/cards">
              <CreditCard size={16} aria-hidden />
              Tessere
            </Link>
            <Link className="primary-button" href="/tolls/import">
              <UploadCloud size={16} aria-hidden />
              Import CSV
            </Link>
          </div>
        }
      />

      {pendingRows > 0 ? (
        <Link href="/tolls/import/review" className="panel toll-pending-banner">
          <AlertTriangle size={18} aria-hidden />
          <span>
            <strong>{pendingBatches.length} file da confermare</strong>
            <small>{pendingRows.toLocaleString('it-IT')} pedaggi in attesa</small>
          </span>
          <span className="metric-action">
            Apri controllo
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
      ) : null}

      <section className="metrics" aria-label="Riepilogo file autostrade">
        <div className="metric">
          <span>File / fatture</span>
          <strong>{filteredBatches.length}</strong>
        </div>
        <div className="metric">
          <span>Pedaggi nei file</span>
          <strong>{totalEntries.toLocaleString('it-IT')}</strong>
        </div>
        <div className="metric">
          <span>Totale nei file</span>
          <strong>{formatTollMoney(totalGrossCents)}</strong>
        </div>
        <div className="metric">
          <span>Netto nei file</span>
          <strong>{formatTollMoney(totalNetCents)}</strong>
        </div>
        <div className="metric">
          <span>Distanza</span>
          <strong>{formatTollDistance(totalDistanceKm)}</strong>
        </div>
        <Link className="metric metric-link" href="/tolls?status=needs_review" aria-label="Vedi fatture autostrade con avvisi">
          <span>File con avvisi</span>
          <strong>{reviewBatches}</strong>
          <span className="metric-action">
            Vedi file
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
      </section>

      <form className="filter-bar toll-batch-filter" action="/tolls">
        <label>
          Cerca
          <input name="q" placeholder="Numero fattura, file, fornitore" defaultValue={resolvedSearchParams.q || ''} />
        </label>
        <label>
          Stato
          <select name="status" defaultValue={statusFilter || ''}>
            <option value="">Tutti</option>
            <option value="pending">Da confermare</option>
            <option value="needs_review">Con avvisi</option>
            <option value="confirmed">Confermati</option>
            <option value="discarded">Scartati</option>
          </select>
        </label>
        <div className="filter-actions">
          <button className="primary-button" type="submit">
            <Filter size={15} aria-hidden />
            Filtra
          </button>
          <Link className="secondary-button" href="/tolls">Reset</Link>
          <span className="filter-count">{filteredBatches.length} file</span>
        </div>
      </form>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fattura / file</th>
              <th>Data fattura</th>
              <th>Periodo pedaggi</th>
              <th>Pedaggi</th>
              <th>Distanza</th>
              <th>Netto</th>
              <th>IVA</th>
              <th>Ivato</th>
              <th>Stato</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.length === 0 ? (
              <tr>
                <td colSpan={10} className="empty-state">Nessun file autostrade trovato.</td>
              </tr>
            ) : (
              pagination.items.map((batch) => {
                const href = `/tolls/imports/${batch.id}`;
                const state = getTollBatchState(batch);
                return (
                  <tr className="clickable-row" key={batch.id}>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={href}>
                        <strong>{batch.invoiceNumber ? `Fattura ${batch.invoiceNumber}` : 'File senza numero fattura'}</strong>
                        <span className="muted">{batch.originalFileName}</span>
                      </Link>
                    </td>
                    <td className="click-cell"><Link className="table-cell-link" href={href}>{formatDate(batch.invoiceDate)}</Link></td>
                    <td className="click-cell"><Link className="table-cell-link" href={href}>{formatPeriod(batch.firstTollDate, batch.lastTollDate)}</Link></td>
                    <td className="click-cell"><Link className="table-cell-link" href={href}>{batch.entryCount.toLocaleString('it-IT')}</Link></td>
                    <td className="click-cell"><Link className="table-cell-link" href={href}>{formatTollDistance(batch.distanceKm)}</Link></td>
                    <td className="click-cell"><Link className="table-cell-link" href={href}>{formatTollMoney(batch.storedNetCents)}</Link></td>
                    <td className="click-cell"><Link className="table-cell-link" href={href}>{formatTollMoney(batch.storedVatCents)}</Link></td>
                    <td className="click-cell"><Link className="table-cell-link" href={href}><strong>{formatTollMoney(batch.storedGrossCents)}</strong></Link></td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={href}>
                        <span className={`badge ${statusClass(state)}`}>{getTollBatchStateLabel(state)}</span>
                        {batch.pendingCount > 0 ? <span className="muted">{batch.pendingCount.toLocaleString('it-IT')} righe</span> : null}
                      </Link>
                    </td>
                    <td>
                      <div className="actions-row">
                        <Link className="secondary-button compact-button" href={href} aria-label={`Apri ${batch.invoiceNumber || batch.originalFileName}`}>
                          Apri
                          <ArrowRight size={14} aria-hidden />
                        </Link>
                        <Link className="icon-button" href={`/api/tolls/imports/${batch.id}/file`} target="_blank" prefetch={false} title="Scarica CSV" aria-label="Scarica CSV">
                          <Download size={16} aria-hidden />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
      <TablePagination
        currentPage={pagination.currentPage}
        from={pagination.from}
        pathname="/tolls"
        searchParams={resolvedSearchParams}
        to={pagination.to}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </>
  );
}
