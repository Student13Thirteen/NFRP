import 'server-only';

import { FuelEntryStatus } from '@prisma/client';
import { startOfDay } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  COST_SOURCE_VALUES,
  filterCostCenterRows,
  formatCostMoney,
  getCostCenterRows,
  getCostSourceLabel,
  type CostCenterRow,
  type CostSource
} from '@/lib/cost-center';
import { formatFuelConsumption, formatFuelCostPerKm } from '@/lib/fuel';
import { isMetricFuelProduct } from '@/lib/fuel-metrics';
import {
  aggregateCostByPlate,
  aggregateFuelByPlate,
  compactPlate,
  computeCostTrend,
  detectAnomalies,
  rankItems,
  type CostInputRow,
  type FuelInputRow,
  type RankDirection,
  type VehicleCostAggregate,
  type VehicleFuelAggregate
} from '@/lib/fleet-analytics-core';
import type { AssistantToolArguments } from '@/lib/assistant-planner';
import type { AssistantResultRow, AssistantToolResult } from '@/lib/assistant-tools';

const RANK_LIMIT = 10;
// Soglie anomalie: campione minimo per targa, coorte minima e z robusto.
const ANOMALY_MIN_SAMPLE_EACH = 5;
const ANOMALY_MIN_COHORT = 4;
const ANOMALY_THRESHOLD = 3.5;

function clampDays(value: number | null | undefined): number | null {
  if (!Number.isFinite(value) || !value) return null;
  return Math.max(1, Math.min(365, Math.trunc(value as number)));
}

function daysAgo(now: Date, days: number): Date {
  const since = startOfDay(now);
  since.setUTCDate(since.getUTCDate() - days);
  return since;
}

function periodLabel(days: number | null): string {
  return days ? ` (ultimi ${days} giorni)` : '';
}

function normalizeDirection(value: AssistantToolArguments['rankDirection']): RankDirection {
  return value === 'bottom' ? 'bottom' : 'top';
}

function analyticsRow(opts: {
  id: string;
  title: string;
  subtitle?: string;
  category?: string;
  statusLabel?: string;
  metricLabel: string;
  metricValue: string;
  href?: string;
}): AssistantResultRow {
  return {
    id: opts.id,
    title: opts.title,
    entityLabel: opts.subtitle || '-',
    entityTypeLabel: 'Analisi',
    documentTypeName: opts.category || '-',
    expiryDate: '-',
    daysUntil: null,
    statusLabel: opts.statusLabel || '-',
    pdfLabel: '-',
    href: opts.href,
    resultType: 'summary',
    typeLabel: 'Targa',
    metricLabel: opts.metricLabel,
    metricValue: opts.metricValue
  };
}

function emptyResult(title: string, message: string, href: string, label: string): AssistantToolResult {
  return { title, message, total: 0, rows: [], link: { href, label }, tooMany: false };
}

/* ----------------------- Helpers centro costi ----------------------- */

type LoadedCostRows = {
  rows: CostCenterRow[];
  labelByPlate: Map<string, string>;
};

async function loadAccountingCostRows(args: AssistantToolArguments, now: Date, days: number | null): Promise<LoadedCostRows> {
  const all = await getCostCenterRows();
  const rows = filterCostCenterRows(all, {
    source: args.costSource || null,
    category: args.costCategoryName || null,
    fromDate: days ? daysAgo(now, days) : null,
    scope: 'accounting'
  }).filter((row) => row.direction === 'COST');
  const labelByPlate = new Map<string, string>();
  for (const row of rows) {
    const plate = compactPlate(row.plate);
    if (plate && !labelByPlate.has(plate)) labelByPlate.set(plate, row.entityLabel);
  }
  return { rows, labelByPlate };
}

function toCostInputRows(rows: CostCenterRow[]): CostInputRow[] {
  return rows.map((row) => ({
    plate: row.plate,
    source: row.source,
    grossAmountCents: row.grossAmountCents,
    netAmountCents: row.netAmountCents,
    date: row.date
  }));
}

