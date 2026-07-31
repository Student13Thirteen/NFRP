import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, Save } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { buildTripMapsHref } from '@/lib/trips';
import { updateLoadingBaseAction } from '../../../actions';

type LoadingBaseDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function LoadingBaseDetailPage({ params, searchParams }: LoadingBaseDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const loadingBase = await prisma.loadingBase.findUnique({
    where: { id },
    include: { _count: { select: { trips: true } } }
  });
  if (!loadingBase) notFound();
  const mapsHref = buildTripMapsHref(loadingBase);

  return (
    <>
      <PageHeader
        title={loadingBase.name}
        description={`${loadingBase._count.trips} viaggi collegati.`}
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
        <h2>Modifica base di carico</h2>
        <form action={updateLoadingBaseAction.bind(null, loadingBase.id)} className="form-stack">
          <div className="form-grid">
            <label>
              Nome
              <input name="name" defaultValue={loadingBase.name} required />
            </label>
            <label>
              Via / indirizzo
              <input name="address" defaultValue={loadingBase.address || ''} />
            </label>
            <label>
              CAP
              <input name="postalCode" defaultValue={loadingBase.postalCode || ''} />
            </label>
            <label>
              Citta
              <input name="city" defaultValue={loadingBase.city || ''} />
            </label>
            <label>
              Provincia
              <input name="province" defaultValue={loadingBase.province || ''} />
            </label>
            <label>
              Nazione
              <input name="country" defaultValue={loadingBase.country || ''} />
            </label>
          </div>
          <label>
            Note
            <textarea name="notes" defaultValue={loadingBase.notes || ''} />
          </label>
          <label className="checkbox-row">
            <input name="active" type="checkbox" defaultChecked={loadingBase.active} />
            Attiva
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
