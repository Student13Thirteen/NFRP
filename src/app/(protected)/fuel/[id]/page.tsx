import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FuelEntryStatus } from '@prisma/client';
import { AlertTriangle, Download, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { FuelEntryForm } from '@/components/FuelEntryForm';
import { PageHeader } from '@/components/PageHeader';
import { formatDate, toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  formatFuelConsumption,
  formatFuelCostPerKm,
  formatFuelLiters,
  formatFuelMoney,
  formatFuelPrice,
  fuelEntryInclude,
  getFuelDriverLabel,
  getFuelEntryStatusLabel,
  getFuelVehicleLabel
} from '@/lib/fuel';
import { deleteFuelEntryAction } from '../actions';

type FuelDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

function decimalInputValue(value: number | null | undefined, divisor: number, fractionDigits: number): string {
  if (value === null || value === undefined) return '';
  // Convenzione input manuale: punto decimale, nessun separatore di migliaia.
  return (value / divisor).toFixed(fractionDigits);
}

export default async function FuelDetailPage({ params, searchParams }: FuelDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const entry = await prisma.fuelEntry.findUnique({
    where: { id },
    include: fuelEntryInclude
  });
  if (!entry) notFound();

  const [tractors, drivers, suppliers, cards, products] = await Promise.all([
    prisma.tractor.findMany({ include: { assignedDriver: true }, orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.fuelSupplier.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.fuelCard.findMany({
      include: { fuelSupplier: true, assignedTractor: true },
      orderBy: [{ active: 'desc' }, { fuelSupplier: { name: 'asc' } }, { cardNumber: 'asc' }]
    }),
    prisma.fuelProduct.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }, { code: 'asc' }] })
  ]);

  return (
    <>
      <PageHeader
        title={`Rifornimento ${entry.plate}`}
        description={`${formatDate(entry.fuelDate)}${entry.fuelTime ? ` - ${entry.fuelTime}` : ''}`}
        action={
          <div className="actions-row">
            {entry.importBatch ? (
              <Link className="secondary-button" href={`/api/fuel/imports/${entry.importBatch.id}/file`} target="_blank">
                <Download size={16} aria-hidden />
                Apri PDF
              </Link>
            ) : null}
            <Link className="secondary-button" href="/fuel">
              Rifornimenti
            </Link>
          </div>
        }
      />

      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <div className="grid two">
        <section className="detail-section">
          <h2>Scheda rifornimento</h2>
          {entry.status === FuelEntryStatus.PENDING ? (
            <p className="muted">
              Riga importata in attesa di conferma: non incide ancora sul centro costi.{' '}
              {entry.importBatchId ? (
                <Link href={`/fuel/import/${entry.importBatchId}`}>Vai alla revisione import</Link>
              ) : null}
            </p>
          ) : null}
          {entry.status === FuelEntryStatus.NEEDS_REVIEW ? (
            <div className="fuel-review-box">
              <p className="fuel-review-box-title">
                <AlertTriangle size={16} aria-hidden /> Perché è da verificare
              </p>
              <p className="fuel-review-box-text">{entry.reviewReasons || 'Rifornimento da controllare manualmente.'}</p>
              <p className="muted fuel-review-box-hint">
                Controlla i dati (in genere i chilometri digitati al distributore), correggi se serve nel form qui a fianco e salva: lo
                stato tornerà a posto da solo.
              </p>
            </div>
          ) : null}
          <dl className="detail-list">
            <div>
              <dt>Data</dt>
              <dd>{formatDate(entry.fuelDate)}</dd>
            </div>
            <div>
              <dt>Ora</dt>
              <dd>{entry.fuelTime || '-'}</dd>
            </div>
            <div>
              <dt>Targa</dt>
              <dd>{getFuelVehicleLabel(entry)}</dd>
            </div>
            <div>
              <dt>Autista</dt>
              <dd>{getFuelDriverLabel(entry)}</dd>
            </div>
            <div>
              <dt>Distributore</dt>
              <dd>{entry.fuelSupplier?.name || entry.fuelCard?.fuelSupplier?.name || entry.supplierName || '-'}</dd>
            </div>
            <div>
              <dt>Tessera</dt>
              <dd>{entry.fuelCard?.cardNumber || entry.cardNumber}</dd>
            </div>
            <div>
              <dt>Prodotto</dt>
              <dd>{entry.fuelProduct?.name || entry.productName || entry.productCode}</dd>
            </div>
            <div>
              <dt>Km dichiarati</dt>
              <dd>{entry.odometerKm ? `${entry.odometerKm.toLocaleString('it-IT')} km` : '-'}</dd>
            </div>
            <div>
              <dt>Delta km</dt>
              <dd>{entry.kmDelta ? `${entry.kmDelta.toLocaleString('it-IT')} km` : '-'}</dd>
            </div>
            <div>
              <dt>Consumo</dt>
              <dd>{formatFuelConsumption(entry.litersPer100KmTenths)}</dd>
            </div>
            <div>
              <dt>Litri</dt>
              <dd>{formatFuelLiters(entry.volumeLitersMilli)}</dd>
            </div>
            <div>
              <dt>Prezzo ivato</dt>
              <dd>{formatFuelPrice(entry.grossPricePerLiterMilliEuro)}</dd>
            </div>
            <div>
              <dt>Costo totale</dt>
              <dd>{formatFuelMoney(entry.totalAmountCents)}</dd>
            </div>
            <div>
              <dt>Euro/km</dt>
              <dd>{formatFuelCostPerKm(entry.costPerKmMilliEuro)}</dd>
            </div>
            <div>
              <dt>Stato</dt>
              <dd>{getFuelEntryStatusLabel(entry.status)}</dd>
            </div>
            <div>
              <dt>Origine</dt>
              <dd>{entry.manualEntry ? 'Manuale' : entry.importBatch?.originalFileName || 'Import PDF'}</dd>
            </div>
          </dl>
          {entry.notes ? <p>{entry.notes}</p> : null}
        </section>

        <section className="panel">
          <h2>Modifica rifornimento</h2>
          <FuelEntryForm
            action={`/api/fuel/${entry.id}/update`}
            tractors={tractors}
            drivers={drivers}
            suppliers={suppliers}
            cards={cards}
            products={products}
            submitLabel="Salva modifiche"
            defaultValues={{
              fuelDate: toDateInputValue(entry.fuelDate),
              fuelTime: entry.fuelTime,
              tractorId: entry.tractorId,
              driverId: entry.driverId,
              fuelSupplierId: entry.fuelSupplierId,
              fuelCardId: entry.fuelCardId,
              cardNumber: entry.fuelCardId ? '' : entry.cardNumber,
              fuelProductId: entry.fuelProductId,
              odometerKm: entry.odometerKm,
              volumeLiters: decimalInputValue(entry.volumeLitersMilli, 1000, 2),
              grossPricePerLiter: decimalInputValue(entry.grossPricePerLiterMilliEuro, 1000, 3),
              totalAmount: decimalInputValue(entry.totalAmountCents, 100, 2),
              receiptNumber: entry.ticketNumber,
              invoiceNumber: entry.invoiceNumber,
              stationName: entry.stationName,
              supplierName: entry.supplierName,
              notes: entry.notes,
              manuallyVerified: entry.manuallyVerified
            }}
          />
          <div className="record-actions">
            <form action={deleteFuelEntryAction.bind(null, entry.id)}>
              <ConfirmSubmitButton
                className="danger-button"
                message="Eliminare definitivamente questo rifornimento? I km della targa verranno ricalcolati."
              >
                <Trash2 size={16} aria-hidden />
                Elimina rifornimento
              </ConfirmSubmitButton>
            </form>
          </div>
        </section>
      </div>
    </>
  );
}
