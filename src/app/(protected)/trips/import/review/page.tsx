import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Check, Download, Trash2, UploadCloud } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { PageHeader } from '@/components/PageHeader';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { tripImportRowInclude, type TripImportRowWithRelations } from '@/lib/trip-import';
import {
  confirmAndCompleteTripImportRowAction,
  confirmAllTripImportsAction,
  confirmTripImportBatchAction,
  discardAllTripImportsAction,
  discardTripImportBatchAction,
  discardTripImportRowAction
} from '../actions';

type BatchGroup = {
  batchId: string;
  fileName: string;
  extractionStatus: string | null;
  rows: TripImportRowWithRelations[];
};

function groupByBatch(rows: TripImportRowWithRelations[]): BatchGroup[] {
  const groups = new Map<string, BatchGroup>();
  for (const row of rows) {
    const group =
      groups.get(row.batchId) ||
      ({
        batchId: row.batchId,
        fileName: row.batch.originalFileName,
        extractionStatus: row.batch.extractionStatus,
        rows: []
      } satisfies BatchGroup);
    group.rows.push(row);
    groups.set(row.batchId, group);
  }

  return Array.from(groups.values()).sort(
    (left, right) => (left.rows[0]?.tripDate?.getTime() ?? 0) - (right.rows[0]?.tripDate?.getTime() ?? 0)
  );
}

function optionalDate(value: Date | null): string {
  return value ? formatDate(value) : '-';
}

function vehicleLabel(row: TripImportRowWithRelations): string {
  return row.tractor?.plate || row.tractorPlate || '-';
}

function trailerLabel(row: TripImportRowWithRelations): string | null {
  return row.trailer?.plate || row.trailerPlate || null;
}

function customerLabel(row: TripImportRowWithRelations): string {
  if (row.customer?.name) return row.customer.code ? `${row.customer.name} (${row.customer.code})` : row.customer.name;
  if (row.customerName) return row.customerCode ? `${row.customerName} (${row.customerCode})` : row.customerName;
  if (row.customerCode) return `Committente ${row.customerCode}`;
  return '-';
}

function loadLabel(row: TripImportRowWithRelations): string {
  return row.loadingBase?.name || row.loadingBaseName || '-';
}

function deliveryLabel(row: TripImportRowWithRelations): string {
  return row.salesPoint?.name || row.deliveryName || '-';
}

function parsedStopLabels(row: TripImportRowWithRelations): string[] {
  if (!Array.isArray(row.parsedStops)) return row.deliveryName ? [row.deliveryName] : [];
  return row.parsedStops.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const name = 'name' in item && typeof item.name === 'string' ? item.name.trim() : '';
    return name ? [name] : [];
  });
}

function containerLabel(row: TripImportRowWithRelations): string {
  const first = row.container1 || row.container1Type;
  const second = row.container2 || row.container2Type;
  return [first, second].filter(Boolean).join(' / ') || '-';
}

