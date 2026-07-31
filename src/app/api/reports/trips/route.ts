import { TripStatus } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { generateReportPdf } from '@/lib/report-pdf';
import {
  formatTripMoney,
  formatTripTotalLoadQuantity,
  getDriverLabel,
  getTripBillingStatusLabel,
  getTripMarginCents,
  getTripSalesPointSummary,
  getTripStatusLabel,
  getTripTotalCostCents,
  tripInclude,
  tripMatchesSearch
} from '@/lib/trips';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response('Non autorizzato.', { status: 401 });

  const q = request.nextUrl.searchParams.get('q') || '';
  const rawStatus = request.nextUrl.searchParams.get('status') || '';
  const status = Object.values(TripStatus).includes(rawStatus as TripStatus) ? rawStatus as TripStatus : null;
  const trips = await prisma.trip.findMany({
    include: tripInclude,
    orderBy: [{ tripDate: 'desc' }, { tripNumber: 'desc' }]
  });
  const filtered = trips.filter((trip) => (!status || trip.status === status) && tripMatchesSearch(trip, q));
  const active = filtered.filter((trip) => trip.status !== TripStatus.CANCELLED);
  const revenue = active.reduce((sum, trip) => sum + (trip.freightRevenueCents || 0), 0);
  const costs = active.reduce((sum, trip) => sum + getTripTotalCostCents(trip), 0);
  const toBill = active.filter((trip) => trip.billingStatus === 'TO_BILL').length;
  const filters = [q ? `Ricerca: ${q}` : '', status ? `Stato: ${getTripStatusLabel(status)}` : ''].filter(Boolean);

  const pdf = generateReportPdf({
    title: 'Report viaggi',
    subtitle: 'Prospetto operativo ed economico dei viaggi',
    filters: filters.length ? filters : ['Tutti i viaggi'],
    metrics: [
      { label: 'Viaggi', value: String(filtered.length) },
      { label: 'Ricavi', value: formatTripMoney(revenue) },
      { label: 'Costi viaggio', value: formatTripMoney(costs) },
      { label: 'Margine', value: formatTripMoney(revenue - costs) },
      { label: 'Da fatturare', value: String(toBill) }
    ],
    columns: [
      { key: 'number', label: 'N.', weight: 0.4 },
      { key: 'date', label: 'Data', weight: 0.7 },
      { key: 'customer', label: 'Cliente', weight: 1.25 },
      { key: 'destination', label: 'Destinazione', weight: 1.65 },
      { key: 'plate', label: 'Targa', weight: 0.7 },
      { key: 'driver', label: 'Autista', weight: 1.05 },
      { key: 'load', label: 'Carico', weight: 0.82 },
      { key: 'billing', label: 'Fatturazione', weight: 0.88 },
      { key: 'invoice', label: 'Fattura', weight: 0.78 },
      { key: 'revenue', label: 'Ricavo', weight: 0.78, align: 'right' },
      { key: 'costs', label: 'Costi', weight: 0.78, align: 'right' },
      { key: 'margin', label: 'Margine', weight: 0.8, align: 'right' },
      { key: 'status', label: 'Stato', weight: 0.8 }
    ],
    rows: filtered.map((trip) => ({
      number: String(trip.tripNumber),
      date: formatDate(trip.tripDate),
      customer: trip.customerName || trip.customer?.name || '-',
      destination: getTripSalesPointSummary(trip),
      plate: trip.tractor?.plate || '-',
      driver: getDriverLabel(trip.driver),
      load: formatTripTotalLoadQuantity(trip),
      billing: getTripBillingStatusLabel(trip.billingStatus),
      invoice: trip.invoiceNumber || '-',
      revenue: formatTripMoney(trip.freightRevenueCents),
      costs: formatTripMoney(getTripTotalCostCents(trip)),
      margin: formatTripMoney(getTripMarginCents(trip)),
      status: getTripStatusLabel(trip.status)
    }))
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="nfrp-viaggi-${date}.pdf"`,
      'Cache-Control': 'private, no-store'
    }
  });
}
