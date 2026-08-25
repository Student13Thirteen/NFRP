import { requireUser } from '@/lib/auth';
import { DriverEmploymentEndReason } from '@prisma/client';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, BriefcaseBusiness, FilePlus, Plus, Save, ShieldCheck, Trash2, Truck } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { DatePartsInput } from '@/components/DatePartsInput';
import { DocumentHistorySection } from '@/components/EntityDocumentSections';
import { DocumentTable } from '@/components/DocumentTable';
import { EntityRoadEventsPanel } from '@/components/EntityRoadEventsPanel';
import { PageHeader } from '@/components/PageHeader';
import { formatDate, toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { documentInclude, splitDocumentsByLifecycle } from '@/lib/documents';
import {
  getDriverEmploymentEndReasonLabel,
  getDriverEmploymentPeriodStatus,
  getDriverEmploymentSummary,
  getDriverEmploymentSummaryLabel
} from '@/lib/driver-employment-core';
import { getDriverAssignmentStatus } from '@/lib/driver-assignment-core';
import {
  createDriverEmploymentAction,
  deleteDriverAction,
  deleteDriverEmploymentAction,
  updateDriverAction,
  updateDriverEmploymentAction
} from '../actions';

type DriverDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ employmentError?: string }>;
};

const endReasons = Object.values(DriverEmploymentEndReason);

