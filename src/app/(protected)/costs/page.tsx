import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowRight, Filter, Landmark, ReceiptText } from 'lucide-react';
import { DatePartFilters } from '@/components/DatePartFilters';
import { FilteredReportButton } from '@/components/FilteredReportButton';
import { PageHeader } from '@/components/PageHeader';
import { TablePagination } from '@/components/TablePagination';
import { buildDateFilterYears, parseFilterDateParts, type DateFilterSearchParams } from '@/lib/date-filters';
import { formatDate } from '@/lib/dates';
import {
  COST_SCOPE_VALUES,
  COST_SOURCE_VALUES,
  filterCostCenterRows,
  formatCostMoney,
  getCostDirectionLabel,
  getCostCenterRows,
  getCostCenterTotals,
  getCostSourceLabel,
  type CostCenterRow,
  type CostScope,
  type CostSource
} from '@/lib/cost-center';
import { paginateItems } from '@/lib/pagination';

type CostsSearchParams = DateFilterSearchParams & {
  q?: string;
  source?: string;
  category?: string;
  plate?: string;
  scope?: string;
  page?: string;
  pageSize?: string;
};

type CostsPageProps = {
  searchParams: Promise<CostsSearchParams>;
};

type GroupSummary = {
  key: string;
  label: string;
  count: number;
  costGrossCents: number;
  revenueGrossCents: number;
  marginGrossCents: number;
  internalGrossCents: number;
  forecastGrossCents: number;
};

function validSource(value: string | undefined): string {
  return COST_SOURCE_VALUES.includes(value as CostSource) ? value || '' : '';
}

function validScope(value: string | undefined): CostScope {
  return COST_SCOPE_VALUES.includes(value as CostScope) ? (value as CostScope) : 'all';
}

function buildGroupSummaries(rows: CostCenterRow[], mode: 'source' | 'plate'): GroupSummary[] {
  const summaries = new Map<string, GroupSummary>();

  for (const row of rows) {
    const key = mode === 'source' ? row.source : row.plate || 'GENERIC';
    const label = mode === 'source' ? row.sourceLabel : row.plate || 'Azienda / magazzino';
    const summary =
      summaries.get(key) ||
      ({
        key,
        label,
        count: 0,
        costGrossCents: 0,
        revenueGrossCents: 0,
        marginGrossCents: 0,
        internalGrossCents: 0,
        forecastGrossCents: 0
      } satisfies GroupSummary);

    summary.count += 1;
    if (row.isForecast) summary.forecastGrossCents += row.grossAmountCents;
    else if (row.isInternalAllocation) summary.internalGrossCents += row.grossAmountCents;
    else if (row.direction === 'REVENUE') summary.revenueGrossCents += row.grossAmountCents;
    else summary.costGrossCents += row.grossAmountCents;
    summary.marginGrossCents = summary.revenueGrossCents - summary.costGrossCents;
    summaries.set(key, summary);
  }

  return Array.from(summaries.values()).sort((a, b) => b.costGrossCents + b.revenueGrossCents - (a.costGrossCents + a.revenueGrossCents));
}

function sourceHref(source: CostSource): string {
  switch (source) {
    case 'TRIPS':
      return '/trips/fuel';
    case 'CONTAINER_TRIPS':
      return '/trips/container';
    case 'FUEL':
      return '/fuel';
    case 'TOLLS':
      return '/tolls';
    case 'LEASE':
      return '/leases';
    case 'EXPENSE':
      return '/maintenances/expenses';
    case 'MAINTENANCE':
      return '/maintenances';
    case 'DOCUMENT':
      return '/documents';
    case 'WAREHOUSE':
    case 'WAREHOUSE_MOUNT':
      return '/warehouse';
    default:
      return '/costs';
  }
}

