import { getCurrentUser } from '@/lib/auth';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  expenseDocumentInclude,
  filterAndSortExpenseDocuments,
  formatEuroCents,
  getAllocationLabel,
  normalizeExpenseDocumentListFilters
} from '@/lib/expense';
import { generateReportPdf } from '@/lib/report-pdf';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response('Non autorizzato.', { status: 401 });

  const allDocuments = await prisma.expenseDocument.findMany({
    include: expenseDocumentInclude,
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
  });
  const searchParams = new URL(request.url).searchParams;
  const filters = normalizeExpenseDocumentListFilters({
    q: searchParams.get('q'),
    sort: searchParams.get('sort'),
    status: searchParams.get('status'),
    vehicleKey: searchParams.get('vehicleKey')
  });
  const documents = filterAndSortExpenseDocuments(allDocuments, filters);
  const [, filteredVehicleId] = filters.vehicleKey.split(':');
  const filteredVehicleLine = filteredVehicleId
    ? allDocuments
        .flatMap((document) => document.lines)
        .find((line) => line.tractorId === filteredVehicleId || line.trailerId === filteredVehicleId)
    : null;
  const filteredVehiclePlate = filteredVehicleLine?.tractor?.plate || filteredVehicleLine?.trailer?.plate;
  const confirmed = documents.filter((document) => document.status === 'CONFIRMED');
  const net = confirmed.reduce((sum, document) => sum + document.totalImponibileCents, 0);
  const vat = confirmed.reduce((sum, document) => sum + document.totalVatCents, 0);
  const gross = confirmed.reduce((sum, document) => sum + document.totalAmountCents, 0);
  const pending = documents.filter((document) => document.status === 'PENDING').length;
  const pdf = generateReportPdf({
    title: 'Registro documenti di spesa',
    subtitle: 'Fatture e DDT ricevuti, con IVA e allocazioni gestionali',
    filters: [
      filters.q ? `Ricerca: ${filters.q}` : '',
      filters.status === 'CONFIRMED' ? 'Stato: confermati' : filters.status === 'PENDING' ? 'Stato: da validare' : '',
      filters.vehicleKey ? `Targa: ${filteredVehiclePlate || 'selezionata'}` : '',
      filters.sort === 'activity' ? 'Ordine: attività più recente' : 'Ordine: data documento'
    ].filter(Boolean),
    metrics: [
      { label: 'Totale ivato', value: formatEuroCents(gross) },
      { label: 'Imponibile', value: formatEuroCents(net) },
      { label: 'IVA', value: formatEuroCents(vat) },
      { label: 'Confermati', value: String(confirmed.length) },
      { label: 'Da validare', value: String(pending) }
    ],
    columns: [
      { key: 'date', label: 'Registrazione', weight: 0.8 },
      { key: 'documentDate', label: 'Data doc.', weight: 0.8 },
      { key: 'supplier', label: 'Fornitore', weight: 1.45 },
      { key: 'number', label: 'N. documento', weight: 1.0 },
      { key: 'lines', label: 'Righe', weight: 0.5, align: 'right' },
      { key: 'allocation', label: 'Allocazione', weight: 1.9 },
      { key: 'odometer', label: 'Km mezzo', weight: 0.8, align: 'right' },
      { key: 'net', label: 'Imponibile', weight: 0.9, align: 'right' },
      { key: 'vat', label: 'IVA', weight: 0.8, align: 'right' },
      { key: 'gross', label: 'Ivato', weight: 0.95, align: 'right' },
      { key: 'source', label: 'Origine', weight: 0.75 },
      { key: 'status', label: 'Stato', weight: 0.9 }
    ],
    rows: documents.map((document) => ({
      date: formatDate(document.registeredAt),
      documentDate: formatDate(document.documentDate),
      supplier: document.supplier?.name || document.supplierName || '-',
      number: document.documentNumber || '-',
      lines: String(document.lines.length),
      allocation: Array.from(new Set(document.lines.map((line) => getAllocationLabel(line)))).join(', ') || '-',
      odometer:
        Array.from(
          new Set(document.lines.flatMap((line) => line.odometerKm === null ? [] : [line.odometerKm]))
        )
          .map((value) => value.toLocaleString('it-IT'))
          .join(', ') || '-',
      net: formatEuroCents(document.totalImponibileCents),
      vat: formatEuroCents(document.totalVatCents),
      gross: formatEuroCents(document.totalAmountCents),
      source: document.source === 'IMPORT' ? 'OCR' : document.source === 'MANUAL' ? 'Manuale' : document.source,
      status: document.status === 'PENDING' ? 'Da validare' : 'Confermato'
    }))
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="nfrp-registro-spese-${date}.pdf"`,
      'Cache-Control': 'private, no-store'
    }
  });
}
