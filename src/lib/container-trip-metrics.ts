export type ContainerTripSpreadsheetMetrics = {
  actualKm: number | null;
  varianceKm: number | null;
  costPerActualKmCents: number | null;
  costWithAdditionalPerActualKmCents: number | null;
  costPerPlannedKmCents: number | null;
};

type MetricInput = {
  plannedKm: number | null;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  actualKm: number | null;
  carrierCostCents: number | null;
  additionalCostCents: number | null;
};

function divideCentsByKm(cents: number | null, km: number | null): number | null {
  if (cents === null || km === null || km <= 0) return null;
  return Math.round(cents / km);
}

export function calculateContainerTripSpreadsheetMetrics(input: MetricInput): ContainerTripSpreadsheetMetrics {
  const actualKm = input.odometerStartKm !== null && input.odometerEndKm !== null
    ? input.odometerEndKm - input.odometerStartKm
    : input.actualKm;
  const validActualKm = actualKm !== null && actualKm >= 0 ? actualKm : null;
  const additionalCost = input.additionalCostCents || 0;

  return {
    actualKm: validActualKm,
    varianceKm: validActualKm !== null && input.plannedKm !== null
      ? validActualKm - input.plannedKm
      : null,
    costPerActualKmCents: divideCentsByKm(input.carrierCostCents, validActualKm),
    costWithAdditionalPerActualKmCents: divideCentsByKm(
      input.carrierCostCents === null ? null : input.carrierCostCents + additionalCost,
      validActualKm
    ),
    costPerPlannedKmCents: divideCentsByKm(input.carrierCostCents, input.plannedKm)
  };
}

export function formatContainerRate(cents: number | null): string {
  if (cents === null) return '-';
  return `${new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)} €/km`;
}
