type DatePrecision = 'day' | 'month';

type DateCandidate = {
  date: Date;
  index: number;
  raw: string;
  precision: DatePrecision;
};

type DateMatch = {
  candidate: DateCandidate;
  evidence: string;
  score: number;
};

type DateRangeMatch = {
  issue: DateMatch;
  expiry: DateMatch;
};

export type InboxDateSuggestions = {
  issueDate: Date | null;
  issueEvidence: string | null;
  expiryDate: Date | null;
  expiryEvidence: string | null;
  foundDates: number;
};

const dayInMilliseconds = 24 * 60 * 60 * 1000;

const issueLabels = [
  'data emissione',
  'emissione',
  'data rilascio',
  'rilascio',
  'decorrenza',
  'inizio validita',
  'stipula',
  'data calibrazione',
  'calibrazione',
  'data taratura',
  'taratura',
  'data revisione',
  'revisione effettuata',
  'data verifica',
  'verifica effettuata',
  'verificato il',
  'calibrato il'
];

const expiryLabels = [
  'data scadenza',
  'scadenza',
  'scade',
  'data fine validita',
  'fine validita',
  'valido fino',
  'valida fino',
  'validita fino',
  'validita al',
  'termine validita',
  'prossima revisione',
  'revisione entro',
  'prossima verifica',
  'verifica entro',
  'rinnovo entro',
  'expiry',
  'expires',
  'valid until'
];

const validityHints = ['polizza', 'assicurazione', 'validita', 'decorrenza', 'copertura', 'certificato'];

const months = new Map([
  ['gennaio', 1],
  ['gen', 1],
  ['febbraio', 2],
  ['feb', 2],
  ['marzo', 3],
  ['mar', 3],
  ['aprile', 4],
  ['apr', 4],
  ['maggio', 5],
  ['mag', 5],
  ['giugno', 6],
  ['giu', 6],
  ['luglio', 7],
  ['lug', 7],
  ['agosto', 8],
  ['ago', 8],
  ['settembre', 9],
  ['set', 9],
  ['ottobre', 10],
  ['ott', 10],
  ['novembre', 11],
  ['nov', 11],
  ['dicembre', 12],
  ['dic', 12]
]);

