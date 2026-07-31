import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { TollEntryStatus } from '@prisma/client';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Check, Download, Filter, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { DatePartFilters } from '@/components/DatePartFilters';
import { FilteredReportButton } from '@/components/FilteredReportButton';
import { PageHeader } from '@/components/PageHeader';
import { TablePagination } from '@/components/TablePagination';
import { buildDateFilterYears, parseFilterDateParts, type DateFilterSearchParams } from '@/lib/date-filters';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { paginateItems } from '@/lib/pagination';
import {
  formatTollDistance,
  formatTollMoney,
  getTollEntryStatusLabel,
  getTollVehicleLabel,
  tollEntryInclude,
  tollEntryMatchesSearch,
  type TollEntryWithRelations
} from '@/lib/tolls';
import { getVehicleLabel } from '@/lib/trips';
import {
  confirmTollBatchDetailAction,
  confirmTollEntryDetailAction,
  deletePendingTollEntryDetailAction,
  deleteTollBatchDetailAction
} from '../../import/actions';

type TollBatchDetailSearchParams = DateFilterSearchParams & {
  cardId?: string;
  page?: string;
  pageSize?: string;
  q?: string;
  status?: string;
  tractorId?: string;
};

type TollBatchDetailPageProps = {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<TollBatchDetailSearchParams>;
};

type TollPlateSummary = {
  count: number;
  distanceKm: number;
  grossAmountCents: number;
  netAmountCents: number;
  plate: string;
  reviewCount: number;
  vatAmountCents: number;
};

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function matchesDateRange(entry: TollEntryWithRelations, fromDate: Date | null, toDate: Date | null): boolean {
  if (fromDate && entry.tollDate < fromDate) return false;
  if (toDate && entry.tollDate >= addUtcDays(toDate, 1)) return false;
  return true;
}

function buildPlateSummaries(entries: TollEntryWithRelations[]): TollPlateSummary[] {
  const summaries = new Map<string, TollPlateSummary>();
  for (const entry of entries) {
    const summary = summaries.get(entry.plate) || {
      count: 0,
      distanceKm: 0,
      grossAmountCents: 0,
      netAmountCents: 0,
      plate: entry.plate,
      reviewCount: 0,
      vatAmountCents: 0
    };
    summary.count += 1;
    summary.distanceKm += entry.distanceKm || 0;
    summary.grossAmountCents += entry.grossAmountCents;
    summary.netAmountCents += entry.netAmountCents;
    summary.vatAmountCents += entry.vatAmountCents;
    if (entry.reviewReasons) summary.reviewCount += 1;
    summaries.set(entry.plate, summary);
  }
  return Array.from(summaries.values()).sort((a, b) => b.grossAmountCents - a.grossAmountCents);
}

