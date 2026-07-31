export type ParsedTripStop = {
  position: number;
  name: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  plannedTime: string | null;
};

export type ParsedTripWaybill = {
  documentFormat: 'STANDARD' | 'SSL' | 'UNKNOWN';
  documentNumber: string | null;
  documentDate: Date | null;
  tripDate: Date | null;
  driverName: string | null;
  tractorPlate: string | null;
  trailerPlate: string | null;
  carrierName: string | null;
  customerCode: string | null;
  customerName: string | null;
  loadingBaseName: string | null;
  loadingTerminalName: string | null;
  deliveryTerminalName: string | null;
  deliveryName: string | null;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  deliveryProvince: string | null;
  container1: string | null;
  container1Type: string | null;
  seal1: string | null;
  container2: string | null;
  container2Type: string | null;
  seal2: string | null;
  booking: string | null;
  ship: string | null;
  pickupCode: string | null;
  deliveryCode: string | null;
  companyReference: string | null;
  forwarder: string | null;
  compilerName: string | null;
  compilationPlace: string | null;
  stops: ParsedTripStop[];
  reviewReasons: string[];
  rawText: string;
};

export type ParsedTripWaybillDocument = {
  rows: ParsedTripWaybill[];
  skippedSections: number;
};

const standardStopLabels = [
  'DataOraFirma',
  'Arrivo Mezzo',
  'ADRTipo merce',
  'CNT 1',
  'CNT 2',
  'Nave Booking',
  'Terminal di Carico',
  'Cod. ritiro',
  'Terminal di Consegna',
  'Cod. consegna',
  'Transitario',
  'Luogo Compilazione',
  'Firma Compilatore'
];

function compactText(value: string): string {
  return value.replace(/\u0000/g, '').replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function compactSingleLine(value: string | null | undefined): string | null {
  if (!value) return null;
  const compacted = value
    .replace(/_{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+\)/g, ')')
    .trim();
  return compacted || null;
}

function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase('it-IT').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function flexibleLabelPattern(label: string): RegExp {
  const pattern = label
    .trim()
    .split(/\s+/)
    .map(escapeRegex)
    .join('\\s*');
  return new RegExp(pattern, 'iu');
}

function findLabelEnd(text: string, label: string, fromIndex = 0): number {
  const match = flexibleLabelPattern(label).exec(text.slice(fromIndex));
  return match ? fromIndex + (match.index || 0) + match[0].length : -1;
}

function findNextLabelIndex(text: string, labels: string[], fromIndex: number): number {
  let next = -1;

  for (const label of labels) {
    const match = flexibleLabelPattern(label).exec(text.slice(fromIndex));
    if (!match) continue;
    const index = fromIndex + (match.index || 0);
    if (next === -1 || index < next) next = index;
  }

  return next;
}

function valueAfterLabel(text: string, label: string, stopLabels: string[] = standardStopLabels): string | null {
  const start = findLabelEnd(text, label);
  if (start === -1) return null;
  const stop = findNextLabelIndex(text, stopLabels.filter((stopLabel) => stopLabel !== label), start);
  return compactSingleLine(text.slice(start, stop === -1 ? undefined : stop));
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1] ? compactSingleLine(match[1]) : null;
    if (value) return value;
  }
  return null;
}

function parseItalianDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(value);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function findFirstDate(text: string): Date | null {
  return parseItalianDate(firstMatch(text, [/(\d{1,2}[./-]\d{1,2}[./-]\d{4})/]));
}

function dateKey(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : 'senza-data';
}

function normalizePlate(value: string | null | undefined): string | null {
  if (!value) return null;
  const compacted = value.toLocaleUpperCase('it-IT').replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(compacted)) return null;
  return compacted;
}

function findPlates(text: string): string[] {
  const plates = new Set<string>();
  for (const match of text.matchAll(/[A-Z]{2}\s*\d{3}\s*[A-Z]{2}/giu)) {
    const plate = normalizePlate(match[0]);
    if (plate) plates.add(plate);
  }
  return Array.from(plates);
}

function parseVehiclePlates(text: string): { tractorPlate: string | null; trailerPlate: string | null } {
  const vehicleStart = findLabelEnd(text, 'Motrice');
  if (vehicleStart === -1) return { tractorPlate: null, trailerPlate: null };
  const vehicleEnd = vehicleStart === -1 ? -1 : findNextLabelIndex(text, ['Vettore', 'Committente', 'Attenzione'], vehicleStart);
  const vehicleText = text.slice(vehicleStart, vehicleEnd === -1 ? vehicleStart + 220 : vehicleEnd);
  const plates = findPlates(vehicleText);
  return { tractorPlate: plates[0] || null, trailerPlate: plates[1] || null };
}

