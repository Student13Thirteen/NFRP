import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowRight, Download, FileUp, Search, Settings2, Wrench } from 'lucide-react';
import { FilteredReportButton } from '@/components/FilteredReportButton';
import { PageHeader } from '@/components/PageHeader';
import { TablePagination } from '@/components/TablePagination';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { expenseDocumentInclude, formatEuroCents } from '@/lib/expense';
import { buildMaintenanceVehicleOptions, maintenanceInclude } from '@/lib/maintenance';
import {
  buildMaintenanceRegisterRows,
  filterAndSortMaintenanceRegisterRows,
  maintenanceRegisterStatusOptions,
  normalizeMaintenanceRegisterFilters,
  summarizeMaintenanceRegister
} from '@/lib/maintenance-register';
import { paginateItems } from '@/lib/pagination';

type MaintenancesPageProps = {
  searchParams: Promise<{
    categoryId?: string;
    driverId?: string;
    error?: string;
    page?: string;
    pageSize?: string;
    pdf?: string;
    q?: string;
    sort?: string;
    status?: string;
    supplierId?: string;
    vehicleKey?: string;
  }>;
};

export default async function MaintenancesPage({ searchParams }: MaintenancesPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [documents, cards, tractors, trailers, categories, suppliers, drivers] = await Promise.all([
    // Le fatture leasing sono documenti di spesa ma appartengono al modulo Leasing:
    // restano fuori dal registro manutenzioni per non confondere i due domini.
    prisma.expenseDocument.findMany({
      where: { source: { not: 'LEASE_INVOICE_IMPORT' } },
      include: expenseDocumentInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.maintenance.findMany({ include: maintenanceInclude, orderBy: [{ maintenanceDate: 'desc' }] }),
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.trailer.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.category.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.supplier.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] })
  ]);

  const rows = buildMaintenanceRegisterRows({ documents, cards });
  const filters = normalizeMaintenanceRegisterFilters(resolvedSearchParams);
  const filteredRows = filterAndSortMaintenanceRegisterRows(rows, filters);
  const summary = summarizeMaintenanceRegister(rows);
  const vehicleOptions = buildMaintenanceVehicleOptions(tractors, trailers);
  const pagination = paginateItems(filteredRows, resolvedSearchParams.page, resolvedSearchParams.pageSize);

  return (
    <>
      <PageHeader
        title="Manutenzioni"
        description="Un solo registro: manutenzioni con una riga o con tutte le righe di una fattura o di un DDT, più le schede storiche inserite prima dell’unificazione."
        action={
          <div className="actions-row">
            <FilteredReportButton baseHref="/api/reports/expenses" label="Registro PDF" />
            <Link className="secondary-button" href="/maintenances/settings">
              <Settings2 size={16} aria-hidden />
              Categorie e fornitori
            </Link>
          </div>
        }
      />

      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <div className="section-heading-inline">
        <div>
          <span className="section-kicker">Inserimento</span>
          <h2>Cosa vuoi fare?</h2>
        </div>
      </div>

      <section className="entry-choice-strip" aria-label="Scegli come inserire una manutenzione">
        <Link className="entry-choice primary-entry" href="/maintenances/new">
          <Wrench size={20} aria-hidden />
          <span>
            <strong>Inserisci nuova manutenzione</strong>
            <small>Una riga per un intervento semplice, tutte le righe che servono per una fattura o un DDT.</small>
          </span>
        </Link>
        <Link className="entry-choice" href="/maintenances/expenses/import">
          <FileUp size={20} aria-hidden />
          <span>
            <strong>Importa manutenzioni da PDF</strong>
            <small>Fatture, DDT o scansioni continue: ogni pagina diventa una manutenzione da controllare.</small>
          </span>
        </Link>
      </section>

      {summary.pending > 0 ? (
        <Link className="panel" href="/maintenances/expenses/review" style={{ display: 'block', marginBottom: 18 }}>
          <strong>{summary.pending} manutenzioni attendono il controllo.</strong> Verifica righe, destinazioni e importi, poi conferma.
        </Link>
      ) : null}

      <section className="metrics" aria-label="Riepilogo manutenzioni">
        <div className="metric">
          <span>Manutenzioni</span>
          <strong>{summary.total}</strong>
        </div>
        <Link className="metric metric-link" href="/maintenances/expenses/review" aria-label="Vedi manutenzioni da controllare">
          <span>Da controllare</span>
          <strong>{summary.pending}</strong>
          <span className="metric-action">
            Vai al controllo
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <div className="metric">
          <span>Totale netto (registrate)</span>
          <strong>{formatEuroCents(summary.confirmedImponibileCents)}</strong>
        </div>
        <div className="metric">
          <span>Totale ivato (registrate)</span>
          <strong>{formatEuroCents(summary.confirmedTotalCents)}</strong>
        </div>
      </section>

      <div className="section-heading-inline">
        <div>
          <span className="section-kicker">Registro</span>
          <h2>Manutenzioni già inserite</h2>
        </div>
      </div>

      <form className="filter-bar" action="/maintenances">
        <label>
          Cerca
          <input name="q" placeholder="Targa, fornitore, lavoro, ricambio, documento" defaultValue={filters.q} />
        </label>
        <label>
          Stato
          <select name="status" defaultValue={filters.status}>
            <option value="">Tutti</option>
            {maintenanceRegisterStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mezzo
          <select name="vehicleKey" defaultValue={filters.vehicleKey}>
            <option value="">Tutti</option>
            {vehicleOptions.map((vehicle) => (
              <option key={vehicle.value} value={vehicle.value}>
                {vehicle.label}
                {vehicle.active === false ? ' (non attivo)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Categoria
          <select name="categoryId" defaultValue={filters.categoryId}>
            <option value="">Tutte</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.active ? '' : ' (non attiva)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fornitore
          <select name="supplierId" defaultValue={filters.supplierId}>
            <option value="">Tutti</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
                {supplier.active ? '' : ' (non attivo)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Autista
          <select name="driverId" defaultValue={filters.driverId}>
            <option value="">Tutti</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {`${driver.lastName} ${driver.firstName}`.trim()}
                {driver.active ? '' : ' (non attivo)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          PDF
          <select name="pdf" defaultValue={filters.pdf}>
            <option value="">Tutti</option>
            <option value="missing">Mancante</option>
            <option value="present">Presente</option>
          </select>
        </label>
        <label>
          Ordina
          <select name="sort" defaultValue={filters.sort}>
            <option value="activity">Attività più recente</option>
            <option value="documentDate">Data manutenzione</option>
          </select>
        </label>
        <div className="filter-actions">
          <button className="primary-button" type="submit">
            <Search size={16} aria-hidden />
            Filtra
          </button>
          <Link className="secondary-button" href="/maintenances">
            Reset
          </Link>
          <span className="filter-count">{filteredRows.length} risultati</span>
        </div>
      </form>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Fornitore</th>
              <th>Documento</th>
              <th>Lavoro</th>
              <th>Mezzo o destinazione</th>
              <th>Autista</th>
              <th>Km</th>
              <th>Netto</th>
              <th>Ivato</th>
              <th>Stato</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="empty-state">
                  {rows.length === 0
                    ? 'Nessuna manutenzione registrata. Inizia da "Inserisci nuova manutenzione" oppure importa un PDF.'
                    : 'Nessuna manutenzione corrisponde ai filtri scelti.'}
                </td>
              </tr>
            ) : (
              pagination.items.map((row) => (
                <tr className="clickable-row" key={`${row.kind}-${row.id}`}>
                  <td className="click-cell">
                    <Link className="table-cell-link" href={row.href}>
                      {formatDate(row.date)}
                      <small className="muted" style={{ display: 'block', marginTop: 3 }}>
                        Attività {formatDate(row.activityAt)}
                      </small>
                    </Link>
                  </td>
                  <td className="click-cell">
                    <Link className="table-cell-link" href={row.href}>
                      {row.supplierLabel}
                    </Link>
                  </td>
                  <td className="click-cell">
                    <Link className="table-cell-link" href={row.href}>
                      {row.documentNumber || '-'}
                    </Link>
                  </td>
                  <td className="click-cell">
                    <Link className="table-cell-link" href={row.href}>
                      <strong>{row.title}</strong>
                      <div className="muted">
                        {row.categoryLabel}
                        {' · '}
                        {row.kind === 'CARD' ? 'Scheda storica' : `${row.lineCount} ${row.lineCount === 1 ? 'riga' : 'righe'}`}
                      </div>
                    </Link>
                  </td>
                  <td className="click-cell">
                    <Link className="table-cell-link" href={row.href}>
                      {row.allocationLabel}
                    </Link>
                  </td>
                  <td className="click-cell">
                    <Link className="table-cell-link" href={row.href}>
                      {row.driverLabel}
                    </Link>
                  </td>
                  <td className="click-cell">
                    <Link className="table-cell-link" href={row.href}>
                      {row.odometerLabel}
                    </Link>
                  </td>
                  <td className="click-cell">
                    <Link className="table-cell-link" href={row.href}>
                      {row.imponibileCents === null ? '-' : formatEuroCents(row.imponibileCents)}
                    </Link>
                  </td>
                  <td className="click-cell">
                    <Link className="table-cell-link" href={row.href}>
                      {row.totalCents === null ? '-' : formatEuroCents(row.totalCents)}
                    </Link>
                  </td>
                  <td className="click-cell">
                    <Link className="table-cell-link" href={row.href}>
                      <span className={`badge ${row.statusClassName}`}>{row.statusLabel}</span>
                    </Link>
                  </td>
                  <td>
                    {row.fileHref ? (
                      <Link className="secondary-button compact-button" href={row.fileHref} target="_blank">
                        <Download size={15} aria-hidden />
                        PDF
                      </Link>
                    ) : (
                      <Link className="file-missing-pill file-missing-link" href={row.missingFileHref}>
                        Aggiungi PDF
                      </Link>
                    )}
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
        pathname="/maintenances"
        searchParams={resolvedSearchParams}
        to={pagination.to}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </>
  );
}
