import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { deleteFuelProductAction, updateFuelProductAction } from '../../actions';

type FuelProductDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function FuelProductDetailPage({ params, searchParams }: FuelProductDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const product = await prisma.fuelProduct.findUnique({
    where: { id },
    include: { _count: { select: { entries: true } } }
  });
  if (!product) notFound();

  return (
    <>
      <PageHeader
        title={product.name}
        description={`${product.code} - ${product._count.entries} rifornimenti collegati`}
        action={
          <Link className="secondary-button" href="/fuel/settings">
            <ArrowLeft size={16} aria-hidden />
            Anagrafiche
          </Link>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="panel">
        <h2>Modifica prodotto</h2>
        <form action={updateFuelProductAction.bind(null, product.id)} className="form-stack">
          <div className="form-grid">
            <label>
              Codice
              <input name="code" defaultValue={product.code} required />
            </label>
            <label>
              Nome
              <input name="name" defaultValue={product.name} required />
            </label>
          </div>
          <label>
            Note
            <textarea name="notes" rows={3} defaultValue={product.notes || ''} />
          </label>
          <label className="checkbox-row">
            <input name="isFuel" type="checkbox" defaultChecked={product.isFuel} />
            A consumo (calcola €/km e consumo). Spuntato per gasolio, AdBlue, metano…; togli per servizi come autolavaggio o penali.
          </label>
          <label className="checkbox-row">
            <input name="active" type="checkbox" defaultChecked={product.active} />
            Attivo
          </label>
          <button className="primary-button" type="submit">
            <Save size={16} aria-hidden />
            Salva modifiche
          </button>
        </form>
        <div className="record-actions">
          <form action={deleteFuelProductAction.bind(null, product.id)}>
            <ConfirmSubmitButton
              className="danger-button"
              message={
                product._count.entries > 0
                  ? 'Questo prodotto ha rifornimenti collegati: verra disattivato e non proposto nei nuovi record. Continuare?'
                  : 'Eliminare definitivamente questo prodotto?'
              }
            >
              <Trash2 size={16} aria-hidden />
              {product._count.entries > 0 ? 'Rimuovi dai nuovi record' : 'Elimina prodotto'}
            </ConfirmSubmitButton>
          </form>
        </div>
      </section>
    </>
  );
}
