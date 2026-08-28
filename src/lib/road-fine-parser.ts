export type ParsedRoadFineVehicleKind = 'TRACTOR' | 'TRAILER';

export type ParsedRoadFine = {
  isRoadFine: boolean;
  noticeNumber: string | null;
  authority: string | null;
  violationDate: Date | null;
  violationTime: string | null;
  notificationDate: Date | null;
  location: string | null;
  violationCode: string | null;
  description: string | null;
  plate: string | null;
  vehicleKind: ParsedRoadFineVehicleKind | null;
  driverName: string | null;
  pointsDeducted: number | null;
  reducedAmountCents: number | null;
  standardAmountCents: number | null;
  discountedPaymentDueDate: Date | null;
  paymentDueDate: Date | null;
  appealDueDate: Date | null;
  reviewReasons: string[];
};

function compact(value: string): string {
  return value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
}

function cleanCapture(value: string | undefined, max = 400): string | null {
  const cleaned = compact(value || '').replace(/^[,;:\s-]+|[,;:\s-]+$/g, '');
  return cleaned ? cleaned.slice(0, max) : null;
}

function titleCase(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .replace(/(^|[\s'-])([a-zà-öø-ÿ])/giu, (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('it-IT')}`)
    .trim();
}

function parseItalianDate(value: string | undefined): Date | null {
  const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value?.trim() || '');
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  if (
    date.getUTCFullYear() !== Number(match[3]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[1])
  ) return null;
  return date;
}

function moneyCents(value: string | undefined): number | null {
  const normalized = (value || '').replace(/\./g, '').replace(',', '.').replace(/\s/g, '');
  if (!/^\d+(?:\.\d{2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

function firstCaptured(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = cleanCapture(match?.[1], 240);
    if (value) return value;
  }
  return null;
}

function parseNoticeNumber(text: string): string | null {
  return firstCaptured(text, [
    /\bVerbale\s+di\s+(?:violazione|contestazione)\s+n(?:r\.?|°)?\s*:?[ ]*([A-Z0-9][A-Z0-9./-]{2,})/i,
    /\bVerbale\s+n(?:r\.?|°)?\s*:?[ ]*([A-Z0-9][A-Z0-9./-]{2,})/i,
    /\bVerbale\s+Numero\s*:\s*([A-Z0-9][A-Z0-9./-]{2,})/i
  ]);
}

function parseAuthority(text: string): string | null {
  const municipality = /\bCOMUNE\s+DI\s+([\p{L}' -]{2,80}?)\s+(?:SERVIZIO|CORPO|COMANDO)\s+(?:DI\s+)?POLIZIA\s+LOCALE\b/iu.exec(text);
  if (municipality?.[1]) return `Comune di ${titleCase(municipality[1])} · Servizio Polizia Locale`;

  const province = /\bProvincia\s+di\s+([\p{L}' -]{2,80}?)\s+CORPO\s+DI\s+POLIZIA\s+PROVINCIALE\b/iu.exec(text);
  if (province?.[1]) return `Provincia di ${titleCase(province[1])} · Corpo di Polizia Provinciale`;

  const genericMunicipality = /\bCOMUNE\s+DI\s+([\p{L}' -]{2,80})\b/iu.exec(text);
  if (genericMunicipality?.[1] && /\bPOLIZIA\s+LOCALE\b/i.test(text)) {
    return `Comune di ${titleCase(genericMunicipality[1])} · Polizia Locale`;
  }
  return null;
}

function parseViolationDateTime(text: string): { date: Date | null; time: string | null } {
  const patterns = [
    /\bData\s*:\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s*Ora\s*:\s*([0-2]?\d:[0-5]\d)\b/i,
    /\bIl\s+giorno\s+(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s+alle\s+ore\s+([0-2]?\d:[0-5]\d)\b/i
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const date = parseItalianDate(match?.[1]);
    if (date) return { date, time: match?.[2]?.padStart(5, '0') || null };
  }
  return { date: null, time: null };
}

function parseNotificationDate(text: string): Date | null {
  const patterns = [
    /\bnotificat[oa]\s+(?:in\s+data|il)\s+(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/i,
    /\bdata\s+(?:di\s+)?notifica\s*:\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/i
  ];
  for (const pattern of patterns) {
    const parsed = parseItalianDate(pattern.exec(text)?.[1]);
    if (parsed) return parsed;
  }
  return null;
}

function parseLabeledDate(text: string, patterns: RegExp[]): Date | null {
  for (const pattern of patterns) {
    const parsed = parseItalianDate(pattern.exec(text)?.[1]);
    if (parsed) return parsed;
  }
  return null;
}

function parseDriverName(text: string): string | null {
  return firstCaptured(text, [
    /\bConducente\s*:\s*([\p{L}' -]{3,100}?)(?=\s+(?:Nato|Residente|Patente|Codice\s+fiscale|Veicolo|Targa)\b)/iu,
    /\bTrasgressore\s*:\s*([\p{L}' -]{3,100}?)(?=\s+(?:Nato|Residente|Patente|Codice\s+fiscale|Veicolo|Targa)\b)/iu
  ]);
}

function parsePoints(text: string): number | null {
  const patterns = [
    /\bdecurtazione(?:\s+di)?\s*(?:n\.?\s*)?(\d{1,2})\s+punti\b/i,
    /\bpunti\s+(?:patente|da\s+decurtare)\s*:\s*(\d{1,2})\b/i
  ];
  for (const pattern of patterns) {
    const value = Number(pattern.exec(text)?.[1]);
    if (Number.isInteger(value) && value >= 0 && value <= 100) return value;
  }
  return null;
}

function parseLocation(text: string): string | null {
  const patterns = [
    /\bpoich[eéè]\s+il\s+giorno\s+\d{1,2}[./-]\d{1,2}[./-]\d{4}\s+alle\s+ore\s+[0-2]?\d:[0-5]\d\s+in\s+(.+?)(?=\s*,?\s+ove\b)/i,
    /\bIl\s+giorno\s+\d{1,2}[./-]\d{1,2}[./-]\d{4}\s+alle\s+ore\s+[0-2]?\d:[0-5]\d\s+in\s+(.+?)(?=\s+il\s+conducente\b)/i
  ];
  return firstCaptured(text, patterns);
}

function parsePlate(text: string): { plate: string | null; vehicleKind: ParsedRoadFineVehicleKind | null } {
  const pattern = /\b(?:Veicolo\s+Targa\s*:|targa(?:to)?\s+)([A-Z]{2}\s*\d{3}\s*[A-Z]{2})\b/gi;
  let fallbackPlate: string | null = null;
  for (const match of text.matchAll(pattern)) {
    if (!match[1] || match.index === undefined) continue;
    const plate = match[1].toLocaleUpperCase('it-IT').replace(/\s/g, '');
    fallbackPlate ||= plate;
    const context = text.slice(Math.max(0, match.index - 180), Math.min(text.length, match.index + match[0].length + 180));
    if (/\b(?:SEMI)?RIMORCHIO\b/i.test(context)) return { plate, vehicleKind: 'TRAILER' };
    if (/\b(?:TRATTORE|AUTOCARRO|MOTRICE|AUTOVETTURA)\b/i.test(context)) return { plate, vehicleKind: 'TRACTOR' };
  }
  return { plate: fallbackPlate, vehicleKind: null };
}

function parseViolationCodeMatch(text: string): { code: string | null; index: number } {
  const match = /\bha\s+violato[\s\S]{0,260}?((?:l['’]\s*)?art\.?\s*\d+(?:\s*(?:[/.-]\s*\d+(?:-\d+)?|c(?:\.|omma)?\s*\d+(?:-\d+)?))*)/i.exec(text);
  if (!match?.[1]) return { code: null, index: -1 };
  const raw = match[1].replace(/^l['’]\s*/i, '');
  const code = compact(raw).replace(/^art\.?/i, 'Art.');
  return { code, index: match.index + match[0].lastIndexOf(match[1]) };
}

function parseDescription(text: string, violationCode: string | null, codeIndex: number): string | null {
  const speeding = /\bpoich[eéè]\s*:\s*(circolava[\s\S]+?)(?=\s+La\s+velocit[aà]\s+come\s+sopra\s+determinata|\s+Non\s+[eè]\s+stato\s+possibile)/i.exec(text);
  if (speeding?.[1]) return cleanCapture([violationCode, cleanCapture(speeding[1], 3000)].filter(Boolean).join(': '), 4000);

  if (codeIndex >= 0) {
    const section = text.slice(codeIndex);
    const end = section.search(/\s+(?:Sanzioni\s+accessorie|MOTIVO\s+DELLA\s+MANCATA\s+CONTESTAZIONE|PROPRIETARIO\s+OVVERO)\b/i);
    return cleanCapture(end >= 0 ? section.slice(0, end) : section.slice(0, 2000), 4000);
  }
  return null;
}

function parseAmounts(text: string): { reduced: number | null; standard: number | null } {
  const totals: number[] = [];
  const totalPattern = /(?:per\s+un\s+)?totale(?:\s+di)?\s*€\s*([0-9.]+,\d{2})/gi;
  for (const match of text.matchAll(totalPattern)) {
    const cents = moneyCents(match[1]);
    if (cents !== null && !totals.includes(cents)) totals.push(cents);
  }
  if (totals.length >= 2) return { reduced: totals[0]!, standard: totals[1]! };

  const reduced = moneyCents(/([0-9.]+,\d{2})\s+Euro\s+entro\s+5\s+gg/i.exec(text)?.[1]);
  const standard = moneyCents(/([0-9.]+,\d{2})\s+Euro\s+entro\s+60\s+gg/i.exec(text)?.[1]);
  return { reduced: totals[0] ?? reduced, standard };
}

export function parseRoadFineText(input: string): ParsedRoadFine {
  const text = compact(input);
  const isRoadFine = /\bCODICE\s+DELLA\s+STRADA\b/i.test(text) && /\b(?:VIOLAZIONE|CONTESTAZIONE)\b/i.test(text) && /\bVERBALE\b/i.test(text);
  const noticeNumber = parseNoticeNumber(text);
  const authority = parseAuthority(text);
  const violation = parseViolationDateTime(text);
  const notificationDate = parseNotificationDate(text);
  const discountedPaymentDueDate = parseLabeledDate(text, [
    /\bscadenza\s+(?:del\s+)?(?:pagamento\s+)?(?:ridotto|scontato)\s*:\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/i
  ]);
  const paymentDueDate = parseLabeledDate(text, [
    /\bscadenza\s+(?:del\s+)?pagamento(?:\s+ordinario)?\s*:\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/i
  ]);
  const appealDueDate = parseLabeledDate(text, [
    /\bscadenza\s+(?:del\s+)?ricorso\s*:\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/i
  ]);
  const location = parseLocation(text);
  const vehicle = parsePlate(text);
  const driverName = parseDriverName(text);
  const pointsDeducted = parsePoints(text);
  const violationCode = parseViolationCodeMatch(text);
  const description = parseDescription(text, violationCode.code, violationCode.index);
  const amounts = parseAmounts(text);
  const reviewReasons = ['Controlla i dati estratti dal PDF prima di cambiare lo stato del verbale.'];

  if (!noticeNumber) reviewReasons.push('Numero verbale non riconosciuto.');
  if (!authority) reviewReasons.push('Autorità emittente non riconosciuta.');
  if (!violation.date) reviewReasons.push('Data dell’infrazione non riconosciuta.');
  if (!location) reviewReasons.push('Luogo dell’infrazione non riconosciuto.');
  if (!violationCode.code) reviewReasons.push('Articolo o violazione non riconosciuti.');
  if (!description) reviewReasons.push('Descrizione della violazione non riconosciuta.');
  if (!vehicle.plate) reviewReasons.push('Targa non riconosciuta: seleziona il mezzo manualmente.');
  if (amounts.reduced === null) reviewReasons.push('Totale ridotto non riconosciuto.');
  if (amounts.standard === null) reviewReasons.push('Totale ordinario non riconosciuto.');
  if (!notificationDate) reviewReasons.push('Data di notifica non riconosciuta: completala solo da una notifica certa.');
  if (!discountedPaymentDueDate && !paymentDueDate && !appealDueDate) reviewReasons.push('Scadenze assolute non indicate: non sono state calcolate dai soli termini relativi.');
  if (!driverName) reviewReasons.push('Autista non indicato esplicitamente nel verbale: selezionalo durante il controllo se necessario.');
  if (pointsDeducted === null) reviewReasons.push('Punti patente non indicati esplicitamente.');
  reviewReasons.push('Responsabilità, pagamento effettivo e addebito all’autista non vengono dedotti automaticamente.');

  return {
    isRoadFine,
    noticeNumber,
    authority,
    violationDate: violation.date,
    violationTime: violation.time,
    notificationDate,
    location,
    violationCode: violationCode.code,
    description,
    plate: vehicle.plate,
    vehicleKind: vehicle.vehicleKind,
    driverName,
    pointsDeducted,
    reducedAmountCents: amounts.reduced,
    standardAmountCents: amounts.standard,
    discountedPaymentDueDate,
    paymentDueDate,
    appealDueDate,
    reviewReasons
  };
}