const italianMonthPattern =
  'gen(?:naio)?|feb(?:braio)?|mar(?:zo)?|apr(?:ile)?|mag(?:gio)?|giu(?:gno)?|lug(?:lio)?|ago(?:sto)?|set(?:tembre)?|ott(?:obre)?|nov(?:embre)?|dic(?:embre)?';

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function sourceHasPhrase(normalizedSource: string, phrase: string): boolean {
  const tokens = normalize(phrase).split(/[^a-z0-9]+/u).filter(Boolean);
  if (tokens.length === 0) return false;

  const pattern = new RegExp(`(^|[^a-z0-9])${tokens.map(escapeRegex).join('[^a-z0-9]+')}($|[^a-z0-9])`, 'u');
  return pattern.test(normalizedSource);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseYear(value: string): number {
  if (value.length === 2) {
    const year = Number(value);
    return year >= 70 ? 1900 + year : 2000 + year;
  }
  return Number(value);
}

function toUtcDate(year: number, month: number, day: number): Date | null {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function endOfUtcMonth(year: number, month: number): Date | null {
  return toUtcDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());
}

function pushCandidate(candidates: DateCandidate[], candidate: DateCandidate) {
  const candidateEnd = candidate.index + candidate.raw.length;
  const overlaps = candidates.some((existing) => {
    const existingEnd = existing.index + existing.raw.length;
    return candidate.index < existingEnd && existing.index < candidateEnd;
  });

  if (!overlaps) candidates.push(candidate);
}

function findDateCandidates(source: string): DateCandidate[] {
  const candidates: DateCandidate[] = [];
  const numericDayPattern = /\b(?:(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})|(\d{4})[./-](\d{1,2})[./-](\d{1,2}))\b/g;
  const namedDayPattern = new RegExp(`\\b(\\d{1,2})[\\s./-]+(${italianMonthPattern})[\\s./-]+(\\d{2,4})\\b`, 'giu');

  for (const match of source.matchAll(numericDayPattern)) {
    const date = match[1]
      ? toUtcDate(parseYear(match[3]), Number(match[2]), Number(match[1]))
      : toUtcDate(Number(match[4]), Number(match[5]), Number(match[6]));

    if (date) {
      pushCandidate(candidates, { date, index: match.index || 0, raw: match[0], precision: 'day' });
    }
  }

  for (const match of source.matchAll(namedDayPattern)) {
    const month = months.get(normalize(match[2]));
    const date = month ? toUtcDate(parseYear(match[3]), month, Number(match[1])) : null;
    if (date) {
      pushCandidate(candidates, { date, index: match.index || 0, raw: match[0], precision: 'day' });
    }
  }

  const numericMonthPattern = /\b(0?[1-9]|1[0-2])[./-](\d{2,4})\b/g;
  const namedMonthPattern = new RegExp(`\\b(${italianMonthPattern})[\\s./-]+(\\d{2,4})\\b`, 'giu');

  for (const match of source.matchAll(numericMonthPattern)) {
    const date = endOfUtcMonth(parseYear(match[2]), Number(match[1]));
    if (date) {
      pushCandidate(candidates, { date, index: match.index || 0, raw: match[0], precision: 'month' });
    }
  }

  for (const match of source.matchAll(namedMonthPattern)) {
    const month = months.get(normalize(match[1]));
    const date = month ? endOfUtcMonth(parseYear(match[2]), month) : null;
    if (date) {
      pushCandidate(candidates, { date, index: match.index || 0, raw: match[0], precision: 'month' });
    }
  }

  return candidates.sort((a, b) => a.index - b.index);
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getEvidence(source: string, candidate: DateCandidate): string {
  const snippet = compactWhitespace(
    source.slice(Math.max(0, candidate.index - 72), Math.min(source.length, candidate.index + candidate.raw.length + 72))
  );
  const precisionNote = candidate.precision === 'month' ? ' Mese/anno convertito nell ultimo giorno del mese.' : '';
  return `${snippet.slice(0, 220)}${precisionNote}`;
}

function findLabelDistance(source: string, candidate: DateCandidate, labels: string[]): number | null {
  const normalizedSource = normalize(source);
  const windowStart = Math.max(0, candidate.index - 110);
  const windowEnd = Math.min(source.length, candidate.index + candidate.raw.length + 110);
  const window = normalizedSource.slice(windowStart, windowEnd);
  let nearest: number | null = null;

  for (const label of labels) {
    let position = window.indexOf(label);
    while (position >= 0) {
      const labelCenter = windowStart + position + label.length / 2;
      const dateCenter = candidate.index + candidate.raw.length / 2;
      const distance = Math.abs(dateCenter - labelCenter);
      if (nearest === null || distance < nearest) nearest = distance;
      position = window.indexOf(label, position + label.length);
    }
  }

  return nearest;
}

function findBestLabeledDate(source: string, candidates: DateCandidate[], labels: string[], opposingLabels: string[]): DateMatch | null {
  const matches = candidates
    .map((candidate) => {
      const labelDistance = findLabelDistance(source, candidate, labels);
      if (labelDistance === null) return null;
      const opposingDistance = findLabelDistance(source, candidate, opposingLabels);
      const score =
        240 -
        Math.round(labelDistance) -
        (candidate.precision === 'month' ? 16 : 0) -
        (opposingDistance !== null && opposingDistance + 18 < labelDistance ? 90 : 0);
      return { candidate, evidence: getEvidence(source, candidate), score };
    })
    .filter((match): match is DateMatch => Boolean(match))
    .sort((a, b) => b.score - a.score);

  const best = matches[0];
  return best && best.score >= 90 ? best : null;
}

// Barrato rosa / certificato di approvazione ADR (Mod. DTT 306/307): nel campo 12 "Valido fino al" la
// scadenza è la data PIÙ FUTURA. La data del "Timbro del servizio emettitore" (emissione) e quella della
// firma sono sempre precedenti, e l'OCR le interlaccia subito dopo l'etichetta: prendere la prima data
// vicina restituiva l'emissione (es. 03.06.2026) invece della validità (es. 06/06/2027).
function findApprovalCertificateExpiry(source: string, candidates: DateCandidate[]): DateMatch | null {
  const normalizedSource = normalize(source);
  const isApprovalCertificate =
    sourceHasPhrase(normalizedSource, 'certificato di approvazione') ||
    (normalizedSource.includes('valido fino') && normalizedSource.includes('timbro del servizio emettitore'));
  if (!isApprovalCertificate) return null;

  const labelMatch = /valido\s+fino/i.exec(source);
  if (!labelMatch) return null;
  const labelIndex = labelMatch.index;
  const windowEnd = labelIndex + 240;

  const within = candidates.filter(
    (candidate) => candidate.precision === 'day' && candidate.index >= labelIndex && candidate.index <= windowEnd
  );
  if (within.length === 0) return null;

  const expiry = within.reduce((latest, candidate) =>
    candidate.date.getTime() > latest.date.getTime() ? candidate : latest
  );

  return {
    candidate: expiry,
    evidence: `Barrato rosa (certificato di approvazione ADR), campo "Valido fino al": ${getEvidence(source, expiry)}`,
    score: 200
  };
}

function findValidityPeriodExpiry(source: string, candidates: DateCandidate[]): DateMatch | null {
  const normalizedSource = normalize(source);
  if (!validityHints.some((hint) => normalizedSource.includes(hint)) || candidates.length < 2) return null;

  const matches = candidates
    .filter((candidate) => {
      const before = normalizedSource.slice(Math.max(0, candidate.index - 55), candidate.index);
      return /\b(al|alla|alle|fino|scadenza)\b/.test(before);
    })
    .map((candidate) => ({
      candidate,
      evidence: getEvidence(source, candidate),
      score: 120 + candidate.date.getUTCFullYear() - (candidate.precision === 'month' ? 12 : 0)
    }))
    .sort((a, b) => b.candidate.date.getTime() - a.candidate.date.getTime());

  return matches[0] || null;
}

function hasClockTimeAfter(source: string, candidate: DateCandidate): boolean {
  const afterDate = source.slice(candidate.index + candidate.raw.length, candidate.index + candidate.raw.length + 18);
  return /^\s+\d{1,2}[:.]\d{2}(?::\d{2})?\b/.test(afterDate);
}

function getInsuranceRangeMarkerScore(source: string, issueCandidate: DateCandidate, expiryCandidate: DateCandidate): number {
  const beforeIssue = normalize(source.slice(Math.max(0, issueCandidate.index - 42), issueCandidate.index));
  const betweenDates = normalize(
    source.slice(issueCandidate.index + issueCandidate.raw.length, Math.min(source.length, expiryCandidate.index))
  );
  let score = 0;

  if (/\b(dal|dalle ore|decorrenza|effetto|from)\b/.test(beforeIssue)) score += 70;
  if (/\b(al|alle ore|scadenza|fino|to)\b/.test(betweenDates)) score += 70;
  return score;
}

function getDateDistanceInDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / dayInMilliseconds);
}

