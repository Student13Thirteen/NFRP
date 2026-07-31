import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, Save, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { buildSupplierMapsHref } from '@/lib/suppliers';
import { deleteWarehouseSupplierAction, updateWarehouseSupplierAction } from '../../../actions';

type WarehouseSupplierDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function WarehouseSupplierDetailPage({ params, searchParams }: WarehouseSupplierDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: { _count: { select: { maintenances: true, warehouseItems: true } } }
  });
  if (!supplier) notFound();
  const mapsHref = buildSupplierMapsHref(supplier);

  return (
    <>
      <PageHeader
        title={supplier.name}
        description={`${supplier._count.maintenances} manutenzioni, ${supplier._count.warehouseItems} record magazzino collegati.`}
        action={
          <div className="actions-row">
            {mapsHref ? (
              <Link className="primary-button" href={mapsHref} target="_blank">
                <MapPin size={16} aria-hidden />
                Apri in Maps
              </Link>
            ) : null}
            <Link className="secondary-button" href="/warehouse/settings">
              <ArrowLeft size={16} aria-hidden />
              Anagrafiche magazzino
            </Link>
          </div>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="panel">
        <h2>Modifica fornitore</h2>
        <form action={updateWarehouseSupplierAction.bind(null, supplier.id)} className="form-stack">
          <div className="form-grid">
            <label>
              Nome fornitore
              <input name="name" defaultValue={supplier.name} required />
            </label>
            <label>
              Telefono
              <input name="phone" defaultValue={supplier.phone || ''} />
            </label>
            <label>
              Email
              <input name="email" type="email" defaultValue={supplier.email || ''} />
            </label>
            <label>
              Via / indirizzo
              <input name="address" defaultValue={supplier.address || ''} />
            </label>
            <label>
              CAP
              <input name="postalCode" defaultValue={supplier.postalCode || ''} />
            </label>
            <label>
              Citta
              <input name="city" defaultValue={supplier.city || ''} />
            </label>
            <label>
              Provincia
              <input name="province" defaultValue={supplier.province || ''} />
            </label>
            <label>
              Nazione
              <input name="country" defaultValue={supplier.country || ''} />
            </label>
          </div>
          <label>
            Note
            <textarea name="notes" rows={3} defaultValue={supplier.notes || ''} />
          </label>
          <label className="checkbox-row">
            <input name="active" type="checkbox" defaultChecked={supplier.active} />
            Attivo
          </label>
          <button className="primary-button" type="submit">
            <Save size={16} aria-hidden />
            Salva modifiche
          </button>
        </form>
        <div className="record-actions">
          <form action={deleteWarehouseSupplierAction.bind(null, supplier.id)}>
            <ConfirmSubmitButton
              className="danger-button"
              message="Eliminare questo fornitore? Le manutenzioni e i record magazzino collegati resteranno senza fornitore associato."
            >
              <Trash2 size={16} aria-hidden />
              Elimina fornitore
            </ConfirmSubmitButton>
          </form>
        </div>
      </section>
    </>
  );
}
