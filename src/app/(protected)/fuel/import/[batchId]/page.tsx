import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FuelEntryStatus } from '@prisma/client';
import { AlertTriangle, ArrowRight, Check, CreditCard, Download, Save, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { PageHeader } from '@/components/PageHeader';
import { TablePagination } from '@/components/TablePagination';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  formatFuelConsumption,
  formatFuelCostPerKm,
  formatFuelLiters,
  formatFuelMoney,
  formatFuelPrice,
  fuelEntryInclude,
  getFuelDriverLabel,
  getFuelVehicleLabel
} from '@/lib/fuel';
import { paginateItems } from '@/lib/pagination';
import {
  assignBatchFuelCardAction,
  confirmAllPendingAction,
  confirmFuelEntryAction,
  deleteAllPendingAction,
  deletePendingFuelEntryAction
} from '../actions';

type FuelImportReviewPageProps = {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string }>;
};

export default async function FuelImportReviewPage({ params, searchParams }: FuelImportReviewPageProps) {
  await requireUser();
  const [{ batchId }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const batch = await prisma.fuelImportBatch.findUnique({ where: { id: batchId } });
  if (!batch) notFound();

  const [pendingEntries, fuelCards] = await Promise.all([
    prisma.fuelEntry.findMany({
      where: { importBatchId: batchId, status: FuelEntryStatus.PENDING },
      include: fuelEntryInclude,
      orderBy: [{ plate: 'asc' }, { fuelDate: 'asc' }, { fuelTime: 'asc' }]
    }),
    prisma.fuelCard.findMany({
      where: { active: true },
      include: { fuelSupplier: true },
      orderBy: [{ fuelSupplier: { name: 'asc' } }, { cardNumber: 'asc' }]
    })
  ]);

  const totalAmountCents = pendingEntries.reduce((sum, entry) => sum + entry.totalAmountCents, 0);
  const totalVolumeLitersMilli = pendingEntries.reduce((sum, entry) => sum + entry.volumeLitersMilli, 0);
  const isWinSoftware = pendingEntries.some((entry) => entry.serviceType === 'WINSOFTWARE');
  const missingSource = pendingEntries.some(
    (entry) => entry.serviceType === 'WINSOFTWARE' && !entry.fuelCardId && !entry.cardNumber.trim()
  );
  const assignedCardIds = Array.from(new Set(pendingEntries.map((entry) => entry.fuelCardId).filter(Boolean)));
  const currentCardId = assignedCardIds.length === 1 ? assignedCardIds[0]! : '';
  const pagination = paginateItems(pendingEntries, resolvedSearchParams.page, resolvedSearchParams.pageSize);

  return (
    <>
      <PageHeader
        title="Conferma rifornimenti importati"
        description={`${batch.originalFileName}${batch.invoiceNumber ? ` · Fattura ${batch.invoiceNumber}` : ''}${
          batch.invoiceDate ? ` del ${formatDate(batch.invoiceDate)}` : ''
        }`}
        action={
          <div className="actions-row">
            <Link className="secondary-button" href={`/api/fuel/imports/${batch.id}/file`} target="_blank">
              <Download size={16} aria-hidden />
              Apri PDF
            </Link>
            <Link className="secondary-button" href="/fuel">
              Rifornimenti
            </Link>
          </div>
        }
      />

      <section className="panel" style={{ marginBottom: 18 }}>
        <p>
          Controlla le righe lette dal PDF. Quando confermi, entrano nel centro costi e nei calcoli km/euro; finche&apos;
          restano in attesa non incidono sui totali. I km sono digitati dagli autisti alla pompa: se vedi un valore
          improbabile correggilo dal dettaglio del rifornimento dopo la conferma, oppure elimina la riga.
        </p>
        {pendingEntries.length > 0 ? (
          <div className="actions-row" style={{ marginTop: 12 }}>
            <form action={confirmAllPendingAction.bind(null, batch.id)}>
              <ConfirmSubmitButton
                className="primary-button"
                disabled={missingSource}
                message={`Confermare tutte le ${pendingEntries.length} righe in attesa di questo import?`}
                title={missingSource ? 'Associa prima la tessera/provenienza.' : undefined}
              >
                <Check size={16} aria-hidden />
                Conferma tutti ({pendingEntries.length})
              </ConfirmSubmitButton>
            </form>
            <form action={deleteAllPendingAction.bind(null, batch.id)}>
              <ConfirmSubmitButton
                className="danger-button"
                message={`Eliminare tutte le ${pendingEntries.length} righe in attesa di questo import?`}
              >
                <Trash2 size={16} aria-hidden />
                Elimina tutti
              </ConfirmSubmitButton>
            </form>
          </div>
        ) : null}
      </section>

      {pendingEntries.length > 0 && isWinSoftware ? (
        <form
          action={assignBatchFuelCardAction.bind(null, batch.id)}
          className={`fuel-source-assignment${missingSource ? ' is-required' : ''}`}
          style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 18 }}
        >
          <div className="fuel-source-copy">
            <span><CreditCard size={17} aria-hidden /></span>
            <div>
              <strong>Tessera / provenienza</strong>
              <small>Vale per tutte le {pendingEntries.length} righe della fattura.</small>
            </div>
          </div>
          <label>
            Tessera registrata
            <select name="fuelCardId" defaultValue={currentCardId}>
              <option value="">Usa il nome indicato</option>
              {fuelCards.map((card) => {
                const identity = card.label && card.label !== card.cardNumber
                  ? `${card.label} · ${card.cardNumber}`
                  : card.cardNumber;
                return (
                  <option key={card.id} value={card.id}>
                    {card.fuelSupplier ? `${identity} · ${card.fuelSupplier.name}` : identity}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            Nome tessera o provenienza
            <input
              name="fuelCardLabel"
              defaultValue={currentCardId ? '' : batch.supplierName || ''}
              placeholder="Es. Energia Demo S.R.L."
            />
          </label>
          <button className="secondary-button" type="submit">
            <Save size={15} aria-hidden />
            Applica alla fattura
          </button>
        </form>
      ) : null}

      {pendingEntries.length > 0 ? (
        <section className="metrics" aria-label="Riepilogo righe in attesa">
          <div className="metric">
            <span>Righe in attesa</span>
            <strong>{pendingEntries.length}</strong>
          </div>
          <div className="metric">
            <span>Litri</span>
            <strong>{formatFuelLiters(totalVolumeLitersMilli)}</strong>
          </div>
          <div className="metric">
            <span>Costo</span>
            <strong>{formatFuelMoney(totalAmountCents)}</strong>
          </div>
        </section>
      ) : null}

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Targa</th>
              <th>Tessera</th>
              <th>Prodotto</th>
              <th>Km</th>
              <th>Litri</th>
              <th>Prezzo</th>
              <th>Costo</th>
              <th>Euro/km</th>
              <th>Avviso</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {pendingEntries.length === 0 ? (
              <tr>
                <td colSpan={11} className="empty-state">
                  Nessuna riga in attesa: tutte le righe di questo import sono gia state validate.{' '}
                  <Link className="table-cell-link" href="/fuel">
                    Vai al centro costi
                    <ArrowRight size={14} aria-hidden />
                  </Link>
                </td>
              </tr>
            ) : (
              pagination.items.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    {formatDate(entry.fuelDate)}
                    {entry.fuelTime ? <div className="muted">{entry.fuelTime}</div> : null}
                  </td>
                  <td>
                    <strong>{getFuelVehicleLabel(entry)}</strong>
                    <div className="muted">{getFuelDriverLabel(entry)}</div>
                  </td>
                  <td>
                    {entry.fuelCard?.label || entry.fuelCard?.cardNumber || entry.cardNumber || (
                      <span className="fuel-review-hint"><AlertTriangle size={13} aria-hidden /> Da associare</span>
                    )}
                  </td>
                  <td>{entry.fuelProduct?.name || entry.productName || entry.productCode}</td>
                  <td>
                    {entry.odometerKm ? `${entry.odometerKm.toLocaleString('it-IT')} km` : '-'}
                    {entry.kmDelta ? <div className="muted">+{entry.kmDelta.toLocaleString('it-IT')} km</div> : null}
                  </td>
                  <td>{formatFuelLiters(entry.volumeLitersMilli)}</td>
                  <td>{formatFuelPrice(entry.grossPricePerLiterMilliEuro)}</td>
                  <td>{formatFuelMoney(entry.totalAmountCents)}</td>
                  <td>
                    {formatFuelCostPerKm(entry.costPerKmMilliEuro)}
                    {entry.litersPer100KmTenths ? (
                      <div className="muted">{formatFuelConsumption(entry.litersPer100KmTenths)}</div>
                    ) : null}
                  </td>
                  <td>
                    {entry.reviewReasons ? (
                      <span className="fuel-review-hint">
                        <AlertTriangle size={13} aria-hidden /> {entry.reviewReasons}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <div className="actions-row">
                      <form action={confirmFuelEntryAction.bind(null, batch.id, entry.id)}>
                        <button
                          className="primary-button compact-button"
                          type="submit"
                          disabled={entry.serviceType === 'WINSOFTWARE' && !entry.fuelCardId && !entry.cardNumber.trim()}
                          title={entry.serviceType === 'WINSOFTWARE' && !entry.fuelCardId && !entry.cardNumber.trim()
                            ? 'Associa prima la tessera/provenienza.'
                            : undefined}
                        >
                          <Check size={15} aria-hidden />
                          Conferma
                        </button>
                      </form>
                      <form action={deletePendingFuelEntryAction.bind(null, batch.id, entry.id)}>
                        <ConfirmSubmitButton
                          className="danger-button compact-button"
                          message="Eliminare questa riga importata?"
                        >
                          <Trash2 size={15} aria-hidden />
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <TablePagination
          pathname={`/fuel/import/${batch.id}`}
          searchParams={resolvedSearchParams}
          {...pagination}
        />
      </section>
    </>
  );
}
