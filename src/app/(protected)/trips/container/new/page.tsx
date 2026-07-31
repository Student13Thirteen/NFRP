import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ContainerTripForm } from '@/components/ContainerTripForm';
import { PageHeader } from '@/components/PageHeader';
import { toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { buildDriverOptions, buildTractorOptions, buildTrailerOptions } from '@/lib/trips';
import { createContainerTripAction } from '../actions';

type Props = { searchParams: Promise<{ error?: string }> };

export default async function NewContainerTripPage({ searchParams }: Props) {
  await requireUser();
  const params = await searchParams;
  const [drivers, tractors, trailers] = await Promise.all([
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.trailer.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] })
  ]);

  return (
    <>
      <PageHeader
        title="Nuovo trasporto container"
        description="Inserisci subito i dati disponibili; chilometri finali ed extra possono arrivare dopo dall'autista."
        action={<Link className="secondary-button" href="/trips/container">Trasporti container</Link>}
      />
      {params.error ? <p className="form-error" style={{ marginBottom: 18 }}>{params.error}</p> : null}
      <section className="panel">
        <ContainerTripForm
          action={createContainerTripAction}
          drivers={buildDriverOptions(drivers)}
          tractors={buildTractorOptions(tractors)}
          trailers={buildTrailerOptions(trailers)}
          defaultValues={{ tripDate: toDateInputValue(new Date()) }}
          submitLabel="Crea trasporto container"
        />
      </section>
    </>
  );
}
