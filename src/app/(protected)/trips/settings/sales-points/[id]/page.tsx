import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, Save } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { buildTripMapsHref } from '@/lib/trips';
import { updateSalesPointAction } from '../../../actions';

type SalesPointDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function SalesPointDetailPage({ params, searchParams }: SalesPointDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const salesPoint = await prisma.salesPoint.findUnique({
    where: { id },
    include: { _count: { select: { trips: true } } }
  });
  if (!salesPoint) notFound();
  const mapsHref = buildTripMapsHref(salesPoint);

  return (
    <>
      <PageHeader
        title={salesPoint.name}
        description={`${salesPoint._count.trips} viaggi collegati.`}
        action={
          <div className="actions-row">
            {mapsHref ? (
              <Link className="primary-button" href={mapsHref} target="_blank">
                <MapPin size={16} aria-hidden />
                Apri in Maps
              </Link>
            ) : null}
            <Link className="secondary-button" href="/trips/settings">
              <ArrowLeft size={16} aria-hidden />
              Anagrafiche viaggio
            </Link>
          </div>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="panel">
        <h2>Modifica punto vendita</h2>
        <form action={updateSalesPointAction.bind(null, salesPoint.id)} className="form-stack">
          <div className="form-grid">
            <label>
              Nome
              <input name="name" defaultValue={salesPoint.name} required />
            </label>
            <label>
              Codice impianto
              <input name="plantCode" defaultValue={salesPoint.plantCode || ''} />
            </label>
            <label>
              Localita
              <input name="city" defaultValue={salesPoint.city || ''} />
            </label>
            <label>
              Via / indirizzo
              <input name="address" defaultValue={salesPoint.address || ''} />
            </label>
            <label>
              CAP
              <input name="postalCode" defaultValue={salesPoint.postalCode || ''} />
            </label>
            <label>
              Provincia
              <input name="province" defaultValue={salesPoint.province || ''} />
            </label>
            <label>
              Nazione
              <input name="country" defaultValue={salesPoint.country || ''} />
            </label>
          </div>
          <label>
            Note
            <textarea name="notes" defaultValue={salesPoint.notes || ''} />
          </label>
          <label className="checkbox-row">
            <input name="active" type="checkbox" defaultChecked={salesPoint.active} />
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