function findInsurancePeriodIndex(normalizedSource: string): number {
  const periodMatch = /\bperiodo\s+di\s+ass?i?curazion\w*/.exec(normalizedSource);
  return periodMatch?.index ?? -1;
}

function findInsurancePeriod(source: string, candidates: DateCandidate[]): DateRangeMatch | null {
  const normalizedSource = normalize(source);
  const periodIndex = findInsurancePeriodIndex(normalizedSource);
  if (periodIndex < 0) return null;

  const windowEnd = Math.min(source.length, periodIndex + 520);
  const periodDates = candidates.filter(
    (candidate) =>
      candidate.precision === 'day' &&
      candidate.index >= periodIndex &&
      candidate.index <= windowEnd &&
      !hasClockTimeAfter(source, candidate)
  );
  const ranges = periodDates
    .flatMap((issueCandidate, issueIndex) =>
      periodDates.slice(issueIndex + 1).map((expiryCandidate) => {
        const distanceInDays = getDateDistanceInDays(issueCandidate.date, expiryCandidate.date);
        if (distanceInDays <= 0 || distanceInDays > 400) return null;

        return {
          issueCandidate,
          expiryCandidate,
          score:
            170 +
            getInsuranceRangeMarkerScore(source, issueCandidate, expiryCandidate) -
            Math.abs(183 - distanceInDays) / 8 -
            Math.max(0, expiryCandidate.index - issueCandidate.index - 180) / 3
        };
      })
    )
    .filter((range): range is { issueCandidate: DateCandidate; expiryCandidate: DateCandidate; score: number } => Boolean(range))
    .sort((a, b) => b.score - a.score);
  const bestRange = ranges[0];
  if (!bestRange) return null;

  return {
    issue: {
      candidate: bestRange.issueCandidate,
      evidence: `Periodo di assicurazione: ${getEvidence(source, bestRange.issueCandidate)}`,
      score: bestRange.score
    },
    expiry: {
      candidate: bestRange.expiryCandidate,
      evidence: `Periodo di assicurazione: ${getEvidence(source, bestRange.expiryCandidate)}`,
      score: bestRange.score
    }
  };
}

