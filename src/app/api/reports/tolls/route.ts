import { TollEntryStatus } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { parseFilterDateParts, type DateFilterSearchParams } from '@/lib/date-filters';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { generateReportPdf } from '@/lib/report-pdf';
import {
  formatTollDistance,
  formatTollMoney,
  getTollEntryStatusLabel,
  tollEntryInclude,
  tollEntryMatchesSearch
} from '@/lib/tolls';

export const dynamic = 'force-dynamic';

type TollReportParams = DateFilterSearchParams & {
  batchId?: string;
  cardId?: string;
  q?: string;
  status?: string;
  tractorId?: string;
};

function addUtcDay(date: Date): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response('Non autorizzato.', { status: 401 });

  const params = Object.fromEntries(request.nextUrl.searchParams.entries()) as TollReportParams;
  const selectedBatch = params.batchId
    ? await prisma.tollImportBatch.findUnique({ where: { id: params.batchId } })
    : null;
  if (params.batchId && !selectedBatch) return new Response('File autostrade non trovato.', { status: 404 });
  const [entries, tractors, cards] = await Promise.all([
    prisma.tollEntry.findMany({
      where: selectedBatch ? { importBatchId: selectedBatch.id } : undefined,
      include: tollEntryInclude,
      orderBy: [{ tollDate: 'desc' }, { tollTime: 'desc' }]
    }),
    prisma.tractor.findMany({ select: { id: true, plate: true } }),
    prisma.tollCard.findMany({ select: { id: true, cardNumber: true } })
  ]);
  const tractorId = tractors.some((item) => item.id === params.tractorId) ? params.tractorId || '' : '';
  const cardId = cards.some((item) => item.id === params.cardId) ? params.cardId || '' : '';
  const status = ['needs_review', 'ok', 'verified'].includes(params.status || '') ? params.status || '' : '';
  const fromDate = parseFilterDateParts(params, 'from');
  const toDate = parseFilterDateParts(params, 'to');
  const filtered = entries.filter((entry) => {
    if (entry.status === TollEntryStatus.PENDING) return false;
    if (tractorId && entry.tractorId !== tractorId) return false;
    if (cardId && entry.cardId !== cardId) return false;
    if (status === 'needs_review' && entry.status !== TollEntryStatus.NEEDS_REVIEW) return false;
    if (status === 'ok' && entry.status !== TollEntryStatus.OK) return false;
    if (status === 'verified' && entry.status !== TollEntryStatus.VERIFIED) return false;
    if (fromDate && entry.tollDate < fromDate) return false;
    if (toDate && entry.tollDate >= addUtcDay(toDate)) return false;
    return tollEntryMatchesSearch(entry, params.q);
  });
  const net = filtered.reduce((sum, entry) => sum + entry.netAmountCents, 0);
  const vat = filtered.reduce((sum, entry) => sum + entry.vatAmountCents, 0);
  const gross = filtered.reduce((sum, entry) => sum + entry.grossAmountCents, 0);
  const distance = filtered.reduce((sum, entry) => sum + (entry.distanceKm || 0), 0);
  const review = filtered.filter((entry) => entry.status === TollEntryStatus.NEEDS_REVIEW).length;
  const filters = [
    selectedBatch ? `Fattura: ${selectedBatch.invoiceNumber || selectedBatch.originalFileName}` : '',
    params.q ? `Ricerca: ${params.q}` : '',
    fromDate ? `Da: ${formatDate(fromDate)}` : '',
    toDate ? `A: ${formatDate(toDate)}` : '',
    tractors.find((item) => item.id === tractorId) ? `Targa: ${tractors.find((item) => item.id === tractorId)?.plate}` : '',
    cards.find((item) => item.id === cardId) ? `Tessera: ${cards.find((item) => item.id === cardId)?.cardNumber}` : '',
    status ? `Stato: ${status}` : ''
  ].filter(Boolean);

  const pdf = generateReportPdf({
    title: selectedBatch?.invoiceNumber ? `Autostrade ${selectedBatch.invoiceNumber}` : 'Report autostrade',
    subtitle: selectedBatch ? `Dettaglio ${selectedBatch.originalFileName}` : 'Pedaggi, tratte e costi per la flotta',
    filters: filters.length ? filters : ['Tutti i pedaggi confermati'],
    metrics: [
      { label: 'Totale ivato', value: formatTollMoney(gross) },
      { label: 'Netto', value: formatTollMoney(net) },
      { label: 'IVA', value: formatTollMoney(vat) },
      { label: 'Distanza', value: formatTollDistance(distance) },
      { label: 'Da verificare', value: String(review) }
    ],
    columns: [
      { key: 'date', label: 'Data', weight: 0.75 },
      { key: 'plate', label: 'Targa', weight: 0.7 },
      { key: 'card', label: 'Tessera', weight: 0.9 },
      { key: 'route', label: 'Tratta', weight: 2.2 },
      { key: 'motorway', label: 'Autostrada', weight: 1.15 },
      { key: 'distance', label: 'Distanza', weight: 0.78, align: 'right' },
      { key: 'net', label: 'Netto', weight: 0.85, align: 'right' },
      { key: 'vat', label: 'IVA', weight: 0.75, align: 'right' },
      { key: 'gross', label: 'Ivato', weight: 0.9, align: 'right' },
      { key: 'invoice', label: 'Fattura', weight: 0.95 },
      { key: 'status', label: 'Stato', weight: 0.9 }
    ],
    rows: filtered.map((entry) => ({
      date: formatDate(entry.tollDate),
      plate: entry.plate,
      card: entry.card?.cardNumber || entry.cardNumber,
      route: entry.routeName,
      motorway: entry.motorwayName || '-',
      distance: formatTollDistance(entry.distanceKm),
      net: formatTollMoney(entry.netAmountCents),
      vat: formatTollMoney(entry.vatAmountCents),
      gross: formatTollMoney(entry.grossAmountCents),
      invoice: entry.invoiceNumber || '-',
      status: getTollEntryStatusLabel(entry.status)
    }))
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="nfrp-autostrade-${date}.pdf"`,
      'Cache-Control': 'private, no-store'
    }
  });
}
