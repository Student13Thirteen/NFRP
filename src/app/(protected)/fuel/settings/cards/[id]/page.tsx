import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { getVehicleLabel } from '@/lib/trips';
import { deleteFuelCardAction, updateFuelCardAction } from '../../actions';

type FuelCardDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function FuelCardDetailPage({ params, searchParams }: FuelCardDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const [card, suppliers, tractors] = await Promise.all([
    prisma.fuelCard.findUnique({
      where: { id },
      include: { fuelSupplier: true, assignedTractor: true, _count: { select: { entries: true } } }
    }),
    prisma.fuelSupplier.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] })
  ]);
  if (!card) notFound();

  return (
    <>
      <PageHeader
        title={card.cardNumber}
        description={`${card.fuelSupplier?.name || 'Senza distributore'} - ${card._count.entries} rifornimenti collegati`}
        action={
          <Link className="secondary-button" href="/fuel/settings">
            <ArrowLeft size={16} aria-hidden />
            Anagrafiche
          </Link>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="panel">
        <h2>Modifica tessera</h2>
        <form action={updateFuelCardAction.bind(null, card.id)} className="form-stack">
          <div className="form-grid">
            <label>
              Numero tessera
              <input name="cardNumber" defaultValue={card.cardNumber} required />
            </label>
            <label>
              Etichetta
              <input name="label" defaultValue={card.label || ''} />
            </label>
            <label>
              Distributore
              <select name="fuelSupplierId" defaultValue={card.fuelSupplierId || ''}>
                <option value="">Nessuno</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                    {supplier.active ? '' : ' (non attivo)'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trattore associato
              <select name="assignedTractorId" defaultValue={card.assignedTractorId || ''}>
                <option value="">Nessuno</option>
                {tractors.map((tractor) => (
                  <option key={tractor.id} value={tractor.id}>
                    {getVehicleLabel(tractor)}
                    {tractor.active ? '' : ' (non attivo)'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Note
            <textarea name="notes" rows={3} defaultValue={card.notes || ''} />
          </label>
          <label className="checkbox-row">
            <input name="active" type="checkbox" defaultChecked={card.active} />
            Attiva
          </label>
          <button className="primary-button" type="submit">
            <Save size={16} aria-hidden />
            Salva modifiche
          </button>
        </form>
        <div className="record-actions">
          <form action={deleteFuelCardAction.bind(null, card.id)}>
            <ConfirmSubmitButton
              className="danger-button"
              message="Eliminare questa tessera? I rifornimenti collegati restano disponibili con il numero tessera salvato nel record."
            >
              <Trash2 size={16} aria-hidden />
              Elimina tessera
            </ConfirmSubmitButton>
          </form>
        </div>
      </section>
    </>
  );
}
