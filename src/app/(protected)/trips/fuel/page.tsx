import { requireUser } from '@/lib/auth';
import { TripStatus } from '@prisma/client';
import Link from 'next/link';
import { ArrowRight, Download, Plus, Settings2 } from 'lucide-react';
import { FilteredReportButton } from '@/components/FilteredReportButton';
import { PageHeader } from '@/components/PageHeader';
import { TablePagination } from '@/components/TablePagination';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { paginateItems } from '@/lib/pagination';
import {
  formatTripMoney,
  formatTripTotalLoadQuantity,
  getDriverLabel,
  getTripBillingStatusLabel,
  getTripMarginCents,
  getTripProductLabel,
  getTripSalesPointSummary,
  getTripStatusLabel,
  getVehicleLabel,
  tripInclude,
  tripMatchesSearch
} from '@/lib/trips';

type TripsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    pageSize?: string;
  }>;
};

export default async function FuelDeliveryTripsPage({ searchParams }: TripsPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const trips = await prisma.trip.findMany({
    include: tripInclude,
    orderBy: [{ tripDate: 'desc' }, { tripNumber: 'desc' }]
  });

  const statusFilter = Object.values(TripStatus).includes(resolvedSearchParams.status as TripStatus)
    ? (resolvedSearchParams.status as TripStatus)
    : '';

  const filteredTrips = trips.filter((trip) => {
    if (statusFilter && trip.status !== statusFilter) return false;
    return tripMatchesSearch(trip, resolvedSearchParams.q);
  });

  const counts = {
    planned: trips.filter((trip) => trip.status === TripStatus.PLANNED).length,
    sent: trips.filter((trip) => trip.status === TripStatus.SENT).length,
    completed: trips.filter((trip) => trip.status === TripStatus.COMPLETED).length,
    cancelled: trips.filter((trip) => trip.status === TripStatus.CANCELLED).length
  };
  const pagination = paginateItems(filteredTrips, resolvedSearchParams.page, resolvedSearchParams.pageSize);

  return (
    <>
      <PageHeader
        title="Viaggi consegna carburante"
        description="Schema storico dedicato alle consegne carburante: basi di carico, punti vendita, prodotti e litri."
        action={
          <div className="actions-row">
            <FilteredReportButton baseHref="/api/reports/trips" />
            <Link className="secondary-button" href="/trips/settings">
              <Settings2 size={16} aria-hidden />
              Anagrafiche viaggio
            </Link>
            <Link className="primary-button" href="/trips/new">
              <Plus size={16} aria-hidden />
              Nuovo viaggio
            </Link>
          </div>
        }
      />

      <section className="metrics" aria-label="Riepilogo viaggi">
        <Link className="metric metric-link" href="/trips/fuel?status=PLANNED" aria-label="Vedi viaggi pianificati">
          <span>Pianificati</span>
          <strong>{counts.planned}</strong>
          <span className="metric-action">
            Vedi viaggi
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <Link className="metric metric-link" href="/trips/fuel?status=SENT" aria-label="Vedi viaggi con PDF inviato">
          <span>PDF inviati</span>
          <strong>{counts.sent}</strong>
          <span className="metric-action">
            Vedi viaggi
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <Link className="metric metric-link" href="/trips/fuel?status=COMPLETED" aria-label="Vedi viaggi completati">
          <span>Completati</span>
          <strong>{counts.completed}</strong>
          <span className="metric-action">
            Vedi viaggi
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <Link className="metric metric-link" href="/trips/fuel?status=CANCELLED" aria-label="Vedi viaggi annullati">
          <span>Annullati</span>
          <strong>{counts.cancelled}</strong>
          <span className="metric-action">
            Vedi viaggi
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
      </section>

      <form className="filter-bar" action="/trips/fuel">
        <label>
          Cerca
          <input name="q" placeholder="Targa, autista, punto vendita, codice" defaultValue={resolvedSearchParams.q || ''} />
        </label>
        <label>
          Stato
          <select name="status" defaultValue={statusFilter}>
            <option value="">Tutti</option>
            {Object.values(TripStatus).map((status) => (
              <option key={status} value={status}>
                {getTripStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <div className="filter-actions">
          <button className="primary-button" type="submit">
            Filtra
          </button>
          <Link className="secondary-button" href="/trips/fuel">
            Reset
          </Link>
        </div>
      </form>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>N.</th>
              <th>Data</th>
              <th>Cliente</th>
              <th>Punto vendita</th>
              <th>Mezzo</th>
              <th>Autista</th>
              <th>Carico</th>
              <th>Economia</th>
              <th>Stato</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {filteredTrips.length === 0 ? (
              <tr>
                <td colSpan={10} className="empty-state">
                  Nessun viaggio trovato.
                </td>
              </tr>
            ) : (
              pagination.items.map((trip) => {
                const tripHref = `/trips/${trip.id}`;

                return (
                  <tr className="clickable-row" key={trip.id}>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={tripHref}>
                        <strong>{trip.tripNumber}</strong>
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={tripHref}>
                        {formatDate(trip.tripDate)}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={tripHref}>
                        <strong>{trip.customerName || '-'}</strong>
                        {trip.customerReference ? <div className="muted">{trip.customerReference}</div> : null}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={tripHref}>
                        <strong>{getTripSalesPointSummary(trip)}</strong>
                        <div className="muted">{trip.loadingBase.name}</div>
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={tripHref}>
                        {getVehicleLabel(trip.tractor)}
                        <div className="muted">{getVehicleLabel(trip.trailer)}</div>
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={tripHref}>
                        {getDriverLabel(trip.driver)}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={tripHref}>
                        <strong>{getTripProductLabel(trip)}</strong>
                        <div className="muted">{formatTripTotalLoadQuantity(trip)}</div>
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={tripHref}>
                        <strong>{formatTripMoney(trip.freightRevenueCents)}</strong>
                        <div className="muted">
                          {getTripBillingStatusLabel(trip.billingStatus)}
                          {getTripMarginCents(trip) !== null ? ` · marg. ${formatTripMoney(getTripMarginCents(trip))}` : ''}
                        </div>
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={tripHref}>
                        <span className={`badge trip-status-${trip.status.toLowerCase()}`}>{getTripStatusLabel(trip.status)}</span>
                      </Link>
                    </td>
                    <td>
                      <Link className="secondary-button compact-button" href={`/api/trips/${trip.id}/pdf`} target="_blank">
                        <Download size={15} aria-hidden />
                        PDF
                      </Link>
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
        pathname="/trips/fuel"
        searchParams={resolvedSearchParams}
        to={pagination.to}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </>
  );
}
