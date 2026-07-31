import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { FuelEntryStatus } from '@prisma/client';
import { ArrowRight, Check, CreditCard, Download, Save, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { PageHeader } from '@/components/PageHeader';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  formatFuelLiters,
  formatFuelMoney,
  fuelEntryInclude,
  type FuelEntryWithRelations
} from '@/lib/fuel';
import {
  assignBatchFuelCardReviewAction,
  confirmAllPendingReviewAction,
  confirmBatchReviewAction,
  deleteAllPendingReviewAction,
  deleteBatchReviewAction
} from '../actions';

type BatchGroup = {
  batchId: string | null;
  fileName: string;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  supplierName: string | null;
  entries: FuelEntryWithRelations[];
};

function groupByBatch(entries: FuelEntryWithRelations[]): BatchGroup[] {
  const groups = new Map<string, BatchGroup>();
  for (const entry of entries) {
    const key = entry.importBatchId ?? 'manuale';
    const group =
      groups.get(key) ||
      ({
        batchId: entry.importBatchId,
        fileName: entry.importBatch?.originalFileName || 'Inserimento manuale',
        invoiceNumber: entry.importBatch?.invoiceNumber ?? null,
        invoiceDate: entry.importBatch?.invoiceDate ?? null,
        supplierName: entry.fuelSupplier?.name || entry.importBatch?.supplierName || null,
        entries: []
      } satisfies BatchGroup);
    group.entries.push(entry);
    groups.set(key, group);
  }
  // Ordine: per data della prima riga della fattura (cronologico).
  return Array.from(groups.values()).sort(
    (a, b) => (a.entries[0]?.fuelDate.getTime() ?? 0) - (b.entries[0]?.fuelDate.getTime() ?? 0)
  );
}

function requiresSourceAssignment(entry: FuelEntryWithRelations): boolean {
  return entry.serviceType === 'WINSOFTWARE' && !entry.fuelCardId && !entry.cardNumber.trim();
}

function cardOptionLabel(card: { cardNumber: string; label: string | null; fuelSupplier: { name: string } | null }): string {
  const identity = card.label && card.label !== card.cardNumber ? `${card.label} · ${card.cardNumber}` : card.cardNumber;
  return card.fuelSupplier ? `${identity} · ${card.fuelSupplier.name}` : identity;
}

