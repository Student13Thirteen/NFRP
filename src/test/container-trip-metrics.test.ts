import { describe, expect, it } from 'vitest';
import { calculateContainerTripSpreadsheetMetrics } from '@/lib/container-trip-metrics';

describe('indicatori del foglio viaggi container', () => {
  it('calcola km reali, scostamento e costi chilometrici senza persistere formule', () => {
    expect(calculateContainerTripSpreadsheetMetrics({
      plannedKm: 560,
      odometerStartKm: 800_630,
      odometerEndKm: 801_211,
      actualKm: null,
      carrierCostCents: 87_150,
      additionalCostCents: 5_810
    })).toEqual({
      actualKm: 581,
      varianceKm: 21,
      costPerActualKmCents: 150,
      costWithAdditionalPerActualKmCents: 160,
      costPerPlannedKmCents: 156
    });
  });

  it('lascia vuoti gli indicatori che richiedono km o costo mancanti', () => {
    expect(calculateContainerTripSpreadsheetMetrics({
      plannedKm: null,
      odometerStartKm: null,
      odometerEndKm: null,
      actualKm: null,
      carrierCostCents: null,
      additionalCostCents: null
    })).toEqual({
      actualKm: null,
      varianceKm: null,
      costPerActualKmCents: null,
      costWithAdditionalPerActualKmCents: null,
      costPerPlannedKmCents: null
    });
  });
});
