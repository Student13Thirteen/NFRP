import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Plus, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { DatePartsInput } from '@/components/DatePartsInput';
import { PageHeader } from '@/components/PageHeader';
import { toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { formatBasisPoints, getLeaseVehicleLabel } from '@/lib/lease';
import { getVehicleLabel } from '@/lib/trips';
import { activateLeaseContractAction, deletePendingLeaseContractAction } from '../../actions';

type ReviewPageProps = {
  searchParams: Promise<{ error?: string }>;
};

function moneyInput(value: number | null): string {
  return value === null ? '' : (value / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percentInput(value: number | null): string {
  return value === null ? '' : (value / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

export default async function LeaseReviewPage({ searchParams }: ReviewPageProps) {
  await requireUser();
  const params = await searchParams;
  const [contracts, tractors, trailers] = await Promise.all([
    prisma.leaseContract.findMany({
      where: { status: 'PENDING' },
      include: { lessor: true, tractor: true, trailer: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.tractor.findMany({ where: { lifecycleStatus: 'ACTIVE' }, orderBy: { plate: 'asc' } }),
    prisma.trailer.findMany({ where: { lifecycleStatus: 'ACTIVE' }, orderBy: { plate: 'asc' } })
  ]);

  return (
    <>
      <PageHeader
        title="Controlla contratti leasing"
        description="Verifica i dati OCR, assegna la targa e indica la decorrenza effettiva. Solo allora viene creato il piano canoni."
        action={
          <Link className="secondary-button" href="/leases">
            <ArrowLeft size={16} aria-hidden />
            Torna ai leasing
          </Link>
        }
      />

      {params.error ? <p className="form-error" style={{ marginBottom: 18 }}>{params.error}</p> : null}

      {contracts.length === 0 ? (
        <section className="panel">
          <p>Nessun contratto leasing in attesa.</p>
          <Link className="primary-button" href="/leases/import">
            <Plus size={16} aria-hidden />
            Importa PDF
          </Link>
        </section>
      ) : (
        contracts.map((contract) => {
          const defaultVehicle = contract.tractorId
            ? `TRACTOR:${contract.tractorId}`
            : contract.trailerId
              ? `TRAILER:${contract.trailerId}`
              : '';
          return (
            <section className="panel" key={contract.id} style={{ marginBottom: 18 }}>
              <div className="actions-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0 }}>{contract.lessor?.name || contract.lessorName || 'Locatore da verificare'}</h2>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    {contract.contractNumber ? `Contratto ${contract.contractNumber}` : 'Numero da verificare'}
                    {contract.originalFileName ? ` · ${contract.originalFileName}` : ''}
                    {contract.tractor || contract.trailer ? ` · ${getLeaseVehicleLabel(contract)}` : ''}
                  </p>
                </div>
                <div className="actions-row">
                  {contract.filePath ? (
                    <Link className="secondary-button compact-button" href={`/api/leases/${contract.id}/file`} target="_blank">
                      <Download size={15} aria-hidden />
                      Apri PDF
                    </Link>
                  ) : null}
                  <form action={deletePendingLeaseContractAction.bind(null, contract.id)}>
                    <ConfirmSubmitButton className="danger-button compact-button" message="Eliminare questa bozza leasing e il PDF?">
                      <Trash2 size={15} aria-hidden />
                      Elimina
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>

              {contract.reviewReasons ? (
                <p className="review-banner" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12 }}>
                  <AlertTriangle size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{contract.reviewReasons}</span>
                </p>
              ) : null}

              <form action={activateLeaseContractAction.bind(null, contract.id)} className="form-stack" style={{ marginTop: 16 }}>
                <div className="form-grid three">
                  <label>
                    Società di leasing / locatore
                    <input name="lessorName" required defaultValue={contract.lessor?.name || contract.lessorName || ''} />
                  </label>
                  <label>
                    Numero contratto
                    <input name="contractNumber" required defaultValue={contract.contractNumber || ''} />
                  </label>
                  <label>
                    Fornitore del veicolo
                    <input name="vehicleSupplierName" defaultValue={contract.vehicleSupplierName || ''} />
                  </label>
                  <DatePartsInput
                    label="Data contratto"
                    name="contractDate"
                    defaultValue={toDateInputValue(contract.contractDate)}
                  />
                  <DatePartsInput
                    label="Decorrenza effettiva canoni"
                    name="startDate"
                    defaultValue={toDateInputValue(contract.startDate)}
                    required
                  />
                  <label>
                    Targa finanziata
                    <select name="vehicleKey" required defaultValue={defaultVehicle}>
                      <option value="">Seleziona targa</option>
                      <optgroup label="Trattori">
                        {tractors.map((tractor) => (
                          <option value={`TRACTOR:${tractor.id}`} key={tractor.id}>{getVehicleLabel(tractor)}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Semirimorchi">
                        {trailers.map((trailer) => (
                          <option value={`TRAILER:${trailer.id}`} key={trailer.id}>{getVehicleLabel(trailer)}</option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                </div>

                <div className="form-grid four">
                  <label>
                    Durata mesi
                    <input name="durationMonths" type="number" min="1" defaultValue={contract.durationMonths ?? ''} />
                  </label>
                  <label>
                    Primo canone netto €
                    <input name="advancePaymentNet" inputMode="decimal" defaultValue={moneyInput(contract.advancePaymentNetCents)} />
                  </label>
                  <label>
                    Canoni periodici
                    <input name="recurringInstallmentCount" type="number" min="1" required defaultValue={contract.recurringInstallmentCount ?? ''} />
                  </label>
                  <label>
                    Canone periodico netto €
                    <input name="recurringPaymentNet" inputMode="decimal" required defaultValue={moneyInput(contract.recurringPaymentNetCents)} />
                  </label>
                  <label>
                    Periodicità in mesi
                    <input name="frequencyMonths" type="number" min="1" max="12" required defaultValue={contract.frequencyMonths} />
                  </label>
                  <label>
                    IVA %
                    <input name="vatRatePercent" type="number" min="0" max="100" required defaultValue={contract.vatRatePercent} />
                  </label>
                  <label>
                    Totale canoni netto €
                    <input name="totalInstallmentsNet" inputMode="decimal" defaultValue={moneyInput(contract.totalInstallmentsNetCents)} />
                  </label>
                  <label>
                    Riscatto netto €
                    <input name="buyoutNet" inputMode="decimal" defaultValue={moneyInput(contract.buyoutNetCents)} />
                  </label>
                  <label>
                    Prezzo bene netto €
                    <input name="purchasePriceNet" inputMode="decimal" defaultValue={moneyInput(contract.purchasePriceNetCents)} />
                  </label>
                  <label>
                    TAN %
                    <input name="tanPercent" inputMode="decimal" defaultValue={percentInput(contract.tanBasisPoints)} placeholder={formatBasisPoints(contract.tanBasisPoints)} />
                  </label>
                  <label>
                    Tasso leasing %
                    <input name="leaseRatePercent" inputMode="decimal" defaultValue={percentInput(contract.leaseRateBasisPoints)} placeholder={formatBasisPoints(contract.leaseRateBasisPoints)} />
                  </label>
                </div>

                <div className="lease-notes-row">
                  <label>
                    Note operative
                    <textarea
                      name="notes"
                      rows={5}
                      defaultValue={contract.notes || ''}
                      placeholder="Annotazioni sul contratto, condizioni particolari o dati da verificare"
                    />
                  </label>
                </div>

                <div className="actions-row">
                  <button className="primary-button" type="submit">
                    <CheckCircle2 size={16} aria-hidden />
                    Verifica e attiva piano canoni
                  </button>
                  <Link className="secondary-button" href="/vehicles/tractors">
                    Targa non presente? Apri anagrafiche
                  </Link>
                </div>
              </form>
            </section>
          );
        })
      )}
    </>
  );
}
