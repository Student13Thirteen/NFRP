import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EntityType } from '@prisma/client';
import { Archive, CircleAlert, FilePlus } from 'lucide-react';
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
import { updateTrailerAction } from '../actions';
import {
  TANK_CARGO_TYPES,
  TRAILER_BODY_TYPES,
  getTankCargoLabel,
  getTrailerBodyTypeLabel,
  getTrailerHeading,
  getTrailerTypeLabel
} from '@/lib/vehicle-types';

type TrailerDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TrailerDetailPage({ params }: TrailerDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const trailer = await prisma.trailer.findUnique({ where: { id }, include: { assignedTractor: true } });
  if (!trailer) notFound();

  const [documents, documentTypes, checklistExclusions, tractors, siblingTrailers, roadFines, roadAccidents] = await Promise.all([
    prisma.document.findMany({
      where: { trailerId: trailer.id },
      include: documentInclude,
      orderBy: { expiryDate: 'asc' }
    }),
    prisma.documentType.findMany({
      where: { active: true, suggestedEntityType: EntityType.TRAILER },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    }),
    prisma.documentRequirementExclusion.findMany({
      where: { trailerId: trailer.id },
      select: { documentTypeId: true }
    }),
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    // Avviso persistente: lo stesso trattore in coppia con piu semirimorchi resta
    // permesso, ma va dichiarato ogni volta che si apre la scheda. Sta nello
    // stesso `Promise.all` per non aggiungere un giro sequenziale al database.
    trailer.assignedTractorId
      ? prisma.trailer.findMany({
          where: { assignedTractorId: trailer.assignedTractorId, id: { not: trailer.id } },
          select: { id: true, plate: true },
          orderBy: { plate: 'asc' }
        })
      : Promise.resolve([]),
    prisma.roadFine.findMany({
      where: { trailerId: trailer.id },
      select: { id: true, violationDate: true, noticeNumber: true, authority: true, status: true },
      orderBy: { violationDate: 'desc' }
    }),
    prisma.roadAccident.findMany({
      where: { trailerId: trailer.id },
      select: { id: true, accidentDate: true, claimNumber: true, location: true, status: true },
      orderBy: { accidentDate: 'desc' }
    })
  ]);
  const checklist = buildDocumentChecklist(documentTypes, documents, checklistExclusions);
  const disposed = isDisposedVehicleStatus(trailer.lifecycleStatus);

  return (
    <>
      <PageHeader
        title={getTrailerHeading(trailer)}
        description={`Scheda semirimorchio - ${getTrailerTypeLabel(trailer)}`}
        action={
          disposed ? (
            <Link className="secondary-button" href={`/documents/disposed?entityKey=TRAILER:${trailer.id}`}>
              <Archive size={16} aria-hidden />
              Documenti mezzo
            </Link>
          ) : (
            <Link className="primary-button" href={`/documents/new?entityType=TRAILER&entityId=${trailer.id}`}>
              <FilePlus size={16} aria-hidden />
              Documento
            </Link>
          )
        }
      />
      {disposed ? (
        <section className="workflow-status vehicle-disposed-status">
          <span className="workflow-status-icon"><Archive size={20} aria-hidden /></span>
          <span className="workflow-status-copy">
            <strong>Mezzo {getVehicleLifecycleLabel(trailer.lifecycleStatus).toLocaleLowerCase('it-IT')}</strong>
            <small>Fuori dall&apos;operativita. Documenti e storico restano consultabili.</small>
          </span>
        </section>
      ) : null}
      <div className="grid">
        <div className={`grid${disposed ? '' : ' two'}`}>
          <section className="panel">
            <h2>Dati semirimorchio</h2>
            <form action={updateTrailerAction.bind(null, trailer.id)} className="form-stack">
              <div className="form-grid">
                <label>
                  Targa
                  <input name="plate" defaultValue={trailer.plate} required />
                </label>
                <label>
                  Allestimento
                  <select name="bodyType" defaultValue={trailer.bodyType || ''}>
                    <option value="">Da classificare</option>
                    {TRAILER_BODY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {getTrailerBodyTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Carico cisterna
                  <select name="tankCargo" defaultValue={trailer.tankCargo || ''}>
                    <option value="">Solo per le cisterne</option>
                    {TANK_CARGO_TYPES.map((cargo) => (
                      <option key={cargo} value={cargo}>
                        {getTankCargoLabel(cargo)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Marca
                  <input name="brand" defaultValue={trailer.brand || ''} />
                </label>
                <label>
                  Modello
                  <input name="model" defaultValue={trailer.model || ''} />
                </label>
                <label>
                  Trattore abbinato
                  <select name="assignedTractorId" defaultValue={trailer.assignedTractorId || ''}>
                    <option value="">Nessuno</option>
                    {tractors.map((tractor) => (
                      <option key={tractor.id} value={tractor.id}>
                        {tractor.plate}
                        {tractor.active ? '' : ' (non attivo)'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {siblingTrailers.length > 0 ? (
                <p className="pairing-warning" role="status">
                  <CircleAlert size={16} aria-hidden />
                  {`${trailer.assignedTractor?.plate || 'Il trattore abbinato'} risulta abbinato anche a ${siblingTrailers
                    .map((sibling) => sibling.plate)
                    .join(', ')}. E permesso, ma di norma il complesso e uno solo.`}
                </p>
              ) : null}
              {trailer.assignedTractor ? (
                <p className="muted">
                  Apri la scheda del trattore:{' '}
                  <Link href={`/vehicles/tractors/${trailer.assignedTractorId}#trailer-pairing`}>
                    {trailer.assignedTractor.plate}
                  </Link>
                </p>
              ) : null}
              <label>
                Note
                <textarea name="notes" defaultValue={trailer.notes || ''} />
              </label>
              <VehicleLifecycleFields endedAt={trailer.lifecycleEndedAt} status={trailer.lifecycleStatus} />
              <VehicleLifecycleSubmitButton currentStatus={trailer.lifecycleStatus} />
            </form>
          </section>
          {!disposed ? <DocumentChecklist checklist={checklist} entityType={EntityType.TRAILER} entityId={trailer.id} /> : null}
        </div>
        <EntityDocumentSections documents={documents} entityKey={`TRAILER:${trailer.id}`} />
        <VehicleExpensesPanel trailerId={trailer.id} />
        <EntityRoadEventsPanel fines={roadFines} accidents={roadAccidents} />
      </div>
    </>
  );
}
