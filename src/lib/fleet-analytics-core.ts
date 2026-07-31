// Analitica di flotta: funzioni pure e testabili (niente prisma, niente server-only).
// Le unita' rispecchiano il DB: litri in millilitri, denaro in centesimi, consumo in
// decimi di L/100 km, costo per km in milli-euro. Il layer server (fleet-analytics.ts)
// recupera i dati e li mappa su questi tipi strutturali.

export type RankDirection = 'top' | 'bottom';

export function compactPlate(value: string | null | undefined): string | null {
  const plate = (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return plate || null;
}

/* ------------------------- Statistica robusta ------------------------- */

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Deviazione assoluta mediana: dispersione robusta agli outlier (a differenza della
// deviazione standard, che verrebbe gonfiata proprio dai mezzi anomali che cerchiamo).
export function medianAbsoluteDeviation(values: number[], med?: number): number {
  if (values.length === 0) return 0;
  const center = med ?? median(values);
  return median(values.map((value) => Math.abs(value - center)));
}

/* ------------------------- Ordinamenti ------------------------- */

export function rankItems<T>(
  items: T[],
  valueOf: (item: T) => number | null,
  direction: RankDirection,
  limit = 10
): T[] {
  const withValue = items.filter((item) => valueOf(item) !== null);
  const sorted = withValue.sort((a, b) => {
    const va = valueOf(a) as number;
    const vb = valueOf(b) as number;
    return direction === 'top' ? vb - va : va - vb;
  });
  return limit > 0 ? sorted.slice(0, limit) : sorted;
}

/* ------------------ Costi cross-modulo (da centro costi) ------------------ */

export type CostInputRow = {
  plate: string | null;
  source: string;
  grossAmountCents: number;
  netAmountCents: number;
  date: Date;
};

export type VehicleCostAggregate = {
  plate: string;
  count: number;
  grossAmountCents: number;
  netAmountCents: number;
  bySource: Record<string, { count: number; grossAmountCents: number }>;
};

// Raggruppa per targa. Le righe senza targa (spese aziendali/generiche) sono escluse
// dai confronti tra mezzi. Le righe vanno gia' filtrate per scopo/periodo dal chiamante.
export function aggregateCostByPlate(rows: CostInputRow[]): VehicleCostAggregate[] {
  const map = new Map<string, VehicleCostAggregate>();
  for (const row of rows) {
    const plate = compactPlate(row.plate);
    if (!plate) continue;
    let agg = map.get(plate);
    if (!agg) {
      agg = { plate, count: 0, grossAmountCents: 0, netAmountCents: 0, bySource: {} };
      map.set(plate, agg);
    }
    agg.count += 1;
    agg.grossAmountCents += row.grossAmountCents;
    agg.netAmountCents += row.netAmountCents;
    const bucket = (agg.bySource[row.source] ||= { count: 0, grossAmountCents: 0 });
    bucket.count += 1;
    bucket.grossAmountCents += row.grossAmountCents;
  }
  return [...map.values()];
}

/* ------------------ Metriche fisiche carburante (da rifornimenti) ------------------ */

export type FuelInputRow = {
  plate: string | null;
  status: string; // 'PENDING' | 'OK' | 'NEEDS_REVIEW' | 'VERIFIED'
  isTractionFuel: boolean; // gasolio/HVO, AdBlue escluso
  volumeLitersMilli: number;
  totalAmountCents: number;
  kmDelta: number | null;
};

export type VehicleFuelAggregate = {
  plate: string;
  segmentCount: number; // numero di tratte km valide usate (dimensione campione)
  litersMilli: number;
  km: number;
  amountWithKmCents: number;
  consumptionTenths: number | null; // decimi di L/100 km
  costPerKmMilli: number | null; // milli-euro per km
};

// Solo righe utilizzabili per consumo/euro-km: carburante di trazione, km valido,
// stato confermato (OK/VERIFIED). Cosi' PENDING e NEEDS_REVIEW non sporcano le medie.
const ACCOUNTED_FUEL_STATUSES = new Set(['OK', 'VERIFIED']);

export function aggregateFuelByPlate(rows: FuelInputRow[]): VehicleFuelAggregate[] {
  const map = new Map<string, VehicleFuelAggregate>();
  for (const row of rows) {
    const plate = compactPlate(row.plate);
    if (!plate) continue;
    if (!row.isTractionFuel || !row.kmDelta || row.kmDelta <= 0 || !ACCOUNTED_FUEL_STATUSES.has(row.status)) continue;
    let agg = map.get(plate);
    if (!agg) {
      agg = { plate, segmentCount: 0, litersMilli: 0, km: 0, amountWithKmCents: 0, consumptionTenths: null, costPerKmMilli: null };
      map.set(plate, agg);
    }
    agg.segmentCount += 1;
    agg.litersMilli += row.volumeLitersMilli;
    agg.km += row.kmDelta;
    agg.amountWithKmCents += row.totalAmountCents;
  }
  for (const agg of map.values()) {
    if (agg.km > 0) {
      // decimi di L/100 km = litersMilli / km ; milli-euro/km = centesimi * 10 / km
      agg.consumptionTenths = Math.round(agg.litersMilli / agg.km);
      agg.costPerKmMilli = Math.round((agg.amountWithKmCents * 10) / agg.km);
    }
  }
  return [...map.values()];
}

/* ------------------------- Anomalie ------------------------- */

export type AnomalyResult<T> = {
  item: T;
  value: number;
  modifiedZ: number; // 0.6745 * (value - mediana) / MAD
  direction: 'high' | 'low';
};

export type AnomalyOptions = {
  minSampleEach: number; // campione minimo per targa per essere valutata
  minCohort: number; // numero minimo di targhe per calcolare la statistica
  threshold: number; // soglia |z robusto| (3.5 = convenzione standard)
};

export type AnomalyReport<T> = {
  anomalies: AnomalyResult<T>[];
  median: number;
  mad: number;
  cohortSize: number;
  reliable: boolean; // false se i dati sono troppo pochi per fidarsi
};

// z robusto (modified z-score di Iglewicz-Hoaglin) basato su mediana e MAD.
export function detectAnomalies<T>(
  items: T[],
  valueOf: (item: T) => number | null,
  sampleOf: (item: T) => number,
  options: AnomalyOptions
): AnomalyReport<T> {
  const eligible = items.filter((item) => valueOf(item) !== null && sampleOf(item) >= options.minSampleEach);
  const values = eligible.map((item) => valueOf(item) as number);
  const med = median(values);
  const mad = medianAbsoluteDeviation(values, med);
  const reliable = eligible.length >= options.minCohort && mad > 0;
  if (!reliable) {
    return { anomalies: [], median: med, mad, cohortSize: eligible.length, reliable: false };
  }
  const anomalies: AnomalyResult<T>[] = [];
  for (const item of eligible) {
    const value = valueOf(item) as number;
    const modifiedZ = (0.6745 * (value - med)) / mad;
    if (Math.abs(modifiedZ) >= options.threshold) {
      anomalies.push({ item, value, modifiedZ, direction: modifiedZ > 0 ? 'high' : 'low' });
    }
  }
  anomalies.sort((a, b) => Math.abs(b.modifiedZ) - Math.abs(a.modifiedZ));
  return { anomalies, median: med, mad, cohortSize: eligible.length, reliable: true };
}

/* ------------------------- Trend (periodo vs precedente) ------------------------- */

export type TrendItem = {
  plate: string;
  currentCents: number;
  previousCents: number;
  deltaCents: number;
  changePct: number | null; // null se nel periodo precedente non c'era spesa
};

// delta > 0 = peggiorato (spende di piu'); ordina dal peggioramento maggiore.
export function computeCostTrend(current: VehicleCostAggregate[], previous: VehicleCostAggregate[]): TrendItem[] {
  const curMap = new Map(current.map((agg) => [agg.plate, agg]));
  const prevMap = new Map(previous.map((agg) => [agg.plate, agg]));
  const plates = new Set<string>([...curMap.keys(), ...prevMap.keys()]);
  const items: TrendItem[] = [];
  for (const plate of plates) {
    const currentCents = curMap.get(plate)?.grossAmountCents ?? 0;
    const previousCents = prevMap.get(plate)?.grossAmountCents ?? 0;
    const deltaCents = currentCents - previousCents;
    const changePct = previousCents > 0 ? (deltaCents / previousCents) * 100 : null;
    items.push({ plate, currentCents, previousCents, deltaCents, changePct });
  }
  items.sort((a, b) => b.deltaCents - a.deltaCents);
  return items;
}
