import { requireUser } from '@/lib/auth';
import {
  ContainerTripExtraKind,
  ContainerTripExtraStatus,
  ContainerTripStatus
} from '@prisma/client';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Download, ListPlus, Pencil, Plus, RotateCcw, Save } from 'lucide-react';
import { ContainerTripForm } from '@/components/ContainerTripForm';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { PageHeader } from '@/components/PageHeader';
import {
  containerTripInclude,
  formatContainerMoney,
  getContainerSummary,
  getContainerTripActualKm,
  getContainerTripApprovedExtrasCents,
  getContainerTripClosureIssues,
  getContainerTripCustomerLabel,
  getContainerTripExtraKindLabel,
  getContainerTripExtraStatusLabel,
  getContainerTripMarginCents,
  getContainerTripStatusLabel,
  getTripBillingStatusLabel,
  isContainerTripClosedForCosts
} from '@/lib/container-trips';
import { formatDate, toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { buildDriverOptions, buildTractorOptions, buildTrailerOptions, getDriverLabel, getVehicleLabel } from '@/lib/trips';
import {
  closeContainerTripAction,
  createContainerExtraAction,
  reopenContainerTripAction,
  updateContainerExtraAction,
  updateContainerTripAction
} from '../actions';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; fromImport?: string }>;
};