function costScopeLabel(args: AssistantToolArguments): string {
  if (args.costSource && COST_SOURCE_VALUES.includes(args.costSource as CostSource)) {
    return getCostSourceLabel(args.costSource as CostSource).toLocaleLowerCase('it-IT');
  }
  return 'spesa totale';
}

function buildCostHref(args: AssistantToolArguments, plate?: string): string {
  const params = new URLSearchParams();
  if (args.costSource) params.set('source', args.costSource);
  if (args.costCategoryName) params.set('category', args.costCategoryName);
  if (plate) params.set('plate', plate);
  params.set('scope', 'accounting');
  const query = params.toString();
  return query ? `/costs?${query}` : '/costs';
}

function sourceBreakdownText(agg: VehicleCostAggregate): string {
  return Object.entries(agg.bySource)
    .sort((a, b) => b[1].grossAmountCents - a[1].grossAmountCents)
    .slice(0, 3)
    .map(([source, bucket]) => `${getCostSourceLabel(source as CostSource)} ${formatCostMoney(bucket.grossAmountCents)}`)
    .join(', ');
}

/* ----------------------- Helpers rifornimenti ----------------------- */

async function loadFuelAggregates(args: AssistantToolArguments, now: Date, days: number | null): Promise<VehicleFuelAggregate[]> {
  const entries = await prisma.fuelEntry.findMany({
    where: {
      status: { in: [FuelEntryStatus.OK, FuelEntryStatus.VERIFIED] },
      kmDelta: { not: null },
      ...(days ? { fuelDate: { gte: daysAgo(now, days) } } : {})
    },
    select: {
      plate: true,
      status: true,
      productCode: true,
      volumeLitersMilli: true,
      totalAmountCents: true,
      kmDelta: true,
      fuelProduct: { select: { isFuel: true } }
    }
  });
  const inputRows: FuelInputRow[] = entries.map((entry) => ({
    plate: entry.plate,
    status: entry.status,
    isTractionFuel: isMetricFuelProduct({ productCode: entry.productCode, fuelProduct: entry.fuelProduct }),
    volumeLitersMilli: entry.volumeLitersMilli,
    totalAmountCents: entry.totalAmountCents,
    kmDelta: entry.kmDelta
  }));
  return aggregateFuelByPlate(inputRows);
}

/* =========================== TOOLS =========================== */

// Classifica targhe per spesa o numero movimenti (qualsiasi modulo del centro costi).
export async function rankVehicleCosts(args: AssistantToolArguments): Promise<AssistantToolResult> {
  const now = new Date();
  const days = clampDays(args.withinDays);
  const direction = normalizeDirection(args.rankDirection);
  const byCount = args.rankMetric === 'count';
  const scopeLabel = costScopeLabel(args);
  const title = `Classifica ${byCount ? 'numero movimenti' : scopeLabel}`;
  const href = buildCostHref(args);

  const { rows, labelByPlate } = await loadAccountingCostRows(args, now, days);
  const aggregates = aggregateCostByPlate(toCostInputRows(rows));
  if (aggregates.length === 0) {
    return emptyResult(title, `Nessun costo per targa trovato${periodLabel(days)}.`, href, 'Apri centro costi');
  }

  const ranked = rankItems(aggregates, (agg) => (byCount ? agg.count : agg.grossAmountCents), direction, RANK_LIMIT);
  const resultRows = ranked.map((agg, index) =>
    analyticsRow({
      id: agg.plate,
      title: `${index + 1}. ${labelByPlate.get(agg.plate) || agg.plate}`,
      subtitle: byCount ? `${formatCostMoney(agg.grossAmountCents)} totali` : `${agg.count} movimenti`,
      category: scopeLabel,
      metricLabel: byCount ? 'Movimenti' : 'Spesa',
      metricValue: byCount ? `${agg.count}` : formatCostMoney(agg.grossAmountCents),
      href: buildCostHref(args, agg.plate)
    })
  );

  const verb = direction === 'top' ? 'in testa' : 'più in basso';
  const head = ranked
    .slice(0, 3)
    .map((agg, index) => `${index + 1}) ${labelByPlate.get(agg.plate) || agg.plate} ${byCount ? `${agg.count} mov.` : formatCostMoney(agg.grossAmountCents)}`)
    .join(', ');

  return {
    title,
    message: `${title}${periodLabel(days)} - ${aggregates.length} mezzi, ${verb}: ${head}.`,
    total: aggregates.length,
    rows: resultRows,
    link: { href, label: 'Apri centro costi' },
    tooMany: aggregates.length > resultRows.length
  };
}

