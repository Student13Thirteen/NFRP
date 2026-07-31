export type FireExtinguisherUnit = {
  serialNumber: string;
  capacityKg: number | null;
};

export type FireExtinguisherRate = {
  capacityKg: number;
  priceCents: number;
};

export const FIRE_EXTINGUISHER_RATES_SETTING_KEY = 'fire_extinguisher_rates';

export const DEFAULT_FIRE_EXTINGUISHER_RATES: FireExtinguisherRate[] = [
  { capacityKg: 2, priceCents: 500 },
  { capacityKg: 6, priceCents: 800 },
  { capacityKg: 12, priceCents: 1300 }
];

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function numbersIn(value: string): string[] {
  return Array.from(value.matchAll(/\b\d{1,12}\b/g), (match) => match[0]);
}

function validCapacity(value: string): number | null {
  const capacity = Number(value);
  return Number.isInteger(capacity) && capacity > 0 && capacity <= 100 ? capacity : null;
}

function mergeUnits(
  baseUnits: FireExtinguisherUnit[],
  explicitUnits: FireExtinguisherUnit[]
): FireExtinguisherUnit[] {
  const bySerial = new Map<string, FireExtinguisherUnit>();

  for (const unit of [...baseUnits, ...explicitUnits]) {
    const existing = bySerial.get(unit.serialNumber);
    bySerial.set(unit.serialNumber, {
      serialNumber: unit.serialNumber,
      capacityKg: unit.capacityKg ?? existing?.capacityKg ?? null
    });
  }

  return Array.from(bySerial.values());
}

/**
 * Legge le coppie matricola/peso dalla tabella dei certificati estintori.
 * Supporta sia il testo lineare prodotto da OCRmyPDF sia le righe supplementari
 * prodotte dal passaggio OCR mirato sulle singole colonne.
 */
export function findFireExtinguisherUnits(source: string): FireExtinguisherUnit[] {
  const normalizedSource = normalize(source);
  if (!normalizedSource.includes('estintor') || !normalizedSource.includes('matricola')) return [];

  const explicitUnits = Array.from(
    normalizedSource.matchAll(
      /matricola\s*[:.]?\s*(\d{1,12})\s*[-–—]\s*(?:peso|capacita)\s*[:.]?\s*(\d{1,3})(?:[,.]0+)?\s*kg\b/g
    ),
    (match): FireExtinguisherUnit => ({
      serialNumber: match[1],
      capacityKg: validCapacity(match[2])
    })
  ).filter((unit) => unit.capacityKg !== null);

  const lines = normalizedSource
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
  const matricolaIndex = lines.findIndex((line) => /\bmatricola\b/.test(line));
  if (matricolaIndex < 0) return explicitUnits;

  const installatiOffset = lines
    .slice(matricolaIndex + 1, matricolaIndex + 18)
    .findIndex((line) => /\binstallat[ioe]\b/.test(line));
  const blockEnd = installatiOffset >= 0 ? matricolaIndex + 1 + installatiOffset : Math.min(lines.length, matricolaIndex + 12);
  const polvereOffset = lines
    .slice(matricolaIndex, blockEnd)
    .findIndex((line) => /\bpolvere\b/.test(line));
  const polvereIndex = polvereOffset >= 0 ? matricolaIndex + polvereOffset : -1;

  const serialEnd = polvereIndex >= 0 ? polvereIndex : Math.min(blockEnd, matricolaIndex + 5);
  const serialText = lines
    .slice(matricolaIndex, serialEnd)
    .join(' ')
    .replace(/\bmatricola\b/g, ' ')
    .replace(/\bnumero\b/g, ' ');
  const serialNumbers = numbersIn(serialText).filter((value) => value.length >= 2);

  let capacities: number[] = [];
  if (polvereIndex >= 0) {
    const capacityLabelOffset = lines
      .slice(polvereIndex, blockEnd)
      .findIndex((line) => /\bcapacita\b/.test(line) && /\bkg\b/.test(line));
    const capacityEnd = capacityLabelOffset >= 0 ? polvereIndex + capacityLabelOffset + 1 : Math.min(blockEnd, polvereIndex + 4);
    const capacityText = lines
      .slice(polvereIndex, capacityEnd)
      .join(' ')
      .replace(/\bpolvere\b/g, ' ')
      .replace(/\bcapacita\b/g, ' ')
      .replace(/\bkg\b/g, ' ');
    capacities = numbersIn(capacityText)
      .map(validCapacity)
      .filter((value): value is number => value !== null);
  }

  const baseUnits = serialNumbers.map((serialNumber, index): FireExtinguisherUnit => ({
    serialNumber,
    capacityKg: capacities[index] ?? null
  }));

  return mergeUnits(baseUnits, explicitUnits);
}

export function parseFireExtinguisherRates(value: string | null | undefined): FireExtinguisherRate[] {
  if (!value) return DEFAULT_FIRE_EXTINGUISHER_RATES.map((rate) => ({ ...rate }));

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('Formato tariffe non valido.');

    const rates = parsed
      .map((item): FireExtinguisherRate | null => {
        if (!item || typeof item !== 'object') return null;
        const capacityKg = Number(item.capacityKg);
        const priceCents = Number(item.priceCents);
        if (!Number.isInteger(capacityKg) || capacityKg <= 0 || capacityKg > 100) return null;
        if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 999999999) return null;
        return { capacityKg, priceCents };
      })
      .filter((rate): rate is FireExtinguisherRate => rate !== null);

    if (rates.length === 0) throw new Error('Nessuna tariffa valida.');
    return rates.sort((left, right) => left.capacityKg - right.capacityKg);
  } catch {
    return DEFAULT_FIRE_EXTINGUISHER_RATES.map((rate) => ({ ...rate }));
  }
}

export function serializeFireExtinguisherRates(rates: FireExtinguisherRate[]): string {
  return JSON.stringify(
    rates
      .map((rate) => ({ capacityKg: rate.capacityKg, priceCents: rate.priceCents }))
      .sort((left, right) => left.capacityKg - right.capacityKg)
  );
}

export function calculateFireExtinguisherCost(
  units: FireExtinguisherUnit[],
  rates: FireExtinguisherRate[]
): number | null {
  if (units.length === 0) return null;
  const rateByCapacity = new Map(rates.map((rate) => [rate.capacityKg, rate.priceCents]));
  let total = 0;

  for (const unit of units) {
    if (unit.capacityKg === null) return null;
    const price = rateByCapacity.get(unit.capacityKg);
    if (price === undefined) return null;
    total += price;
  }

  return total;
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value / 100);
}

export function formatFireExtinguisherNotes(
  units: FireExtinguisherUnit[],
  rates: FireExtinguisherRate[]
): string | null {
  if (units.length === 0) return null;
  const rateByCapacity = new Map(rates.map((rate) => [rate.capacityKg, rate.priceCents]));
  const lines = units.map((unit) => {
    if (unit.capacityKg === null) return `- Matricola ${unit.serialNumber} — peso da verificare`;
    const price = rateByCapacity.get(unit.capacityKg);
    return price === undefined
      ? `- Matricola ${unit.serialNumber} — ${unit.capacityKg} kg — tariffa da configurare`
      : `- Matricola ${unit.serialNumber} — ${unit.capacityKg} kg — ${formatEuro(price)}`;
  });
  const total = calculateFireExtinguisherCost(units, rates);

  return [
    'Estintori rilevati:',
    ...lines,
    total === null ? 'Totale servizio: da verificare' : `Totale servizio: ${formatEuro(total)}`
  ].join('\n');
}