function amountValue(cents: number | null | undefined) {
  return cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

export default async function ContainerTripDetailPage({ params, searchParams }: Props) {
  await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const [trip, drivers, tractors, trailers, tariffs] = await Promise.all([
    prisma.containerTrip.findUnique({ where: { id }, include: containerTripInclude }),
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.trailer.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.containerExtraTariff.findMany({ where: { active: true }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] })
  ]);
  if (!trip) notFound();

  const actualKm = getContainerTripActualKm(trip);
  const approvedExtras = getContainerTripApprovedExtrasCents(trip);
  const margin = getContainerTripMarginCents(trip);
  const firstImport = trip.importRows[0];
  const closureIssues = getContainerTripClosureIssues(trip);
  const isClosed = isContainerTripClosedForCosts(trip.status);
  const canClose =
    closureIssues.length === 0 &&
    trip.status !== ContainerTripStatus.CANCELLED &&
    trip.status !== ContainerTripStatus.INVOICED;

  return (
    <>
      <PageHeader
        title={`Container n. ${trip.tripNumber}`}
        description={`${getContainerTripCustomerLabel(trip)} · ${getContainerTripStatusLabel(trip.status)}`}
        action={
          <div className="actions-row">
            {firstImport ? (
              <Link className="secondary-button" href={`/api/trips/imports/${firstImport.batchId}/file`} target="_blank">
                <Download size={16} aria-hidden />
                Bolla originale
              </Link>
            ) : null}
            <Link className="secondary-button" href="/trips/container">Elenco container</Link>
            <Link className="primary-button" href="/trips/container/new">
              <Plus size={16} aria-hidden />
              Nuovo
            </Link>
          </div>
        }
      />

      {query.error ? <p className="form-error" style={{ marginBottom: 18 }}>{query.error}</p> : null}

      {query.fromImport === '1' ? (
        <section className="workflow-status needs-action">
          <span className="workflow-status-icon"><Pencil size={20} aria-hidden /></span>
          <span className="workflow-status-copy">
            <small>Bolla importata correttamente</small>
            <strong>Ora puoi modificare e completare questo viaggio</strong>
            <span>Inserisci anche in un secondo momento km, dogana, soste, importi e note; poi chiudilo per portarlo nel centro costi.</span>
          </span>
          <a className="primary-button compact-button workflow-status-note" href="#completa-viaggio">Completa ora</a>
        </section>
      ) : null}

      <nav className="container-trip-steps" aria-label="Fasi del viaggio container">
        <a href="#completa-viaggio">
          <span>1</span>
          <Pencil size={17} aria-hidden />
          <strong>Dati, tappe e km</strong>
        </a>
        <a href="#extra-viaggio">
          <span>2</span>
          <ListPlus size={17} aria-hidden />
          <strong>Dogana, soste ed extra</strong>
        </a>
        <a href="#chiusura-viaggio">
          <span>3</span>
          <CheckCircle2 size={17} aria-hidden />
          <strong>Chiusura e centro costi</strong>
        </a>
      </nav>

      <section className="metrics" aria-label="Riepilogo trasporto container">
        <div className="metric"><span>Km effettivi</span><strong>{actualKm?.toLocaleString('it-IT') || '-'}</strong></div>
        <div className="metric"><span>Ricavo base</span><strong>{formatContainerMoney(trip.freightRevenueCents)}</strong></div>
        <div className="metric"><span>Extra approvati</span><strong>{formatContainerMoney(approvedExtras)}</strong></div>
        <div className="metric"><span>Margine</span><strong>{formatContainerMoney(margin)}</strong></div>
      </section>

      <section className="detail-section container-trip-summary">
        <div className="actions-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Riepilogo attuale</h2>
          <a className="secondary-button compact-button" href="#completa-viaggio"><Pencil size={14} aria-hidden />Modifica</a>
        </div>
        <dl className="detail-list">
          <div><dt>Data</dt><dd>{formatDate(trip.tripDate)}</dd></div>
          <div><dt>Lettera di vettura</dt><dd>{trip.waybillNumber || '-'}{trip.waybillDate ? <div className="muted">{formatDate(trip.waybillDate)}</div> : null}</dd></div>
          <div><dt>Committente</dt><dd>{getContainerTripCustomerLabel(trip)}</dd></div>
          <div><dt>Riferimento</dt><dd>{trip.customerReference || '-'}</dd></div>
          <div><dt>Container</dt><dd>{getContainerSummary(trip)}</dd></div>
          <div><dt>Booking</dt><dd>{trip.booking || '-'}</dd></div>
          <div><dt>Nave / compagnia</dt><dd>{[trip.ship, trip.shippingCompany].filter(Boolean).join(' · ') || '-'}</dd></div>
          <div><dt>Terminal carico</dt><dd>{trip.loadingTerminalName || '-'}</dd></div>
          <div><dt>Terminal consegna</dt><dd>{trip.deliveryTerminalName || '-'}</dd></div>
          <div><dt>PIN / codici</dt><dd>{[trip.pickupCode, trip.deliveryCode].filter(Boolean).join(' · ') || '-'}</dd></div>
          <div><dt>Transitario</dt><dd>{trip.forwarder || '-'}</dd></div>
          <div><dt>Autista</dt><dd>{getDriverLabel(trip.driver)}</dd></div>
          <div><dt>Trattore / semirimorchio</dt><dd>{getVehicleLabel(trip.tractor)} · {getVehicleLabel(trip.trailer)}</dd></div>
          <div><dt>Stato</dt><dd>{getContainerTripStatusLabel(trip.status)}</dd></div>
          <div><dt>Fatturazione</dt><dd>{getTripBillingStatusLabel(trip.billingStatus)}</dd></div>
        </dl>

        <h3>Tappe operative</h3>
        {trip.stops.length === 0 ? <p className="empty-state">Nessuna tappa inserita.</p> : (
          <ol className="trip-load-lines">
            {trip.stops.map((stop) => (
              <li key={stop.id}>
                <span>
                  {stop.name}
                  <small>{[stop.address, stop.postalCode, stop.city, stop.province].filter(Boolean).join(' · ') || '-'}</small>
                </span>
                <strong>{stop.plannedTime || '-'}</strong>
              </li>
            ))}
          </ol>
        )}
        {trip.notes ? <p>{trip.notes}</p> : null}
      </section>

      <section className="panel container-trip-edit-section" id="completa-viaggio">
        <h2>1. Modifica e completa il viaggio</h2>
        <p className="muted">
          Puoi salvare subito i dati disponibili e tornare in seguito. Quando l&apos;autista comunica i dati finali,
          inserisci contachilometri o km dichiarati; il salvataggio non alimenta ancora il centro costi.
        </p>
        <ContainerTripForm
          action={updateContainerTripAction.bind(null, trip.id)}
          drivers={buildDriverOptions(drivers)}
          tractors={buildTractorOptions(tractors)}
          trailers={buildTrailerOptions(trailers)}
          showStatus
          submitLabel="Salva dati viaggio"
          defaultValues={{
            tripDate: toDateInputValue(trip.tripDate),
            status: trip.status,
            billingStatus: trip.billingStatus,
            waybillNumber: trip.waybillNumber,
            waybillDate: toDateInputValue(trip.waybillDate),
            customerCode: trip.customerCode,
            customerName: trip.customerName,
            customerReference: trip.customerReference,
            carrierName: trip.carrierName,
            driverId: trip.driverId,
            tractorId: trip.tractorId,
            trailerId: trip.trailerId,
            loadingTerminalName: trip.loadingTerminalName,
            deliveryTerminalName: trip.deliveryTerminalName,
            booking: trip.booking,
            ship: trip.ship,
            pickupCode: trip.pickupCode,
            deliveryCode: trip.deliveryCode,
            shippingCompany: trip.shippingCompany,
            forwarder: trip.forwarder,
            plannedKm: trip.plannedKm,
            odometerStartKm: trip.odometerStartKm,
            odometerEndKm: trip.odometerEndKm,
            actualKm: trip.actualKm,
            distanceSource: trip.distanceSource,
            freightRevenue: amountValue(trip.freightRevenueCents),
            carrierCost: amountValue(trip.carrierCostCents),
            tollCost: amountValue(trip.tollCostCents),
            economicNotes: trip.economicNotes,
            notes: trip.notes,
            containers: trip.containers,
            stops: trip.stops
          }}
        />
      </section>

      <section className="panel" id="extra-viaggio">
        <div className="actions-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>2. Dogana, soste ed extra</h2>
            <p className="muted" style={{ margin: 0 }}>
              Aggiungi gli imprevisti anche dopo il viaggio. L&apos;importo richiesto, quello concordato e quello approvato
              restano distinti; soltanto gli extra approvati entrano nel centro costi alla chiusura.
            </p>
          </div>
          <Link className="secondary-button compact-button" href="/trips/container/settings">Gestisci prezzario</Link>
        </div>

        <form action={createContainerExtraAction.bind(null, trip.id)} className="form-stack" style={{ marginTop: 18 }}>
          <div className="form-grid">
            <label>
              Voce standard
              <select name="tariffId" defaultValue="">
                <option value="">Extra libero</option>
                {tariffs.map((tariff) => (
                  <option value={tariff.id} key={tariff.id}>
                    {tariff.name} · {formatContainerMoney(tariff.defaultUnitPriceCents)}/{tariff.unitLabel}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <select name="kind" defaultValue={ContainerTripExtraKind.OTHER}>
                {Object.values(ContainerTripExtraKind).map((kind) => (
                  <option value={kind} key={kind}>{getContainerTripExtraKindLabel(kind)}</option>
                ))}
              </select>
            </label>
            <label>
              Descrizione
              <input name="description" placeholder="Es. dogana non prevista" />
            </label>
            <label>
              Importo proposto
              <input name="proposedAmount" inputMode="decimal" placeholder="Es. 120,00" />
            </label>
          </div>
          <label>
            Note e contesto
            <textarea name="reason" rows={3} placeholder="Es. dogana richiesta dal terminal durante il viaggio; attesa di 2 ore comunicata dall'autista" />
          </label>
          <button className="primary-button" type="submit"><Plus size={15} aria-hidden />Aggiungi extra</button>
        </form>

        <div className="form-stack" style={{ marginTop: 20 }}>
          {trip.extras.length === 0 ? <p className="empty-state">Nessun extra registrato.</p> : trip.extras.map((extra) => (
            <form action={updateContainerExtraAction.bind(null, trip.id, extra.id)} className="panel" key={extra.id}>
              <div className="actions-row" style={{ justifyContent: 'space-between' }}>
                <strong>{getContainerTripExtraKindLabel(extra.kind)} · {extra.description}</strong>
                <span className={`badge container-extra-status-${extra.status.toLowerCase()}`}>
                  {getContainerTripExtraStatusLabel(extra.status)}
                </span>
              </div>
              <div className="form-grid" style={{ marginTop: 12 }}>
                <label>
                  Proposto X
                  <input name="proposedAmount" inputMode="decimal" defaultValue={amountValue(extra.proposedAmountCents)} />
                </label>
                <label>
                  Negoziato Y
                  <input name="negotiatedAmount" inputMode="decimal" defaultValue={amountValue(extra.negotiatedAmountCents)} />
                </label>
                <label>
                  Approvato / fatturabile
                  <input name="approvedAmount" inputMode="decimal" defaultValue={amountValue(extra.approvedAmountCents)} />
                </label>
                <label>
                  Decisione
                  <select name="status" defaultValue={extra.status}>
                    {Object.values(ContainerTripExtraStatus).map((status) => (
                      <option value={status} key={status}>{getContainerTripExtraStatusLabel(status)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Note e motivo della decisione
                <textarea name="reason" rows={3} defaultValue={extra.reason || ''} placeholder="Es. importo ridotto dopo accordo con il committente" />
              </label>
              <div className="actions-row">
                <button className="primary-button compact-button" type="submit"><Save size={15} aria-hidden />Salva decisione</button>
                <details>
                  <summary>Storico ({extra.revisions.length})</summary>
                  <ul>
                    {extra.revisions.map((revision) => (
                      <li key={revision.id}>
                        {revision.createdAt.toLocaleString('it-IT')} · {getContainerTripExtraStatusLabel(revision.status)}
                        {' · '}X {formatContainerMoney(revision.proposedAmountCents)}
                        {' · '}Y {formatContainerMoney(revision.negotiatedAmountCents)}
                        {' · '}approvato {formatContainerMoney(revision.approvedAmountCents)}
                        {revision.reason ? ` · ${revision.reason}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </form>
          ))}
        </div>
      </section>

      <section className={`panel container-trip-close-section ${isClosed ? 'is-closed' : ''}`} id="chiusura-viaggio">
        <div className="container-trip-close-copy">
          <span className="workflow-status-icon">
            {isClosed ? <CheckCircle2 size={21} aria-hidden /> : <AlertTriangle size={21} aria-hidden />}
          </span>
          <div>
            <h2>3. Chiudi e porta nel centro costi</h2>
            {isClosed ? (
              <p>
                Il viaggio e <strong>{getContainerTripStatusLabel(trip.status)}</strong>: ricavo base, extra approvati,
                costo vettore e pedaggi sono visibili nel centro costi.
              </p>
            ) : (
              <p>
                Prima salva tutte le modifiche e definisci ogni extra. La chiusura e l&apos;azione esplicita che rende
                contabilizzabili gli importi del viaggio.
              </p>
            )}
          </div>
        </div>

        {!isClosed && closureIssues.length > 0 ? (
          <div className="review-banner container-trip-missing">
            <strong>Per chiudere mancano:</strong>
            <ul>
              {closureIssues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          </div>
        ) : null}

        {trip.status === ContainerTripStatus.CANCELLED ? (
          <p className="review-banner">
            Il viaggio e annullato. Cambia prima lo stato operativo se deve tornare lavorabile.
          </p>
        ) : null}

        {!isClosed && trip.status !== ContainerTripStatus.CANCELLED && closureIssues.length === 0 ? (
          <p className="info-banner">
            <CheckCircle2 size={18} aria-hidden />
            Tutti i dati minimi sono presenti. Puoi chiudere il viaggio e renderlo visibile nel centro costi.
          </p>
        ) : null}

        <div className="actions-row">
          {!isClosed ? (
            <form action={closeContainerTripAction.bind(null, trip.id)}>
              <ConfirmSubmitButton
                className="primary-button"
                disabled={!canClose}
                message="Chiudere il viaggio e portare i suoi importi nel centro costi?"
                title={
                  trip.status === ContainerTripStatus.CANCELLED
                    ? 'Riattiva prima il viaggio'
                    : closureIssues.length > 0
                      ? `Completa: ${closureIssues.join(', ')}`
                      : undefined
                }
              >
                <CheckCircle2 size={16} aria-hidden />
                Chiudi e contabilizza
              </ConfirmSubmitButton>
            </form>
          ) : null}
          {trip.status === ContainerTripStatus.READY_TO_BILL ? (
            <form action={reopenContainerTripAction.bind(null, trip.id)}>
              <ConfirmSubmitButton
                className="secondary-button"
                message="Riaprire il viaggio? I suoi importi usciranno temporaneamente dal centro costi."
              >
                <RotateCcw size={16} aria-hidden />
                Riapri per modifiche
              </ConfirmSubmitButton>
            </form>
          ) : null}
          {isClosed ? (
            <Link className="primary-button" href="/costs?source=CONTAINER_TRIPS">
              Apri centro costi
            </Link>
          ) : null}
        </div>
      </section>
    </>
  );
}
