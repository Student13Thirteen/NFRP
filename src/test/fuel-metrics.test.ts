import { describe, expect, it } from 'vitest';
import { FuelEntryStatus } from '@prisma/client';
import {
  calculateMetrics,
  estimateFullVolumeMilli,
  isPartialFillVolume,
  type FuelMetricEntry,
  type FuelSegmentContext
} from '@/lib/fuel-metrics';

function buildEntry(overrides: Partial<FuelMetricEntry>): FuelMetricEntry {
  return {
    id: 'x',
    fuelDate: new Date('2026-04-14T00:00:00.000Z'),
    fuelTime: '12:16',
    plate: 'ZZ102ZZ',
    tractorId: 'tractor-1',
    productCode: 'GLS',
    odometerKm: null,
    volumeLitersMilli: 0,
    totalAmountCents: 0,
    manuallyVerified: false,
    status: FuelEntryStatus.OK,
    fuelProduct: { isFuel: true },
    ...overrides
  };
}

describe('calculateMetrics', () => {
  it('computes realistic consumption (L/100 km) and cost per km for a normal truck fill', () => {
    const previous = buildEntry({ odometerKm: 699722, volumeLitersMilli: 243000, totalAmountCents: 50000 });
    const current = buildEntry({ odometerKm: 700779, volumeLitersMilli: 376000, totalAmountCents: 74426 });

    const metrics = calculateMetrics(current, previous);

    expect(metrics.kmDelta).toBe(1057);
    // 376 L su 1057 km = 35,57 L/100 km -> 356 decimi (NON 3557, che era il bug x10).
    expect(metrics.litersPer100KmTenths).toBe(356);
    expect(metrics.litersPer100KmTenths! / 10).toBeCloseTo(35.6, 1);
    // 744,26 € su 1057 km = 0,704 €/km -> 704 milliEuro.
    expect(metrics.costPerKmMilliEuro).toBe(704);
    expect(metrics.status).toBe(FuelEntryStatus.OK);
    expect(metrics.reviewReasons).toBe('');
  });

  it('does not flag a normal consumption as out of threshold', () => {
    const previous = buildEntry({ odometerKm: 100000, volumeLitersMilli: 300000, totalAmountCents: 60000 });
    const current = buildEntry({ odometerKm: 101000, volumeLitersMilli: 320000, totalAmountCents: 64000 });

    const metrics = calculateMetrics(current, previous);

    expect(metrics.litersPer100KmTenths).toBe(320); // 32,0 L/100 km
    expect(metrics.reviewReasons).not.toContain('Consumo anomalo');
    expect(metrics.status).toBe(FuelEntryStatus.OK);
  });

  it('keeps service products (car wash) out of consumption calculations', () => {
    const current = buildEntry({
      productCode: 'CWS',
      fuelProduct: { isFuel: false },
      odometerKm: 500000,
      volumeLitersMilli: 0,
      totalAmountCents: 1500
    });

    const metrics = calculateMetrics(current, null);

    expect(metrics.litersPer100KmTenths).toBeNull();
    expect(metrics.costPerKmMilliEuro).toBeNull();
    expect(metrics.status).toBe(FuelEntryStatus.OK);
  });

  it('measures AdBlue on its own product chain with a low-consumption band', () => {
    // AdBlue: ~38 L su 2500 km = 1,52 L/100 km. Con la soglia gasolio sarebbe
    // "fuori soglia"; con la banda AdBlue (0,3-8) e' normale.
    const previous = buildEntry({ productCode: 'ADB', fuelProduct: { isFuel: true }, odometerKm: 500000 });
    const current = buildEntry({
      productCode: 'ADB',
      fuelProduct: { isFuel: true },
      odometerKm: 502500,
      volumeLitersMilli: 38000,
      totalAmountCents: 3040
    });

    const metrics = calculateMetrics(current, previous);

    expect(metrics.kmDelta).toBe(2500);
    expect(metrics.litersPer100KmTenths).toBe(15); // 1,5 L/100 km
    expect(metrics.costPerKmMilliEuro).toBe(12); // 0,012 €/km
    expect(metrics.status).toBe(FuelEntryStatus.OK);
    expect(metrics.reviewReasons).toBe('');
  });

  it('flags AdBlue consumption that is too high for its band', () => {
    const previous = buildEntry({ productCode: 'ADB', fuelProduct: { isFuel: true }, odometerKm: 500000 });
    const current = buildEntry({
      productCode: 'ADB',
      fuelProduct: { isFuel: true },
      odometerKm: 500300,
      volumeLitersMilli: 38000, // 38 L su 300 km = 12,7 L/100 km, oltre 8,0
      totalAmountCents: 3040
    });

    const metrics = calculateMetrics(current, previous);

    expect(metrics.status).toBe(FuelEntryStatus.NEEDS_REVIEW);
    expect(metrics.reviewReasons).toContain('Consumo anomalo');
  });

  it('flags missing or non-increasing km as a soft review reason', () => {
    const previous = buildEntry({ odometerKm: 200000, volumeLitersMilli: 300000, totalAmountCents: 60000 });
    const lowerKm = buildEntry({ odometerKm: 199000, volumeLitersMilli: 300000, totalAmountCents: 60000 });

    const metrics = calculateMetrics(lowerKm, previous);

    expect(metrics.status).toBe(FuelEntryStatus.NEEDS_REVIEW);
    expect(metrics.reviewReasons).toContain('più bassi del pieno precedente');
  });
});

