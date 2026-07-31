import { FuelEntryStatus, type FuelEntry } from '@prisma/client';
import { isAdBlueProductCode, isFuelProductCode } from '@/lib/fuel-parser';

// Soglie anomalia: avvisi soft, non bloccano l'inserimento. La validazione vera
// la fa l'operatore in fase di conferma. Consumo espresso in decimi di L/100 km.
// Sono i valori di riferimento del gasolio (profilo di default).
export const MAX_REASONABLE_KM_DELTA = 4500;
export const MIN_REASONABLE_CONSUMPTION_TENTHS = 100; // 10,0 L/100 km
export const MAX_REASONABLE_CONSUMPTION_TENTHS = 900; // 90,0 L/100 km
export const LOW_KM_DELTA_REVIEW_THRESHOLD = 25;
export const LARGE_FILL_LITERS_MILLI = 100_000;

// Rilevamento "rabbocco parziale" (es. pieno forzato in autostrada): un
// rifornimento sensibilmente piu' piccolo del pieno tipico della targa. Il suo
// consumo non si misura da solo (il serbatoio non era pieno), ma si assorbe nel
// pieno successivo con il metodo "da pieno a pieno". Soglia relativa al pieno
// abituale del gruppo (targa + prodotto), stimato col 70esimo percentile dei
// volumi: robusto verso i rabbocchi in basso e gli outlier in alto.
export const PARTIAL_FILL_FRACTION = 0.6;
const MIN_FILLS_FOR_PARTIAL_DETECTION = 3;
const FULL_VOLUME_PERCENTILE = 0.7;

// Contesto del segmento "da pieno a pieno" per il calcolo del consumo. L'ancora
// e' l'ultimo pieno; litri/costo accumulati sono quelli dei rabbocchi avvenuti
// dopo l'ancora (esclusa la riga corrente).
export type FuelSegmentContext = {
  anchorOdometerKm: number | null;
  litersSinceAnchorMilli: number;
  costSinceAnchorCents: number;
  isPartialFill: boolean;
};

export function estimateFullVolumeMilli(volumesMilli: number[]): number | null {
  const positive = volumesMilli.filter((value) => value > 0).sort((a, b) => a - b);
  if (positive.length < MIN_FILLS_FOR_PARTIAL_DETECTION) return null;
  // Percentile "nearest-rank".
  const rank = Math.ceil(FULL_VOLUME_PERCENTILE * positive.length);
  return positive[Math.min(rank, positive.length) - 1];
}

export function isPartialFillVolume(volumeMilli: number, referenceFullVolumeMilli: number | null): boolean {
  if (!referenceFullVolumeMilli || referenceFullVolumeMilli <= 0) return false;
  return volumeMilli > 0 && volumeMilli < referenceFullVolumeMilli * PARTIAL_FILL_FRACTION;
}

// Ogni prodotto "a consumo" ha la sua banda realistica. L'AdBlue si rabbocca di
// rado (salto km grande) e consuma pochissimo (~1-2 L/100 km), quindi userebbe
// soglie diverse dal gasolio: senza queste, ogni riga AdBlue sembrerebbe anomala.
type MetricProfile = {
  minConsumptionTenths: number;
  maxConsumptionTenths: number;
  maxKmDelta: number;
};

const DIESEL_PROFILE: MetricProfile = {
  minConsumptionTenths: MIN_REASONABLE_CONSUMPTION_TENTHS,
  maxConsumptionTenths: MAX_REASONABLE_CONSUMPTION_TENTHS,
  maxKmDelta: MAX_REASONABLE_KM_DELTA
};

const ADBLUE_PROFILE: MetricProfile = {
  minConsumptionTenths: 3, // 0,3 L/100 km
  maxConsumptionTenths: 80, // 8,0 L/100 km
  maxKmDelta: 30000
};

function metricProfileForProduct(entry: Pick<FuelMetricEntry, 'productCode'>): MetricProfile {
  return isAdBlueProductCode(entry.productCode) ? ADBLUE_PROFILE : DIESEL_PROFILE;
}

export type FuelMetricEntry = Pick<
  FuelEntry,
  | 'id'
  | 'fuelDate'
  | 'fuelTime'
  | 'plate'
  | 'tractorId'
  | 'productCode'
  | 'odometerKm'
  | 'volumeLitersMilli'
  | 'totalAmountCents'
  | 'manuallyVerified'
  | 'status'
> & {
  fuelProduct: { isFuel: boolean } | null;
};

export type FuelMetricsResult = {
  status: FuelEntryStatus;
  reviewReasons: string;
  kmDelta: number | null;
  litersPer100KmTenths: number | null;
  costPerKmMilliEuro: number | null;
};

function formatKm(value: number): string {
  return new Intl.NumberFormat('it-IT').format(value);
}

function formatConsumptionTenths(value: number): string {
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value / 10);
}

function formatLitersMilli(value: number): string {
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 1000);
}

export function isMetricFuelProduct(entry: Pick<FuelMetricEntry, 'productCode' | 'fuelProduct'>): boolean {
  return entry.fuelProduct?.isFuel ?? isFuelProductCode(entry.productCode);
}

