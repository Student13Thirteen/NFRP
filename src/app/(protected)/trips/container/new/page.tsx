import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ContainerTripForm } from '@/components/ContainerTripForm';
import { PageHeader } from '@/components/PageHeader';
import { toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { buildContainerTripFormSuggestions } from '@/lib/container-trips';
import { buildCustomerOptions, buildDriverOptions, buildTractorOptions, buildTrailerOptions } from '@/lib/trips';
import { createContainerTripAction } from '../actions';

type Props = { searchParams: Promise<{ error?: string }> };

export default async function NewContainerTripPage({ searchParams }: Props) {
  await requireUser();
  const params = await searchParams;
  const [drivers, tractors, trailers, customers, vehicleOwners, previousTrips, importedWaybills] = await Promise.all([
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.trailer.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.customer.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.vehicleOwner.findMany({
      select: { id: true, name: true, active: true },
      orderBy: [{ active: 'desc' }, { name: 'asc' }]
    }),
    prisma.containerTrip.findMany({
      select: {
        loadingTerminalName: true,
        deliveryTerminalName: true,
        returnBaseName: true,
        carrierName: true,
        stops: { select: { name: true } }
      },
      orderBy: { tripDate: 'desc' },
      take: 300
    }),
    prisma.tripImportRow.findMany({
      select: {
        loadingBaseName: true,
        loadingTerminalName: true,
        deliveryTerminalName: true,
        deliveryName: true,
        carrierName: true
      },
      orderBy: { createdAt: 'desc' },
      take: 300
    })
  ]);
  const suggestions = buildContainerTripFormSuggestions({ trips: previousTrips, importRows: importedWaybills });

  return (
    <>
      <PageHeader
        title="Nuovo trasporto container"
        description="Segui il foglio operativo: scegli anagrafiche, percorso e container; km reali, scostamenti ed euro/km vengono calcolati automaticamente."
        action={<Link className="secondary-button" href="/trips/container">Trasporti container</Link>}
      />
      {params.error ? <p className="form-error" style={{ marginBottom: 18 }}>{params.error}</p> : null}
      <section className="panel">
        <ContainerTripForm
          action={createContainerTripAction}
          recoveryKey="container-trip:new"
          recoverOnError={Boolean(params.error)}
          drivers={buildDriverOptions(drivers)}
          tractors={buildTractorOptions(tractors)}
          trailers={buildTrailerOptions(trailers)}
          customers={buildCustomerOptions(customers)}
          vehicleOwners={vehicleOwners}
          suggestions={suggestions}
          defaultValues={{ tripDate: toDateInputValue(new Date()) }}
          submitLabel="Crea trasporto container"
        />
      </section>
    </>
  );
}
