import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { filterFuelEntries, type FuelSearchParams } from '@/lib/fuel-filters';
import {
  formatFuelCostPerKm,
  formatFuelLiters,
  formatFuelMoney,
  formatFuelPrice,
  fuelEntryInclude,
  getFuelDriverLabel,
  getFuelEntryStatusLabel
} from '@/lib/fuel';
import { isDefaultFuelProductCode } from '@/lib/fuel-parser';
import { generateReportPdf } from '@/lib/report-pdf';

export const dynamic = 'force-dynamic';

function safeParams(request: NextRequest): FuelSearchParams {
  return Object.fromEntries(request.nextUrl.searchParams.entries()) as FuelSearchParams;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response('Non autorizzato.', { status: 401 });

  const params = safeParams(request);
  const [entries, tractors, drivers, suppliers, cards, products] = await Promise.all([
    prisma.fuelEntry.findMany({
      include: fuelEntryInclude,
      orderBy: [{ fuelDate: 'desc' }, { fuelTime: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.tractor.findMany({ select: { id: true, plate: true } }),
    prisma.driver.findMany({ select: { id: true, firstName: true, lastName: true } }),
    prisma.fuelSupplier.findMany({ select: { id: true, name: true } }),
    prisma.fuelCard.findMany({ select: { id: true, cardNumber: true } }),
    prisma.fuelProduct.findMany({ select: { id: true, code: true, name: true } })
  ]);

  const product = products.find((item) => item.id === params.fuelProductId) || products.find((item) => item.code === params.productCode);
  const normalized: FuelSearchParams = {
    ...params,
    tractorId: tractors.some((item) => item.id === params.tractorId) ? params.tractorId : '',
    driverId: drivers.some((item) => item.id === params.driverId) ? params.driverId : '',
    fuelSupplierId: suppliers.some((item) => item.id === params.fuelSupplierId) ? params.fuelSupplierId : '',
    fuelCardId: cards.some((item) => item.id === params.fuelCardId) ? params.fuelCardId : '',
    fuelProductId: product?.id || '',
    productCode: product?.code || '',
    review: ['needs_review', 'verified', 'ok'].includes(params.review || '') ? params.review : ''
  };
  const filtered = filterFuelEntries(entries, normalized);
  const totalCents = filtered.reduce((sum, entry) => sum + entry.totalAmountCents, 0);
  const totalLitersMilli = filtered.reduce((sum, entry) => sum + entry.volumeLitersMilli, 0);
  const validKm = filtered.reduce(
    (sum, entry) => entry.kmDelta && entry.status !== 'NEEDS_REVIEW' && isDefaultFuelProductCode(entry.productCode) ? sum + entry.kmDelta : sum,
    0
  );
  const amountWithKm = filtered.reduce(
    (sum, entry) => entry.kmDelta && entry.status !== 'NEEDS_REVIEW' && isDefaultFuelProductCode(entry.productCode) ? sum + entry.totalAmountCents : sum,
    0
  );
  const reviewCount = filtered.filter((entry) => entry.status === 'NEEDS_REVIEW').length;
  const filters = [
    params.q ? `Ricerca: ${params.q}` : '',
    params.fromYear ? `Da: ${[params.fromDay, params.fromMonth, params.fromYear].filter(Boolean).join('/')}` : '',
    params.toYear ? `A: ${[params.toDay, params.toMonth, params.toYear].filter(Boolean).join('/')}` : '',
    tractors.find((item) => item.id === normalized.tractorId)?.plate ? `Targa: ${tractors.find((item) => item.id === normalized.tractorId)?.plate}` : '',
    drivers.find((item) => item.id === normalized.driverId) ? `Autista: ${drivers.find((item) => item.id === normalized.driverId)?.lastName}` : '',
    suppliers.find((item) => item.id === normalized.fuelSupplierId)?.name ? `Distributore: ${suppliers.find((item) => item.id === normalized.fuelSupplierId)?.name}` : '',
    product ? `Prodotto: ${product.name}` : '',
    normalized.review ? `Stato: ${normalized.review}` : ''
  ].filter(Boolean);

  const pdf = generateReportPdf({
    title: 'Report rifornimenti',
    subtitle: 'Riepilogo gestionale carburanti e consumi della flotta',
    filters: filters.length ? filters : ['Tutti i rifornimenti confermati'],
    metrics: [
      { label: 'Costo totale', value: formatFuelMoney(totalCents) },
      { label: 'Litri', value: `${formatFuelLiters(totalLitersMilli)} L` },
      { label: 'Km calcolati', value: validKm.toLocaleString('it-IT') },
      { label: 'Costo medio', value: validKm > 0 ? formatFuelCostPerKm(Math.round((amountWithKm * 10) / validKm)) : '-' },
      { label: 'Da verificare', value: String(reviewCount) }
    ],
    columns: [
      { key: 'date', label: 'Data', weight: 0.8 },
      { key: 'plate', label: 'Targa', weight: 0.72 },
      { key: 'driver', label: 'Autista', weight: 1.18 },
      { key: 'product', label: 'Prodotto', weight: 1.05 },
      { key: 'odometer', label: 'Km mezzo', weight: 0.75, align: 'right' },
      { key: 'delta', label: 'Delta km', weight: 0.68, align: 'right' },
      { key: 'liters', label: 'Litri', weight: 0.75, align: 'right' },
      { key: 'price', label: 'Prezzo', weight: 0.85, align: 'right' },
      { key: 'cost', label: 'Costo', weight: 0.9, align: 'right' },
      { key: 'status', label: 'Stato', weight: 0.9 }
    ],
    rows: filtered.map((entry) => ({
      date: formatDate(entry.fuelDate),
      plate: entry.plate,
      driver: getFuelDriverLabel(entry),
      product: entry.fuelProduct?.name || entry.productName || entry.productCode,
      odometer: entry.odometerKm?.toLocaleString('it-IT') || '-',
      delta: entry.kmDelta?.toLocaleString('it-IT') || '-',
      liters: formatFuelLiters(entry.volumeLitersMilli),
      price: formatFuelPrice(entry.finalPricePerLiterMilliEuro),
      cost: formatFuelMoney(entry.totalAmountCents),
      status: getFuelEntryStatusLabel(entry.status)
    }))
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="nfrp-rifornimenti-${date}.pdf"`,
      'Cache-Control': 'private, no-store'
    }
  });
}
