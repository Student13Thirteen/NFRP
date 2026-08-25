import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EntityType, VehicleLifecycleStatus } from '@prisma/client';
import { Archive, CalendarDays, CheckCircle2, CircleAlert, Download, FilePlus, Link2, Link2Off, Plus, Save, Trash2, Truck, UserRound } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { DatePartsInput } from '@/components/DatePartsInput';
import { DocumentChecklist } from '@/components/DocumentChecklist';
import { EntityDocumentSections } from '@/components/EntityDocumentSections';
import { EntityRoadEventsPanel } from '@/components/EntityRoadEventsPanel';
import { PageHeader } from '@/components/PageHeader';
import { VehicleExpensesPanel } from '@/components/VehicleExpensesPanel';
import { VehicleLifecycleFields } from '@/components/VehicleLifecycleFields';
import { VehicleLifecycleSubmitButton } from '@/components/VehicleLifecycleSubmitButton';
import { buildDocumentChecklist } from '@/lib/document-checklist';
import { prisma } from '@/lib/db';
import { documentInclude } from '@/lib/documents';
import {
  getVehicleLifecycleLabel,
  isDisposedVehicleStatus
} from '@/lib/vehicle-lifecycle';
import {
  assignTrailerToTractorAction,
  createTractorDriverAssignmentAction,
  deleteTractorDriverAssignmentAction,
  detachTrailerFromTractorAction,
  updateTractorAction,
  updateTractorDriverAssignmentAction
} from '../actions';
import {
  MOTOR_VEHICLE_TYPES,
  getMotorVehicleHeading,
  getMotorVehicleTypeLabel,
  getTrailerTypeLabel
} from '@/lib/vehicle-types';
import { formatDate, toDateInputValue } from '@/lib/dates';
import { getDriverAssignmentStatus } from '@/lib/driver-assignment-core';
import { isTachographUpdateDocumentTypeName } from '@/lib/tachograph-update';

type TractorDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ assignmentError?: string; pairingError?: string }>;
};