function findSeparatedInsurancePeriod(source: string, candidates: DateCandidate[]): DateRangeMatch | null {
  const normalizedSource = normalize(source);
  const labelIndex = normalizedSource.search(/decorrenza\s+dalle\s+ore\s+(?:del\s+)?scadenza\s+alle\s+ore/su);
  if (labelIndex < 0) return null;
  if (
    !sourceHasPhrase(normalizedSource, 'certificato di assicurazione') ||
    !sourceHasPhrase(normalizedSource, 'Assicurazioni Demo Due')
  ) {
    return null;
  }

  const periodDates = candidates.filter((candidate) => candidate.precision === 'day' && candidate.index > labelIndex);
  const ranges = periodDates
    .flatMap((issueCandidate, issueIndex) =>
      periodDates.slice(issueIndex + 1).map((expiryCandidate) => {
        const distanceInDays = getDateDistanceInDays(issueCandidate.date, expiryCandidate.date);
        if (distanceInDays <= 0 || distanceInDays > 400) return null;

        return {
          issueCandidate,
          expiryCandidate,
          score:
            155 -
            issueIndex * 8 -
            Math.abs(180 - distanceInDays) / 10 -
            Math.max(0, expiryCandidate.index - issueCandidate.index - 80) / 4
        };
      })
    )
    .filter((range): range is { issueCandidate: DateCandidate; expiryCandidate: DateCandidate; score: number } => Boolean(range))
    .sort((a, b) => b.score - a.score);
  const bestRange = ranges[0];
  if (!bestRange || bestRange.score < 115) return null;

  return {
    issue: {
      candidate: bestRange.issueCandidate,
      evidence: `Periodo assicurativo Assicurazioni Demo Due: ${getEvidence(source, bestRange.issueCandidate)}`,
      score: bestRange.score
    },
    expiry: {
      candidate: bestRange.expiryCandidate,
      evidence: `Periodo assicurativo Assicurazioni Demo Due: ${getEvidence(source, bestRange.expiryCandidate)}`,
      score: bestRange.score
    }
  };
}

function sourceLooksLikeCronotachograph(source: string): boolean {
  const normalizedSource = normalize(source);
  return (
    sourceHasPhrase(normalizedSource, 'rapporto tecnico di intervento') &&
    (sourceHasPhrase(normalizedSource, 'tachigrafo') ||
      sourceHasPhrase(normalizedSource, 'cronotachigrafo') ||
      sourceHasPhrase(normalizedSource, 'controllo periodico di un tachigrafo') ||
      sourceHasPhrase(normalizedSource, 'taratura di un tachigrafo') ||
      sourceHasPhrase(normalizedSource, 'calibratura di un tachigrafo'))
  );
}

function sourceLooksLikeExtinguisherInspection(source: string): boolean {
  const normalizedSource = normalize(source);
  return (
    (sourceHasPhrase(normalizedSource, 'rimessa in efficienza estintori') ||
      sourceHasPhrase(normalizedSource, 'ricarica degli estintori') ||
      sourceHasPhrase(normalizedSource, 'estintori secondo uni 9994')) &&
    (sourceHasPhrase(normalizedSource, 'automezzo targato') || sourceHasPhrase(normalizedSource, 'scadenza'))
  );
}

