import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Download, LockKeyhole, Save } from 'lucide-react';
import { FileUpload } from '@/components/FileUpload';
import { PageHeader } from '@/components/PageHeader';
import { RecoverableForm } from '@/components/RecoverableForm';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  allocationKeyFor,
  expenseDocumentInclude,
  formatEuroCents,
  getExpenseLineAllocationDetails
} from '@/lib/expense';
import {
  EXPENSE_DRIVER_AUTO,
  EXPENSE_DRIVER_NONE,
  expenseDriverName,
  findAutomaticExpenseDriver
} from '@/lib/expense-driver';
import { updateConfirmedExpenseDetailsAction } from '../../actions';

type EditExpenseDocumentPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function EditExpenseDocumentPage({ params, searchParams }: EditExpenseDocumentPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const [doc, drivers, driverAssignments] = await Promise.all([
    prisma.expenseDocument.findUnique({ where: { id }, include: expenseDocumentInclude }),
    prisma.driver.findMany({ orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractorDriverAssignment.findMany({
      include: { driver: { select: { firstName: true, lastName: true } } },
      orderBy: { validFrom: 'desc' }
    })
  ]);
  if (!doc) notFound();
  if (doc.status === 'PENDING') redirect('/maintenances/expenses/review');
  const allocationDate = doc.documentDate ?? doc.registeredAt;
  const trailerTractorLinks = doc.lines.flatMap((line) => line.allocations.flatMap((allocation) =>
    allocation.trailer
      ? [{ trailerId: allocation.trailer.id, tractorId: allocation.trailer.assignedTractorId }]
      : []
  ));

  return (
    <>
      <PageHeader
        title="Modifica manutenzione"
        description={`${doc.supplier?.name || doc.supplierName || 'Fornitore non indicato'}${doc.documentNumber ? ` · ${doc.documentNumber}` : ''}`}
        action={
          <div className="actions-row">
            <Link className="secondary-button" href={`/maintenances/expenses/${doc.id}`}>
              <ArrowLeft size={16} aria-hidden />
              Torna alla scheda
            </Link>
            {doc.filePath ? (
              <Link className="secondary-button" href={`/api/maintenances/expenses/${doc.id}/file`} target="_blank">
                <Download size={16} aria-hidden />
                Apri PDF attuale
              </Link>
            ) : null}
          </div>
        }
      />

      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="review-banner expense-safe-edit-notice">
        <LockKeyhole size={18} aria-hidden />
        <span>
          Puoi correggere descrizioni, codici e note oppure allegare il PDF ricevuto in seguito.
          Importi, IVA, quantità e destinazioni restano bloccati perché il documento è già nei costi;
          l’autista di ogni mezzo può invece essere corretto.
        </span>
      </section>

      <section className="metrics" aria-label="Dati contabili invariati">
        <div className="metric">
          <span>Data registrazione</span>
          <strong>{formatDate(doc.registeredAt)}</strong>
        </div>
        <div className="metric">
          <span>Data documento</span>
          <strong>{formatDate(doc.documentDate)}</strong>
        </div>
        <div className="metric">
          <span>Imponibile</span>
          <strong>{formatEuroCents(doc.totalImponibileCents)}</strong>
        </div>
        <div className="metric">
          <span>Totale ivato</span>
          <strong>{formatEuroCents(doc.totalAmountCents)}</strong>
        </div>
      </section>

      <RecoverableForm
        action={updateConfirmedExpenseDetailsAction.bind(null, doc.id)}
        className="form-stack"
        recoveryKey={`expense:details:${doc.id}`}
        recoverOnError={Boolean(resolvedSearchParams.error)}
      >
        <input name="expectedUpdatedAt" type="hidden" value={doc.updatedAt.toISOString()} />

        <section className="panel form-stack">
          <div className="form-section-title">Dettagli delle operazioni</div>
          <div className="expense-text-edit-list">
            {doc.lines.map((line, index) => (
              <section className="expense-text-edit-row" key={line.id}>
                <input name="lineId" type="hidden" value={line.id} />
                <div className="expense-text-edit-heading">
                  <strong>Operazione {index + 1}</strong>
                  <span>{formatEuroCents(line.imponibileCents)} netto · {line.vatRatePercent}% IVA</span>
                </div>
                <div className="form-grid">
                  <label>
                    Descrizione
                    <textarea name="lineDescription" rows={3} defaultValue={line.description} required maxLength={400} />
                  </label>
                  <label>
                    Codice
                    <input name="lineCode" defaultValue={line.code || ''} maxLength={120} />
                  </label>
                </div>
                <label>
                  Note operative della riga
                  <textarea
                    name="lineNotes"
                    rows={3}
                    defaultValue={line.notes || ''}
                    maxLength={2000}
                    placeholder="Dettagli aggiuntivi, lavorazioni svolte, riferimenti interni…"
                  />
                </label>
                <div className="expense-locked-allocation">
                  <LockKeyhole size={14} aria-hidden />
                  <span>{getExpenseLineAllocationDetails(line).join(' · ')}</span>
                </div>
                <div className="expense-edit-driver-list">
                  {line.allocations.map((allocation) => {
                    const isVehicle = allocation.allocationType === 'TRACTOR' || allocation.allocationType === 'TRAILER';
                    const automaticAssignment = findAutomaticExpenseDriver(
                      driverAssignments,
                      trailerTractorLinks,
                      allocationKeyFor(allocation),
                      allocationDate
                    );
                    return (
                      <div key={allocation.id}>
                        <input name="allocationId" type="hidden" value={allocation.id} />
                        {isVehicle ? (
                          <label>
                            Autista · {allocation.tractor?.plate || allocation.trailer?.plate || 'mezzo'}
                            <select name="allocationDriverSelection" defaultValue={allocation.driverId || EXPENSE_DRIVER_AUTO}>
                              <option value={EXPENSE_DRIVER_AUTO}>
                                Automatico: {automaticAssignment?.driver
                                  ? expenseDriverName(automaticAssignment.driver)
                                  : 'nessun autista associato alla data'}
                              </option>
                              <option value={EXPENSE_DRIVER_NONE}>Nessun autista</option>
                              {drivers.map((driver) => (
                                <option key={driver.id} value={driver.id}>
                                  {expenseDriverName(driver)}{driver.active ? '' : ' (non attivo)'}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <input name="allocationDriverSelection" type="hidden" value={EXPENSE_DRIVER_NONE} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <label>
            Note e dettagli generali della manutenzione
            <textarea
              name="notes"
              rows={5}
              defaultValue={doc.notes || ''}
              maxLength={4000}
              placeholder="Annotazioni generali, riferimenti o informazioni ottenute dopo la registrazione…"
            />
          </label>
        </section>

        <section className="panel form-stack">
          <div className="form-section-title">Documento PDF</div>
          <p className="muted" style={{ margin: 0 }}>
            {doc.originalFileName
              ? `File attuale: ${doc.originalFileName}. Un nuovo PDF lo sostituirà.`
              : 'Nessun PDF allegato. Puoi aggiungerlo ora oppure salvare solo i dettagli.'}
          </p>
          <FileUpload
            label={doc.filePath ? 'Sostituisci il PDF, se necessario' : 'Aggiungi il PDF della manutenzione'}
            name="file"
          />
        </section>

        <button className="primary-button" type="submit">
          <Save size={16} aria-hidden />
          Salva modifiche
        </button>
      </RecoverableForm>
    </>
  );
}