export default async function TripImportReviewPage() {
  await requireUser();
  const pendingRows = await prisma.tripImportRow.findMany({
    where: { status: 'PENDING' },
    include: tripImportRowInclude,
    orderBy: [{ tripDate: 'asc' }, { createdAt: 'asc' }]
  });
  const groups = groupByBatch(pendingRows);
  const rowsWithWarnings = pendingRows.filter((row) => row.reviewReasons).length;

  return (
    <>
      <PageHeader
        title="Conferma bolle container"
        description="Controlla i dati OCR e usa «Crea e completa» per aprire subito la scheda modificabile. Non viene contabilizzato nulla finche il viaggio non viene chiuso."
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/trips/import">
              <UploadCloud size={16} aria-hidden />
              Import PDF
            </Link>
            <Link className="secondary-button" href="/trips/container">
              Trasporti container
            </Link>
          </div>
        }
      />

      <section className="panel" style={{ marginBottom: 18 }}>
        <p>
          Il PDF propone i dati ma non li rende definitivi: aprilo quando compaiono avvisi. Le tappe multiple restano
          righe distinte; km, dogana, soste, importi e note si completano nella scheda del viaggio anche in un secondo momento.
        </p>
        {pendingRows.length > 0 ? (
          <div className="actions-row" style={{ marginTop: 12 }}>
            <form action={confirmAllTripImportsAction}>
              <ConfirmSubmitButton
                className="primary-button"
                message={`Confermare TUTTE le ${pendingRows.length} bolle viaggio in attesa?`}
              >
                <Check size={16} aria-hidden />
                Conferma tutte ({pendingRows.length})
              </ConfirmSubmitButton>
            </form>
            <form action={discardAllTripImportsAction}>
              <ConfirmSubmitButton className="danger-button" message={`Scartare TUTTE le ${pendingRows.length} bolle viaggio in attesa?`}>
                <Trash2 size={16} aria-hidden />
                Scarta tutte
              </ConfirmSubmitButton>
            </form>
          </div>
        ) : null}
      </section>

      {pendingRows.length > 0 ? (
        <section className="metrics" aria-label="Riepilogo bolle viaggio in attesa">
          <div className="metric">
            <span>Righe in attesa</span>
            <strong>{pendingRows.length}</strong>
          </div>
          <div className="metric">
            <span>PDF</span>
            <strong>{groups.length}</strong>
          </div>
          <div className="metric">
            <span>Con avvisi</span>
            <strong>{rowsWithWarnings}</strong>
          </div>
          <div className="metric">
            <span>Pronte</span>
            <strong>{pendingRows.length - rowsWithWarnings}</strong>
          </div>
        </section>
      ) : null}

      {pendingRows.length === 0 ? (
        <section className="panel">
          <p className="empty-state" style={{ margin: 0 }}>
            Nessuna bolla viaggio in attesa.{' '}
            <Link className="table-cell-link" href="/trips/container">
              Vai ai trasporti container
              <ArrowRight size={14} aria-hidden />
            </Link>
          </p>
        </section>
      ) : (
        groups.map((group) => (
          <section className="table-wrap" key={group.batchId} style={{ marginBottom: 22 }}>
            <div className="actions-row" style={{ alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <strong>{group.fileName}</strong>
              <span className="muted">{group.rows.length} righe</span>
              {group.extractionStatus ? <span className="muted">{group.extractionStatus}</span> : null}
              <div className="actions-row" style={{ marginLeft: 'auto', gap: 8 }}>
                <Link className="secondary-button compact-button" href={`/api/trips/imports/${group.batchId}/file`} target="_blank">
                  <Download size={14} aria-hidden />
                  Apri PDF
                </Link>
                <form action={confirmTripImportBatchAction.bind(null, group.batchId)}>
                  <ConfirmSubmitButton className="primary-button compact-button" message={`Confermare le ${group.rows.length} righe di questo PDF?`}>
                    <Check size={14} aria-hidden />
                    Conferma PDF
                  </ConfirmSubmitButton>
                </form>
                <form action={discardTripImportBatchAction.bind(null, group.batchId)}>
                  <ConfirmSubmitButton className="danger-button compact-button" message={`Scartare le ${group.rows.length} righe di questo PDF?`}>
                    <Trash2 size={14} aria-hidden />
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Data / doc.</th>
                  <th>Autista e mezzo</th>
                  <th>Committente</th>
                  <th>Tappe</th>
                  <th>Container</th>
                  <th>Riferimenti</th>
                  <th>Avvisi</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => {
                  const stopLabels = parsedStopLabels(row);
                  const canConfirm = Boolean((row.tripDate || row.documentDate) && (row.customerCode || row.customerName));

                  return (
                    <tr key={row.id}>
                      <td>
                        {optionalDate(row.tripDate || row.documentDate)}
                        <div className="muted">{row.documentNumber || '-'}</div>
                      </td>
                      <td>
                        <strong>Da inserire manualmente</strong>
                        {row.driverName ? <div className="muted">Nel PDF: {row.driverName} (non importato)</div> : null}
                        <div className="muted">
                          {vehicleLabel(row)}
                          {trailerLabel(row) ? ` / ${trailerLabel(row)}` : ''}
                        </div>
                      </td>
                      <td>{customerLabel(row)}</td>
                      <td>
                        <strong>{row.loadingTerminalName || loadLabel(row)}</strong>
                        {stopLabels.length > 0
                          ? stopLabels.map((label, index) => <div className="muted" key={`${row.id}-stop-${index}`}>{index + 1}. {label}</div>)
                          : <div className="muted">{deliveryLabel(row)}</div>}
                        {row.deliveryTerminalName ? <div className="muted">Terminal consegna: {row.deliveryTerminalName}</div> : null}
                      </td>
                      <td>{containerLabel(row)}</td>
                      <td>
                        {row.booking || '-'}
                        {row.companyReference ? <div className="muted">{row.companyReference}</div> : null}
                      </td>
                      <td>
                        {row.reviewReasons ? (
                          <span className="fuel-review-hint">
                            <AlertTriangle size={13} aria-hidden /> {row.reviewReasons}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <div className="actions-row">
                          <form action={confirmAndCompleteTripImportRowAction.bind(null, row.id)}>
                            <button className="primary-button compact-button" type="submit" disabled={!canConfirm}>
                              <ArrowRight size={15} aria-hidden />
                              Crea e completa
                            </button>
                          </form>
                          <form action={discardTripImportRowAction.bind(null, row.id)}>
                            <ConfirmSubmitButton className="danger-button compact-button" message="Scartare questa bolla viaggio?">
                              <Trash2 size={15} aria-hidden />
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                        {!canConfirm ? <div className="muted">Manca data o committente</div> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))
      )}
    </>
  );
}
