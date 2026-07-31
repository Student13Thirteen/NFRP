import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { DatePartsInput } from '@/components/DatePartsInput';
import { ExpenseLinesEditor, type ExpenseLineDefault } from '@/components/ExpenseLinesEditor';
import { PageHeader } from '@/components/PageHeader';
import { formatDate, toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  allocationKeyFor,
  buildAllocationOptions,
  expenseDocumentInclude,
  formatQuantityMilli,
  type ExpenseLineWithRelations
} from '@/lib/expense';
import { buildMaintenanceCategoryOptions } from '@/lib/maintenance';
import {
  confirmAllPendingExpensesAction,
  confirmExpenseWithEditsAction,
  deleteAllPendingExpensesAction,
  deleteExpenseDocumentAction
} from '../actions';

type ReviewPageProps = {
  searchParams: Promise<{ error?: string }>;
};

function amountInput(cents: number): string {
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function lineToDefault(line: ExpenseLineWithRelations): ExpenseLineDefault {
  return {
    description: line.description,
    code: line.code || '',
    quantity: formatQuantityMilli(line.quantityMilli),
    unit: line.unit,
    unitPrice: amountInput(line.unitPriceCents),
    vatRate: String(line.vatRatePercent),
    allocationKey: allocationKeyFor(line),
    categoryId: line.categoryId || '',
    odometerKm: line.odometerKm === null ? '' : String(line.odometerKm)
  };
}

export default async function ExpensesReviewPage({ searchParams }: ReviewPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [documents, categories, tractors, trailers] = await Promise.all([
    prisma.expenseDocument.findMany({
      where: { status: 'PENDING' },
      include: expenseDocumentInclude,
      orderBy: [{ createdAt: 'asc' }]
    }),
    prisma.category.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.tractor.findMany({
      where: { active: true },
      include: {
        assignedDriver: {
          select: { firstName: true, lastName: true }
        }
      },
      orderBy: { plate: 'asc' }
    }),
    prisma.trailer.findMany({ where: { active: true }, orderBy: { plate: 'asc' } })
  ]);

  const allocations = buildAllocationOptions(tractors, trailers);
  const categoryChoices = buildMaintenanceCategoryOptions(categories);

  const totalLines = documents.reduce((sum, doc) => sum + doc.lines.length, 0);
  const hasVehicleRequiredImports = documents.some(
    (doc) => doc.source === 'MAINTENANCE_IMPORT' || doc.source === 'LEASE_INVOICE_IMPORT'
  );

  return (
    <>
      <PageHeader
        title="Fatture e DDT da validare"
        description="Controlla i dati letti dal PDF e assegna ogni riga al Magazzino oppure alla targa corretta."
        action={
          <Link className="secondary-button" href="/maintenances/expenses">
            <ArrowLeft size={16} aria-hidden />
            Torna a fatture e DDT
          </Link>
        }
      />

      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      {documents.length === 0 ? (
        <section className="panel">
          <p>Nessun documento in attesa di validazione.</p>
          <Link className="primary-button" href="/maintenances/expenses/import">
            Importa PDF
          </Link>
        </section>
      ) : (
        <>
          <section className="panel" style={{ marginBottom: 18 }}>
            <div className="actions-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <strong>{documents.length} documenti</strong> da validare · {totalLines} righe totali.
              </div>
              <div className="actions-row" style={{ gap: 10 }}>
                {!hasVehicleRequiredImports ? (
                  <form action={confirmAllPendingExpensesAction}>
                    <ConfirmSubmitButton
                      className="primary-button"
                      message="Confermare tutti i documenti in attesa così come sono? Entreranno nei costi e aggiorneranno il magazzino."
                    >
                      <CheckCircle2 size={16} aria-hidden />
                      Conferma tutti ({documents.length})
                    </ConfirmSubmitButton>
                  </form>
                ) : null}
                <form action={deleteAllPendingExpensesAction}>
                  <ConfirmSubmitButton
                    className="danger-button"
                    message="Eliminare tutti i documenti in attesa? Operazione non annullabile."
                  >
                    <Trash2 size={16} aria-hidden />
                    Elimina tutti
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          </section>

          {documents.map((doc) => (
            <section className="panel" key={doc.id} style={{ marginBottom: 18 }}>
              <div className="actions-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0 }}>{doc.supplier?.name || doc.supplierName || 'Fornitore non indicato'}</h2>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    {doc.documentNumber ? `${doc.documentNumber} · ` : ''}
                    {formatDate(doc.registeredAt)}
                    {doc.originalFileName ? ` · ${doc.originalFileName}` : ''}
                    {doc.sourcePageCount && doc.sourcePageCount > 1 ? ` · pagina ${doc.sourcePage}/${doc.sourcePageCount}` : ''}
                  </p>
                </div>
                <div className="actions-row" style={{ gap: 10 }}>
                  {doc.filePath ? (
                    <Link className="secondary-button compact-button" href={`/api/maintenances/expenses/${doc.id}/file`} target="_blank">
                      <Download size={15} aria-hidden />
                      Apri PDF
                    </Link>
                  ) : null}
                  <form action={deleteExpenseDocumentAction.bind(null, doc.id)}>
                    <ConfirmSubmitButton
                      className="danger-button compact-button"
                      message="Eliminare questo documento in attesa?"
                    >
                      <Trash2 size={15} aria-hidden />
                      Elimina
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>

              {doc.reviewReasons ? (
                <p className="review-banner" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12 }}>
                  <AlertTriangle size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{doc.reviewReasons}</span>
                </p>
              ) : null}

              <form action={confirmExpenseWithEditsAction.bind(null, doc.id)} className="form-stack" style={{ marginTop: 12 }}>
                <div className="expense-review-metadata">
                  <label>
                    Fornitore
                    <input name="reviewSupplierName" defaultValue={doc.supplier?.name || doc.supplierName || ''} />
                  </label>
                  <label>
                    Numero documento
                    <input name="reviewDocumentNumber" defaultValue={doc.documentNumber || ''} />
                  </label>
                  <DatePartsInput
                    label="Data documento"
                    name="reviewDocumentDate"
                    defaultValue={toDateInputValue(doc.documentDate)}
                  />
                </div>
                <ExpenseLinesEditor
                  allocations={allocations}
                  categories={categoryChoices}
                  defaultRows={doc.lines.map(lineToDefault)}
                  warehouseOrVehicleRequired={doc.source === 'MAINTENANCE_IMPORT'}
                  vehicleAllocationRequired={doc.source === 'LEASE_INVOICE_IMPORT'}
                />
                <button className="primary-button" type="submit">
                  <CheckCircle2 size={16} aria-hidden />
                  {doc.source === 'MAINTENANCE_IMPORT'
                    ? 'Valida e registra manutenzione'
                    : doc.source === 'LEASE_INVOICE_IMPORT'
                      ? 'Valida e registra fattura leasing'
                      : 'Conferma documento'}
                </button>
              </form>
            </section>
          ))}
        </>
      )}
    </>
  );
}
