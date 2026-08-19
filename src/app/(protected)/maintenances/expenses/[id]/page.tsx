import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Download, PencilLine, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { PageHeader } from '@/components/PageHeader';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  expenseDocumentInclude,
  formatEuroCents,
  formatUnitPrice,
  formatQuantityMilli,
  getExpenseAllocationLabel,
  getExpenseLineAllocations
} from '@/lib/expense';
import { deleteExpenseFromDetailAction } from '../actions';

type ExpenseDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function ExpenseDocumentDetailPage({ params, searchParams }: ExpenseDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const doc = await prisma.expenseDocument.findUnique({ where: { id }, include: expenseDocumentInclude });
  if (!doc) notFound();

  const isPending = doc.status === 'PENDING';

  return (
    <>
      <PageHeader
        title={doc.supplier?.name || doc.supplierName || 'Fattura / DDT'}
        description={`${doc.documentNumber ? `${doc.documentNumber} · ` : ''}${formatDate(doc.registeredAt)}`}
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/maintenances">
              <ArrowLeft size={16} aria-hidden />
              Torna alle manutenzioni
            </Link>
            {doc.filePath ? (
              <Link className="secondary-button" href={`/api/maintenances/expenses/${doc.id}/file`} target="_blank">
                <Download size={16} aria-hidden />
                Apri PDF
              </Link>
            ) : null}
            {isPending ? (
              <Link className="primary-button" href="/maintenances/expenses/review">
                <PencilLine size={16} aria-hidden />
                Valida documento
              </Link>
            ) : (
              <Link className="primary-button" href={`/maintenances/expenses/${doc.id}/edit`}>
                <PencilLine size={16} aria-hidden />
                {doc.filePath ? 'Modifica dettagli' : 'Modifica / aggiungi PDF'}
              </Link>
            )}
          </div>
        }
      />

      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="metrics" aria-label="Totali documento">
        <div className="metric">
          <span>Stato</span>
          <strong>{isPending ? 'Da validare' : 'Confermato'}</strong>
        </div>
        <div className="metric">
          <span>Imponibile (netto)</span>
          <strong>{formatEuroCents(doc.totalImponibileCents)}</strong>
        </div>
        <div className="metric">
          <span>IVA</span>
          <strong>{formatEuroCents(doc.totalVatCents)}</strong>
        </div>
        <div className="metric">
          <span>Totale (ivato)</span>
          <strong>{formatEuroCents(doc.totalAmountCents)}</strong>
        </div>
      </section>

      {isPending && doc.reviewReasons ? (
        <p className="review-banner" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 18 }}>
          <AlertTriangle size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{doc.reviewReasons}</span>
        </p>
      ) : null}

      <section className="table-wrap expense-detail-lines">
        <table>
          <thead>
            <tr>
              <th>Descrizione</th>
              <th>Codice</th>
              <th>Q.tà</th>
              <th>Prezzo unit. netto</th>
              <th>IVA</th>
              <th>Prezzo unit. ivato</th>
              <th>Imponibile</th>
              <th>Ivato</th>
              <th>Allocazione</th>
              <th>Km mezzo</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line) => {
              const allocations = getExpenseLineAllocations(line);
              return (
              <tr key={line.id}>
                <td>
                  {line.description}
                  {line.notes ? <small className="muted" style={{ display: 'block', marginTop: 4 }}>{line.notes}</small> : null}
                </td>
                <td>{line.code || '-'}</td>
                <td>
                  {formatQuantityMilli(line.quantityMilli)} {line.unit}
                </td>
                <td>{formatUnitPrice(line.unitPriceMilliEuro)}</td>
                <td>{line.vatRatePercent}%</td>
                <td>{formatUnitPrice(Math.round(line.unitPriceMilliEuro * (100 + line.vatRatePercent) / 100))}</td>
                <td>{formatEuroCents(line.imponibileCents)}</td>
                <td>{formatEuroCents(line.totalCents)}</td>
                <td>
                  <div className="expense-allocation-detail">
                    {allocations.map((allocation) => (
                      <span key={allocation.id}>
                        {formatQuantityMilli(allocation.quantityMilli)} {line.unit} → {getExpenseAllocationLabel(allocation)}
                        {allocation.driver ? ` · Autista ${allocation.driver.lastName} ${allocation.driver.firstName}` : ''}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <div className="expense-allocation-detail">
                    {allocations.some((allocation) => allocation.odometerKm !== null)
                      ? allocations.flatMap((allocation) => allocation.odometerKm === null ? [] : [
                          <span key={allocation.id}>{getExpenseAllocationLabel(allocation)}: {allocation.odometerKm.toLocaleString('it-IT')} km</span>
                        ])
                      : '-'}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {doc.notes ? (
        <section className="panel" style={{ marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Note e dettagli</h2>
          <p style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{doc.notes}</p>
        </section>
      ) : null}

      <div className="record-actions" style={{ marginTop: 18 }}>
        <form action={deleteExpenseFromDetailAction.bind(null, doc.id)}>
          <ConfirmSubmitButton
            className="danger-button"
            message="Eliminare definitivamente questa manutenzione e il PDF collegato? Le giacenze di magazzino già caricate non vengono ripristinate."
          >
            <Trash2 size={16} aria-hidden />
            Elimina documento
          </ConfirmSubmitButton>
        </form>
      </div>
    </>
  );
}