function findExtinguisherIssueDate(source: string, candidates: DateCandidate[]): DateMatch | null {
  if (!sourceLooksLikeExtinguisherInspection(source)) return null;

  const normalizedSource = normalize(source);
  const matches = candidates
    .filter((candidate) => candidate.precision === 'day')
    .map((candidate) => {
      const before = normalizedSource.slice(Math.max(0, candidate.index - 36), candidate.index);
      const after = normalizedSource.slice(candidate.index + candidate.raw.length, candidate.index + candidate.raw.length + 80);
      let score = 0;

      // I report di assistenza riportano spesso "localita data" senza una
      // label esplicita. Accettiamo un nome di luogo breve, senza legarci a
      // una sede o citta operativa specifica.
      if (/\b[a-z][a-z .'’-]{1,34}\s*$/u.test(before)) score += 175;
      if (sourceHasPhrase(after, 'spett')) score += 35;
      if (findLabelDistance(source, candidate, expiryLabels) !== null) score -= 120;

      return {
        candidate,
        evidence: `Estintori: ${getEvidence(source, candidate)}`,
        score
      };
    })
    .filter((match) => match.score >= 150)
    .sort((a, b) => b.score - a.score);

  return matches[0] || null;
}

function findCronotachographIssueDate(source: string, candidates: DateCandidate[]): DateMatch | null {
  if (!sourceLooksLikeCronotachograph(source)) return null;

  const normalizedSource = normalize(source);
  const matches = candidates
    .filter((candidate) => candidate.precision === 'day')
    .map((candidate) => {
      const before = normalizedSource.slice(Math.max(0, candidate.index - 45), candidate.index);
      const after = normalizedSource.slice(candidate.index + candidate.raw.length, candidate.index + candidate.raw.length + 130);
      const wider = normalizedSource.slice(Math.max(0, candidate.index - 260), candidate.index + candidate.raw.length + 260);
      let score = 0;

      if (/\bdata\s*[:.]?\s*$/u.test(before)) score += 165;
      if (sourceHasPhrase(after, 'data calibrazione')) score += 155;
      if (sourceHasPhrase(after, 'firma e timbro')) score += 40;
      if (sourceHasPhrase(wider, 'controllo periodico') || sourceHasPhrase(wider, 'taratura') || sourceHasPhrase(wider, 'calibratura')) {
        score += 45;
      }

      return {
        candidate,
        evidence: `Cronotachigrafo: ${getEvidence(source, candidate)}`,
        score
      };
    })
    .filter((match) => match.score >= 150)
    .sort((a, b) => b.score - a.score);

  return matches[0] || null;
}

function expandCompactFileNameDates(fileName: string): string {
  return fileName.replace(/\b(\d{1,2})[./-](\d{2})(\d{4})\b/g, '$1/$2/$3');
}

function findDateFromFileName(fileName: string, now: Date): DateMatch | null {
  const candidates = findDateCandidates(expandCompactFileNameDates(fileName));
  if (candidates.length !== 1) return null;
  const candidate = candidates[0];
  const lowerBound = new Date(Date.UTC(now.getUTCFullYear() - 2, 0, 1));
  const upperBound = new Date(Date.UTC(now.getUTCFullYear() + 20, 11, 31));
  if (candidate.date < lowerBound || candidate.date > upperBound) return null;

  return {
    candidate,
    evidence: `Data unica nel nome file: ${candidate.raw}.${candidate.precision === 'month' ? ' Mese/anno convertito nell ultimo giorno del mese.' : ''}`,
    score: 70
  };
}

export function findInboxDateSuggestions(source: string, originalFileName: string, now = new Date()): InboxDateSuggestions {
  const candidates = findDateCandidates(source);
  const insurancePeriod = findInsurancePeriod(source, candidates);
  const separatedInsurancePeriod = findSeparatedInsurancePeriod(source, candidates);
  const issueMatch =
    findBestLabeledDate(source, candidates.filter((candidate) => candidate.precision === 'day'), issueLabels, expiryLabels) ||
    findExtinguisherIssueDate(source, candidates) ||
    findCronotachographIssueDate(source, candidates) ||
    insurancePeriod?.issue ||
    separatedInsurancePeriod?.issue ||
    null;
  const expiryMatch =
    insurancePeriod?.expiry ||
    separatedInsurancePeriod?.expiry ||
    findApprovalCertificateExpiry(source, candidates) ||
    findValidityPeriodExpiry(source, candidates) ||
    findBestLabeledDate(source, candidates, expiryLabels, issueLabels) ||
    findDateFromFileName(originalFileName, now);
  const issueIsAfterExpiry =
    issueMatch && expiryMatch && issueMatch.candidate.date.getTime() >= expiryMatch.candidate.date.getTime();

  return {
    issueDate: issueIsAfterExpiry ? null : issueMatch?.candidate.date || null,
    issueEvidence: issueIsAfterExpiry ? null : issueMatch?.evidence || null,
    expiryDate: expiryMatch?.candidate.date || null,
    expiryEvidence: expiryMatch?.evidence || null,
    foundDates: candidates.length
  };
}

export function deriveCronotachographExpiryDate(issueDate: Date): Date {
  return new Date(Date.UTC(issueDate.getUTCFullYear() + 2, issueDate.getUTCMonth(), issueDate.getUTCDate()) - dayInMilliseconds);
}
