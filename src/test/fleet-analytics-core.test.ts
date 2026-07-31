import { describe, expect, it } from 'vitest';
import {
  aggregateCostByPlate,
  aggregateFuelByPlate,
  computeCostTrend,
  detectAnomalies,
  median,
  medianAbsoluteDeviation,
  rankItems,
  type CostInputRow,
  type FuelInputRow,
  type VehicleCostAggregate
} from '@/lib/fleet-analytics-core';

function fuelRow(overrides: Partial<FuelInputRow>): FuelInputRow {
  return {
    plate: 'AA111AA',
    status: 'OK',
    isTractionFuel: true,
    volumeLitersMilli: 0,
    totalAmountCents: 0,
    kmDelta: null,
    ...overrides
  };
}

function costRow(overrides: Partial<CostInputRow>): CostInputRow {
  return {
    plate: 'AA111AA',
    source: 'FUEL',
    grossAmountCents: 0,
    netAmountCents: 0,
    date: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides
  };
}

function costAgg(plate: string, grossAmountCents: number): VehicleCostAggregate {
  return { plate, count: 1, grossAmountCents, netAmountCents: grossAmountCents, bySource: {} };
}

describe('robust statistics', () => {
  it('computes median for odd and even length', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it('computes the median absolute deviation', () => {
    // valori [1,2,3,4,5] -> mediana 3 -> deviazioni [2,1,0,1,2] -> MAD 1
    expect(medianAbsoluteDeviation([1, 2, 3, 4, 5])).toBe(1);
  });
});

describe('rankItems', () => {
  it('ranks descending (top) and ascending (bottom), skipping null values', () => {
    const items = [{ v: 10 }, { v: null }, { v: 30 }, { v: 20 }];
    expect(rankItems(items, (i) => i.v, 'top', 2)).toEqual([{ v: 30 }, { v: 20 }]);
    expect(rankItems(items, (i) => i.v, 'bottom', 2)).toEqual([{ v: 10 }, { v: 20 }]);
  });
});

describe('aggregateCostByPlate', () => {
  it('groups by normalized plate, sums money and breaks down by source, skipping null plates', () => {
    const rows: CostInputRow[] = [
      costRow({ plate: 'aa 111 aa', source: 'FUEL', grossAmountCents: 1000, netAmountCents: 820 }),
      costRow({ plate: 'AA111AA', source: 'TOLLS', grossAmountCents: 500, netAmountCents: 410 }),
      costRow({ plate: null, source: 'EXPENSE', grossAmountCents: 9999, netAmountCents: 9999 })
    ];
    const result = aggregateCostByPlate(rows);
    expect(result).toHaveLength(1);
    const agg = result[0];
    expect(agg.plate).toBe('AA111AA');
    expect(agg.count).toBe(2);
    expect(agg.grossAmountCents).toBe(1500);
    expect(agg.bySource.FUEL).toEqual({ count: 1, grossAmountCents: 1000 });
    expect(agg.bySource.TOLLS).toEqual({ count: 1, grossAmountCents: 500 });
  });
});

describe('aggregateFuelByPlate', () => {
  it('computes consumption (tenths of L/100km) and cost per km (milli-euro) on traction fuel only', () => {
    const rows: FuelInputRow[] = [
      // 30 L su 100 km, 45 euro -> 30,0 L/100km (tenths 300) e 0,450 euro/km (milli 450)
      fuelRow({ volumeLitersMilli: 30000, totalAmountCents: 4500, kmDelta: 100 }),
      // AdBlue: ignorato dal consumo
      fuelRow({ isTractionFuel: false, volumeLitersMilli: 5000, totalAmountCents: 1000, kmDelta: 100 }),
      // PENDING: ignorato
      fuelRow({ status: 'PENDING', volumeLitersMilli: 30000, totalAmountCents: 4500, kmDelta: 100 }),
      // km mancante: ignorato
      fuelRow({ volumeLitersMilli: 30000, totalAmountCents: 4500, kmDelta: null })
    ];
    const [agg] = aggregateFuelByPlate(rows);
    expect(agg.segmentCount).toBe(1);
    expect(agg.km).toBe(100);
    expect(agg.consumptionTenths).toBe(300);
    expect(agg.costPerKmMilli).toBe(450);
  });

  it('aggregates multiple valid segments before computing the ratio', () => {
    const rows: FuelInputRow[] = [
      fuelRow({ volumeLitersMilli: 30000, totalAmountCents: 4500, kmDelta: 100 }),
      fuelRow({ volumeLitersMilli: 30000, totalAmountCents: 4500, kmDelta: 100 })
    ];
    const [agg] = aggregateFuelByPlate(rows);
    expect(agg.segmentCount).toBe(2);
    expect(agg.km).toBe(200);
    expect(agg.consumptionTenths).toBe(300); // stesso rapporto
  });
});

describe('detectAnomalies', () => {
  const options = { minSampleEach: 5, minCohort: 4, threshold: 3.5 };

  it('flags a single clear outlier with enough cohort and sample', () => {
    const items = [
      { plate: 'A', value: 300, n: 6 },
      { plate: 'B', value: 310, n: 6 },
      { plate: 'C', value: 305, n: 6 },
      { plate: 'D', value: 295, n: 6 },
      { plate: 'E', value: 302, n: 6 },
      { plate: 'F', value: 600, n: 6 }
    ];
    const report = detectAnomalies(items, (i) => i.value, (i) => i.n, options);
    expect(report.reliable).toBe(true);
    expect(report.anomalies).toHaveLength(1);
    expect(report.anomalies[0].item.plate).toBe('F');
    expect(report.anomalies[0].direction).toBe('high');
  });

  it('is not reliable with too small a cohort', () => {
    const items = [
      { plate: 'A', value: 300, n: 6 },
      { plate: 'B', value: 600, n: 6 }
    ];
    const report = detectAnomalies(items, (i) => i.value, (i) => i.n, options);
    expect(report.reliable).toBe(false);
    expect(report.anomalies).toHaveLength(0);
  });

  it('excludes plates below the minimum sample from the cohort', () => {
    const items = [
      { plate: 'A', value: 300, n: 6 },
      { plate: 'B', value: 310, n: 6 },
      { plate: 'C', value: 305, n: 2 }, // troppo poche tratte
      { plate: 'D', value: 295, n: 6 }
    ];
    const report = detectAnomalies(items, (i) => i.value, (i) => i.n, options);
    expect(report.cohortSize).toBe(3);
  });
});

describe('computeCostTrend', () => {
  it('ranks worsened vehicles first and computes the percentage change', () => {
    const current = [costAgg('A', 20000), costAgg('B', 5000)];
    const previous = [costAgg('A', 10000), costAgg('B', 8000)];
    const trend = computeCostTrend(current, previous);
    expect(trend[0].plate).toBe('A');
    expect(trend[0].deltaCents).toBe(10000);
    expect(trend[0].changePct).toBe(100);
    expect(trend[1].plate).toBe('B');
    expect(trend[1].deltaCents).toBe(-3000);
  });

  it('returns null percentage when there was no previous spend', () => {
    const trend = computeCostTrend([costAgg('A', 5000)], []);
    expect(trend[0].changePct).toBeNull();
    expect(trend[0].previousCents).toBe(0);
  });
});
