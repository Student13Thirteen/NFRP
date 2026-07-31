import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, Receipt, Settings2 } from 'lucide-react';
import { MaintenanceForm } from '@/components/MaintenanceForm';
import { PageHeader } from '@/components/PageHeader';
import { toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  buildMaintenanceCategoryOptions,
  buildMaintenanceDriverOptions,
  buildMaintenanceSupplierOptions,
  buildMaintenanceVehicleOptions
} from '@/lib/maintenance';
import { MaintenanceStatus } from '@prisma/client';

type NewMaintenancePageProps = {
  searchParams: Promise<{
    error?: string;
    categoryId?: string;
    supplierId?: string;
    driverId?: string;
    vehicleKey?: string;
  }>;
};

export default async function NewMaintenancePage({ searchParams }: NewMaintenancePageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [categories, suppliers, drivers, tractors, trailers] = await Promise.all([
    prisma.category.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.driver.findMany({ where: { active: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractor.findMany({ where: { active: true }, orderBy: { plate: 'asc' } }),
    prisma.trailer.findMany({ where: { active: true }, orderBy: { plate: 'asc' } })
  ]);
  const missingRegistry = categories.length === 0;
  const vehicleOptions = buildMaintenanceVehicleOptions(tractors, trailers);
  const defaultCategoryId = categories.some((category) => category.id === resolvedSearchParams.categoryId)
    ? resolvedSearchParams.categoryId
    : categories[0]?.id;
  const defaultSupplierId = suppliers.some((supplier) => supplier.id === resolvedSearchParams.supplierId)
    ? resolvedSearchParams.supplierId
    : undefined;
  const defaultDriverId = drivers.some((driver) => driver.id === resolvedSearchParams.driverId)
    ? resolvedSearchParams.driverId
    : undefined;
  const defaultVehicleKey = vehicleOptions.some((vehicle) => vehicle.value === resolvedSearchParams.vehicleKey)
    ? resolvedSearchParams.vehicleKey
    : undefined;

  return (
    <>
      <PageHeader
        title="Nuova scheda intervento"
        description="Inserimento rapido per una manutenzione senza righe contabili."
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/maintenances">
              <ArrowLeft size={16} aria-hidden />
              Torna alla lista
            </Link>
            <Link className="primary-button" href="/maintenances/expenses/new">
              <Receipt size={16} aria-hidden />
              Fattura/DDT multi-riga
            </Link>
            <Link className="secondary-button" href="/maintenances/settings">
              <Settings2 size={16} aria-hidden />
              Anagrafiche manutenzioni
            </Link>
          </div>
        }
      />

      <section className="panel">
        {resolvedSearchParams.error ? <p className="form-error">{resolvedSearchParams.error}</p> : null}
        {missingRegistry ? (
          <p className="form-error">Inserisci almeno una categoria manutenzione prima di creare una scheda.</p>
        ) : null}
        <div className="mode-banner">
          <Receipt size={18} aria-hidden />
          <div>
            <strong>Per fatture, DDT o ricambi con più righe usa il documento di spesa.</strong>
            <span>Qui salvi solo una scheda semplice con un importo unico.</span>
          </div>
          <Link className="secondary-button compact-button" href="/maintenances/expenses/new">
            Apri multi-riga
          </Link>
        </div>
        <MaintenanceForm
          action="/api/maintenances/create"
          categories={buildMaintenanceCategoryOptions(categories)}
          suppliers={buildMaintenanceSupplierOptions(suppliers)}
          drivers={buildMaintenanceDriverOptions(drivers)}
          vehicles={vehicleOptions}
          defaultValues={{
            maintenanceDate: toDateInputValue(new Date()),
            status: MaintenanceStatus.COMPLETED,
            categoryId: defaultCategoryId,
            supplierId: defaultSupplierId,
            driverId: defaultDriverId,
            vehicleKey: defaultVehicleKey
          }}
          submitLabel="Salva manutenzione"
          disabled={missingRegistry}
        />
      </section>
    </>
  );
}
