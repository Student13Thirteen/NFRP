import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  COST_SCOPE_VALUES,
  COST_SOURCE_VALUES,
  filterCostCenterRows,
  formatCostMoney,
  getCostCenterRows,
  getCostCenterTotals,
  getCostDirectionLabel,
  getCostSourceLabel,
  type CostScope,
  type CostSource
} from '@/lib/cost-center';
import { parseFilterDateParts, type DateFilterSearchParams } from '@/lib/date-filters';
import { formatDate } from '@/lib/dates';
import { generateReportPdf } from '@/lib/report-pdf';

export const dynamic = 'force-dynamic';

type CostReportParams = DateFilterSearchParams & {
  category?: string;
  plate?: string;
  q?: string;
  scope?: string;
  source?: string;
};

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response('Non autorizzato.', { status: 401 });

  const params = Object.fromEntries(request.nextUrl.searchParams.entries()) as CostReportParams;
  const allRows = await getCostCenterRows();
  const source = COST_SOURCE_VALUES.includes(params.source as CostSource) ? params.source || '' : '';
  const scope = COST_SCOPE_VALUES.includes(params.scope as CostScope) ? (params.scope as CostScope) : 'all';
  const categories = new Set(allRows.map((row) => row.categoryName));
  const plates = new Set(allRows.map((row) => row.plate).filter(Boolean));
  const category = categories.has(params.category || '') ? params.category || '' : '';
  const plateCandidate = (params.plate || '').toUpperCase();
  const plate = plates.has(plateCandidate) ? plateCandidate : '';
  const fromDate = parseFilterDateParts(params, 'from');
  const toDate = parseFilterDateParts(params, 'to');
  const rows = filterCostCenterRows(allRows, {
    query: params.q,
    source,
    category,
    plate,
    fromDate,
    toDate,
    scope
  });
  const totals = getCostCenterTotals(rows);
  const filters = [
    params.q ? `Ricerca: ${params.q}` : '',
    fromDate ? `Da: ${formatDate(fromDate)}` : '',
    toDate ? `A: ${formatDate(toDate)}` : '',
    source ? `Tipo: ${getCostSourceLabel(source as CostSource)}` : '',
    category ? `Categoria: ${category}` : '',
    plate ? `Targa: ${plate}` : '',
    scope !== 'all'
      ? `Vista: ${scope === 'accounting' ? 'Contabile' : scope === 'internal' ? 'Attribuzioni interne' : 'Impegni previsti'}`
      : ''
  ].filter(Boolean);

  const pdf = generateReportPdf({
    title: 'Report centro costi',
    subtitle: 'Costi, ricavi, margini e attribuzioni della flotta',
    filters: filters.length ? filters : ['Tutte le fonti e tutte le targhe'],
    metrics: [
      { label: 'Costi contabili', value: formatCostMoney(totals.accountingGrossAmountCents) },
      { label: 'Ricavi viaggi', value: formatCostMoney(totals.revenueGrossAmountCents) },
      { label: 'Margine', value: formatCostMoney(totals.marginGrossAmountCents) },
      { label: 'Attribuzioni interne', value: formatCostMoney(totals.internalGrossAmountCents) },
      { label: 'Impegni leasing', value: formatCostMoney(totals.forecastGrossAmountCents) },
      { label: 'Righe', value: String(rows.length) }
    ],
    columns: [
      { key: 'date', label: 'Data', weight: 0.72 },
      { key: 'source', label: 'Tipo', weight: 0.9 },
      { key: 'direction', label: 'Movimento', weight: 0.72 },
      { key: 'category', label: 'Categoria', weight: 1.05 },
      { key: 'description', label: 'Descrizione', weight: 2.05 },
      { key: 'plate', label: 'Targa', weight: 0.72 },
      { key: 'supplier', label: 'Fornitore', weight: 1.1 },
      { key: 'reference', label: 'Riferimento', weight: 0.9 },
      { key: 'net', label: 'Netto', weight: 0.82, align: 'right' },
      { key: 'vat', label: 'IVA', weight: 0.72, align: 'right' },
      { key: 'gross', label: 'Totale', weight: 0.9, align: 'right' }
    ],
    rows: rows.map((row) => ({
      date: formatDate(row.date),
      source: row.sourceLabel,
      direction: row.isForecast ? 'Impegno' : row.isInternalAllocation ? 'Interno' : getCostDirectionLabel(row.direction),
      category: row.categoryName,
      description: row.description,
      plate: row.plate || '-',
      supplier: row.supplierName || '-',
      reference: row.reference || '-',
      net: formatCostMoney(row.netAmountCents),
      vat: formatCostMoney(row.vatAmountCents),
      gross: formatCostMoney(row.grossAmountCents)
    }))
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="nfrp-centro-costi-${date}.pdf"`,
      'Cache-Control': 'private, no-store'
    }
  });
}
