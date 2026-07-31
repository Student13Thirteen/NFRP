import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, Plus, Trash2, Truck } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { DatePartsInput } from '@/components/DatePartsInput';
import { PageHeader } from '@/components/PageHeader';
import { WarehouseForm } from '@/components/WarehouseForm';
import { formatDate, toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { formatEuroCents, formatQuantityMilli } from '@/lib/expense-shared';
import { buildMaintenanceVehicleOptions } from '@/lib/maintenance';
import { getVehicleLabel } from '@/lib/trips';
import {
  buildWarehouseCategoryOptions,
  buildWarehouseSupplierOptions,
  formatMoneyCents,
  formatWarehouseQuantity,
  getWarehouseStatusLabel,
  warehouseItemInclude
} from '@/lib/warehouse';
import { warehouseMovementInclude, type WarehouseMovementWithRelations } from '@/lib/warehouse-movement';
import { deleteWarehouseItemAction, mountOnVehicleAction } from '../actions';

function movementTypeLabel(type: string): string {
  if (type === 'LOAD') return 'Carico';
  if (type === 'UNLOAD') return 'Scarico / montaggio';
  return 'Rettifica';
}

function movementVehicleLabel(movement: WarehouseMovementWithRelations): string {
  if (movement.tractor) return `Trattore ${getVehicleLabel(movement.tractor)}`;
  if (movement.trailer) return `Semirimorchio ${getVehicleLabel(movement.trailer)}`;
  return '-';
}

function movementQuantityLabel(movement: WarehouseMovementWithRelations, unit: string): string {
  const sign = movement.type === 'LOAD' ? '+' : movement.type === 'UNLOAD' ? '−' : '±';
  return `${sign}${formatQuantityMilli(movement.quantityMilli)} ${unit}`;
}

type WarehouseDetailPageProps = {
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

export default async function WarehouseDetailPage({ params, searchParams }: WarehouseDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const item = await prisma.warehouseItem.findUnique({
    where: { id },
    include: warehouseItemInclude
  });
  if (!item) notFound();

  const [categories, suppliers, tractors, trailers, movements] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.supplier.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.tractor.findMany({ where: { active: true }, orderBy: { plate: 'asc' } }),
    prisma.trailer.findMany({ where: { active: true }, orderBy: { plate: 'asc' } }),
    prisma.warehouseMovement.findMany({
      where: { warehouseItemId: id },
      include: warehouseMovementInclude,
      orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }]
    })
  ]);
  const vehicleOptions = buildMaintenanceVehicleOptions(tractors, trailers);
  const newWarehouseParams = new URLSearchParams({
    categoryId: item.categoryId,
    unit: item.unit
  });
  if (item.supplierId) newWarehouseParams.set('supplierId', item.supplierId);
  const newWarehouseHref = `/warehouse/new?${newWarehouseParams.toString()}`;

  return (
    <>
      <PageHeader
        title={item.title}
        description={`${item.category.name} - ${formatWarehouseQuantity(item)}`}
        action={
          <div className="actions-row">
            {item.filePath ? (
              <Link className="secondary-button" href={`/api/warehouse/${item.id}/file`} target="_blank">
                <Download size={16} aria-hidden />
                Apri PDF
              </Link>
            ) : null}
            <Link className="primary-button" href={newWarehouseHref}>
              <Plus size={16} aria-hidden />
              Nuovo record
            </Link>
          </div>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <div className="grid two">
        <section className="detail-section">
          <h2>Scheda magazzino</h2>
          <div className="warehouse-focus">
            <span>Materiale</span>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Data carico</dt>
              <dd>{formatDate(item.stockedAt)}</dd>
            </div>
            <div>
              <dt>Categoria</dt>
              <dd>{item.category.name}</dd>
            </div>
            <div>
              <dt>Stato</dt>
              <dd>{getWarehouseStatusLabel(item.status)}</dd>
            </div>
            <div>
              <dt>Quantita</dt>
              <dd>{formatWarehouseQuantity(item)}</dd>
            </div>
            <div>
              <dt>Soglia minima</dt>
              <dd>{item.minimumQuantity !== null ? `${item.minimumQuantity.toLocaleString('it-IT')} ${item.unit}` : '-'}</dd>
            </div>
            <div>
              <dt>Ubicazione</dt>
              <dd>{item.location || '-'}</dd>
            </div>
            <div>
              <dt>Codice</dt>
              <dd>{item.code || '-'}</dd>
            </div>
            <div>
              <dt>Fornitore</dt>
              <dd>{item.supplier?.name || '-'}</dd>
            </div>
            <div>
              <dt>Documento</dt>
              <dd>{item.documentNumber || '-'}</dd>
            </div>
            <div>
              <dt>Data documento</dt>
              <dd>{formatDate(item.documentDate)}</dd>
            </div>
            <div>
              <dt>Importo</dt>
              <dd>{formatMoneyCents(item.amountCents)}</dd>
            </div>
            <div>
              <dt>File</dt>
              <dd>{item.originalFileName || 'PDF non ancora caricato'}</dd>
            </div>
            <div>
              <dt>Dimensione</dt>
              <dd>{formatFileSize(item.fileSize)}</dd>
            </div>
          </dl>
          {item.notes ? <p>{item.notes}</p> : null}
          <div className="record-actions">
            <form action={deleteWarehouseItemAction.bind(null, item.id)}>
              <ConfirmSubmitButton
                className="danger-button"
                message="Eliminare definitivamente questo record magazzino e il PDF collegato? Questa operazione non si puo annullare."
              >
                <Trash2 size={16} aria-hidden />
                Elimina record
              </ConfirmSubmitButton>
            </form>
          </div>
        </section>

        <section className="panel">
          <h2>Modifica record</h2>
          <WarehouseForm
            action={`/api/warehouse/${item.id}/update`}
            categories={buildWarehouseCategoryOptions(categories)}
            suppliers={buildWarehouseSupplierOptions(suppliers)}
            defaultValues={{
              title: item.title,
              categoryId: item.categoryId,
              status: item.status,
              stockedAt: toDateInputValue(item.stockedAt),
              documentDate: toDateInputValue(item.documentDate),
              supplierId: item.supplierId,
              documentNumber: item.documentNumber,
              code: item.code,
              quantity: item.quantity,
              unit: item.unit,
              minimumQuantity: item.minimumQuantity,
              location: item.location,
              amount: amountInputValue(item.amountCents),
              description: item.description,
              notes: item.notes
            }}
            fileLabel={item.filePath ? 'Sostituisci PDF' : 'Carica PDF opzionale'}
            showStatus
            submitLabel="Salva modifiche"
          />
        </section>
      </div>

      <div className="grid two" style={{ marginTop: 18 }}>
        <section className="panel">
          <h2>Monta su mezzo</h2>
          <p className="muted">
            Scarica una quantità dalla giacenza e attribuiscine il costo a una targa.
            {item.unitCostCents !== null ? ` Costo unitario stimato: ${formatEuroCents(item.unitCostCents)}.` : ''}
          </p>
          {vehicleOptions.length === 0 ? (
            <p className="form-error">Nessuna targa attiva disponibile.</p>
          ) : (
            <form action={mountOnVehicleAction.bind(null, item.id)} className="form-stack">
              <div className="form-grid">
                <label>
                  Mezzo
                  <select name="vehicleKey" defaultValue="" required>
                    <option value="">Seleziona targa</option>
                    {vehicleOptions.map((vehicle) => (
                      <option key={vehicle.value} value={vehicle.value}>
                        {vehicle.label}
                        {vehicle.active === false ? ' (non attivo)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantità
                  <input name="quantity" type="number" min={1} max={item.quantity} defaultValue={1} required />
                </label>
                <DatePartsInput label="Data" name="movementDate" defaultValue={toDateInputValue(new Date())} required />
              </div>
              <label>
                Note
                <input name="notes" placeholder="Es. sostituzione filtro olio" />
              </label>
              <button className="primary-button" type="submit" disabled={item.quantity <= 0}>
                <Truck size={16} aria-hidden />
                Monta sul mezzo
              </button>
            </form>
          )}
        </section>

        <section className="detail-section">
          <h2>Movimenti di magazzino</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Quantità</th>
                  <th>Mezzo</th>
                  <th>Valore</th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-state">
                      Nessun movimento registrato.
                    </td>
                  </tr>
                ) : (
                  movements.map((movement) => (
                    <tr key={movement.id}>
                      <td>{formatDate(movement.movementDate)}</td>
                      <td>{movementTypeLabel(movement.type)}</td>
                      <td>{movementQuantityLabel(movement, item.unit)}</td>
                      <td>{movementVehicleLabel(movement)}</td>
                      <td>{formatEuroCents(movement.amountCents)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