// Confronto diretto fra due o piu' targhe, con scomposizione per modulo.
export async function compareVehicleCosts(args: AssistantToolArguments): Promise<AssistantToolResult> {
  const now = new Date();
  const days = clampDays(args.withinDays);
  const scopeLabel = costScopeLabel(args);
  const title = 'Confronto mezzi';
  const requested = (args.plates || []).map(compactPlate).filter((plate): plate is string => Boolean(plate));
  const href = buildCostHref(args);

  if (requested.length < 1) {
    return emptyResult(title, 'Indica almeno due targhe da confrontare.', href, 'Apri centro costi');
  }

  const { rows, labelByPlate } = await loadAccountingCostRows(args, now, days);
  const aggByPlate = new Map(aggregateCostByPlate(toCostInputRows(rows)).map((agg) => [agg.plate, agg]));

  const resultRows = requested.map((plate) => {
    const agg = aggByPlate.get(plate);
    const gross = agg?.grossAmountCents || 0;
    const breakdown = agg ? sourceBreakdownText(agg) : 'nessun costo';
    return analyticsRow({
      id: plate,
      title: labelByPlate.get(plate) || plate,
      subtitle: breakdown || 'nessun costo',
      category: scopeLabel,
      metricLabel: 'Spesa',
      metricValue: formatCostMoney(gross),
      href: buildCostHref(args, plate)
    });
  });

  const totals = requested.map((plate) => ({ plate, gross: aggByPlate.get(plate)?.grossAmountCents || 0 }));
  const sorted = [...totals].sort((a, b) => b.gross - a.gross);
  let message = `Confronto ${scopeLabel}${periodLabel(days)}: ` + totals.map((t) => `${labelByPlate.get(t.plate) || t.plate} ${formatCostMoney(t.gross)}`).join(' vs ');
  if (sorted.length >= 2 && sorted[0].gross !== sorted[sorted.length - 1].gross) {
    const diff = sorted[0].gross - sorted[sorted.length - 1].gross;
    message += `. ${labelByPlate.get(sorted[0].plate) || sorted[0].plate} spende ${formatCostMoney(diff)} in più.`;
  }

  return {
    title,
    message,
    total: resultRows.length,
    rows: resultRows,
    link: { href, label: 'Apri centro costi' },
    tooMany: false
  };
}