export default async function TollBatchDetailPage({ params, searchParams }: TollBatchDetailPageProps) {
  await requireUser();
  const [{ batchId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const [batch, entries, tractors, cards] = await Promise.all([
    prisma.tollImportBatch.findUnique({ where: { id: batchId } }),
    prisma.tollEntry.findMany({
      where: { importBatchId: batchId },
      include: tollEntryInclude,
      orderBy: [{ tollDate: 'desc' }, { tollTime: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.tollCard.findMany({
      include: { assignedTractor: true },
      orderBy: [{ active: 'desc' }, { cardNumber: 'asc' }]
    })
  ]);
  if (!batch) notFound();

  const tractorFilter = tractors.some((tractor) => tractor.id === resolvedSearchParams.tractorId) ? resolvedSearchParams.tractorId || '' : '';
  const cardFilter = cards.some((card) => card.id === resolvedSearchParams.cardId) ? resolvedSearchParams.cardId || '' : '';
  const statusFilter = ['pending', 'needs_review', 'ok', 'verified'].includes(resolvedSearchParams.status || '')
    ? resolvedSearchParams.status || ''
    : '';
  const fromDate = parseFilterDateParts(resolvedSearchParams, 'from');
  const toDate = parseFilterDateParts(resolvedSearchParams, 'to');
  const yearOptions = buildDateFilterYears(entries.map((entry) => entry.tollDate));
  const filteredEntries = entries.filter((entry) => {
    if (tractorFilter && entry.tractorId !== tractorFilter) return false;
    if (cardFilter && entry.cardId !== cardFilter) return false;
    if (statusFilter === 'pending' && entry.status !== TollEntryStatus.PENDING) return false;
    if (statusFilter === 'needs_review' && entry.status !== TollEntryStatus.NEEDS_REVIEW) return false;
    if (statusFilter === 'ok' && entry.status !== TollEntryStatus.OK) return false;
    if (statusFilter === 'verified' && entry.status !== TollEntryStatus.VERIFIED) return false;
    if (!matchesDateRange(entry, fromDate, toDate)) return false;
    return tollEntryMatchesSearch(entry, resolvedSearchParams.q);
  });

  const pagination = paginateItems(filteredEntries, resolvedSearchParams.page, resolvedSearchParams.pageSize);
  const totalNetCents = filteredEntries.reduce((sum, entry) => sum + entry.netAmountCents, 0);
  const totalVatCents = filteredEntries.reduce((sum, entry) => sum + entry.vatAmountCents, 0);
  const totalGrossCents = filteredEntries.reduce((sum, entry) => sum + entry.grossAmountCents, 0);
  const totalDistanceKm = filteredEntries.reduce((sum, entry) => sum + (entry.distanceKm || 0), 0);
  const pendingCount = entries.filter((entry) => entry.status === TollEntryStatus.PENDING).length;
  const hasReportableEntries = filteredEntries.some((entry) => entry.status !== TollEntryStatus.PENDING);
  const reviewCount = filteredEntries.filter((entry) => Boolean(entry.reviewReasons)).length;
  const plateSummaries = buildPlateSummaries(filteredEntries);
  const title = batch.invoiceNumber ? `Fattura ${batch.invoiceNumber}` : 'Dettaglio file autostrade';

  return (
    <>
      <PageHeader
        title={title}
        description={`${formatDate(batch.invoiceDate)} · ${batch.originalFileName}`}
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/tolls">
              <ArrowLeft size={16} aria-hidden />
              Fatture autostrade
            </Link>
            {hasReportableEntries ? (
              <FilteredReportButton baseHref="/api/reports/tolls" fixedParams={{ batchId }} label="Report confermati" />
            ) : null}
            <Link className="secondary-button" href={`/api/tolls/imports/${batchId}/file`} target="_blank" prefetch={false}>
              <Download size={16} aria-hidden />
              CSV
            </Link>
          </div>
        }
      />

      {pendingCount > 0 ? (
        <section className="workflow-status needs-action toll-file-review-status">
          <span className="workflow-status-icon"><AlertTriangle size={20} aria-hidden /></span>
          <span className="workflow-status-copy">
            <strong>{pendingCount.toLocaleString('it-IT')} pedaggi da confermare</strong>
            <small>{reviewCount > 0 ? `${reviewCount} righe hanno un avviso` : 'Nessun avviso rilevato nel file'}</small>
          </span>
          <div className="actions-row">
            <form action={confirmTollBatchDetailAction.bind(null, batchId)}>
              <ConfirmSubmitButton className="primary-button" message={`Confermare tutti i ${pendingCount} pedaggi di questo file?`}>
                <Check size={16} aria-hidden />
                Conferma file
              </ConfirmSubmitButton>
            </form>
            <form action={deleteTollBatchDetailAction.bind(null, batchId)}>
              <ConfirmSubmitButton className="danger-button" message={`Scartare tutti i ${pendingCount} pedaggi in attesa di questo file?`}>
                <Trash2 size={16} aria-hidden />
                Scarta file
              </ConfirmSubmitButton>
            </form>
          </div>
        </section>
      ) : null}

      <section className="metrics" aria-label="Riepilogo fattura autostrade">
        <div className="metric"><span>Totale ivato</span><strong>{formatTollMoney(totalGrossCents)}</strong></div>
        <div className="metric"><span>Netto</span><strong>{formatTollMoney(totalNetCents)}</strong></div>
        <div className="metric"><span>IVA</span><strong>{formatTollMoney(totalVatCents)}</strong></div>
        <div className="metric"><span>Pedaggi</span><strong>{filteredEntries.length.toLocaleString('it-IT')}</strong></div>
        <div className="metric"><span>Distanza</span><strong>{formatTollDistance(totalDistanceKm)}</strong></div>
        <div className="metric"><span>Avvisi</span><strong>{reviewCount}</strong></div>
      </section>

      <form className="filter-bar fuel-filter-bar" action={`/tolls/imports/${batchId}`}>
        <label className="fuel-filter-search">
          Cerca
          <input name="q" placeholder="Targa, tessera, tratta o casello" defaultValue={resolvedSearchParams.q || ''} />
        </label>
        <DatePartFilters label="Da" prefix="from" date={fromDate} years={yearOptions} />
        <DatePartFilters label="A" prefix="to" date={toDate} years={yearOptions} />
        <label>
          Targa
          <select name="tractorId" defaultValue={tractorFilter}>
            <option value="">Tutte</option>
            {tractors.map((tractor) => <option key={tractor.id} value={tractor.id}>{getVehicleLabel(tractor)}{tractor.active ? '' : ' (non attivo)'}</option>)}
          </select>
        </label>
        <label>
          Tessera
          <select name="cardId" defaultValue={cardFilter}>
            <option value="">Tutte</option>
            {cards.map((card) => <option key={card.id} value={card.id}>{card.cardNumber}{card.assignedTractor ? ` - ${card.assignedTractor.plate}` : ''}</option>)}
          </select>
        </label>
        <label>
          Stato
          <select name="status" defaultValue={statusFilter}>
            <option value="">Tutti</option>
            <option value="pending">In attesa</option>
            <option value="needs_review">Da verificare</option>
            <option value="ok">OK</option>
            <option value="verified">Verificati</option>
          </select>
        </label>
        <div className="filter-actions">
          <button className="primary-button" type="submit"><Filter size={15} aria-hidden />Filtra</button>
          <Link className="secondary-button" href={`/tolls/imports/${batchId}`}>Reset</Link>
          <span className="filter-count">{filteredEntries.length.toLocaleString('it-IT')} risultati</span>
        </div>
      </form>

      <section className="detail-section" style={{ marginBottom: 18 }}>
        <h2>Riepilogo per targa</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Targa</th><th>Pedaggi</th><th>Distanza</th><th>Netto</th><th>IVA</th><th>Ivato</th><th>Avvisi</th></tr></thead>
            <tbody>
              {plateSummaries.length === 0 ? (
                <tr><td colSpan={7} className="empty-state">Nessun pedaggio nel filtro.</td></tr>
              ) : plateSummaries.map((summary) => (
                <tr key={summary.plate}>
                  <td><strong>{summary.plate}</strong></td>
                  <td>{summary.count}</td>
                  <td>{formatTollDistance(summary.distanceKm)}</td>
                  <td>{formatTollMoney(summary.netAmountCents)}</td>
                  <td>{formatTollMoney(summary.vatAmountCents)}</td>
                  <td>{formatTollMoney(summary.grossAmountCents)}</td>
                  <td>{summary.reviewCount || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-wrap">
        <table>
          <thead>
            <tr><th>Data</th><th>Targa</th><th>Tessera</th><th>Tratta</th><th>Distanza</th><th>Netto</th><th>IVA</th><th>Ivato</th><th>Stato</th><th>Azioni</th></tr>
          </thead>
          <tbody>
            {pagination.items.length === 0 ? (
              <tr><td colSpan={10} className="empty-state">Nessun pedaggio trovato.</td></tr>
            ) : pagination.items.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDate(entry.tollDate)}{entry.tollTime ? <span className="muted">{entry.tollTime}</span> : null}</td>
                <td><strong>{getTollVehicleLabel(entry)}</strong>{entry.vehicleClass ? <span className="muted">Classe {entry.vehicleClass}</span> : null}</td>
                <td>{entry.card?.cardNumber || entry.cardNumber}{entry.card?.assignedTractor ? <span className="muted">Associata a {entry.card.assignedTractor.plate}</span> : null}</td>
                <td><strong>{entry.routeName}</strong>{entry.motorwayName ? <span className="muted">{entry.motorwayName}</span> : null}</td>
                <td>{formatTollDistance(entry.distanceKm)}</td>
                <td>{formatTollMoney(entry.netAmountCents)}</td>
                <td>{formatTollMoney(entry.vatAmountCents)}{entry.vatRatePercent !== null ? <span className="muted">{entry.vatRatePercent}%</span> : null}</td>
                <td>
                  <strong>{formatTollMoney(entry.grossAmountCents)}</strong>
                  {entry.grossAmountCents < 0 ? (
                    <span className="muted">Rettifica{entry.movementType ? ` ${entry.movementType}` : ''}</span>
                  ) : null}
                </td>
                <td>
                  <span className={`badge fuel-status-${entry.status.toLowerCase().replace('_', '-')}`}>
                    {entry.status === TollEntryStatus.NEEDS_REVIEW || entry.reviewReasons ? <AlertTriangle size={13} aria-hidden /> : null}
                    {getTollEntryStatusLabel(entry.status)}
                  </span>
                  {entry.reviewReasons ? <span className="fuel-review-reason">{entry.reviewReasons}</span> : null}
                </td>
                <td>
                  {entry.status === TollEntryStatus.PENDING ? (
                    <div className="actions-row">
                      <form action={confirmTollEntryDetailAction.bind(null, batchId, entry.id)}>
                        <button className="primary-button compact-button" type="submit"><Check size={14} aria-hidden />Conferma</button>
                      </form>
                      <form action={deletePendingTollEntryDetailAction.bind(null, batchId, entry.id)}>
                        <ConfirmSubmitButton className="danger-button compact-button" message="Scartare questo pedaggio?"><Trash2 size={14} aria-hidden /></ConfirmSubmitButton>
                      </form>
                    </div>
                  ) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <TablePagination
        currentPage={pagination.currentPage}
        from={pagination.from}
        pathname={`/tolls/imports/${batchId}`}
        searchParams={resolvedSearchParams}
        to={pagination.to}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </>
  );
}
