import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, MapPin, Plus, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { PageHeader } from '@/components/PageHeader';
import { TripForm } from '@/components/TripForm';
import { formatDate, toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  buildDriverOptions,
  buildLoadingBaseOptions,
  buildTripMapsHref,
  buildSalesPointOptions,
  buildTractorOptions,
  buildTrailerOptions,
  buildTripProductOptions,
  formatTripLoadQuantity,
  formatTripMoney,
  formatTripTotalLoadQuantity,
  formatTripAddress,
  getDriverLabel,
  getTripActualKm,
  getTripBillingStatusLabel,
  getTripMarginCents,
  getTripProductLineLabel,
  getTripProductLineSalesPointLabel,
  getTripProductLines,
  getTripSalesPointSummary,
  getTripStatusLabel,
  getTripTitle,
  getVehicleLabel,
  tripInclude
} from '@/lib/trips';
import { deleteTripAction, updateTripAction } from '../actions';

type TripDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

function amountInputValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return (value / 100).toFixed(2);
}

export default async function TripDetailPage({ params, searchParams }: TripDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: tripInclude
  });
  if (!trip) notFound();

  const [loadingBases, salesPoints, products, drivers, tractors, trailers] = await Promise.all([
    prisma.loadingBase.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.salesPoint.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }, { plantCode: 'asc' }] }),
    prisma.tripProduct.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.trailer.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] })
  ]);
  const loadingBaseAddress = formatTripAddress(trip.loadingBase);
  const tripProductLines = getTripProductLines(trip);
  const primarySalesPoint = tripProductLines[0]?.salesPoint || trip.salesPoint;
  const primarySalesPointAddress = formatTripAddress(primarySalesPoint);
  const salesPointMapsHref = buildTripMapsHref(primarySalesPoint);
  const totalTripCostCents = (trip.carrierCostCents || 0) + (trip.tollCostCents || 0) + (trip.extraCostCents || 0);
  const tripMarginCents = getTripMarginCents(trip);
  const actualKm = getTripActualKm(trip);
  const newTripParams = new URLSearchParams({
    loadingBaseId: trip.loadingBaseId
  });
  tripProductLines.forEach((line) => {
    if (line.salesPointId) newTripParams.append('salesPointId', line.salesPointId);
    if (line.productId) newTripParams.append('productId', line.productId);
    newTripParams.append('liters', String(line.liters));
  });
  if (trip.driverId) newTripParams.set('driverId', trip.driverId);
  if (trip.tractorId) newTripParams.set('tractorId', trip.tractorId);
  if (trip.trailerId) newTripParams.set('trailerId', trip.trailerId);
  if (trip.customerName) newTripParams.set('customerName', trip.customerName);
  if (trip.carrierName) newTripParams.set('carrierName', trip.carrierName);
  const newTripHref = `/trips/new?${newTripParams.toString()}`;

  return (
    <>
      <PageHeader
        title={getTripTitle(trip)}
        description={`${trip.loadingBase.name} - ${getTripStatusLabel(trip.status)}`}
        action={
          <div className="actions-row">
            {salesPointMapsHref ? (
              <Link className="secondary-button" href={salesPointMapsHref} target="_blank">
                <MapPin size={16} aria-hidden />
                {tripProductLines.length > 1 ? 'Apri primo scarico in Maps' : 'Apri scarico in Maps'}
              </Link>
            ) : null}
            <Link className="secondary-button" href={`/api/trips/${trip.id}/pdf`} target="_blank">
              <Download size={16} aria-hidden />
              Apri PDF
            </Link>
            <Link className="primary-button" href={newTripHref}>
              <Plus size={16} aria-hidden />
              Nuovo viaggio
            </Link>
          </div>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="metrics" aria-label="Economia viaggio">
        <div className="metric">
          <span>Ricavo viaggio</span>
          <strong>{formatTripMoney(trip.freightRevenueCents)}</strong>
        </div>
        <div className="metric">
          <span>Costi viaggio</span>
          <strong>{formatTripMoney(totalTripCostCents || null)}</strong>
        </div>
        <div className="metric">
          <span>Margine</span>
          <strong>{formatTripMoney(tripMarginCents)}</strong>
        </div>
        <div className="metric">
          <span>Km reali</span>
          <strong>{actualKm !== null ? actualKm.toLocaleString('it-IT') : '-'}</strong>
        </div>
      </section>

      <div className="grid two">
        <section className="detail-section">
          <h2>Scheda viaggio</h2>
          <div className="trip-focus">
            <span>{tripProductLines.length > 1 ? 'Punti di consegna' : 'Punto di consegna'}</span>
            <strong>{getTripSalesPointSummary(trip)}</strong>
            <b>Codice impianto: {primarySalesPoint.plantCode || '-'}</b>
            {primarySalesPointAddress ? <p>{primarySalesPointAddress}</p> : null}
          </div>
          <dl className="detail-list">
            <div>
              <dt>Numero</dt>
              <dd>{trip.tripNumber}</dd>
            </div>
            <div>
              <dt>Data</dt>
              <dd>{formatDate(trip.tripDate)}</dd>
            </div>
            <div>
              <dt>Base di carico</dt>
              <dd>
                {trip.loadingBase.name}
                {loadingBaseAddress ? <div className="muted">{loadingBaseAddress}</div> : null}
              </dd>
            </div>
            <div>
              <dt>Sequenza</dt>
              <dd>{trip.sequenceNumber || '-'}</dd>
            </div>
            <div>
              <dt>Autista</dt>
              <dd>{getDriverLabel(trip.driver)}</dd>
            </div>
            <div>
              <dt>Km previsti</dt>
              <dd>{trip.expectedKm || '-'}</dd>
            </div>
            <div>
              <dt>Km partenza</dt>
              <dd>{trip.odometerStartKm ? trip.odometerStartKm.toLocaleString('it-IT') : '-'}</dd>
            </div>
            <div>
              <dt>Km arrivo</dt>
              <dd>{trip.odometerEndKm ? trip.odometerEndKm.toLocaleString('it-IT') : '-'}</dd>
            </div>
            <div>
              <dt>Trattore</dt>
              <dd>{getVehicleLabel(trip.tractor)}</dd>
            </div>
            <div>
              <dt>Rimorchio</dt>
              <dd>{getVehicleLabel(trip.trailer)}</dd>
            </div>
            <div>
              <dt>Carico</dt>
              <dd>
                <ul className="trip-load-lines">
                  {tripProductLines.length === 0 ? (
                    <li>-</li>
                  ) : (
                    tripProductLines.map((line, index) => (
                      <li key={line.id || `${line.productId || 'legacy'}-${index}`}>
                        <span>
                          {getTripProductLineSalesPointLabel(line)}
                          <small>{getTripProductLineLabel(line)}</small>
                        </span>
                        <strong>{formatTripLoadQuantity(line)}</strong>
                      </li>
                    ))
                  )}
                </ul>
                {tripProductLines.length > 1 ? <span className="muted">Totale {formatTripTotalLoadQuantity(trip)}</span> : null}
              </dd>
            </div>
            <div>
              <dt>Stato</dt>
              <dd>{getTripStatusLabel(trip.status)}</dd>
            </div>
            <div>
              <dt>Cliente</dt>
              <dd>{trip.customerName || '-'}</dd>
            </div>
            <div>
              <dt>Ordine cliente</dt>
              <dd>{trip.customerReference || '-'}</dd>
            </div>
            <div>
              <dt>Trasportatore / sub-vettore</dt>
              <dd>{trip.carrierName || 'Flotta interna'}</dd>
            </div>
            <div>
              <dt>DDT</dt>
              <dd>
                {trip.transportDocumentNumber || '-'}
                {trip.transportDocumentDate ? <div className="muted">{formatDate(trip.transportDocumentDate)}</div> : null}
              </dd>
            </div>
            <div>
              <dt>Fatturazione</dt>
              <dd>{getTripBillingStatusLabel(trip.billingStatus)}</dd>
            </div>
            <div>
              <dt>Fattura</dt>
              <dd>
                {trip.invoiceNumber || '-'}
                {trip.invoiceDate ? <div className="muted">{formatDate(trip.invoiceDate)}</div> : null}
              </dd>
            </div>
          </dl>
          {trip.economicNotes ? <p>{trip.economicNotes}</p> : null}
          {trip.notes ? <p>{trip.notes}</p> : null}
          <div className="record-actions">
            <form action={deleteTripAction.bind(null, trip.id)}>
              <ConfirmSubmitButton
                className="danger-button"
                message="Eliminare definitivamente questo viaggio? Questa operazione non si puo annullare."
              >
                <Trash2 size={16} aria-hidden />
                Elimina viaggio
              </ConfirmSubmitButton>
            </form>
          </div>
        </section>

        <section className="panel">
          <h2>Modifica viaggio</h2>
          <TripForm
            action={updateTripAction.bind(null, trip.id)}
            loadingBases={buildLoadingBaseOptions(loadingBases)}
            salesPoints={buildSalesPointOptions(salesPoints)}
            drivers={buildDriverOptions(drivers)}
            tractors={buildTractorOptions(tractors)}
            trailers={buildTrailerOptions(trailers)}
            products={buildTripProductOptions(products)}
            defaultValues={{
              tripDate: toDateInputValue(trip.tripDate),
              loadingBaseId: trip.loadingBaseId,
              salesPointId: trip.salesPointId,
              driverId: trip.driverId,
              tractorId: trip.tractorId,
              trailerId: trip.trailerId,
              sequenceNumber: trip.sequenceNumber,
              expectedKm: trip.expectedKm,
              odometerStartKm: trip.odometerStartKm,
              odometerEndKm: trip.odometerEndKm,
              productLines: tripProductLines.map((line) => ({
                id: line.id,
                salesPointId: line.salesPointId,
                productId: line.productId,
                liters: line.liters
              })),
              status: trip.status,
              billingStatus: trip.billingStatus,
              customerName: trip.customerName,
              customerReference: trip.customerReference,
              carrierName: trip.carrierName,
              transportDocumentNumber: trip.transportDocumentNumber,
              transportDocumentDate: toDateInputValue(trip.transportDocumentDate),
              invoiceNumber: trip.invoiceNumber,
              invoiceDate: toDateInputValue(trip.invoiceDate),
              freightRevenue: amountInputValue(trip.freightRevenueCents),
              carrierCost: amountInputValue(trip.carrierCostCents),
              tollCost: amountInputValue(trip.tollCostCents),
              extraCost: amountInputValue(trip.extraCostCents),
              economicNotes: trip.economicNotes,
              notes: trip.notes
            }}
            showStatus
            submitLabel="Salva modifiche"
          />
        </section>
      </div>
    </>
  );
}
