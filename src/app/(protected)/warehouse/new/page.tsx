import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { WarehouseForm } from '@/components/WarehouseForm';
import { toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { buildWarehouseCategoryOptions, buildWarehouseSupplierOptions } from '@/lib/warehouse';

type NewWarehousePageProps = {
  searchParams: Promise<{
    error?: string;
    categoryId?: string;
    supplierId?: string;
    unit?: string;
  }>;
};

export default async function NewWarehousePage({ searchParams }: NewWarehousePageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [categories, suppliers] = await Promise.all([
    prisma.category.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  ]);
  const defaultCategoryId = categories.some((category) => category.id === resolvedSearchParams.categoryId)
    ? resolvedSearchParams.categoryId
    : categories[0]?.id;
  const defaultSupplierId = suppliers.some((supplier) => supplier.id === resolvedSearchParams.supplierId)
    ? resolvedSearchParams.supplierId
    : undefined;
  const defaultUnit = resolvedSearchParams.unit && resolvedSearchParams.unit.length <= 20 ? resolvedSearchParams.unit : 'pz';

  return (
    <>
      <PageHeader
        title="Nuovo record magazzino"
        description="Inserimento rapido di stock, ricambi e materiale con PDF opzionale."
        action={
          <Link className="secondary-button" href="/warehouse">
            <ArrowLeft size={16} aria-hidden />
            Torna al magazzino
          </Link>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="panel">
        <WarehouseForm
          action="/api/warehouse/create"
          categories={buildWarehouseCategoryOptions(categories)}
          suppliers={buildWarehouseSupplierOptions(suppliers)}
          defaultValues={{
            stockedAt: toDateInputValue(new Date()),
            categoryId: defaultCategoryId,
            supplierId: defaultSupplierId,
            quantity: 1,
            unit: defaultUnit
          }}
          submitLabel="Salva record"
        />
      </section>
    </>
  );
}
