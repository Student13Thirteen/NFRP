import { requireUser } from '@/lib/auth';
import { MaintenanceStatus } from '@prisma/client';
import Link from 'next/link';
import { ArrowRight, ClipboardList, Download, FileUp, Receipt, Settings2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { TablePagination } from '@/components/TablePagination';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { paginateItems } from '@/lib/pagination';
import {
  buildMaintenanceVehicleOptions,
  formatMoneyCents,
  getMaintenanceDriverLabel,
  getMaintenanceStatusLabel,
  getMaintenanceVehicleLabel,
  maintenanceInclude,
  maintenanceMatchesSearch,
  parseMaintenanceVehicleKey
} from '@/lib/maintenance';

type MaintenancesPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    categoryId?: string;
    supplierId?: string;
    driverId?: string;
    vehicleKey?: string;
    pdf?: string;
    error?: string;
    page?: string;
    pageSize?: string;
  }>;
};

export default async function MaintenancesPage({ searchParams }: MaintenancesPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [maintenances, categories, suppliers, drivers, tractors, trailers] = await Promise.all([
    prisma.maintenance.findMany({
      include: maintenanceInclude,
      orderBy: [{ maintenanceDate: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.category.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.supplier.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.trailer.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] })
  ]);

  const statusFilter = Object.values(MaintenanceStatus).includes(resolvedSearchParams.status as MaintenanceStatus)
    ? (resolvedSearchParams.status as MaintenanceStatus)
    : '';
  const categoryFilter = categories.some((category) => category.id === resolvedSearchParams.categoryId)
    ? resolvedSearchParams.categoryId || ''
    : '';
  const supplierFilter = suppliers.some((supplier) => supplier.id === resolvedSearchParams.supplierId)
    ? resolvedSearchParams.supplierId || ''
    : '';
  const driverFilter = drivers.some((driver) => driver.id === resolvedSearchParams.driverId)
    ? resolvedSearchParams.driverId || ''
    : '';
  const vehicleFilter = parseMaintenanceVehicleKey(resolvedSearchParams.vehicleKey) ? resolvedSearchParams.vehicleKey || '' : '';
  const pdfFilter = resolvedSearchParams.pdf === 'missing' || resolvedSearchParams.pdf === 'present' ? resolvedSearchParams.pdf : '';

  const filteredMaintenances = maintenances.filter((maintenance) => {
    if (statusFilter && maintenance.status !== statusFilter) return false;
    if (categoryFilter && maintenance.categoryId !== categoryFilter) return false;
    if (supplierFilter && maintenance.supplierId !== supplierFilter) return false;
    if (driverFilter && maintenance.driverId !== driverFilter) return false;
    if (vehicleFilter) {
      const vehicleKey = parseMaintenanceVehicleKey(vehicleFilter);
      if (vehicleKey?.type === 'TRACTOR' && maintenance.tractorId !== vehicleKey.id) return false;
      if (vehicleKey?.type === 'TRAILER' && maintenance.trailerId !== vehicleKey.id) return false;
    }
    if (pdfFilter === 'missing' && maintenance.filePath) return false;
    if (pdfFilter === 'present' && !maintenance.filePath) return false;
    return maintenanceMatchesSearch(maintenance, resolvedSearchParams.q);
  });

  const counts = {
    open: maintenances.filter((maintenance) => maintenance.status === MaintenanceStatus.OPEN).length,
    inProgress: maintenances.filter((maintenance) => maintenance.status === MaintenanceStatus.IN_PROGRESS).length,
    completed: maintenances.filter((maintenance) => maintenance.status === MaintenanceStatus.COMPLETED).length,
    invoiced: maintenances.filter((maintenance) => maintenance.status === MaintenanceStatus.INVOICED).length,
    missingPdf: maintenances.filter((maintenance) => !maintenance.filePath).length
  };
  const vehicleOptions = buildMaintenanceVehicleOptions(tractors, trailers);
  const pagination = paginateItems(filteredMaintenances, resolvedSearchParams.page, resolvedSearchParams.pageSize);

  return (
    <>
      <PageHeader
        title="Schede intervento"
        description="Registro degli interventi operativi. Le fatture e i DDT restano nella scheda dedicata della stessa area."
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/maintenances/settings">
              <Settings2 size={16} aria-hidden />
              Anagrafiche manutenzioni
            </Link>
            <Link className="secondary-button" href="/maintenances/expenses">
              <Receipt size={16} aria-hidden />
              Fatture e DDT
            </Link>
          </div>
        }
      />

      <section className="entry-choice-strip" aria-label="Nuovo inserimento manutenzioni">
        <Link className="entry-choice primary-entry" href="/maintenances/expenses/new">
          <Receipt size={20} aria-hidden />
          <span>
            <strong>Nuova fattura/DDT multi-riga</strong>
            <small>Righe, IVA e destinazione su targa, magazzino o azienda.</small>
          </span>
        </Link>
        <Link className="entry-choice" href="/maintenances/new">
          <ClipboardList size={20} aria-hidden />
          <span>
            <strong>Nuova scheda intervento</strong>
            <small>Inserimento rapido quando non serve il dettaglio contabile.</small>
          </span>
        </Link>
        <Link className="entry-choice" href="/maintenances/expenses/import">
          <FileUp size={20} aria-hidden />
          <span>
            <strong>Importa manutenzioni da PDF</strong>
            <small>OCR di fatture e DDT, anche multi-pagina e con targhe diverse per riga.</small>
          </span>
        </Link>
      </section>

      <section className="metrics" aria-label="Riepilogo manutenzioni">
        <Link className="metric metric-link" href="/maintenances?status=OPEN" aria-label="Vedi manutenzioni da fare">
          <span>Da fare</span>
          <strong>{counts.open}</strong>
          <span className="metric-action">
            Vedi manutenzioni
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <Link className="metric metric-link" href="/maintenances?status=IN_PROGRESS" aria-label="Vedi manutenzioni in lavorazione">
          <span>In lavorazione</span>
          <strong>{counts.inProgress}</strong>
          <span className="metric-action">
            Vedi manutenzioni
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <Link className="metric metric-link" href="/maintenances?status=COMPLETED" aria-label="Vedi manutenzioni completate">
          <span>Completate</span>
          <strong>{counts.completed}</strong>
          <span className="metric-action">
            Vedi manutenzioni
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <Link className="metric metric-link" href="/maintenances?status=INVOICED" aria-label="Vedi manutenzioni fatturate">
          <span>Fatturate</span>
          <strong>{counts.invoiced}</strong>
          <span className="metric-action">
            Vedi manutenzioni
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <Link className="metric metric-link pdf-missing" href="/maintenances?pdf=missing" aria-label="Vedi manutenzioni senza PDF">
          <span>PDF mancanti</span>
          <strong>{counts.missingPdf}</strong>
          <span className="metric-action">
            Vedi manutenzioni
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
      </section>

      <form className="filter-bar" action="/maintenances">
        <label>
          Cerca
          <input name="q" placeholder="Targa, fornitore, lavoro, documento" defaultValue={resolvedSearchParams.q || ''} />
        </label>
        <label>
          Stato
          <select name="status" defaultValue={statusFilter}>
            <option value="">Tutti</option>
            {Object.values(MaintenanceStatus).map((status) => (
              <option key={status} value={status}>
                {getMaintenanceStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Categoria
          <select name="categoryId" defaultValue={categoryFilter}>
            <option value="">Tutti</option>
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
          <select name="supplierId" defaultValue={supplierFilter}>
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
          Mezzo
          <select name="vehicleKey" defaultValue={vehicleFilter}>
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
          Autista
          <select name="driverId" defaultValue={driverFilter}>
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
          <select name="pdf" defaultValue={pdfFilter}>
            <option value="">Tutti</option>
            <option value="missing">Mancante</option>
            <option value="present">Presente</option>
          </select>
        </label>
        <div className="filter-actions">
          <button className="primary-button" type="submit">
            Filtra
          </button>
          <Link className="secondary-button" href="/maintenances">
            Reset
          </Link>
          <span className="filter-count">{filteredMaintenances.length} risultati</span>
        </div>
      </form>

      <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Mezzo</th>
                <th>Autista</th>
                <th>Intervento</th>
                <th>Fornitore</th>
                <th>Importo</th>
                <th>Stato</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {filteredMaintenances.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-state">
                    Nessuna manutenzione trovata.
                  </td>
                </tr>
              ) : (
                pagination.items.map((maintenance) => {
                  const maintenanceHref = `/maintenances/${maintenance.id}`;

                  return (
                    <tr className="clickable-row" key={maintenance.id}>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={maintenanceHref}>
                          {formatDate(maintenance.maintenanceDate)}
                        </Link>
                      </td>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={maintenanceHref}>
                          {getMaintenanceVehicleLabel(maintenance)}
                        </Link>
                      </td>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={maintenanceHref}>
                          {getMaintenanceDriverLabel(maintenance)}
                        </Link>
                      </td>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={maintenanceHref}>
                          <strong>{maintenance.title}</strong>
                          <div className="muted">{maintenance.category.name}</div>
                        </Link>
                      </td>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={maintenanceHref}>
                          {maintenance.supplier?.name || '-'}
                          {maintenance.documentNumber ? <div className="muted">{maintenance.documentNumber}</div> : null}
                        </Link>
                      </td>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={maintenanceHref}>
                          {formatMoneyCents(maintenance.amountCents)}
                        </Link>
                      </td>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={maintenanceHref}>
                          <span className={`badge maintenance-status-${maintenance.status.toLowerCase().replace('_', '-')}`}>
                            {getMaintenanceStatusLabel(maintenance.status)}
                          </span>
                        </Link>
                      </td>
                      <td>
                        {maintenance.filePath ? (
                          <Link className="secondary-button compact-button" href={`/api/maintenances/${maintenance.id}/file`} target="_blank">
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
        pathname="/maintenances"
        searchParams={resolvedSearchParams}
        to={pagination.to}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </>
  );
}