// Chi e' peggiorato/migliorato rispetto al periodo precedente di pari durata.
export async function getVehicleCostTrend(args: AssistantToolArguments): Promise<AssistantToolResult> {
  const now = new Date();
  const days = clampDays(args.withinDays) || 30;
  const direction = normalizeDirection(args.rankDirection); // top = peggiorati, bottom = migliorati
  const scopeLabel = costScopeLabel(args);
  const title = direction === 'top' ? 'Mezzi peggiorati' : 'Mezzi migliorati';
  const href = buildCostHref(args);

  const all = await getCostCenterRows();
  const base = filterCostCenterRows(all, {
    source: args.costSource || null,
    category: args.costCategoryName || null,
    scope: 'accounting'
  });
  const labelByPlate = new Map<string, string>();
  for (const row of base) {
    const plate = compactPlate(row.plate);
    if (plate && !labelByPlate.has(plate)) labelByPlate.set(plate, row.entityLabel);
  }

  const currentStart = daysAgo(now, days);
  const previousStart = daysAgo(now, days * 2);
  const currentRows = base.filter((row) => row.date >= currentStart);
  const previousRows = base.filter((row) => row.date >= previousStart && row.date < currentStart);

  const trend = computeCostTrend(
    aggregateCostByPlate(toCostInputRows(currentRows)),
    aggregateCostByPlate(toCostInputRows(previousRows))
  );
  // top = peggioramenti (delta>0) in cima; bottom = miglioramenti (delta<0) in cima
  const ordered = direction === 'top' ? trend.filter((t) => t.deltaCents > 0) : [...trend].reverse().filter((t) => t.deltaCents < 0);
  if (ordered.length === 0) {
    return emptyResult(title, `Nessuna variazione ${direction === 'top' ? 'in aumento' : 'in calo'} nel periodo (${scopeLabel}, ultimi ${days} giorni vs ${days} precedenti).`, href, 'Apri centro costi');
  }

  const resultRows = ordered.slice(0, RANK_LIMIT).map((item, index) => {
    const pct = item.changePct === null ? 'nuovo' : `${item.changePct > 0 ? '+' : ''}${item.changePct.toFixed(0)}%`;
    const deltaTxt = `${item.deltaCents > 0 ? '+' : ''}${formatCostMoney(item.deltaCents)}`;
    return analyticsRow({
      id: item.plate,
      title: `${index + 1}. ${labelByPlate.get(item.plate) || item.plate}`,
      subtitle: `${formatCostMoney(item.previousCents)} -> ${formatCostMoney(item.currentCents)}`,
      category: scopeLabel,
      metricLabel: 'Variazione',
      metricValue: `${deltaTxt} (${pct})`,
      href: buildCostHref(args, item.plate)
    });
  });

  const head = ordered
    .slice(0, 3)
    .map((item) => `${labelByPlate.get(item.plate) || item.plate} ${item.deltaCents > 0 ? '+' : ''}${formatCostMoney(item.deltaCents)}`)
    .join(', ');

  return {
    title,
    message: `${title} (${scopeLabel}, ultimi ${days} giorni vs ${days} precedenti): ${head}.`,
    total: ordered.length,
    rows: resultRows,
    link: { href, label: 'Apri centro costi' },
    tooMany: ordered.length > resultRows.length
  };
}

// Classifica targhe per consumo medio (L/100 km) o costo per km, da pieno a pieno.
export async function rankFuelEfficiency(args: AssistantToolArguments): Promise<AssistantToolResult> {
  const now = new Date();
  const days = clampDays(args.withinDays);
  const direction = normalizeDirection(args.rankDirection); // top = piu' alto (peggiore)
  const byCost = args.rankMetric === 'costPerKm';
  const metricName = byCost ? 'costo per km' : 'consumo medio';
  const title = `Classifica ${metricName}`;
  const href = '/fuel';

  const aggregates = (await loadFuelAggregates(args, now, days)).filter((agg) => agg.segmentCount >= 3);
  if (aggregates.length === 0) {
    return emptyResult(title, `Dati km insufficienti per la classifica${periodLabel(days)} (servono almeno 3 tratte valide per mezzo).`, href, 'Apri rifornimenti');
  }

  const valueOf = (agg: VehicleFuelAggregate) => (byCost ? agg.costPerKmMilli : agg.consumptionTenths);
  const ranked = rankItems(aggregates, valueOf, direction, RANK_LIMIT);
  const fmt = (agg: VehicleFuelAggregate) => (byCost ? formatFuelCostPerKm(agg.costPerKmMilli) : formatFuelConsumption(agg.consumptionTenths));

  const resultRows = ranked.map((agg, index) =>
    analyticsRow({
      id: agg.plate,
      title: `${index + 1}. ${agg.plate}`,
      subtitle: `${agg.segmentCount} tratte, ${agg.km.toLocaleString('it-IT')} km`,
      category: metricName,
      metricLabel: byCost ? 'Costo/km' : 'Consumo',
      metricValue: fmt(agg),
      href: `/fuel?q=${encodeURIComponent(agg.plate)}`
    })
  );

  const verb = direction === 'top' ? 'più alto' : 'più basso';
  const head = ranked
    .slice(0, 3)
    .map((agg, index) => `${index + 1}) ${agg.plate} ${fmt(agg)}`)
    .join(', ');

  return {
    title,
    message: `${title}${periodLabel(days)} - ${verb} in cima: ${head}.`,
    total: aggregates.length,
    rows: resultRows,
    link: { href, label: 'Apri rifornimenti' },
    tooMany: aggregates.length > resultRows.length
  };
}