export default async function FuelImportReviewAllPage() {
  await requireUser();
  const [pendingEntries, fuelCards] = await Promise.all([
    prisma.fuelEntry.findMany({
      where: { status: FuelEntryStatus.PENDING },
      include: fuelEntryInclude,
      orderBy: [{ fuelDate: 'asc' }, { fuelTime: 'asc' }, { plate: 'asc' }]
    }),
    prisma.fuelCard.findMany({
      where: { active: true },
      include: { fuelSupplier: true },
      orderBy: [{ fuelSupplier: { name: 'asc' } }, { cardNumber: 'asc' }]
    })
  ]);

  const groups = groupByBatch(pendingEntries);
  const missingSourceCount = pendingEntries.filter(requiresSourceAssignment).length;
  const totalAmountCents = pendingEntries.reduce((sum, entry) => sum + entry.totalAmountCents, 0);
  const totalVolumeLitersMilli = pendingEntries.reduce((sum, entry) => sum + entry.volumeLitersMilli, 0);

  return (
    <>
      <PageHeader
        title="Conferma rifornimenti importati"
        description="Tutte le fatture in attesa di conferma, raggruppate per documento."
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/fuel/import">
              Import PDF
            </Link>
            <Link className="secondary-button" href="/fuel">
              Rifornimenti
            </Link>
          </div>
        }
      />

      <section className="panel" style={{ marginBottom: 18 }}>
        <p>
          Controlla le righe lette dai PDF. Quando confermi, entrano nel centro costi e nei calcoli km/euro; finche&apos;
          restano in attesa non incidono sui totali. I km sono digitati dagli autisti alla pompa: se vedi un valore
          improbabile correggilo dal dettaglio del rifornimento dopo la conferma, oppure elimina la riga.
        </p>
        {pendingEntries.length > 0 ? (
          <div className="actions-row" style={{ marginTop: 12 }}>
            <form action={confirmAllPendingReviewAction}>
              <ConfirmSubmitButton
                className="primary-button"
                disabled={missingSourceCount > 0}
                message={`Confermare TUTTE le ${pendingEntries.length} righe in attesa (tutte le fatture)?`}
                title={missingSourceCount > 0 ? 'Associa prima la tessera/provenienza alle fatture WinSoftware.' : undefined}
              >
                <Check size={16} aria-hidden />
                Conferma tutti ({pendingEntries.length})
              </ConfirmSubmitButton>
            </form>
            <form action={deleteAllPendingReviewAction}>
              <ConfirmSubmitButton
                className="danger-button"
                message={`Eliminare TUTTE le ${pendingEntries.length} righe in attesa (tutte le fatture)?`}
              >
                <Trash2 size={16} aria-hidden />
                Elimina tutti
              </ConfirmSubmitButton>
            </form>
          </div>
        ) : null}
        {missingSourceCount > 0 ? (
          <div className="fuel-review-box" style={{ marginTop: 14, marginBottom: 0 }}>
            <p className="fuel-review-box-title">
              <CreditCard size={16} aria-hidden /> Tessera o provenienza da associare
            </p>
            <p className="fuel-review-box-text">
              {missingSourceCount} righe WinSoftware non possono essere confermate finché non scegli da chi è stato fatto il rifornimento.
            </p>
          </div>
        ) : null}
      </section>

      {pendingEntries.length > 0 ? (
        <section className="metrics" aria-label="Riepilogo righe in attesa">
          <div className="metric">
            <span>Righe in attesa</span>
            <strong>{pendingEntries.length}</strong>
          </div>
          <div className="metric">
            <span>Fatture</span>
            <strong>{groups.length}</strong>
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

      {pendingEntries.length === 0 ? (
        <section className="panel">
          <p className="empty-state" style={{ margin: 0 }}>
            Nessuna riga in attesa: tutte le righe importate sono gia state validate.{' '}
            <Link className="table-cell-link" href="/fuel">
              Vai al centro costi
              <ArrowRight size={14} aria-hidden />
            </Link>
          </p>
        </section>
      ) : (
        groups.map((group) => {
          const groupNeedsSource = group.entries.some(requiresSourceAssignment);
          const isWinSoftware = group.entries.some((entry) => entry.serviceType === 'WINSOFTWARE');
          const assignedCardIds = Array.from(new Set(group.entries.map((entry) => entry.fuelCardId).filter(Boolean)));
          const currentCardId = assignedCardIds.length === 1 ? assignedCardIds[0]! : '';
          const groupVolume = group.entries.reduce((sum, entry) => sum + entry.volumeLitersMilli, 0);
          const groupAmount = group.entries.reduce((sum, entry) => sum + entry.totalAmountCents, 0);
          const groupWarnings = group.entries.filter((entry) => Boolean(entry.reviewReasons)).length;

          return (
          <section key={group.batchId ?? 'manuale'} className="panel fuel-review-group" style={{ marginBottom: 16 }}>
            <div
              className="actions-row"
              style={{ alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}
            >
              <strong>
                {group.fileName}
                {group.invoiceNumber ? ` · Fattura ${group.invoiceNumber}` : ''}
                {group.invoiceDate ? ` del ${formatDate(group.invoiceDate)}` : ''}
              </strong>
              <span className="muted">{group.entries.length} righe</span>
              <div className="actions-row" style={{ marginLeft: 'auto', gap: 8 }}>
                {group.batchId ? (
                  <Link className="secondary-button compact-button" href={`/fuel/import/${group.batchId}`}>
                    Apri righe
                    <ArrowRight size={14} aria-hidden />
                  </Link>
                ) : null}
                {group.batchId ? (
                  <Link
                    className="secondary-button compact-button"
                    href={`/api/fuel/imports/${group.batchId}/file`}
                    target="_blank"
                  >
                    <Download size={14} aria-hidden />
                    Apri PDF
                  </Link>
                ) : null}
                {group.batchId ? (
                  <>
                    <form action={confirmBatchReviewAction.bind(null, group.batchId)}>
                      <ConfirmSubmitButton
                        className="primary-button compact-button"
                        disabled={groupNeedsSource}
                        message={`Confermare le ${group.entries.length} righe di questa fattura?`}
                        title={groupNeedsSource ? 'Associa prima la tessera/provenienza.' : undefined}
                      >
                        <Check size={14} aria-hidden />
                        Conferma fattura
                      </ConfirmSubmitButton>
                    </form>
                    <form action={deleteBatchReviewAction.bind(null, group.batchId)}>
                      <ConfirmSubmitButton
                        className="danger-button compact-button"
                        message={`Eliminare le ${group.entries.length} righe di questa fattura?`}
                      >
                        <Trash2 size={14} aria-hidden />
                      </ConfirmSubmitButton>
                    </form>
                  </>
                ) : null}
              </div>
            </div>
            {group.batchId && isWinSoftware ? (
              <form
                action={assignBatchFuelCardReviewAction.bind(null, group.batchId)}
                className={`fuel-source-assignment${groupNeedsSource ? ' is-required' : ''}`}
              >
                <div className="fuel-source-copy">
                  <span><CreditCard size={17} aria-hidden /></span>
                  <div>
                    <strong>Tessera / provenienza</strong>
                    <small>Vale per tutte le {group.entries.length} righe della fattura.</small>
                  </div>
                </div>
                <label>
                  Tessera registrata
                  <select name="fuelCardId" defaultValue={currentCardId}>
                    <option value="">Usa il nome indicato</option>
                    {fuelCards.map((card) => (
                      <option key={card.id} value={card.id}>{cardOptionLabel(card)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Nome tessera o provenienza
                  <input
                    name="fuelCardLabel"
                    defaultValue={currentCardId ? '' : group.supplierName || ''}
                    placeholder="Es. Energia Demo S.R.L."
                  />
                </label>
                <button className="secondary-button" type="submit">
                  <Save size={15} aria-hidden />
                  Applica alla fattura
                </button>
              </form>
            ) : null}
            <div className="import-batch-summary" aria-label={`Riepilogo ${group.fileName}`}>
              <span><small>Righe</small><strong>{group.entries.length}</strong></span>
              <span><small>Litri</small><strong>{formatFuelLiters(groupVolume)}</strong></span>
              <span><small>Costo</small><strong>{formatFuelMoney(groupAmount)}</strong></span>
              <span><small>Avvisi</small><strong>{groupWarnings}</strong></span>
            </div>
          </section>
          );
        })
      )}
    </>
  );
}
