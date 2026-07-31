import { requireUser } from '@/lib/auth';
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
  const [tractors, drivers, suppliers, cards, products] = await Promise.all([
    prisma.tractor.findMany({ include: { assignedDriver: true }, orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.fuelSupplier.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.fuelCard.findMany({
      include: { fuelSupplier: true, assignedTractor: true },
      orderBy: [{ active: 'desc' }, { fuelSupplier: { name: 'asc' } }, { cardNumber: 'asc' }]
    }),
    prisma.fuelProduct.findMany({ where: { active: true }, orderBy: [{ name: 'asc' }, { code: 'asc' }] })
  ]);
  const defaultProduct = products.find((product) => product.code === 'GLS') || products[0];

  return (
    <>
      <PageHeader
        title="Nuovo rifornimento"
        description="Inserimento manuale per scontrini non disponibili in tabulato PDF."
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
          tractors={tractors}
          drivers={drivers}
          suppliers={suppliers}
          cards={cards}
          products={products}
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