export function calculateMetrics(
  entry: FuelMetricEntry,
  previousFuelEntry: FuelMetricEntry | null,
  segment?: FuelSegmentContext | null
): FuelMetricsResult {
  const reasons: string[] = [];
  let kmDelta: number | null = null;
  let litersPer100KmTenths: number | null = null;
  let costPerKmMilliEuro: number | null = null;

  if (!entry.tractorId) {
    reasons.push('Targa non ancora presente in anagrafica trattori: aprila dal menu Trattori e completa i dati.');
  }

  if (!isMetricFuelProduct(entry)) {
    return {
      status: reasons.length > 0 ? FuelEntryStatus.NEEDS_REVIEW : FuelEntryStatus.OK,
      reviewReasons: reasons.join(' '),
      kmDelta,
      litersPer100KmTenths,
      costPerKmMilliEuro
    };
  }

  if (!entry.odometerKm) {
    reasons.push('Chilometri mancanti o illeggibili: l’autista non li ha digitati al distributore. Controlla lo scontrino.');
  } else if (previousFuelEntry?.odometerKm) {
    kmDelta = entry.odometerKm - previousFuelEntry.odometerKm;

    if (kmDelta < 0) {
      reasons.push(
        `Chilometri (${formatKm(entry.odometerKm)} km) più bassi del pieno precedente (${formatKm(previousFuelEntry.odometerKm)} km): di solito è un errore di battitura dell’autista al distributore (cifre invertite). Controlla il numero.`
      );
    } else if (kmDelta === 0) {
      reasons.push('Chilometri identici al pieno precedente: probabilmente l’autista non li ha aggiornati. Controlla il numero.');
    } else {
      const profile = metricProfileForProduct(entry);

      // Controlli sul salto immediato dal rifornimento precedente: valgono sempre,
      // sia per i pieni sia per i rabbocchi.
      if (kmDelta > profile.maxKmDelta) {
        reasons.push(
          `Salto chilometrico molto grande (+${formatKm(kmDelta)} km) dal pieno precedente: verifica che i chilometri siano corretti.`
        );
      }

      if (kmDelta < LOW_KM_DELTA_REVIEW_THRESHOLD && entry.volumeLitersMilli >= LARGE_FILL_LITERS_MILLI) {
        reasons.push(
          `Pieno da ${formatLitersMilli(entry.volumeLitersMilli)} L ma chilometri quasi fermi (+${formatKm(kmDelta)} km): probabile chilometraggio non aggiornato. Controlla il numero.`
        );
      }

      // Consumo: metodo "da pieno a pieno". Un rabbocco parziale non si misura da
      // solo (i suoi litri vengono assorbiti nel pieno successivo); un pieno misura
      // il consumo sull'intero segmento dall'ultimo pieno, sommando i rabbocchi nel
      // mezzo. Senza contesto di segmento (test diretti, prima riga della catena) si
      // ricade sul calcolo per singola coppia, come da comportamento storico.
      const hasAnchor =
        segment != null && segment.anchorOdometerKm != null && entry.odometerKm > segment.anchorOdometerKm;

      if (segment?.isPartialFill) {
        litersPer100KmTenths = null;
        costPerKmMilliEuro = null;
      } else if (hasAnchor && segment) {
        const segmentKm = entry.odometerKm - segment.anchorOdometerKm!;
        const litersInSegmentMilli = segment.litersSinceAnchorMilli + entry.volumeLitersMilli;
        const costInSegmentCents = segment.costSinceAnchorCents + entry.totalAmountCents;
        litersPer100KmTenths = Math.round(litersInSegmentMilli / segmentKm);
        costPerKmMilliEuro = Math.round((costInSegmentCents * 10) / segmentKm);
      } else {
        // volumeLitersMilli = litri x1000; decimi di L/100 km = litriMilli / kmDelta.
        litersPer100KmTenths = Math.round(entry.volumeLitersMilli / kmDelta);
        costPerKmMilliEuro = Math.round((entry.totalAmountCents * 10) / kmDelta);
      }

      if (
        litersPer100KmTenths != null &&
        (litersPer100KmTenths < profile.minConsumptionTenths || litersPer100KmTenths > profile.maxConsumptionTenths)
      ) {
        reasons.push(
          `Consumo anomalo: ${formatConsumptionTenths(litersPer100KmTenths)} L ogni 100 km (di norma tra ${formatConsumptionTenths(profile.minConsumptionTenths)} e ${formatConsumptionTenths(profile.maxConsumptionTenths)}). Quasi sempre dipende dai chilometri digitati male: controlla il numero.`
        );
      }
    }
  }

  const status =
    reasons.length === 0
      ? FuelEntryStatus.OK
      : entry.manuallyVerified
        ? FuelEntryStatus.VERIFIED
        : FuelEntryStatus.NEEDS_REVIEW;

  return {
    status,
    reviewReasons: reasons.join(' '),
    kmDelta: kmDelta && kmDelta > 0 ? kmDelta : null,
    litersPer100KmTenths,
    costPerKmMilliEuro
  };
}
