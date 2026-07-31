import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Download, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { PageHeader } from '@/components/PageHeader';
import { formatDate } from '@/lib/dates';
import { getTollBatchSummaries } from '@/lib/toll-batches';
import { formatTollMoney } from '@/lib/tolls';
import {
  confirmAllPendingTollsReviewAction,
  confirmTollBatchReviewAction,
  deleteAllPendingTollsReviewAction,
  deleteTollBatchReviewAction
} from '../actions';

function formatPeriod(from: Date | null, to: Date | null): string {
  if (!from && !to) return '-';
  if (!from || !to || from.getTime() === to.getTime()) return formatDate(from || to);
  return `${formatDate(from)} - ${formatDate(to)}`;
}

export default async function TollImportReviewPage() {
  await requireUser();
  const batches = await getTollBatchSummaries({ pendingOnly: true });
  const pendingRows = batches.reduce((sum, batch) => sum + batch.pendingCount, 0);
  const totalNetCents = batches.reduce((sum, batch) => sum + batch.storedNetCents, 0);
  const totalVatCents = batches.reduce((sum, batch) => sum + batch.storedVatCents, 0);
  const totalGrossCents = batches.reduce((sum, batch) => sum + batch.storedGrossCents, 0);
  const reviewRows = batches.reduce((sum, batch) => sum + batch.reviewCount, 0);

  return (
    <>
      <PageHeader
        title="Controllo file autostrade"
        description="CSV e fatture pedaggi in attesa di conferma."
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/tolls">
              <ArrowLeft size={16} aria-hidden />
              Fatture autostrade
            </Link>
            <Link className="secondary-button" href="/tolls/import">Import CSV</Link>
          </div>
        }
      />

      {pendingRows > 0 ? (
        <section className="workflow-status needs-action toll-review-summary">
          <span className="workflow-status-icon"><AlertTriangle size={20} aria-hidden /></span>
          <span className="workflow-status-copy">
            <strong>{batches.length} file · {pendingRows.toLocaleString('it-IT')} pedaggi in attesa</strong>
            <small>{reviewRows > 0 ? `${reviewRows} righe richiedono attenzione` : 'Nessun avviso rilevato'}</small>
          </span>
          <div className="actions-row">
            <form action={confirmAllPendingTollsReviewAction}>
              <ConfirmSubmitButton className="primary-button" message={`Confermare tutti i ${pendingRows} pedaggi di ${batches.length} file?`}>
                <Check size={16} aria-hidden />
                Conferma tutti
              </ConfirmSubmitButton>
            </form>
            <form action={deleteAllPendingTollsReviewAction}>
              <ConfirmSubmitButton className="danger-button" message={`Scartare tutti i ${pendingRows} pedaggi in attesa?`}>
                <Trash2 size={16} aria-hidden />
                Scarta tutti
              </ConfirmSubmitButton>
            </form>
          </div>
        </section>
      ) : null}

      {pendingRows > 0 ? (
        <section className="metrics" aria-label="Riepilogo file autostrade in attesa">
          <div className="metric"><span>File</span><strong>{batches.length}</strong></div>
          <div className="metric"><span>Pedaggi</span><strong>{pendingRows.toLocaleString('it-IT')}</strong></div>
          <div className="metric"><span>Netto</span><strong>{formatTollMoney(totalNetCents)}</strong></div>
          <div className="metric"><span>IVA</span><strong>{formatTollMoney(totalVatCents)}</strong></div>
          <div className="metric"><span>Ivato</span><strong>{formatTollMoney(totalGrossCents)}</strong></div>
          <div className="metric"><span>Avvisi</span><strong>{reviewRows}</strong></div>
        </section>
      ) : null}

      {pendingRows === 0 ? (
        <section className="panel">
          <div className="priority-clear">
            <Check size={20} aria-hidden />
            <span><strong>Nessun file da controllare</strong><small>Tutti i pedaggi importati sono stati gestiti.</small></span>
            <Link className="secondary-button" href="/tolls">Apri fatture autostrade <ArrowRight size={14} aria-hidden /></Link>
          </div>
        </section>
      ) : (
        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fattura / file</th>
                <th>Data fattura</th>
                <th>Periodo pedaggi</th>
                <th>Pedaggi</th>
                <th>Netto</th>
                <th>IVA</th>
                <th>Ivato</th>
                <th>Avvisi</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td>
                    <strong>{batch.invoiceNumber ? `Fattura ${batch.invoiceNumber}` : 'File senza numero fattura'}</strong>
                    <span className="muted">{batch.originalFileName}</span>
                  </td>
                  <td>{formatDate(batch.invoiceDate)}</td>
                  <td>{formatPeriod(batch.firstTollDate, batch.lastTollDate)}</td>
                  <td>{batch.pendingCount.toLocaleString('it-IT')}</td>
                  <td>{formatTollMoney(batch.storedNetCents)}</td>
                  <td>{formatTollMoney(batch.storedVatCents)}</td>
                  <td><strong>{formatTollMoney(batch.storedGrossCents)}</strong></td>
                  <td>{batch.reviewCount || '-'}</td>
                  <td>
                    <div className="actions-row toll-batch-actions">
                      <Link className="secondary-button compact-button" href={`/tolls/imports/${batch.id}?status=pending`}>
                        Apri righe
                        <ArrowRight size={14} aria-hidden />
                      </Link>
                      <Link className="icon-button" href={`/api/tolls/imports/${batch.id}/file`} target="_blank" prefetch={false} title="Scarica CSV" aria-label="Scarica CSV">
                        <Download size={15} aria-hidden />
                      </Link>
                      <form action={confirmTollBatchReviewAction.bind(null, batch.id)}>
                        <ConfirmSubmitButton className="primary-button compact-button" message={`Confermare i ${batch.pendingCount} pedaggi di questo file?`}>
                          <Check size={14} aria-hidden />
                          Conferma
                        </ConfirmSubmitButton>
                      </form>
                      <form action={deleteTollBatchReviewAction.bind(null, batch.id)}>
                        <ConfirmSubmitButton className="danger-button compact-button" message={`Scartare i ${batch.pendingCount} pedaggi di questo file?`}>
                          <Trash2 size={14} aria-hidden />
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