function parseDriverName(text: string): string | null {
  return firstMatch(text, [
    /Autista\s*([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' .-]{1,60}?)(?=Motrice|Semirimorchio|Vettore|\n|$)/iu,
    /Autista\s*\n\s*([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' .-]{1,60})/iu
  ]);
}

function parseDocumentNumber(text: string): string | null {
  const sslNumber = firstMatch(text, [/\b(SSL\s*\d{2,})\b/iu]);
  if (sslNumber) return sslNumber.toLocaleUpperCase('it-IT').replace(/\s+/g, '');

  return firstMatch(text.slice(0, 400), [
    /(?:^|\n)\s*Nr\.?\s*\n?\s*([A-Z0-9/-]{2,24})/iu,
    /\bNr\.?\s+([A-Z0-9/-]{2,24})\b/iu
  ]);
}

function parseDocumentDate(text: string): Date | null {
  const top = text.slice(0, 600);
  return parseItalianDate(firstMatch(top, [/\bDATA\s*\n?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/iu])) || findFirstDate(top);
}

function cleanBlockLines(value: string | null): string[] {
  if (!value) return [];
  return value
    .split('\n')
    .map((line) => compactSingleLine(line))
    .filter((line): line is string => Boolean(line))
    .filter((line) => !/^h\.?\s*\d{1,2}[:/]\d{2}$/iu.test(line))
    .filter((line) => !/^Data\s*Ora\s*Firma$/iu.test(line))
    .filter((line) => !/^#N\/A$/iu.test(line));
}

function parseLocality(line: string | null | undefined): { city: string | null; province: string | null } {
  if (!line) return { city: null, province: null };
  const withParens = /(?:\d{5}\s*)?(.+?)\s*\(\s*([A-Z]{2})\s*\)/iu.exec(line);
  if (withParens) return { city: compactSingleLine(withParens[1])?.toLocaleUpperCase('it-IT') || null, province: withParens[2].toLocaleUpperCase('it-IT') };

  const plain = /(?:\d{5}\s*)?([A-ZÀ-ÖØ-Ý' .-]+?)\s+([A-Z]{2})$/iu.exec(line);
  if (plain) return { city: compactSingleLine(plain[1])?.toLocaleUpperCase('it-IT') || null, province: plain[2].toLocaleUpperCase('it-IT') };

  return { city: null, province: null };
}

function parsePickupBlock(value: string, position: number): ParsedTripStop | null {
  const cleaned = compactSingleLine(value
    .replace(/Data\s*Ora\s*Firma[\s\S]*$/iu, '')
    .replace(/_{3,}/g, ' '));
  if (!cleaned) return null;

  const plannedMatch = /\bh\.?\s*(\d{1,2})\s*[:.,]\s*(\d{2})\b/iu.exec(cleaned);
  const withoutTime = cleaned.replace(/\bh\.?\s*\d{1,2}\s*[:.,]\s*\d{2}\b[\s\S]*$/iu, '').trim();
  const addressMarker = /\b(VIALE|VIA|CORSO|PIAZZA|STRADA|LOCALIT[ÀA]|LOC\.?)\b/iu.exec(withoutTime);
  const name = compactSingleLine(addressMarker ? withoutTime.slice(0, addressMarker.index) : withoutTime);
  if (!name) return null;

  const addressAndLocality = addressMarker ? withoutTime.slice(addressMarker.index).trim() : null;
  const withPostalCode = addressAndLocality
    ? /^(.*?)\b(\d{5})\s+(.+?)\s*\(\s*([A-Z]{2})\s*\)\s*$/iu.exec(addressAndLocality)
    : null;
  const provinceOnly = !withPostalCode && addressAndLocality
    ? /\(\s*([A-Z]{2})\s*\)/iu.exec(addressAndLocality)
    : null;
  const postalCode = withPostalCode?.[2] || null;
  const city = compactSingleLine(withPostalCode?.[3])?.toLocaleUpperCase('it-IT') || null;
  const province = (withPostalCode?.[4] || provinceOnly?.[1])?.toLocaleUpperCase('it-IT') || null;
  const address = compactSingleLine(
    withPostalCode
      ? withPostalCode[1]
      : addressAndLocality?.replace(/\s*\(\s*[A-Z]{2}\s*\)\s*$/iu, '')
  );

  return {
    position,
    name,
    address,
    postalCode,
    city,
    province,
    plannedTime: plannedMatch ? `${plannedMatch[1]!.padStart(2, '0')}:${plannedMatch[2]}` : null
  };
}

function parseDatiPresaBlocks(text: string): ParsedTripStop[] {
  const matches = Array.from(text.matchAll(/DATI\s*PRESA\s*(\d+)/giu));
  return matches.flatMap((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const nextStart = matches[index + 1]?.index;
    const terminalStop = findNextLabelIndex(text, ['ADRTipo merce', 'CNT 1'], start);
    const end = nextStart !== undefined
      ? nextStart
      : terminalStop === -1
        ? text.length
        : terminalStop;
    const stop = parsePickupBlock(text.slice(start, end), Number(match[1]) - 1);
    return stop ? [stop] : [];
  });
}

function parseTerminalName(text: string, label: string): string | null {
  const value = valueAfterLabel(text, label, [
    'Cod. ritiro',
    'PIN',
    'Rif. Comp',
    'Terminal di Consegna',
    'Cod. consegna',
    'Transitario',
    'Luogo Compilazione',
    'Data',
    'Compilatore'
  ]);
  if (!value) return null;
  return value
    .replace(/\(\s*[A-Z]{2}\s*\)/giu, '')
    .replace(/\b(?:GE|AL|TO|CN|FI|LC|RM|NA)\s*$/iu, '')
    .trim() || null;
}

function parseCodeAfter(text: string, labelPattern: RegExp): string | null {
  const match = labelPattern.exec(text);
  if (!match) return null;
  const value = compactSingleLine(match[1] || '');
  if (!value) return null;
  const token = value.split(/\s+/)[0]?.replace(/RIF.*$/iu, '').replace(/[^A-Z0-9/-]/giu, '') || '';
  return token || null;
}

function parseCompanyReference(text: string): string | null {
  const matches = Array.from(text.matchAll(/Rif\.?\s*Comp\.?\s*([A-Z0-9 ./'-]{2,40}?)(?=\s*(?:Terminal|Cod\.|Transitario|Luogo|Data|Compilatore|$))/giu))
    .map((match) => compactSingleLine(match[1]))
    .filter((value): value is string => Boolean(value));
  return matches[0] || null;
}

function parseCompiler(text: string): { compilationPlace: string | null; compilerName: string | null } {
  const compact = text.replace(/\n/g, ' ');
  return {
    compilationPlace: firstMatch(compact, [/Luogo\s*Compilazione\s*([A-ZÀ-ÖØ-Ý' .-]{2,50}?)(?=Data|Compilatore|Firma|$)/iu]),
    compilerName: firstMatch(compact, [/Compilatore\s*([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' .-]{2,80}?)(?=Firma|$)/iu])
  };
}

function parseContainerSegment(text: string, label: string): { container: string | null; type: string | null; seal: string | null } {
  const value = valueAfterLabel(text, label, [label === 'CNT 1' ? 'CNT 2' : 'Nave Booking', 'Nave Booking', 'Terminal di Carico']);
  if (!value) return { container: null, type: null, seal: null };

  const containerPart = value.split(/Sigillo\s*n?\.?/iu)[0] || '';
  const containerMatch = /(?:^|\s)([A-Z]{4})\s*(\d{6})\s*(\d)(?=\s|20|40|$)/iu.exec(containerPart);
  const afterContainer = containerMatch ? containerPart.slice((containerMatch.index || 0) + containerMatch[0].length) : containerPart;
  const typeMatch = /(20|40)\s*(HC|H|BOX|DV|DC|RF|OT|FR)?/iu.exec(afterContainer) || /(20|40)\s*(HC|H|BOX|DV|DC|RF|OT|FR)?/iu.exec(containerPart);
  const sealCandidate = firstMatch(value, [/Sigillo\s*n\.?\s*([A-Z0-9/-]{3,30})/iu]);
  const seal = sealCandidate && !/^(?:Nave|Booking|Terminal)/iu.test(sealCandidate) ? sealCandidate : null;

  return {
    container: containerMatch ? `${containerMatch[1]}${containerMatch[2]}${containerMatch[3] || ''}`.toLocaleUpperCase('it-IT') : null,
    type: typeMatch ? `${typeMatch[1]}${typeMatch[2] || ''}`.toLocaleUpperCase('it-IT') : null,
    seal
  };
}

function parseStandardWaybill(section: string): ParsedTripWaybill {
  const text = compactText(section);
  const documentDate = parseDocumentDate(text);
  const { tractorPlate, trailerPlate } = parseVehiclePlates(text);
  const stops = parseDatiPresaBlocks(text);
  const firstStop = stops[0] || null;
  const terminalLoad = parseTerminalName(text, 'Terminal di Carico');
  const terminalDelivery = parseTerminalName(text, 'Terminal di Consegna');
  const container1 = parseContainerSegment(text, 'CNT 1');
  const container2 = parseContainerSegment(text, 'CNT 2');
  const compiler = parseCompiler(text);
  const booking = firstMatch(text, [/Booking\s*([A-Z0-9/-]{5,24})(?=\s*Terminal|\s*Cod\.|\s*Rif\.|$)/iu]);
  const ship = firstMatch(text, [/\bNave\s*(?!Booking\b)([A-Z0-9][A-Z0-9 .'-]{1,60}?)(?=\s*Booking|\s*Terminal)/iu]);

  const row: ParsedTripWaybill = {
    documentFormat: 'STANDARD',
    documentNumber: parseDocumentNumber(text),
    documentDate,
    tripDate: documentDate,
    driverName: parseDriverName(text),
    tractorPlate,
    trailerPlate,
    carrierName: firstMatch(text, [
      /Vettore\s*([A-Z0-9 &'().-]{2,80}?)(?=\s+VIA\b|\s+VIALE\b|\s+Committente\b)/iu,
      /Vettore\s*\n\s*([^\n]+)/iu
    ]),
    customerCode: firstMatch(text, [/Committente\s*\n?\s*([0-9]{3,})/iu]),
    customerName: null,
    loadingBaseName: terminalLoad,
    loadingTerminalName: terminalLoad,
    deliveryTerminalName: terminalDelivery,
    deliveryName: firstStop?.name || terminalDelivery,
    deliveryAddress: firstStop?.address || null,
    deliveryCity: firstStop?.city || null,
    deliveryProvince: firstStop?.province || null,
    container1: container1.container,
    container1Type: container1.type,
    seal1: container1.seal,
    container2: container2.container,
    container2Type: container2.type,
    seal2: container2.seal,
    booking,
    ship,
    pickupCode:
      parseCodeAfter(text, /Cod\.?\s*ritiro\s*(?:PIN\s*)?([A-Z0-9/-]{2,40})/iu) ||
      parseCodeAfter(text, /PIN\s*([A-Z0-9/-]{2,40})/iu),
    deliveryCode: parseCodeAfter(text, /Cod\.?\s*consegna\s*([A-Z0-9/-]{2,40})/iu),
    companyReference: parseCompanyReference(text),
    forwarder: valueAfterLabel(text, 'Transitario', ['Luogo Compilazione', 'Data', 'Compilatore']),
    compilerName: compiler.compilerName,
    compilationPlace: compiler.compilationPlace,
    stops,
    reviewReasons: [],
    rawText: text.slice(0, 12000)
  };

  row.reviewReasons = buildReviewReasons(row);
  return row;
}

function parseSslDelivery(text: string): { name: string | null; address: string | null; city: string | null; province: string | null } {
  const match = /([A-Z0-9 &'().-]{2,80}?\s+VIA\s+[A-Z0-9 &'()./-]{2,120}?)(?=\s+PESARE|\s+EVERGREEN|\s+QINGDAO|\n|$)/iu.exec(text);
  const value = compactSingleLine(match?.[1]);
  if (!value) return { name: null, address: null, city: null, province: null };

  const viaIndex = normalizeSearch(value).indexOf(' via ');
  const name = viaIndex > 0 ? value.slice(0, viaIndex).trim() : value;
  const addressAndLocality = viaIndex > 0 ? value.slice(viaIndex + 1).trim() : null;
  const locality = parseLocality(addressAndLocality);

  return {
    name: compactSingleLine(name),
    address: addressAndLocality,
    city: locality.city,
    province: locality.province
  };
}

function parseSslWaybill(section: string): ParsedTripWaybill {
  const text = compactText(section);
  const documentDate = findFirstDate(text);
  const delivery = parseSslDelivery(text);
  const firstLines = cleanBlockLines(text).slice(0, 12);
  const containerType = firstMatch(text.slice(0, 500), [/\b((?:20|40)\s*(?:HC|H|BOX|DV|DC|RF)?)\b/iu]);
  const booking = firstMatch(text.slice(0, 600), [/\b(\d{9,14})\b/u]);
  const terminalHint = firstMatch(text, [/\b(VTE|PSA\s+GENOVA\s+PRA|PESARE\s+A\s+VOLTRI)\b/iu]);

  const row: ParsedTripWaybill = {
    documentFormat: 'SSL',
    documentNumber: parseDocumentNumber(text),
    documentDate,
    tripDate: documentDate,
    driverName: parseDriverName(text),
    ...parseVehiclePlates(text),
    carrierName: firstMatch(text, [/DATI\s+DEL\s+VETTORE\s*([A-Z0-9 &'().-]{2,80})/iu]),
    customerCode: null,
    customerName:
      firstMatch(text, [/DATI\s+DEL\s+PROPRIETARIO\s+DELLA\s+MERCE\s*([A-Z0-9 &'().-]{2,80})/iu]) ||
      firstLines.find((line) => /SRL|SPA|S\.P\.A|S\.R\.L/iu.test(line)) ||
      null,
    loadingBaseName: terminalHint,
    loadingTerminalName: terminalHint,
    deliveryTerminalName: null,
    deliveryName: delivery.name,
    deliveryAddress: delivery.address,
    deliveryCity: delivery.city,
    deliveryProvince: delivery.province,
    container1: null,
    container1Type: compactSingleLine(containerType)?.replace(/\s+/g, '').toLocaleUpperCase('it-IT') || null,
    seal1: null,
    container2: null,
    container2Type: null,
    seal2: null,
    booking,
    ship: firstMatch(text, [/\b(OOCL\s+[A-Z ]{3,40})\b/iu]),
    pickupCode: null,
    deliveryCode: null,
    companyReference: firstMatch(text, [/\b(EVERGREEN|YANG\s+MING|COSCO|HAPAG|MAERSK)\b/iu]),
    forwarder: firstMatch(text, [/\b(VECTORLAGHEZZA|LAGHEZZA|P&A)\b/iu]),
    compilerName: firstMatch(text, [/LUOGODATADATI\s+DEL\s+COMPILATORE\(5\)\s*[A-Z]+\s*([A-ZÀ-ÖØ-Ý' .-]{2,80})/iu]),
    compilationPlace: firstMatch(text, [/\b(GENOVA)\b/iu]),
    stops: delivery.name
      ? [{
          position: 0,
          name: delivery.name,
          address: delivery.address,
          postalCode: null,
          city: delivery.city,
          province: delivery.province,
          plannedTime: null
        }]
      : [],
    reviewReasons: [],
    rawText: text.slice(0, 12000)
  };

  row.reviewReasons = buildReviewReasons(row);
  return row;
}

function buildReviewReasons(row: ParsedTripWaybill): string[] {
  const reasons: string[] = [];
  if (!row.documentNumber) reasons.push('Numero documento non riconosciuto.');
  if (!row.tripDate) reasons.push('Data viaggio non riconosciuta.');
  if (!row.driverName) reasons.push('Autista non riconosciuto nel PDF.');
  if (!row.tractorPlate) reasons.push('Targa trattore non riconosciuta nel PDF.');
  if (!row.loadingBaseName) reasons.push('Base di carico non riconosciuta: controllare prima della conferma.');
  if (!row.deliveryName) reasons.push('Destinazione non riconosciuta: controllare prima della conferma.');
  return reasons;
}

function splitSections(text: string): string[] {
  const compacted = compactText(text);
  if (!compacted) return [];

  const matches = Array.from(compacted.matchAll(/LETTERA\s+DI\s+VETTURA/giu));
  if (matches.length === 0) return [compacted];

  return matches
    .map((match, index) => {
      const start = match.index || 0;
      const end = index + 1 < matches.length ? matches[index + 1]!.index || compacted.length : compacted.length;
      return compacted.slice(start, end).trim();
    })
    .filter(Boolean);
}

export function buildTripWaybillSourceKey(row: ParsedTripWaybill, rowIndex: number): string {
  const pieces = [
    row.documentFormat,
    row.documentNumber || `row-${rowIndex + 1}`,
    dateKey(row.tripDate || row.documentDate),
    row.tractorPlate || 'senza-targa',
    row.driverName || 'senza-autista',
    row.loadingBaseName || 'senza-base',
    row.deliveryName || 'senza-destinazione'
  ];
  return `trip-waybill:${pieces.join('|').toLocaleLowerCase('it-IT')}`;
}

export function parseTripWaybillText(text: string): ParsedTripWaybillDocument {
  const sections = splitSections(text);
  const rows: ParsedTripWaybill[] = [];
  let skippedSections = 0;

  for (const section of sections) {
    const normalized = normalizeSearch(section);
    if (!normalized.includes('lettera di vettura') && !/\bSSL\s*\d{2,}/iu.test(section)) {
      skippedSections += 1;
      continue;
    }

    const row = normalized.includes('scheda di trasporto') || /\bSSL\s*\d{2,}/iu.test(section)
      ? parseSslWaybill(section)
      : parseStandardWaybill(section);

    if (!row.documentNumber && !row.tripDate && !row.driverName && !row.tractorPlate) {
      skippedSections += 1;
      continue;
    }

    rows.push(row);
  }

  return { rows, skippedSections };
}
