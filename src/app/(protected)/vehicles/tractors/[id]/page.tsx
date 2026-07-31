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
import { updateTractorAction } from '../actions';

type TractorDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TractorDetailPage({ params }: TractorDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const tractor = await prisma.tractor.findUnique({ where: { id }, include: { assignedDriver: true } });
  if (!tractor) notFound();

  const [documents, documentTypes, checklistExclusions, drivers] = await Promise.all([
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
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] })
  ]);
  const checklist = buildDocumentChecklist(documentTypes, documents, checklistExclusions);
  const disposed = isDisposedVehicleStatus(tractor.lifecycleStatus);

  return (
    <>
      <PageHeader
        title={`Trattore ${tractor.plate}`}
        description="Scheda trattore"
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
            <h2>Dati trattore</h2>
            <form action={updateTractorAction.bind(null, tractor.id)} className="form-stack">
              <div className="form-grid">
                <label>
                  Targa
                  <input name="plate" defaultValue={tractor.plate} required />
                </label>
                <label>
                  Marca
                  <input name="brand" defaultValue={tractor.brand || ''} />
                </label>
                <label>
                  Modello
                  <input name="model" defaultValue={tractor.model || ''} />
                </label>
                <label>
                  Autista associato
                  <select name="assignedDriverId" defaultValue={tractor.assignedDriverId || ''}>
                    <option value="">Nessuno</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {`${driver.lastName} ${driver.firstName}`.trim()}
                        {driver.active ? '' : ' (non attivo)'}
                      </option>
                    ))}
                  </select>
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
        <section className="detail-section">
          <h2>Documenti targa</h2>
          <DocumentTable documents={documents} />
        </section>
        <VehicleExpensesPanel tractorId={tractor.id} />
      </div>
    </>
  );
}
