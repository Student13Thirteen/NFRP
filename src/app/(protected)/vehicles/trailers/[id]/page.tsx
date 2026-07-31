import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EntityType } from '@prisma/client';
import { Archive, FilePlus } from 'lucide-react';
import { DocumentChecklist } from '@/components/DocumentChecklist';
import { DocumentTable } from '@/components/DocumentTable';
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

type TrailerDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TrailerDetailPage({ params }: TrailerDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const trailer = await prisma.trailer.findUnique({ where: { id }, include: { assignedTractor: true } });
  if (!trailer) notFound();

  const [documents, documentTypes, checklistExclusions, tractors] = await Promise.all([
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
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] })
  ]);
  const checklist = buildDocumentChecklist(documentTypes, documents, checklistExclusions);
  const disposed = isDisposedVehicleStatus(trailer.lifecycleStatus);

  return (
    <>
      <PageHeader
        title={`Semirimorchio ${trailer.plate}`}
        description="Scheda semirimorchio"
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
                  Marca
                  <input name="brand" defaultValue={trailer.brand || ''} />
                </label>
                <label>
                  Modello
                  <input name="model" defaultValue={trailer.model || ''} />
                </label>
                <label>
                  Trattore associato
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
        <section className="detail-section">
          <h2>Documenti targa</h2>
          <DocumentTable documents={documents} />
        </section>
        <VehicleExpensesPanel trailerId={trailer.id} />
      </div>
    </>
  );
}