export default async function CostsPage({ searchParams }: CostsPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const allRows = await getCostCenterRows();
  const sourceFilter = validSource(resolvedSearchParams.source);
  const scope = validScope(resolvedSearchParams.scope);
  const fromDate = parseFilterDateParts(resolvedSearchParams, 'from');
  const toDate = parseFilterDateParts(resolvedSearchParams, 'to');
  const yearOptions = buildDateFilterYears(allRows.map((row) => row.date));

  const categories = Array.from(new Set(allRows.map((row) => row.categoryName))).sort((a, b) => a.localeCompare(b));
  const plates = Array.from(new Set(allRows.map((row) => row.plate).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
  const categoryFilter = categories.includes(resolvedSearchParams.category || '') ? resolvedSearchParams.category || '' : '';
  const plateFilter = plates.includes((resolvedSearchParams.plate || '').toUpperCase()) ? (resolvedSearchParams.plate || '').toUpperCase() : '';

  const rows = filterCostCenterRows(allRows, {
    query: resolvedSearchParams.q,
    source: sourceFilter,
    category: categoryFilter,
    plate: plateFilter,
    fromDate,
    toDate,
    scope
  });
  const totals = getCostCenterTotals(rows);
  const sourceSummaries = buildGroupSummaries(rows, 'source');
  const plateSummaries = buildGroupSummaries(rows, 'plate');
  const pagination = paginateItems(rows, resolvedSearchParams.page, resolvedSearchParams.pageSize);

  return (
    <>
      <PageHeader
        title="Centro costi"
        description="Vista unica di costi, ricavi, margini e impegni: viaggi, rifornimenti, autostrade, leasing, fatture/DDT, manutenzioni e magazzino."
        action={
          <div className="actions-row">
            <FilteredReportButton baseHref="/api/reports/costs" />
            <Link className="secondary-button" href="/trips">
              Viaggi
            </Link>
            <Link className="secondary-button" href="/fuel">
              Rifornimenti
            </Link>
            <Link className="secondary-button" href="/tolls">
              Autostrade
            </Link>
            <Link className="secondary-button" href="/leases">
              <Landmark size={16} aria-hidden />
              Leasing
            </Link>
            <Link className="primary-button" href="/maintenances/expenses/new">
              <ReceiptText size={16} aria-hidden />
              Nuova spesa
            </Link>
          </div>
        }
      />

      <section className="metrics" aria-label="Riepilogo centro costi">
        <div className="metric">
          <span>Costi contabili</span>
          <strong>{formatCostMoney(totals.accountingGrossAmountCents)}</strong>
        </div>
        <div className="metric">
          <span>Ricavi viaggi</span>
          <strong>{formatCostMoney(totals.revenueGrossAmountCents)}</strong>
        </div>
        <div className="metric">
          <span>Margine</span>
          <strong>{formatCostMoney(totals.marginGrossAmountCents)}</strong>
        </div>
        <div className="metric">
          <span>Attribuzioni interne</span>
          <strong>{formatCostMoney(totals.internalGrossAmountCents)}</strong>
        </div>
        <div className="metric">
          <span>Impegni leasing previsti</span>
          <strong>{formatCostMoney(totals.forecastGrossAmountCents)}</strong>
        </div>
        <div className="metric">
          <span>Righe</span>
          <strong>{rows.length}</strong>
        </div>
      </section>

      <form className="filter-bar fuel-filter-bar" action="/costs">
        <label className="fuel-filter-search">
          Cerca
          <input name="q" placeholder="Targa, fornitore, tratta, fattura, ricambio" defaultValue={resolvedSearchParams.q || ''} />
        </label>
        <DatePartFilters label="Da" prefix="from" date={fromDate} years={yearOptions} />
        <DatePartFilters label="A" prefix="to" date={toDate} years={yearOptions} />
        <label>
          Tipo costo
          <select name="source" defaultValue={sourceFilter}>
            <option value="">Tutti</option>
            {COST_SOURCE_VALUES.map((source) => (
              <option key={source} value={source}>
                {getCostSourceLabel(source)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Categoria
          <select name="category" defaultValue={categoryFilter}>
            <option value="">Tutte</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          Targa
          <select name="plate" defaultValue={plateFilter}>
            <option value="">Tutte</option>
            {plates.map((plate) => (
              <option key={plate} value={plate}>
                {plate}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vista
          <select name="scope" defaultValue={scope}>
            <option value="all">Tutto</option>
            <option value="accounting">Solo contabile</option>
            <option value="internal">Solo attribuzioni interne</option>
            <option value="forecast">Solo impegni previsti</option>
          </select>
        </label>
        <div className="filter-actions">
          <button className="primary-button" type="submit">
            <Filter size={15} aria-hidden />
            Filtra
          </button>
          <Link className="secondary-button" href="/costs">
            Reset
          </Link>
          <span className="filter-count">{rows.length} risultati</span>
        </div>
      </form>

      <section className="detail-section" style={{ marginBottom: 18 }}>
        <h2>Riepilogo per tipo costo</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Righe</th>
                <th>Costi</th>
                <th>Ricavi</th>
                <th>Margine</th>
                <th>Attribuzioni interne</th>
                <th>Impegni previsti</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sourceSummaries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-state">
                    Nessun costo nel filtro.
                  </td>
                </tr>
              ) : (
                sourceSummaries.map((summary) => (
                  <tr key={summary.key}>
                    <td>
                      <strong>{summary.label}</strong>
                    </td>
                    <td>{summary.count}</td>
                    <td>{formatCostMoney(summary.costGrossCents)}</td>
                    <td>{formatCostMoney(summary.revenueGrossCents)}</td>
                    <td>{formatCostMoney(summary.marginGrossCents)}</td>
                    <td>{formatCostMoney(summary.internalGrossCents)}</td>
                    <td>{formatCostMoney(summary.forecastGrossCents)}</td>
                    <td>
                      <Link className="table-cell-link" href={sourceHref(summary.key as CostSource)}>
                        Apri sezione
                        <ArrowRight size={14} aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="detail-section" style={{ marginBottom: 18 }}>
        <h2>Riepilogo per targa</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Targa</th>
                <th>Righe</th>
                <th>Costi</th>
                <th>Ricavi</th>
                <th>Margine</th>
                <th>Attribuzioni interne</th>
                <th>Impegni previsti</th>
              </tr>
            </thead>
            <tbody>
              {plateSummaries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-state">
                    Nessun costo per targa nel filtro.
                  </td>
                </tr>
              ) : (
                plateSummaries.map((summary) => (
                  <tr key={summary.key}>
                    <td>
                      <strong>{summary.label}</strong>
                    </td>
                    <td>{summary.count}</td>
                    <td>{formatCostMoney(summary.costGrossCents)}</td>
                    <td>{formatCostMoney(summary.revenueGrossCents)}</td>
                    <td>{formatCostMoney(summary.marginGrossCents)}</td>
                    <td>{formatCostMoney(summary.internalGrossCents)}</td>
                    <td>{formatCostMoney(summary.forecastGrossCents)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Movimento</th>
              <th>Categoria</th>
              <th>Targa / area</th>
              <th>Descrizione</th>
              <th>Fornitore</th>
              <th>Riferimento</th>
              <th>Netto</th>
              <th>IVA</th>
              <th>Ivato</th>
              <th>Stato</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="empty-state">
                  Nessun costo trovato.
                </td>
              </tr>
            ) : (
              pagination.items.map((row) => (
                <tr key={row.key} className={row.isForecast ? 'cost-forecast-row' : row.isInternalAllocation ? 'cost-internal-row' : undefined}>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.sourceLabel}</td>
                  <td>{row.isForecast ? 'Impegno' : getCostDirectionLabel(row.direction)}</td>
                  <td>{row.categoryName}</td>
                  <td>{row.entityLabel}</td>
                  <td>
                    <Link className="table-cell-link" href={row.href} prefetch={false}>
                      {row.description}
                    </Link>
                  </td>
                  <td>{row.supplierName || '-'}</td>
                  <td>{row.reference || '-'}</td>
                  <td>{formatCostMoney(row.netAmountCents)}</td>
                  <td>{formatCostMoney(row.vatAmountCents)}</td>
                  <td>
                    <strong>{formatCostMoney(row.grossAmountCents)}</strong>
                  </td>
                  <td>
                    <span className={`badge ${row.isForecast ? 'fuel-status-review' : row.isInternalAllocation ? 'fuel-status-verified' : 'fuel-status-ok'}`}>
                      {row.statusLabel}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <TablePagination
        currentPage={pagination.currentPage}
        from={pagination.from}
        pathname="/costs"
        searchParams={resolvedSearchParams}
        to={pagination.to}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </>
  );
}
