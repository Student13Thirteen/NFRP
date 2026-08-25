import { requireUser } from '@/lib/auth';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { FuelEntryForm } from '@/components/FuelEntryForm';
import { PageHeader } from '@/components/PageHeader';
import { toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';

type FuelNewPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function FuelNewPage({ searchParams }: FuelNewPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [tractors, drivers, suppliers, cards, products, driverAssignments, vehicleOwners] = await Promise.all([
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.fuelSupplier.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.fuelCard.findMany({
      include: { fuelSupplier: true, assignedTractor: true },
      orderBy: [{ active: 'desc' }, { fuelSupplier: { name: 'asc' } }, { cardNumber: 'asc' }]
    }),
    prisma.fuelProduct.findMany({ where: { active: true }, orderBy: [{ name: 'asc' }, { code: 'asc' }] }),
    prisma.tractorDriverAssignment.findMany({
      include: { driver: { select: { firstName: true, lastName: true } } },
      orderBy: { validFrom: 'desc' }
    }),
    prisma.vehicleOwner.findMany({
      select: { id: true, name: true, active: true },
      orderBy: [{ active: 'desc' }, { name: 'asc' }]
    })
  ]);
  const defaultProduct = products.find((product) => product.code === 'GLS') || products[0];

  return (
    <>
      <PageHeader
        title="Nuovo rifornimento"
        description="Inserimento manuale per scontrini non disponibili in tabulato PDF, anche per mezzi non aziendali."
        action={
          <Link className="secondary-button" href="/fuel">
            Rifornimenti
          </Link>
        }
      />

      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="panel">
        <FuelEntryForm
          action="/api/fuel/create"
          submissionKey={randomUUID()}
          recoveryKey="fuel:new"
          recoverOnError={Boolean(resolvedSearchParams.error)}
          tractors={tractors}
          drivers={drivers}
          suppliers={suppliers}
          cards={cards}
          products={products}
          vehicleOwners={vehicleOwners}
          driverAssignments={driverAssignments.map((assignment) => ({
            ...assignment,
            validFrom: toDateInputValue(assignment.validFrom),
            validTo: assignment.validTo ? toDateInputValue(assignment.validTo) : null
          }))}
          submitLabel="Salva rifornimento"
          defaultValues={{
            fuelDate: toDateInputValue(new Date()),
            fuelProductId: defaultProduct?.id || ''
          }}
        />
      </section>
    </>
  );
}