export default async function TractorDetailPage({ params, searchParams }: TractorDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const tractor = await prisma.tractor.findUnique({ where: { id } });
  if (!tractor) notFound();

  const [documents, documentTypes, checklistExclusions, drivers, driverAssignments, pairedTrailers, selectableTrailers, roadFines, roadAccidents] = await Promise.all([
    prisma.document.findMany({
      where: { tractorId: tractor.id },
      include: documentInclude,
      orderBy: { expiryDate: 'asc' }
    }),
    prisma.documentType.findMany({
      where: { active: true, suggestedEntityType: EntityType.TRACTOR },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    }),
    prisma.documentRequirementExclusion.findMany({
      where: { tractorId: tractor.id },
      select: { documentTypeId: true }
    }),
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractorDriverAssignment.findMany({
      where: { tractorId: tractor.id },
      include: { driver: true },
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.trailer.findMany({
      where: { assignedTractorId: tractor.id },
      orderBy: { plate: 'asc' }
    }),
    // Restano selezionabili anche i semirimorchi gia abbinati altrove: la
    // tendina lo dichiara e l'abbinamento resta possibile. Il confronto va
    // scritto con l'OR esplicito: `not` diventa `<>` in SQL ed escluderebbe
    // proprio i semirimorchi liberi, che hanno `assignedTractorId` nullo.
    prisma.trailer.findMany({
      where: {
        lifecycleStatus: VehicleLifecycleStatus.ACTIVE,
        OR: [{ assignedTractorId: null }, { assignedTractorId: { not: tractor.id } }]
      },
      include: { assignedTractor: { select: { plate: true } } },
      orderBy: [{ assignedTractorId: 'asc' }, { plate: 'asc' }]
    }),
    prisma.roadFine.findMany({
      where: { tractorId: tractor.id },
      select: { id: true, violationDate: true, noticeNumber: true, authority: true, status: true },
      orderBy: { violationDate: 'desc' }
    }),
    prisma.roadAccident.findMany({
      where: { tractorId: tractor.id },
      select: { id: true, accidentDate: true, claimNumber: true, location: true, status: true },
      orderBy: { accidentDate: 'desc' }
    })
  ]);
  const checklist = buildDocumentChecklist(documentTypes, documents, checklistExclusions);
  const disposed = isDisposedVehicleStatus(tractor.lifecycleStatus);
  const currentAssignment = driverAssignments.find(
    (assignment) => getDriverAssignmentStatus(assignment) === 'CURRENT'
  );
  const tachographDocument = documents
    .filter(
      (document) =>
        isTachographUpdateDocumentTypeName(document.documentType.name) &&
        document.status !== 'ARCHIVED' &&
        document.status !== 'RENEWED' &&
        Boolean(document.filePath)
    )
    .sort((a, b) => (b.issueDate?.getTime() || b.createdAt.getTime()) - (a.issueDate?.getTime() || a.createdAt.getTime()))[0];

  return (
    <>
      <PageHeader
        title={getMotorVehicleHeading(tractor)}
        description={`Scheda mezzo - ${getMotorVehicleTypeLabel(tractor.vehicleType)}`}
        action={
          disposed ? (
            <Link className="secondary-button" href={`/documents/disposed?entityKey=TRACTOR:${tractor.id}`}>
              <Archive size={16} aria-hidden />
              Documenti mezzo
            </Link>
          ) : (
            <Link className="primary-button" href={`/documents/new?entityType=TRACTOR&entityId=${tractor.id}`}>
              <FilePlus size={16} aria-hidden />
              Documento
            </Link>
          )
        }
      />
      {!disposed ? (
        <section className={`workflow-status${tachographDocument ? '' : ' needs-action'}`}>
          <span className="workflow-status-icon">
            {tachographDocument ? <CheckCircle2 size={20} aria-hidden /> : <CircleAlert size={20} aria-hidden />}
          </span>
          <span className="workflow-status-copy">
            <strong>
              {tachographDocument ? 'Aggiornamento tachigrafo documentato' : 'Documentazione aggiornamento tachigrafo mancante'}
            </strong>
            <small>
              {tachographDocument
                ? `Intervento documentato${tachographDocument.issueDate ? ` il ${formatDate(tachographDocument.issueDate)}` : ''}.`
                : 'Lo stato indica solo che non e ancora presente un PDF validato nel gestionale.'}
            </small>
          </span>
          <div className="actions-row">
            {tachographDocument?.filePath ? (
              <Link className="secondary-button" href={`/api/documents/${tachographDocument.id}/file`} target="_blank">
                <Download size={16} aria-hidden />
                PDF
              </Link>
            ) : null}
            {!tachographDocument ? (
              <Link className="primary-button" href="/documents/inbox">
                <FilePlus size={16} aria-hidden />
                Carica con OCR
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
      {disposed ? (
        <section className="workflow-status vehicle-disposed-status">
          <span className="workflow-status-icon"><Archive size={20} aria-hidden /></span>
          <span className="workflow-status-copy">
            <strong>Mezzo {getVehicleLifecycleLabel(tractor.lifecycleStatus).toLocaleLowerCase('it-IT')}</strong>
            <small>Fuori dall&apos;operativita. Documenti e storico restano consultabili.</small>
          </span>
        </section>
      ) : null}
      <div className="grid">
        <div className={`grid${disposed ? '' : ' two'}`}>
          <section className="panel">
            <h2>Dati mezzo</h2>
            <form action={updateTractorAction.bind(null, tractor.id)} className="form-stack">
              <div className="form-grid">
                <label>
                  Targa
                  <input name="plate" defaultValue={tractor.plate} required />
                </label>
                <label>
                  Tipologia
                  <select name="vehicleType" defaultValue={tractor.vehicleType || ''}>
                    <option value="">Da classificare</option>
                    {MOTOR_VEHICLE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {getMotorVehicleTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Marca
                  <input name="brand" defaultValue={tractor.brand || ''} />
                </label>
                <label>
                  Modello
                  <input name="model" defaultValue={tractor.model || ''} />
                </label>
              </div>
              <label>
                Note
                <textarea name="notes" defaultValue={tractor.notes || ''} />
              </label>
              <VehicleLifecycleFields endedAt={tractor.lifecycleEndedAt} status={tractor.lifecycleStatus} />
              <VehicleLifecycleSubmitButton currentStatus={tractor.lifecycleStatus} />
            </form>
          </section>
          {!disposed ? <DocumentChecklist checklist={checklist} entityType={EntityType.TRACTOR} entityId={tractor.id} /> : null}
        </div>
        <section className="panel driver-assignments-panel" id="driver-assignments">
          <div className="section-heading-inline">
            <div>
              <h2>Assegnazioni autista</h2>
              <p className="muted">Lo storico decide l&apos;autista corretto in base alla data di manutenzioni e rifornimenti.</p>
            </div>
            <span className={`badge ${currentAssignment ? 'valid' : 'thirtyDays'}`}>
              {currentAssignment
                ? `Oggi: ${currentAssignment.driver.lastName} ${currentAssignment.driver.firstName}`.trim()
                : 'Nessun autista oggi'}
            </span>
          </div>

          {resolvedSearchParams.assignmentError ? (
            <p className="form-error" role="alert">{resolvedSearchParams.assignmentError}</p>
          ) : null}

          <div className="assignment-create-card">
            <div className="mode-banner assignment-explainer">
              <CalendarDays size={18} aria-hidden />
              <div>
                <strong>Registra il periodo, non solo l&apos;autista di oggi.</strong>
                <span>Le date sono inclusive. Lascia vuota la fine se l&apos;associazione e ancora in corso.</span>
              </div>
            </div>
            <form action={createTractorDriverAssignmentAction.bind(null, tractor.id)} className="form-stack">
              <div className="form-grid">
                <label>
                  Autista
                  <select name="driverId" required defaultValue="">
                    <option value="">Seleziona autista</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {`${driver.lastName} ${driver.firstName}`.trim()}{driver.active ? '' : ' (non attivo)'}
                      </option>
                    ))}
                  </select>
                </label>
                <DatePartsInput label="Dal" name="validFrom" defaultValue={toDateInputValue(new Date())} required />
                <DatePartsInput label="Al (facoltativo)" name="validTo" />
              </div>
              <label>
                Nota facoltativa
                <input name="assignmentNotes" placeholder="Es. sostituzione ferie, cambio mezzo, nuova assegnazione" />
              </label>
              <label className="checkbox-row assignment-close-option">
                <input name="closeOpenAssignments" type="checkbox" defaultChecked />
                Chiudi automaticamente al giorno prima gli eventuali periodi ancora aperti del trattore o dell&apos;autista
              </label>
              <button className="primary-button" type="submit">
                <Plus size={16} aria-hidden />
                Aggiungi associazione
              </button>
            </form>
          </div>

          <div className="assignment-history">
            <h3>Storico ({driverAssignments.length})</h3>
            {driverAssignments.length === 0 ? (
              <div className="empty-state assignment-empty-state">
                <UserRound size={24} aria-hidden />
                <strong>Nessuna associazione registrata</strong>
                <span>Aggiungi il primo periodo: da quel momento l&apos;autista verra proposto alla data corretta.</span>
              </div>
            ) : driverAssignments.map((assignment) => {
              const status = getDriverAssignmentStatus(assignment);
              const statusLabel = status === 'CURRENT' ? 'In corso' : status === 'FUTURE' ? 'Programmata' : 'Conclusa';
              const statusClass = status === 'CURRENT' ? 'valid' : status === 'FUTURE' ? 'thirtyDays' : 'inactive';
              return (
                <details className="assignment-record" key={assignment.id}>
                  <summary>
                    <span className="assignment-driver-name">{`${assignment.driver.lastName} ${assignment.driver.firstName}`.trim()}</span>
                    <span className="assignment-period">
                      {formatDate(assignment.validFrom)} → {assignment.validTo ? formatDate(assignment.validTo) : 'senza fine'}
                    </span>
                    <span className={`badge ${statusClass}`}>{statusLabel}</span>
                  </summary>
                  <div className="assignment-record-body">
                    <form action={updateTractorDriverAssignmentAction.bind(null, tractor.id, assignment.id)} className="form-stack">
                      <div className="form-grid">
                        <label>
                          Autista
                          <select name="driverId" defaultValue={assignment.driverId} required>
                            {drivers.map((driver) => (
                              <option key={driver.id} value={driver.id}>
                                {`${driver.lastName} ${driver.firstName}`.trim()}{driver.active ? '' : ' (non attivo)'}
                              </option>
                            ))}
                          </select>
                        </label>
                        <DatePartsInput label="Dal" name="validFrom" defaultValue={toDateInputValue(assignment.validFrom)} required />
                        <DatePartsInput label="Al (facoltativo)" name="validTo" defaultValue={toDateInputValue(assignment.validTo)} />
                      </div>
                      <label>
                        Nota
                        <input name="assignmentNotes" defaultValue={assignment.notes || ''} />
                      </label>
                      <button className="secondary-button" type="submit">
                        <Save size={16} aria-hidden />
                        Salva periodo
                      </button>
                    </form>
                    <form action={deleteTractorDriverAssignmentAction.bind(null, tractor.id, assignment.id)}>
                      <ConfirmSubmitButton
                        className="danger-button compact-button"
                        message="Eliminare questo periodo dallo storico delle associazioni?"
                      >
                        <Trash2 size={15} aria-hidden />
                        Elimina periodo
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
        {!disposed ? (
          <section className="panel" id="trailer-pairing">
            <div className="section-heading-inline">
              <div>
                <h2>Semirimorchio abbinato</h2>
                <p className="muted">Il complesso mezzo abituale. Serve a ritrovare il rimorchiato giusto da targa a targa.</p>
              </div>
              <span className={`badge ${pairedTrailers.length > 0 ? 'valid' : 'inactive'}`}>
                {pairedTrailers.length === 0
                  ? 'Nessun abbinamento'
                  : pairedTrailers.length === 1
                    ? pairedTrailers[0].plate
                    : `${pairedTrailers.length} semirimorchi`}
              </span>
            </div>

            {resolvedSearchParams.pairingError ? (
              <p className="form-error" role="alert">{resolvedSearchParams.pairingError}</p>
            ) : null}

            {pairedTrailers.length > 1 ? (
              <p className="pairing-warning" role="status">
                <CircleAlert size={16} aria-hidden />
                Questo trattore risulta abbinato a piu di un semirimorchio. E permesso, ma di norma il complesso e uno solo:
                verifica e sgancia quelli non piu in uso.
              </p>
            ) : null}

            {pairedTrailers.length > 0 ? (
              <div className="vehicle-pairing-list">
                {pairedTrailers.map((trailer) => (
                  <div className="vehicle-pairing-row" key={trailer.id}>
                    <div>
                      <Link className="vehicle-pairing-plate" href={`/vehicles/trailers/${trailer.id}`}>
                        {trailer.plate}
                      </Link>
                      <span className="muted">
                        {getTrailerTypeLabel(trailer)}
                        {[trailer.brand, trailer.model].filter(Boolean).length > 0
                          ? ` - ${[trailer.brand, trailer.model].filter(Boolean).join(' ')}`
                          : ''}
                      </span>
                    </div>
                    <form action={detachTrailerFromTractorAction.bind(null, tractor.id, trailer.id)}>
                      <ConfirmSubmitButton
                        className="secondary-button compact-button"
                        message={`Sganciare ${trailer.plate} da questo trattore? Documenti, costi e storico restano invariati.`}
                      >
                        <Link2Off size={15} aria-hidden />
                        Sgancia
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state assignment-empty-state">
                <Truck size={24} aria-hidden />
                <strong>Nessun semirimorchio abbinato</strong>
                <span>Scegli la targa rimorchiata abituale: la trovi poi anche dalla scheda del semirimorchio.</span>
              </div>
            )}

            <form action={assignTrailerToTractorAction.bind(null, tractor.id)} className="form-stack">
              <label>
                Abbina semirimorchio
                <select name="trailerId" defaultValue="" required>
                  <option value="">Seleziona targa</option>
                  {selectableTrailers.map((trailer) => (
                    <option key={trailer.id} value={trailer.id}>
                      {`${trailer.plate} - ${getTrailerTypeLabel(trailer)}`}
                      {trailer.assignedTractor?.plate ? ` (gia con ${trailer.assignedTractor.plate})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">
                Le targhe gia abbinate a un altro trattore restano selezionabili: il gestionale avvisa e sostituisce
                l&apos;abbinamento precedente invece di bloccarti.
              </p>
              <button className="primary-button" type="submit">
                <Link2 size={16} aria-hidden />
                Abbina
              </button>
            </form>
          </section>
        ) : null}
        <EntityDocumentSections documents={documents} entityKey={`TRACTOR:${tractor.id}`} />
        <VehicleExpensesPanel tractorId={tractor.id} />
        <EntityRoadEventsPanel fines={roadFines} accidents={roadAccidents} />
      </div>
    </>
  );
}
