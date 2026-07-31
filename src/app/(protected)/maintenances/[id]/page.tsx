import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, Plus, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { MaintenanceForm } from '@/components/MaintenanceForm';
import { PageHeader } from '@/components/PageHeader';
import { formatDate, toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  buildMaintenanceCategoryOptions,
  buildMaintenanceDriverOptions,
  buildMaintenanceSupplierOptions,
  buildMaintenanceVehicleOptions,
  formatMoneyCents,
  getMaintenanceDriverLabel,
  getMaintenanceStatusLabel,
  getMaintenanceVehicleKey,
  getMaintenanceVehicleLabel,
  maintenanceInclude
} from '@/lib/maintenance';
import { deleteMaintenanceAction } from '../actions';

type MaintenanceDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

function amountInputValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100);
}

function formatFileSize(value: number | null | undefined): string {
  if (!value) return 'Non disponibile';
  return `${Math.round(value / 1024)} KB`;
}

export default async function MaintenanceDetailPage({ params, searchParams }: MaintenanceDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const maintenance = await prisma.maintenance.findUnique({
    where: { id },
    include: maintenanceInclude
  });
  if (!maintenance) notFound();

  const [categories, suppliers, drivers, tractors, trailers] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.supplier.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.trailer.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] })
  ]);
  const newMaintenanceParams = new URLSearchParams({ categoryId: maintenance.categoryId });
  if (maintenance.supplierId) newMaintenanceParams.set('supplierId', maintenance.supplierId);
  if (maintenance.driverId) newMaintenanceParams.set('driverId', maintenance.driverId);
  const maintenanceVehicleKey = getMaintenanceVehicleKey(maintenance);
  if (maintenanceVehicleKey) newMaintenanceParams.set('vehicleKey', maintenanceVehicleKey);
  const newMaintenanceHref = `/maintenances/new?${newMaintenanceParams.toString()}`;

  return (
    <>
      <PageHeader
        title={maintenance.title}
        description={`${maintenance.category.name} - ${getMaintenanceVehicleLabel(maintenance)}`}
        action={
          <div className="actions-row">
            {maintenance.filePath ? (
              <Link className="secondary-button" href={`/api/maintenances/${maintenance.id}/file`} target="_blank">
                <Download size={16} aria-hidden />
                Apri PDF
              </Link>
            ) : null}
            <Link className="primary-button" href={newMaintenanceHref}>
              <Plus size={16} aria-hidden />
              Nuova manutenzione
            </Link>
          </div>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <div className="grid two">
        <section className="detail-section">
          <h2>Scheda manutenzione</h2>
          <div className="maintenance-focus">
            <span>Intervento</span>
            <strong>{maintenance.title}</strong>
            <p>{maintenance.description}</p>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Data intervento</dt>
              <dd>{formatDate(maintenance.maintenanceDate)}</dd>
            </div>
            <div>
              <dt>Mezzo</dt>
              <dd>{getMaintenanceVehicleLabel(maintenance)}</dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{maintenance.category.name}</dd>
            </div>
            <div>
              <dt>Stato</dt>
              <dd>{getMaintenanceStatusLabel(maintenance.status)}</dd>
            </div>
            <div>
              <dt>Autista</dt>
              <dd>{getMaintenanceDriverLabel(maintenance)}</dd>
            </div>
            <div>
              <dt>Fornitore</dt>
              <dd>{maintenance.supplier?.name || '-'}</dd>
            </div>
            <div>
              <dt>Documento</dt>
              <dd>{maintenance.documentNumber || '-'}</dd>
            </div>
            <div>
              <dt>Data documento</dt>
              <dd>{formatDate(maintenance.documentDate)}</dd>
            </div>
            <div>
              <dt>Km</dt>
              <dd>{maintenance.odometerKm ? `${maintenance.odometerKm.toLocaleString('it-IT')} km` : '-'}</dd>
            </div>
            <div>
              <dt>Importo</dt>
              <dd>{formatMoneyCents(maintenance.amountCents)}</dd>
            </div>
            <div>
              <dt>File</dt>
              <dd>{maintenance.originalFileName || 'PDF non ancora caricato'}</dd>
            </div>
            <div>
              <dt>Dimensione</dt>
              <dd>{formatFileSize(maintenance.fileSize)}</dd>
            </div>
          </dl>
          {maintenance.notes ? <p>{maintenance.notes}</p> : null}
          <div className="record-actions">
            <form action={deleteMaintenanceAction.bind(null, maintenance.id)}>
              <ConfirmSubmitButton
                className="danger-button"
                message="Eliminare definitivamente questa manutenzione e il PDF collegato? Questa operazione non si puo annullare."
              >
                <Trash2 size={16} aria-hidden />
                Elimina manutenzione
              </ConfirmSubmitButton>
            </form>
          </div>
        </section>

        <section className="panel">
          <h2>Modifica manutenzione</h2>
          <MaintenanceForm
            action={`/api/maintenances/${maintenance.id}/update`}
            categories={buildMaintenanceCategoryOptions(categories)}
            suppliers={buildMaintenanceSupplierOptions(suppliers)}
            drivers={buildMaintenanceDriverOptions(drivers)}
            vehicles={buildMaintenanceVehicleOptions(tractors, trailers)}
            defaultValues={{
              title: maintenance.title,
              categoryId: maintenance.categoryId,
              status: maintenance.status,
              maintenanceDate: toDateInputValue(maintenance.maintenanceDate),
              documentDate: toDateInputValue(maintenance.documentDate),
              supplierId: maintenance.supplierId,
              documentNumber: maintenance.documentNumber,
              driverId: maintenance.driverId,
              vehicleKey: maintenanceVehicleKey,
              odometerKm: maintenance.odometerKm,
              amount: amountInputValue(maintenance.amountCents),
              description: maintenance.description,
              notes: maintenance.notes
            }}
            fileLabel={maintenance.filePath ? 'Sostituisci PDF' : 'Carica PDF opzionale'}
            showStatus
            submitLabel="Salva modifiche"
          />
        </section>
      </div>
    </>
  );
}
