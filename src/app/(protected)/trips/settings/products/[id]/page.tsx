import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { updateTripProductAction } from '../../../actions';

type TripProductDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function TripProductDetailPage({ params, searchParams }: TripProductDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const product = await prisma.tripProduct.findUnique({
    where: { id },
    include: { _count: { select: { tripLines: true } } }
  });
  if (!product) notFound();

  return (
    <>
      <PageHeader
        title={product.name}
        description={`${product._count.tripLines} righe prodotto collegate.`}
        action={
          <Link className="secondary-button" href="/trips/settings">
            <ArrowLeft size={16} aria-hidden />
            Basi, punti vendita e prodotti
          </Link>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="panel">
        <h2>Modifica prodotto</h2>
        <form action={updateTripProductAction.bind(null, product.id)} className="form-stack">
          <div className="form-grid">
            <label>
              Nome
              <input name="name" defaultValue={product.name} required />
            </label>
            <label>
              Unita
              <input name="unitLabel" defaultValue={product.unitLabel} required />
            </label>
          </div>
          <label>
            Note
            <textarea name="notes" defaultValue={product.notes || ''} />
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
      </section>
    </>
  );
}