// Mezzi con consumo (o costo/km) statisticamente anomalo rispetto alla flotta (mediana + MAD).
export async function analyzeFuelAnomalies(args: AssistantToolArguments): Promise<AssistantToolResult> {
  const now = new Date();
  const days = clampDays(args.withinDays);
  const byCost = args.rankMetric === 'costPerKm';
  const metricName = byCost ? 'costo per km' : 'consumo';
  const title = `Anomalie ${metricName}`;
  const href = '/fuel';

  const aggregates = await loadFuelAggregates(args, now, days);
  const valueOf = (agg: VehicleFuelAggregate) => (byCost ? agg.costPerKmMilli : agg.consumptionTenths);
  const fmt = (value: number) => (byCost ? formatFuelCostPerKm(value) : formatFuelConsumption(value));

  const report = detectAnomalies(aggregates, valueOf, (agg) => agg.segmentCount, {
    minSampleEach: ANOMALY_MIN_SAMPLE_EACH,
    minCohort: ANOMALY_MIN_COHORT,
    threshold: ANOMALY_THRESHOLD
  });

  if (!report.reliable) {
    // Ripiego trasparente: niente statistica affidabile, ma mostriamo la classifica come contesto.
    const fallback = rankItems(
      aggregates.filter((agg) => agg.segmentCount >= 3),
      valueOf,
      'top',
      RANK_LIMIT
    );
    const rows = fallback.map((agg, index) =>
      analyticsRow({
        id: agg.plate,
        title: `${index + 1}. ${agg.plate}`,
        subtitle: `${agg.segmentCount} tratte`,
        category: metricName,
        metricLabel: byCost ? 'Costo/km' : 'Consumo',
        metricValue: fmt(valueOf(agg) as number),
        href: `/fuel?q=${encodeURIComponent(agg.plate)}`
      })
    );
    return {
      title,
      message: `Dati insufficienti per anomalie statistiche affidabili (servono almeno ${ANOMALY_MIN_COHORT} mezzi con ${ANOMALY_MIN_SAMPLE_EACH} tratte valide ciascuno). Mostro la classifica ${metricName} come riferimento.`,
      total: fallback.length,
      rows,
      link: { href, label: 'Apri rifornimenti' },
      tooMany: false
    };
  }

  const medianLabel = fmt(report.median);
  if (report.anomalies.length === 0) {
    return {
      title,
      message: `Nessun mezzo anomalo${periodLabel(days)}: tutti vicini alla mediana flotta (${medianLabel}) su ${report.cohortSize} mezzi.`,
      total: 0,
      rows: [],
      link: { href, label: 'Apri rifornimenti' },
      tooMany: false
    };
  }

  const resultRows = report.anomalies.map((anomaly) => {
    const deltaPct = report.median > 0 ? ((anomaly.value - report.median) / report.median) * 100 : 0;
    const sign = anomaly.direction === 'high' ? 'sopra' : 'sotto';
    return analyticsRow({
      id: anomaly.item.plate,
      title: anomaly.item.plate,
      subtitle: `${anomaly.item.segmentCount} tratte, ${Math.abs(deltaPct).toFixed(0)}% ${sign} la mediana`,
      category: metricName,
      statusLabel: anomaly.direction === 'high' ? 'Sopra norma' : 'Sotto norma',
      metricLabel: byCost ? 'Costo/km' : 'Consumo',
      metricValue: fmt(anomaly.value),
      href: `/fuel?q=${encodeURIComponent(anomaly.item.plate)}`
    });
  });

  return {
    title,
    message: `${report.anomalies.length} mezzo/i con ${metricName} anomalo rispetto alla flotta (mediana ${medianLabel}, ${report.cohortSize} mezzi confrontati)${periodLabel(days)}.`,
    total: report.anomalies.length,
    rows: resultRows,
    link: { href, label: 'Apri rifornimenti' },
    tooMany: false
  };
}
