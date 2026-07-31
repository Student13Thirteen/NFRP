import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowRight, ClipboardList, Download, FileUp, Plus, Search } from 'lucide-react';
import { FilteredReportButton } from '@/components/FilteredReportButton';
import { PageHeader } from '@/components/PageHeader';
import { TablePagination } from '@/components/TablePagination';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { paginateItems } from '@/lib/pagination';
import {
  expenseDocumentInclude,
  filterAndSortExpenseDocuments,
  formatEuroCents,
  getAllocationLabel,
  normalizeExpenseDocumentListFilters,
  type ExpenseLineWithRelations
} from '@/lib/expense';
import { buildMaintenanceVehicleOptions } from '@/lib/maintenance';

type ExpensesPageProps = {
  searchParams: Promise<{
    error?: string;
    page?: string;
    pageSize?: string;
    q?: string;
    sort?: string;
    status?: string;
    vehicleKey?: string;
  }>;
};

function allocationSummary(lines: ExpenseLineWithRelations[]): string {
  const labels = Array.from(new Set(lines.map((line) => getAllocationLabel(line))));
  if (labels.length === 0) return '-';
  if (labels.length <= 2) return labels.join(', ');
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
}

function odometerSummary(lines: ExpenseLineWithRelations[]): string {
  const values = Array.from(
    new Set(lines.flatMap((line) => line.odometerKm === null ? [] : [line.odometerKm]))
  );
  if (values.length === 0) return '-';
  if (values.length <= 2) return values.map((value) => value.toLocaleString('it-IT')).join(', ');
  return `${values.slice(0, 2).map((value) => value.toLocaleString('it-IT')).join(', ')} +${values.length - 2}`;
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [documents, tractors, trailers] = await Promise.all([
    prisma.expenseDocument.findMany({
      include: expenseDocumentInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.trailer.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] })
  ]);

  const pending = documents.filter((doc) => doc.status === 'PENDING');
  const confirmed = documents.filter((doc) => doc.status === 'CONFIRMED');
  const totalNetto = confirmed.reduce((sum, doc) => sum + doc.totalImponibileCents, 0);
  const totalIvato = confirmed.reduce((sum, doc) => sum + doc.totalAmountCents, 0);
  const filters = normalizeExpenseDocumentListFilters(resolvedSearchParams);
  const vehicleOptions = buildMaintenanceVehicleOptions(tractors, trailers);
  const filteredDocuments = filterAndSortExpenseDocuments(documents, filters);
  const pagination = paginateItems(filteredDocuments, resolvedSearchParams.page, resolvedSearchParams.pageSize);

  return (
    <>
      <PageHeader
        title="Fatture e DDT"
        description="Qui trovi subito i documenti validati, ordinati dall’attività più recente e ricercabili anche per targa."
        action={
          <div className="actions-row">
            <FilteredReportButton baseHref="/api/reports/expenses" label="Registro PDF" />
            <Link className="secondary-button" href="/maintenances">
              <ClipboardList size={16} aria-hidden />
              Schede intervento
            </Link>
            <Link className="secondary-button" href="/maintenances/expenses/import">
              <FileUp size={16} aria-hidden />
              Importa PDF
            </Link>
            <Link className="primary-button" href="/maintenances/expenses/new">
              <Plus size={16} aria-hidden />
              Nuova fattura/DDT
            </Link>
          </div>
        }
      />

      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      {pending.length > 0 ? (
        <Link className="panel" href="/maintenances/expenses/review" style={{ display: 'block', marginBottom: 18 }}>
          <strong>{pending.length} documenti in attesa di validazione.</strong> Controllali, correggi righe e allocazioni, poi conferma.
        </Link>
      ) : null}

      <section className="metrics" aria-label="Riepilogo documenti di spesa">
        <div className="metric">
          <span>Documenti</span>
          <strong>{documents.length}</strong>
        </div>
        <Link className="metric metric-link" href="/maintenances/expenses/review" aria-label="Vedi documenti da validare">
          <span>Da validare</span>
          <strong>{pending.length}</strong>
          <span className="metric-action">
            Vai alla validazione
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <div className="metric">
          <span>Totale netto (confermati)</span>
          <strong>{formatEuroCents(totalNetto)}</strong>
        </div>
        <div className="metric">
          <span>Totale ivato (confermati)</span>
          <strong>{formatEuroCents(totalIvato)}</strong>
        </div>
      </section>

      <form className="filter-bar" action="/maintenances/expenses">
        <label>
          Cerca
          <input
            name="q"
            placeholder="Targa, fornitore, numero, ricambio"
            defaultValue={resolvedSearchParams.q || ''}
          />
        </label>
        <label>
          Stato
          <select name="status" defaultValue={filters.status}>
            <option value="">Tutti</option>
            <option value="CONFIRMED">Confermati</option>
            <option value="PENDING">Da validare</option>
          </select>
        </label>
        <label>
          Targa
          <select name="vehicleKey" defaultValue={filters.vehicleKey}>
            <option value="">Tutte</option>
            {vehicleOptions.map((vehicle) => (
              <option key={vehicle.value} value={vehicle.value}>
                {vehicle.label}
                {vehicle.active === false ? ' (non attivo)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ordina
          <select name="sort" defaultValue={filters.sort}>
            <option value="activity">Attività più recente</option>
            <option value="documentDate">Data documento</option>
          </select>
        </label>
        <button className="primary-button" type="submit">
          <Search size={16} aria-hidden />
          Filtra
        </button>
        <Link className="secondary-button" href="/maintenances/expenses">
          Reset
        </Link>
      </form>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Fornitore</th>
              <th>Documento</th>
              <th>Righe</th>
              <th>Allocazione</th>
              <th>Km mezzo</th>
              <th>Netto</th>
              <th>Ivato</th>
              <th>Stato</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.length === 0 ? (
              <tr>
                <td colSpan={10} className="empty-state">
                  {documents.length === 0
                    ? 'Nessun documento di spesa. Inizia con "Nuova fattura/DDT" o "Importa PDF".'
                    : 'Nessuna fattura o DDT corrisponde ai filtri scelti.'}
                </td>
              </tr>
            ) : (
              pagination.items.map((doc) => {
                const href = `/maintenances/expenses/${doc.id}`;
                return (
                  <tr className="clickable-row" key={doc.id}>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={href}>
                        {formatDate(doc.registeredAt)}
                        <small className="muted" style={{ display: 'block', marginTop: 3 }}>
                          Attività {formatDate(doc.updatedAt)}
                        </small>
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={href}>
                        {doc.supplier?.name || doc.supplierName || '-'}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={href}>
                        {doc.documentNumber || '-'}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={href}>
                        {doc.lines.length}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={href}>
                        {allocationSummary(doc.lines)}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={href}>
                        {odometerSummary(doc.lines)}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={href}>
                        {formatEuroCents(doc.totalImponibileCents)}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={href}>
                        {formatEuroCents(doc.totalAmountCents)}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={href}>
                        <span className={`badge expense-status-${doc.status.toLowerCase()}`}>
                          {doc.status === 'PENDING' ? 'Da validare' : 'Confermato'}
                        </span>
                      </Link>
                    </td>
                    <td>
                      {doc.filePath ? (
                        <Link className="secondary-button compact-button" href={`/api/maintenances/expenses/${doc.id}/file`} target="_blank">
                          <Download size={15} aria-hidden />
                          PDF
                        </Link>
                      ) : (
                        <span className="file-missing-pill">Manca PDF</span>
                      )}
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
        pathname="/maintenances/expenses"
        searchParams={resolvedSearchParams}
        to={pagination.to}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </>
  );
}
