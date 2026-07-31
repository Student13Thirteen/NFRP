import { requireUser } from '@/lib/auth';
import { ContainerTripStatus } from '@prisma/client';
import Link from 'next/link';
import { ArrowRight, Plus, Settings2, UploadCloud } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { TablePagination } from '@/components/TablePagination';
import {
  containerTripInclude,
  containerTripMatchesSearch,
  formatContainerMoney,
  getContainerSummary,
  getContainerStopsSummary,
  getContainerTripActualKm,
  getContainerTripApprovedExtrasCents,
  getContainerTripCustomerLabel,
  getContainerTripStatusLabel
} from '@/lib/container-trips';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { paginateItems } from '@/lib/pagination';
import { getDriverLabel, getVehicleLabel } from '@/lib/trips';

type Props = {
  searchParams: Promise<{ q?: string; status?: string; page?: string; pageSize?: string }>;
};

export default async function ContainerTripsPage({ searchParams }: Props) {
  await requireUser();
  const params = await searchParams;
  const [trips, pendingImports] = await Promise.all([
    prisma.containerTrip.findMany({
      include: containerTripInclude,
      orderBy: [{ tripDate: 'desc' }, { tripNumber: 'desc' }]
    }),
    prisma.tripImportRow.count({ where: { status: 'PENDING' } })
  ]);
  const status = Object.values(ContainerTripStatus).includes(params.status as ContainerTripStatus)
    ? params.status as ContainerTripStatus
    : '';
  const filtered = trips.filter((trip) => (!status || trip.status === status) && containerTripMatchesSearch(trip, params.q));
  const pagination = paginateItems(filtered, params.page, params.pageSize);
  const counts = {
    active: trips.filter((trip) => trip.status === ContainerTripStatus.PLANNED || trip.status === ContainerTripStatus.IN_PROGRESS).length,
    driver: trips.filter((trip) => trip.status === ContainerTripStatus.AWAITING_DRIVER_DATA).length,
    review: trips.filter((trip) => trip.status === ContainerTripStatus.UNDER_REVIEW).length,
    ready: trips.filter((trip) => trip.status === ContainerTripStatus.READY_TO_BILL).length
  };

  return (
    <>
      <PageHeader
        title="Trasporti container"
        description="Committente, lettera di vettura, container, terminal, tappe multiple, km finali ed extra restano separati dai viaggi carburante."
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/trips/container/settings">
              <Settings2 size={16} aria-hidden />
              Prezzario extra
            </Link>
            <Link className="secondary-button" href={pendingImports > 0 ? '/trips/import/review' : '/trips/import'}>
              <UploadCloud size={16} aria-hidden />
              Import PDF
            </Link>
            <Link className="primary-button" href="/trips/container/new">
              <Plus size={16} aria-hidden />
              Nuovo container
            </Link>
          </div>
        }
      />

      {pendingImports > 0 ? (
        <section className="panel" style={{ marginBottom: 18 }}>
          <div className="actions-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0 }}><strong>{pendingImports}</strong> bolle importate attendono conferma.</p>
            <Link className="primary-button compact-button" href="/trips/import/review">
              Revisiona <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        </section>
      ) : null}

      <section className="metrics" aria-label="Riepilogo trasporti container">
        <Link className="metric metric-link" href="/trips/container">
          <span>Pianificati / in corso</span><strong>{counts.active}</strong>
        </Link>
        <Link className="metric metric-link" href="/trips/container?status=AWAITING_DRIVER_DATA">
          <span>Attesa dati autista</span><strong>{counts.driver}</strong>
        </Link>
        <Link className="metric metric-link" href="/trips/container?status=UNDER_REVIEW">
          <span>Da verificare</span><strong>{counts.review}</strong>
        </Link>
        <Link className="metric metric-link" href="/trips/container?status=READY_TO_BILL">
          <span>Chiusi / da fatturare</span><strong>{counts.ready}</strong>
        </Link>
      </section>

      <form className="filter-bar" action="/trips/container">
        <label>
          Cerca
          <input name="q" defaultValue={params.q || ''} placeholder="LDV, committente, container, targa, booking, tappa" />
        </label>
        <label>
          Stato
          <select name="status" defaultValue={status}>
            <option value="">Tutti</option>
            {Object.values(ContainerTripStatus).map((value) => (
              <option value={value} key={value}>{getContainerTripStatusLabel(value)}</option>
            ))}
          </select>
        </label>
        <div className="filter-actions">
          <button className="primary-button" type="submit">Filtra</button>
          <Link className="secondary-button" href="/trips/container">Reset</Link>
        </div>
      </form>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>N.</th>
              <th>Data / LDV</th>
              <th>Committente</th>
              <th>Container</th>
              <th>Tappe</th>
              <th>Autista / mezzo</th>
              <th>Km</th>
              <th>Extra approvati</th>
              <th>Stato</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.length === 0 ? (
              <tr><td className="empty-state" colSpan={9}>Nessun trasporto container trovato.</td></tr>
            ) : pagination.items.map((trip) => {
              const href = `/trips/container/${trip.id}`;
              return (
                <tr className="clickable-row" key={trip.id}>
                  <td className="click-cell"><Link className="table-cell-link" href={href}><strong>{trip.tripNumber}</strong></Link></td>
                  <td className="click-cell">
                    <Link className="table-cell-link" href={href}>
                      {formatDate(trip.tripDate)}
                      <div className="muted">LDV {trip.waybillNumber || '-'}</div>
                    </Link>
                  </td>
                  <td className="click-cell"><Link className="table-cell-link" href={href}>{getContainerTripCustomerLabel(trip)}</Link></td>
                  <td className="click-cell"><Link className="table-cell-link" href={href}>{getContainerSummary(trip)}</Link></td>
                  <td className="click-cell">
                    <Link className="table-cell-link" href={href}>
                      {getContainerStopsSummary(trip)}
                      <div className="muted">{trip.loadingTerminalName || '-'}</div>
                    </Link>
                  </td>
                  <td className="click-cell">
                    <Link className="table-cell-link" href={href}>
                      {getDriverLabel(trip.driver)}
                      <div className="muted">{getVehicleLabel(trip.tractor)} · {getVehicleLabel(trip.trailer)}</div>
                    </Link>
                  </td>
                  <td className="click-cell"><Link className="table-cell-link" href={href}>{getContainerTripActualKm(trip)?.toLocaleString('it-IT') || '-'}</Link></td>
                  <td className="click-cell"><Link className="table-cell-link" href={href}>{formatContainerMoney(getContainerTripApprovedExtrasCents(trip))}</Link></td>
                  <td className="click-cell">
                    <Link className="table-cell-link" href={href}>
                      <span className={`badge container-trip-status-${trip.status.toLowerCase()}`}>{getContainerTripStatusLabel(trip.status)}</span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <TablePagination
        currentPage={pagination.currentPage}
        from={pagination.from}
        pathname="/trips/container"
        searchParams={params}
        to={pagination.to}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </>
  );
}
