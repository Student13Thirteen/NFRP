export type DriverNameCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  active?: boolean;
};

export type DriverNameSuggestion<T extends DriverNameCandidate> = {
  driver: T;
  score: number;
};

export const TRIP_IMPORT_DRIVER_FIELD_PREFIX = 'tripDriverId:';

const STOP_WORDS = new Set(['autista', 'conducente', 'driver', 'sig', 'sigra', 'signor', 'signora']);
const MINIMUM_SCORE = 0.8;
const MINIMUM_MARGIN = 0.12;

function normalizeNameTokens(value: string): string[] {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function tokenSimilarity(left: string, right: string): number {
  const longest = Math.max(left.length, right.length);
  if (longest === 0) return 0;
  return 1 - levenshteinDistance(left, right) / longest;
}

function candidateScore(sourceTokens: string[], candidate: DriverNameCandidate): number {
  const candidateTokens = normalizeNameTokens(`${candidate.firstName} ${candidate.lastName}`);
  if (candidateTokens.length === 0) return 0;

  const coverage = sourceTokens.map((sourceToken) =>
    Math.max(...candidateTokens.map((candidateToken) => tokenSimilarity(sourceToken, candidateToken)))
  );
  return coverage.reduce((sum, score) => sum + score, 0) / coverage.length;
}

export function findDriverNameSuggestion<T extends DriverNameCandidate>(
  ocrName: string | null | undefined,
  drivers: T[]
): DriverNameSuggestion<T> | null {
  const sourceTokens = normalizeNameTokens(ocrName || '');
  if (sourceTokens.length === 0 || drivers.length === 0) return null;

  const ranked = drivers
    .map((driver) => ({ driver, score: candidateScore(sourceTokens, driver) }))
    .sort((left, right) => right.score - left.score || left.driver.id.localeCompare(right.driver.id));
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < MINIMUM_SCORE) return null;
  if (second && best.score - second.score < MINIMUM_MARGIN) return null;

  return best;
}

export function getTripImportDriverFieldName(rowId: string): string {
  return `${TRIP_IMPORT_DRIVER_FIELD_PREFIX}${rowId}`;
}
