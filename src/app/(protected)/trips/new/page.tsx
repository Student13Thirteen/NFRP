import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { Settings2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { TripForm } from '@/components/TripForm';
import { toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  buildDriverOptions,
  buildLoadingBaseOptions,
  buildSalesPointOptions,
  buildTractorOptions,
  buildTrailerOptions,
  buildTripProductOptions
} from '@/lib/trips';
import { createTripAction } from '../actions';

type NewTripPageProps = {
  searchParams: Promise<{
    error?: string;
    loadingBaseId?: string;
    salesPointId?: string | string[];
    productId?: string | string[];
    liters?: string | string[];
    driverId?: string;
    tractorId?: string;
    trailerId?: string;
    customerName?: string;
    carrierName?: string;
  }>;
};

function asArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parseDefaultLiters(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function NewTripPage({ searchParams }: NewTripPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [loadingBases, salesPoints, products, drivers, tractors, trailers] = await Promise.all([
    prisma.loadingBase.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.salesPoint.findMany({ where: { active: true }, orderBy: [{ name: 'asc' }, { plantCode: 'asc' }] }),
    prisma.tripProduct.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.driver.findMany({ where: { active: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractor.findMany({ where: { active: true }, orderBy: { plate: 'asc' } }),
    prisma.trailer.findMany({ where: { active: true }, orderBy: { plate: 'asc' } })
  ]);

  const missingTripRegistry = loadingBases.length === 0 || salesPoints.length === 0 || products.length === 0;
  const defaultLoadingBaseId = loadingBases.some((option) => option.id === resolvedSearchParams.loadingBaseId)
    ? resolvedSearchParams.loadingBaseId
    : undefined;
  const defaultSalesPointId = salesPoints.some((option) => option.id === resolvedSearchParams.salesPointId)
    ? (resolvedSearchParams.salesPointId as string)
    : undefined;
  const defaultSalesPointIds = asArray(resolvedSearchParams.salesPointId);
  const defaultProductIds = asArray(resolvedSearchParams.productId);
  const defaultLitersValues = asArray(resolvedSearchParams.liters);
  const defaultLineCount = Math.max(defaultSalesPointIds.length, defaultProductIds.length, defaultLitersValues.length);
  const defaultProductLines = Array.from({ length: defaultLineCount }, (_, index) => {
    const salesPointId = defaultSalesPointIds[index];
    const productId = defaultProductIds[index];
    const hasSalesPoint = salesPoints.some((option) => option.id === salesPointId);
    const hasProduct = products.some((option) => option.id === productId);

    return hasSalesPoint || hasProduct
      ? {
          salesPointId: hasSalesPoint ? salesPointId : null,
          productId: hasProduct ? productId : null,
          liters: parseDefaultLiters(defaultLitersValues[index])
        }
      : null;
  }).filter((line): line is { salesPointId: string | null; productId: string | null; liters: number | null } => Boolean(line));
  const defaultDriverId = drivers.some((option) => option.id === resolvedSearchParams.driverId)
    ? resolvedSearchParams.driverId
    : undefined;
  const defaultTractorId = tractors.some((option) => option.id === resolvedSearchParams.tractorId)
    ? resolvedSearchParams.tractorId
    : undefined;
  const defaultTrailerId = trailers.some((option) => option.id === resolvedSearchParams.trailerId)
    ? resolvedSearchParams.trailerId
    : undefined;

  return (
    <>
      <PageHeader
        title="Nuovo viaggio"
        description="Crea il viaggio e genera il PDF A4 per l'autista."
        action={
          <Link className="secondary-button" href="/trips/settings">
            <Settings2 size={16} aria-hidden />
            Anagrafiche viaggio
          </Link>
        }
      />

      <section className="panel">
        {resolvedSearchParams.error ? <p className="form-error">{resolvedSearchParams.error}</p> : null}
        {missingTripRegistry ? (
          <p className="form-error">
            Inserisci almeno una base di carico, un punto vendita e un prodotto prima di creare un viaggio.
          </p>
        ) : null}
        <TripForm
          action={createTripAction}
          loadingBases={buildLoadingBaseOptions(loadingBases)}
          salesPoints={buildSalesPointOptions(salesPoints)}
          drivers={buildDriverOptions(drivers)}
          tractors={buildTractorOptions(tractors)}
          trailers={buildTrailerOptions(trailers)}
          products={buildTripProductOptions(products)}
          defaultValues={{
            tripDate: toDateInputValue(new Date()),
            sequenceNumber: 1,
            loadingBaseId: defaultLoadingBaseId,
            salesPointId: defaultSalesPointId,
            productLines: defaultProductLines.length > 0 ? defaultProductLines : undefined,
            driverId: defaultDriverId,
            tractorId: defaultTractorId,
            trailerId: defaultTrailerId,
            customerName: resolvedSearchParams.customerName,
            carrierName: resolvedSearchParams.carrierName
          }}
          submitLabel="Salva viaggio"
          disabled={missingTripRegistry}
        />
      </section>
    </>
  );
}
