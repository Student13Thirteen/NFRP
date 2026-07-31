import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { deleteFuelSupplierAction, updateFuelSupplierAction } from '../../actions';

type FuelSupplierDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function FuelSupplierDetailPage({ params, searchParams }: FuelSupplierDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const supplier = await prisma.fuelSupplier.findUnique({
    where: { id },
    include: { _count: { select: { cards: true, entries: true, batches: true } } }
  });
  if (!supplier) notFound();

  return (
    <>
      <PageHeader
        title={supplier.name}
        description={`${supplier._count.cards} tessere, ${supplier._count.entries} rifornimenti, ${supplier._count.batches} import PDF`}
        action={
          <Link className="secondary-button" href="/fuel/settings">
            <ArrowLeft size={16} aria-hidden />
            Anagrafiche
          </Link>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="panel">
        <h2>Modifica distributore</h2>
        <form action={updateFuelSupplierAction.bind(null, supplier.id)} className="form-stack">
          <label>
            Nome
            <input name="name" defaultValue={supplier.name} required />
          </label>
          <label>
            Note
            <textarea name="notes" rows={4} defaultValue={supplier.notes || ''} />
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
          <form action={deleteFuelSupplierAction.bind(null, supplier.id)}>
            <ConfirmSubmitButton
              className="danger-button"
              message="Eliminare questo distributore? Tessere e rifornimenti collegati resteranno disponibili senza distributore associato."
            >
              <Trash2 size={16} aria-hidden />
              Elimina distributore
            </ConfirmSubmitButton>
          </form>
        </div>
      </section>
    </>
  );
}