export default async function DriverDetailPage({ params, searchParams }: DriverDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const [driver, documents, badgeDocumentType, roadFines, roadAccidents] = await Promise.all([
    prisma.driver.findUnique({
      where: { id },
      include: {
        employmentPeriods: { orderBy: { startDate: 'desc' } },
        tractorAssignments: {
          include: { tractor: true },
          orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }]
        }
      }
    }),
    prisma.document.findMany({
      where: { driverId: id },
      include: documentInclude,
      orderBy: { expiryDate: 'asc' }
    }),
    prisma.documentType.findUnique({ where: { name: 'Badge portuale' } }),
    prisma.roadFine.findMany({
      where: { driverId: id },
      select: { id: true, violationDate: true, noticeNumber: true, authority: true, status: true },
      orderBy: { violationDate: 'desc' }
    }),
    prisma.roadAccident.findMany({
      where: { driverId: id },
      select: { id: true, accidentDate: true, claimNumber: true, location: true, status: true },
      orderBy: { accidentDate: 'desc' }
    })
  ]);
  if (!driver) notFound();

  // Anche qui i documenti sostituiti o archiviati escono dalle liste operative e
  // finiscono in un blocco storico separato.
  const { current: activeDocuments, historical: historicalDocuments } = splitDocumentsByLifecycle(documents);
  const badgeDocuments = badgeDocumentType
    ? activeDocuments.filter((document) => document.documentTypeId === badgeDocumentType.id)
    : [];
  const ordinaryDocuments = badgeDocumentType
    ? activeDocuments.filter((document) => document.documentTypeId !== badgeDocumentType.id)
    : activeDocuments;
  const employmentSummary = getDriverEmploymentSummary(driver.employmentPeriods);
  const employmentSummaryLabel = getDriverEmploymentSummaryLabel(employmentSummary);
  const employmentSummaryClass = employmentSummary === 'EMPLOYED'
    ? 'valid'
    : employmentSummary === 'PLANNED'
      ? 'thirtyDays'
      : 'inactive';
  const currentTractorAssignment = driver.tractorAssignments.find(
    (assignment) => getDriverAssignmentStatus(assignment) === 'CURRENT'
  );

  return (
    <>
      <PageHeader
        title={`${driver.firstName} ${driver.lastName}`}
        description="Scheda autista, assegnazioni ai mezzi, rapporto di lavoro e documenti"
        action={
          <div className="actions-row">
            <a className="secondary-button" href="#vehicle-assignments">
              <Truck size={16} aria-hidden />
              Assegnazioni ai mezzi
            </a>
            <Link className="primary-button" href={`/documents/new?entityType=DRIVER&entityId=${driver.id}`}>
              <FilePlus size={16} aria-hidden />
              Documento
            </Link>
          </div>
        }
      />

      <div className="grid two">
        <section className="panel">
          <h2>Dati autista</h2>
          <form action={updateDriverAction.bind(null, driver.id)} className="form-stack">
            <div className="form-grid">
              <label>Nome<input name="firstName" defaultValue={driver.firstName} required /></label>
              <label>Cognome<input name="lastName" defaultValue={driver.lastName} required /></label>
              <label>Telefono<input name="phone" defaultValue={driver.phone || ''} /></label>
              <label>Email<input name="email" type="email" defaultValue={driver.email || ''} /></label>
            </div>
            <label>Note<textarea name="notes" defaultValue={driver.notes || ''} /></label>
            <label className="checkbox-row">
              <input name="active" type="checkbox" defaultChecked={driver.active} />
              Disponibile nelle selezioni operative
            </label>
            <div className="actions-row">
              <button className="primary-button" type="submit"><Save size={16} aria-hidden />Salva</button>
            </div>
          </form>
          <form action={deleteDriverAction.bind(null, driver.id)} className="actions-row" style={{ marginTop: 12 }}>
            <ConfirmSubmitButton className="danger-button" message="Eliminare questo autista? L’operazione e possibile solo se non esistono dati gestionali collegati.">
              <Trash2 size={16} aria-hidden />Elimina
            </ConfirmSubmitButton>
          </form>
        </section>

        <section className="panel" id="employment">
          <div className="actions-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2>Assunzione e cessazione</h2>
              <p className="muted">Le date sono inclusive e lo storico permette di registrare anche eventuali riassunzioni.</p>
            </div>
            <span className={`badge ${employmentSummaryClass}`}>{employmentSummaryLabel}</span>
          </div>
          {query.employmentError ? <p className="form-error" role="alert">{query.employmentError}</p> : null}
          <div className="assignment-create-card">
            <div className="mode-banner assignment-explainer">
              <BriefcaseBusiness size={18} aria-hidden />
              <div><strong>Nuovo periodo di lavoro</strong><span>Lascia vuota la fine finche il rapporto e in corso.</span></div>
            </div>
            <form action={createDriverEmploymentAction.bind(null, driver.id)} className="form-stack">
              <div className="form-grid">
                <DatePartsInput label="Data assunzione" name="startDate" defaultValue={toDateInputValue(new Date())} required />
                <DatePartsInput label="Data cessazione (facoltativa)" name="endDate" />
                <label>
                  Causale cessazione
                  <select name="endReason" defaultValue="">
                    <option value="">Rapporto in corso</option>
                    {endReasons.map((reason) => <option key={reason} value={reason}>{getDriverEmploymentEndReasonLabel(reason)}</option>)}
                  </select>
                </label>
              </div>
              <label>Note<input name="employmentNotes" placeholder="Es. qualifica, livello, tipologia contrattuale" /></label>
              <button className="primary-button" type="submit"><Plus size={16} aria-hidden />Aggiungi periodo</button>
            </form>
          </div>

          <div className="assignment-history">
            <h3>Storico rapporto di lavoro ({driver.employmentPeriods.length})</h3>
            {driver.employmentPeriods.length === 0 ? (
              <div className="empty-state assignment-empty-state">
                <BriefcaseBusiness size={24} aria-hidden />
                <strong>Nessun periodo registrato</strong>
                <span>Inserisci la data di assunzione per iniziare lo storico.</span>
              </div>
            ) : driver.employmentPeriods.map((period) => {
              const status = getDriverEmploymentPeriodStatus(period);
              const statusLabel = status === 'CURRENT' ? 'In corso' : status === 'FUTURE' ? 'Programmata' : 'Conclusa';
              const statusClass = status === 'CURRENT' ? 'valid' : status === 'FUTURE' ? 'thirtyDays' : 'inactive';
              return (
                <details className="assignment-record" key={period.id}>
                  <summary>
                    <span className="assignment-driver-name">{formatDate(period.startDate)} → {period.endDate ? formatDate(period.endDate) : 'senza fine'}</span>
                    <span className="assignment-period">{period.endReason ? getDriverEmploymentEndReasonLabel(period.endReason) : 'Rapporto aperto'}</span>
                    <span className={`badge ${statusClass}`}>{statusLabel}</span>
                  </summary>
                  <div className="assignment-record-body">
                    <form action={updateDriverEmploymentAction.bind(null, driver.id, period.id)} className="form-stack">
                      <div className="form-grid">
                        <DatePartsInput label="Data assunzione" name="startDate" defaultValue={toDateInputValue(period.startDate)} required />
                        <DatePartsInput label="Data cessazione" name="endDate" defaultValue={toDateInputValue(period.endDate)} />
                        <label>
                          Causale cessazione
                          <select name="endReason" defaultValue={period.endReason || ''}>
                            <option value="">Rapporto in corso</option>
                            {endReasons.map((reason) => <option key={reason} value={reason}>{getDriverEmploymentEndReasonLabel(reason)}</option>)}
                          </select>
                        </label>
                      </div>
                      <label>Note<input name="employmentNotes" defaultValue={period.notes || ''} /></label>
                      <button className="secondary-button" type="submit"><Save size={16} aria-hidden />Salva periodo</button>
                    </form>
                    <form action={deleteDriverEmploymentAction.bind(null, driver.id, period.id)}>
                      <ConfirmSubmitButton className="danger-button compact-button" message="Eliminare questo periodo dallo storico del rapporto di lavoro?">
                        <Trash2 size={15} aria-hidden />Elimina periodo
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      </div>

      <section className="panel driver-assignments-panel" id="vehicle-assignments" tabIndex={-1} style={{ marginTop: 18 }}>
        <div className="section-heading-inline">
          <div>
            <h2>Assegnazioni ai mezzi</h2>
            <p className="muted">
              Qui controlli su quale trattore risultava l&apos;autista in ogni periodo. Le modifiche si fanno dalla scheda del trattore.
            </p>
          </div>
          <span className={`badge ${currentTractorAssignment ? 'valid' : 'thirtyDays'}`}>
            {currentTractorAssignment ? `Oggi: ${currentTractorAssignment.tractor.plate}` : 'Nessun mezzo oggi'}
          </span>
        </div>

        <div className="assignment-history">
          <h3>Storico assegnazioni ({driver.tractorAssignments.length})</h3>
          {driver.tractorAssignments.length === 0 ? (
            <div className="empty-state assignment-empty-state">
              <Truck size={24} aria-hidden />
              <strong>Nessuna assegnazione registrata</strong>
              <span>Apri il trattore interessato e aggiungi il periodo con questo autista.</span>
              <Link className="secondary-button compact-button" href="/vehicles/tractors">
                Apri trattori
                <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
          ) : driver.tractorAssignments.map((assignment) => {
            const status = getDriverAssignmentStatus(assignment);
            const statusLabel = status === 'CURRENT' ? 'In corso' : status === 'FUTURE' ? 'Programmata' : 'Conclusa';
            const statusClass = status === 'CURRENT' ? 'valid' : status === 'FUTURE' ? 'thirtyDays' : 'inactive';
            return (
              <details className="assignment-record" key={assignment.id} open={status === 'CURRENT'}>
                <summary>
                  <span className="assignment-driver-name">Trattore {assignment.tractor.plate}</span>
                  <span className="assignment-period">
                    {formatDate(assignment.validFrom)} → {assignment.validTo ? formatDate(assignment.validTo) : 'senza fine'}
                  </span>
                  <span className={`badge ${statusClass}`}>{statusLabel}</span>
                </summary>
                <div className="assignment-record-body">
                  <div>
                    <strong>{assignment.tractor.brand || assignment.tractor.model
                      ? [assignment.tractor.brand, assignment.tractor.model].filter(Boolean).join(' ')
                      : `Trattore ${assignment.tractor.plate}`}</strong>
                    <p className="muted">{assignment.notes || 'Nessuna nota per questo periodo.'}</p>
                  </div>
                  <Link
                    className="secondary-button"
                    href={`/vehicles/tractors/${assignment.tractor.id}#driver-assignments`}
                  >
                    Controlla o modifica
                    <ArrowRight size={15} aria-hidden />
                  </Link>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <div className="grid two" style={{ marginTop: 18 }}>
        <section className="detail-section">
          <div className="actions-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Documenti autista</h2>
            <Link className="secondary-button compact-button" href={`/documents/new?entityType=DRIVER&entityId=${driver.id}`}>
              <FilePlus size={15} aria-hidden />Aggiungi
            </Link>
          </div>
          <DocumentTable documents={ordinaryDocuments} emptyText="Nessun documento autista inserito." />
        </section>
        <section className="detail-section">
          <div className="actions-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div><h2>Badge portuali</h2><p className="muted">Un documento separato per ogni porto, con scadenza e PDF opzionale.</p></div>
            {badgeDocumentType ? (
              <Link className="primary-button compact-button" href={`/documents/new?entityType=DRIVER&entityId=${driver.id}&documentTypeId=${badgeDocumentType.id}`}>
                <ShieldCheck size={15} aria-hidden />Nuovo badge
              </Link>
            ) : null}
          </div>
          <DocumentTable documents={badgeDocuments} emptyText="Nessun badge portuale inserito." />
        </section>
      </div>
      <div className="grid" style={{ marginTop: 18 }}>
        <EntityRoadEventsPanel fines={roadFines} accidents={roadAccidents} />
        <DocumentHistorySection documents={historicalDocuments} entityKey={`DRIVER:${driver.id}`} />
      </div>
    </>
  );
}