describe('rilevamento rabbocco parziale', () => {
  // Volumi sintetici del mezzo demo ZZ103ZZ (milli-litri): pieni 363-510 L, rabbocchi 146/167 L.
  const gk420 = [384320, 388050, 363350, 380660, 379750, 393980, 393790, 167150, 405790, 146780, 423200, 420970, 510460];

  it('stima il pieno tipico col 70esimo percentile e ignora i pochi rabbocchi', () => {
    expect(estimateFullVolumeMilli(gk420)).toBe(405790);
  });

  it('non stima nulla con meno di 3 rifornimenti', () => {
    expect(estimateFullVolumeMilli([400000, 410000])).toBeNull();
  });

  it('classifica come parziale solo i rifornimenti molto sotto il pieno tipico', () => {
    const reference = estimateFullVolumeMilli(gk420);
    expect(isPartialFillVolume(146780, reference)).toBe(true); // rabbocco autostrada
    expect(isPartialFillVolume(167150, reference)).toBe(true);
    expect(isPartialFillVolume(423200, reference)).toBe(false); // pieno
    expect(isPartialFillVolume(146780, null)).toBe(false); // senza riferimento, nessun parziale
  });
});

describe('consumo da pieno a pieno (segmento)', () => {
  it('non misura il consumo di un rabbocco parziale (lo assorbe il pieno successivo)', () => {
    // 13/05 ZZ103ZZ: rabbocco di 146,78 L a 1255 km dal pieno precedente.
    const previousFull = buildEntry({ odometerKm: 256612, volumeLitersMilli: 405790, totalAmountCents: 79900 });
    const partial = buildEntry({ odometerKm: 257867, volumeLitersMilli: 146780, totalAmountCents: 30002 });
    const segment: FuelSegmentContext = {
      anchorOdometerKm: 256612,
      litersSinceAnchorMilli: 0,
      costSinceAnchorCents: 0,
      isPartialFill: true
    };

    const metrics = calculateMetrics(partial, previousFull, segment);

    expect(metrics.litersPer100KmTenths).toBeNull();
    expect(metrics.costPerKmMilliEuro).toBeNull();
    expect(metrics.reviewReasons).not.toContain('Consumo anomalo');
    expect(metrics.status).toBe(FuelEntryStatus.OK);
  });

  it('assorbe il rabbocco nel pieno successivo invece di segnalarlo', () => {
    // 14/05 ZZ103ZZ: pieno di 423,20 L a soli 119 km dal rabbocco. Per coppia
    // sarebbe 355,6 L/100 km (segnalato); da pieno a pieno (1374 km, 569,98 L) e' 41,5.
    const partial = buildEntry({ odometerKm: 257867, volumeLitersMilli: 146780, totalAmountCents: 30002 });
    const fullFill = buildEntry({ odometerKm: 257986, volumeLitersMilli: 423200, totalAmountCents: 79900 });
    const segment: FuelSegmentContext = {
      anchorOdometerKm: 256612,
      litersSinceAnchorMilli: 146780,
      costSinceAnchorCents: 30002,
      isPartialFill: false
    };

    const metrics = calculateMetrics(fullFill, partial, segment);

    expect(metrics.kmDelta).toBe(119);
    expect(metrics.litersPer100KmTenths).toBe(415); // 41,5 L/100 km
    expect(metrics.costPerKmMilliEuro).toBe(800); // 0,80 €/km
    expect(metrics.reviewReasons).not.toContain('Consumo anomalo');
    expect(metrics.status).toBe(FuelEntryStatus.OK);
  });

  it('segnala comunque due pieni grossi troppo ravvicinati', () => {
    // Pieno seguito da un altro pieno (nessun rabbocco nel mezzo) a pochi km:
    // 400 L su 40 km = 1000 L/100 km, fuori banda -> segnalato.
    const previousFull = buildEntry({ odometerKm: 257900, volumeLitersMilli: 400000, totalAmountCents: 79900 });
    const closeFull = buildEntry({ odometerKm: 257940, volumeLitersMilli: 400000, totalAmountCents: 79900 });
    const segment: FuelSegmentContext = {
      anchorOdometerKm: 257900,
      litersSinceAnchorMilli: 0,
      costSinceAnchorCents: 0,
      isPartialFill: false
    };

    const metrics = calculateMetrics(closeFull, previousFull, segment);

    expect(metrics.litersPer100KmTenths).toBe(10000); // 1000 L/100 km
    expect(metrics.reviewReasons).toContain('Consumo anomalo');
    expect(metrics.status).toBe(FuelEntryStatus.NEEDS_REVIEW);
  });
});
