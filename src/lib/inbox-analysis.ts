import 'server-only';

import path from 'node:path';
import { EntityType, type DocumentType, type Driver, type OtherEntity, type Tractor, type Trailer } from '@prisma/client';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { deriveCronotachographExpiryDate, findInboxDateSuggestions } from '@/lib/inbox-dates';
import { findBarratoRosaLibrettoExpiryOverride, type BarratoRosaExpiryReference } from '@/lib/inbox-expiry';
import { readPdfTextWithOcr } from '@/lib/inbox-ocr';
import { readStoredPdf, type StoredPdf } from '@/lib/files';
import {
  DEFAULT_FIRE_EXTINGUISHER_RATES,
  calculateFireExtinguisherCost,
  findFireExtinguisherUnits,
  formatFireExtinguisherNotes,
  type FireExtinguisherRate
} from '@/lib/fire-extinguisher';

export type ReferenceData = {
  documentTypes: DocumentType[];
  drivers: Driver[];
  tractors: Tractor[];
  trailers: Trailer[];
  otherEntities: OtherEntity[];
  barratoRosaExpiries: BarratoRosaExpiryReference[];
  fireExtinguisherRates?: FireExtinguisherRate[];
};

type EntitySuggestion = {
  entityType: EntityType;
  entityId: string;
  label: string;
  score: number;
};

export type InsuranceVehicleSuggestion = {
  plate: string;
  entityType: Extract<EntityType, 'TRACTOR' | 'TRAILER'>;
  evidence: string;
};

type DocumentTypeRule = {
  key: string;
  names: string[];
  strongHints: string[];
  weakHints: string[];
  negativeHints?: string[];
  preferredEntityTypes?: EntityType[];
};

export type PdfTextExtraction = {
  text: string;
  status: string;
  source: 'pdf-text' | 'ocr' | 'none';
};

export type InboxAnalysis = {
  extractedText: string | null;
  extractionStatus: string;
  suggestedTitle: string | null;
  suggestedDocumentTypeId: string | null;
  suggestedEntityType: EntityType | null;
  suggestedEntityId: string | null;
  suggestedIssueDate: Date | null;
  suggestedExpiryDate: Date | null;
  suggestedNoticeDays: number | null;
  suggestedNotes: string | null;
  suggestedAmountCents: number | null;
  confidence: number;
  analysisNotes: string;
};

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sourceHasPhrase(normalizedSource: string, phrase: string): boolean {
  const tokens = normalize(phrase).split(/[^a-z0-9]+/u).filter(Boolean);
  if (tokens.length === 0) return false;

  const pattern = new RegExp(`(^|[^a-z0-9])${tokens.map(escapeRegex).join('[^a-z0-9]+')}($|[^a-z0-9])`, 'u');
  return pattern.test(normalizedSource);
}

function compact(value: string): string {
  return value.toLocaleUpperCase('it-IT').replace(/[^A-Z0-9]/g, '');
}

function isInsuranceDocumentType(documentType: DocumentType | null): boolean {
  return Boolean(documentType && normalize(documentType.name).includes('assicurazione'));
}

export function findInsuranceVehicleSuggestion(source: string): InsuranceVehicleSuggestion | null {
  const matches = Array.from(source.matchAll(/\b[A-Z]{2}\s*\d{3}\s*[A-Z]{2}\b/giu));
  const suggestions = new Map<string, InsuranceVehicleSuggestion>();

  for (const match of matches) {
    const plate = compact(match[0]);
    if (!plate) continue;

    const index = match.index || 0;
    const windowText = source.slice(Math.max(0, index - 220), Math.min(source.length, index + match[0].length + 220));
    const wideWindowText = source.slice(Math.max(0, index - 520), Math.min(source.length, index + match[0].length + 220));
    const normalizedWindow = normalize(windowText);
    const normalizedWideWindow = normalize(wideWindowText);
    const hasVehicleTypeContext =
      sourceHasPhrase(normalizedWindow, 'tipo veicolo') ||
      sourceHasPhrase(normalizedWindow, 'targa veicolo') ||
      sourceHasPhrase(normalizedWideWindow, 'category of vehicles code') ||
      sourceHasPhrase(normalizedWideWindow, 'category of vehicle');
    if (!hasVehicleTypeContext) continue;

    let entityType: InsuranceVehicleSuggestion['entityType'] | null = null;
    let evidence = '';
    if (sourceHasPhrase(normalizedWideWindow, 'autocarro') || sourceHasPhrase(normalizedWideWindow, 'trattore stradale')) {
      entityType = EntityType.TRACTOR;
      evidence = sourceHasPhrase(normalizedWideWindow, 'autocarro') ? 'Tipo veicolo AUTOCARRO' : 'Tipo veicolo TRATTORE STRADALE';
    } else if (sourceHasPhrase(normalizedWideWindow, 'semirimorchio') || sourceHasPhrase(normalizedWideWindow, 'rimorchio')) {
      entityType = EntityType.TRAILER;
      evidence = sourceHasPhrase(normalizedWideWindow, 'semirimorchio') ? 'Tipo veicolo SEMIRIMORCHIO' : 'Tipo veicolo RIMORCHIO';
    }
    if (!entityType) continue;

    suggestions.set(`${plate}:${entityType}`, { plate, entityType, evidence });
  }

  const unique = Array.from(suggestions.values());
  if (unique.length !== 1) return null;
  return unique[0];
}

function platePattern(plate: string): RegExp {
  return new RegExp(plate.split('').map(escapeRegex).join('[^A-Z0-9]{0,3}'), 'giu');
}

function scorePlateEvidence(source: string, plate: string): number {
  const normalizedPlate = compact(plate);
  if (!normalizedPlate) return 0;

  const matches = Array.from(source.matchAll(platePattern(normalizedPlate)));
  let bestScore = 0;

  for (const match of matches) {
    const index = match.index || 0;
    const lineStart = source.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
    const lineEnd = source.indexOf('\n', index);
    const line = normalize(source.slice(lineStart, lineEnd >= 0 ? lineEnd : source.length));
    const window = normalize(source.slice(Math.max(0, index - 90), Math.min(source.length, index + match[0].length + 90)));
    let score = lineStart === 0 ? 88 : 64;

    if (
      sourceHasPhrase(window, 'targa') ||
      sourceHasPhrase(window, 'targa veicolo') ||
      sourceHasPhrase(window, 'numero di immatricolazione') ||
      sourceHasPhrase(window, 'nr di immatricolazione') ||
      sourceHasPhrase(window, 'automezzo targato')
    ) {
      score = 92;
    }

    if (
      sourceHasPhrase(line, 'fabbricante modello') ||
      sourceHasPhrase(line, 'marca del veicolo') ||
      sourceHasPhrase(line, 'motore') ||
      sourceHasPhrase(line, 'numero telaio') ||
      sourceHasPhrase(line, 'numero di telaio')
    ) {
      score = Math.min(score, 24);
    }

    bestScore = Math.max(bestScore, score);
  }

  return bestScore;
}

export function findInboxFleetPlate(source: string): string | null {
  const candidates = new Set<string>();
  for (const match of source.matchAll(/\b[A-Z]{2}\s*\d{3}\s*[A-Z]{2}\b/giu)) {
    const plate = compact(match[0]);
    if (plate && scorePlateEvidence(source, plate) >= 80) candidates.add(plate);
  }

  return candidates.size === 1 ? Array.from(candidates)[0] : null;
}

const documentTypeRules: DocumentTypeRule[] = [
  {
    key: 'assicurazione',
    names: ['assicurazione'],
    strongHints: [
      'polizza',
      'contratto di assicurazione',
      'certificato di assicurazione',
      'periodo di assicurazione',
      'asscurazione',
      'periodo di asscurazione',
      'Assicurazioni Demo Unosai',
      'rc auto',
      'rca',
      'carta verde'
    ],
    weakHints: ['assicurazione', 'compagnia', 'premio', 'massimale'],
    preferredEntityTypes: [EntityType.TRACTOR, EntityType.TRAILER]
  },
  {
    key: 'revisione',
    names: ['revisione'],
    strongHints: ['esito revisione', 'revisione periodica', 'prossima revisione', 'centro revisioni'],
    weakHints: ['revisione', 'collaudo', 'motorizzazione'],
    negativeHints: ['polizza', 'assicurazione', 'tachigrafo', 'cronotachigrafo']
  },
  {
    key: 'patente',
    names: ['patente'],
    strongHints: ['patente di guida', 'driving licence'],
    weakHints: ['patente', 'categoria', 'rilasciata da'],
    preferredEntityTypes: [EntityType.DRIVER]
  },
  {
    key: 'cqc',
    names: ['cqc'],
    strongHints: ['carta di qualificazione del conducente', 'cqc'],
    weakHints: ['qualificazione conducente'],
    preferredEntityTypes: [EntityType.DRIVER]
  },
  {
    key: 'tachigrafica',
    names: ['tachigrafica'],
    strongHints: ['carta tachigrafica', 'tachograph card'],
    weakHints: ['tachigrafica', 'tachigrafo'],
    negativeHints: ['cronotachigrafo', 'revisione', 'verifica periodica', 'calibrazione'],
    preferredEntityTypes: [EntityType.DRIVER]
  },
  {
    key: 'adr',
    names: ['adr'],
    strongHints: ['certificato adr', 'patentino adr', 'abilitazione adr', 'formazione adr'],
    weakHints: ['merci pericolose'],
    negativeHints: ['carta di circolazione', 'documento unico di circolazione', 'libretto'],
    preferredEntityTypes: [EntityType.DRIVER]
  },
  {
    key: 'visita-medica',
    names: ['visita medica'],
    strongHints: ['certificato medico', 'visita medica', 'idoneita alla guida'],
    weakHints: ['idoneita', 'medico'],
    preferredEntityTypes: [EntityType.DRIVER]
  },
  {
    key: 'libretto',
    names: ['libretto'],
    strongHints: ['carta di circolazione', 'documento unico di circolazione', 'documento unico', 'libretto di circolazione'],
    weakHints: ['ministero delle infrastrutture', 'repubblica italiana', 'telaio', 'massa complessiva'],
    negativeHints: ['polizza', 'certificato adr'],
    preferredEntityTypes: [EntityType.TRACTOR, EntityType.TRAILER]
  },
  {
    key: 'barrato-rosa',
    names: ['barrato rosa'],
    strongHints: [
      'barrato rosa',
      'dtt306',
      'dtt 306',
      'd t t 306',
      'dtt 307',
      'd t t 307',
      'certificato di approvazione adr',
      'certificato approvazione adr',
      'certificato di approvazione per i veicoli',
      'veicoli che trasportano merci pericolose',
      'approvazione adr'
    ],
    weakHints: ['trasporto merci pericolose', 'certificato di approvazione', 'merci pericolose', 'valido fino al'],
    preferredEntityTypes: [EntityType.TRACTOR, EntityType.TRAILER]
  },
  {
    key: 'revisione-cronotachigrafo',
    names: ['revisione cronotachigrafo', 'cronotachigrafo'],
    strongHints: [
      'cronotachigrafo',
      'tachigrafo digitale',
      'rapporto tecnico di intervento',
      'verifica periodica tachigrafo',
      'calibrazione tachigrafo',
      'taratura di un tachigrafo',
      'calibratura di un tachigrafo',
      'controllo periodico di un tachigrafo',
      'manuale tecnico del tachigrafo'
    ],
    weakHints: ['tachigrafo', 'dati tachigrafo', 'tipo tachigrafo', 'sigilli', 'odometro', 'calibrazione'],
    negativeHints: ['carta tachigrafica', 'tachograph card'],
    preferredEntityTypes: [EntityType.TRACTOR]
  },
  {
    key: 'metrica-carburanti',
    names: ['metrica', 'carburanti'],
    strongHints: ['certificato di verifica periodica', 'strumento di misura', 'verifica metrica', 'metrica carburanti'],
    weakHints: ['benzina', 'gasolio', 'erogatore', 'misuratore', 'matricola strumento'],
    negativeHints: ['carta di circolazione', 'carta tachigrafica'],
    preferredEntityTypes: [EntityType.OTHER]
  },
  {
    key: 'estintori',
    names: ['estintori', 'estintore'],
    strongHints: [
      'estintori',
      'estintore',
      'rimessa in efficienza',
      'rimessa in efficienza estintori',
      'revisione ed alla ricarica degli estintori',
      'ricarica degli estintori',
      'automezzo targato',
      'uni 9994'
    ],
    weakHints: ['ricarica', 'polvere', 'scadenza'],
    preferredEntityTypes: [EntityType.TRACTOR, EntityType.TRAILER]
  },
  {
    key: 'permesso-porto',
    names: ['permesso porto'],
    strongHints: ['permesso porto', 'autorizzazione porto', 'accesso porto'],
    weakHints: ['porto', 'terminal'],
    preferredEntityTypes: [EntityType.OTHER]
  }
];

function matchingRulesForType(documentType: DocumentType): DocumentTypeRule[] {
  const normalizedName = normalize(documentType.name);
  return documentTypeRules.filter((rule) => rule.names.some((name) => normalizedName.includes(name)));
}

function scoreDocumentType(documentType: DocumentType, source: string, preferredEntityType?: EntityType): number {
  const normalizedName = normalize(documentType.name);
  const tokens = normalizedName.split(/\s+/).filter((token) => token.length > 2);
  let score = 0;

  if (sourceHasPhrase(source, normalizedName)) score += 54;
  score += tokens.filter((token) => sourceHasPhrase(source, token)).length * 8;

  for (const rule of matchingRulesForType(documentType)) {
    score += rule.strongHints.filter((hint) => sourceHasPhrase(source, hint)).length * 48;
    score += rule.weakHints.filter((hint) => sourceHasPhrase(source, hint)).length * 14;
    score -= (rule.negativeHints || []).filter((hint) => sourceHasPhrase(source, hint)).length * 42;
    if (preferredEntityType && rule.preferredEntityTypes?.includes(preferredEntityType)) score += 16;
  }

  if (preferredEntityType) {
    if (documentType.suggestedEntityType === preferredEntityType) score += 18;
    else score -= 14;
  }

  if (!documentType.active) score -= 20;
  return score;
}

function findDocumentType(documentTypes: DocumentType[], source: string, preferredEntityType?: EntityType): { documentType: DocumentType | null; score: number } {
  const normalizedSource = normalize(source);
  const matches = documentTypes
    .map((documentType) => ({ documentType, score: scoreDocumentType(documentType, normalizedSource, preferredEntityType) }))
    .sort((a, b) => b.score - a.score);

  const best = matches[0];
  const second = matches[1];
  if (!best || best.score < 44) return { documentType: null, score: 0 };
  if (second && best.score - second.score < 18) return { documentType: null, score: 0 };
  return best;
}

function findBestEntity(referenceData: ReferenceData, source: string, preferredType?: EntityType): EntitySuggestion | null {
  const normalizedSource = normalize(source);
  const suggestions: EntitySuggestion[] = [];

  function allow(type: EntityType) {
    return !preferredType || preferredType === type;
  }

  if (allow(EntityType.TRACTOR)) {
    for (const tractor of referenceData.tractors) {
      const score = scorePlateEvidence(source, tractor.plate);
      if (score >= 58) {
        suggestions.push({ entityType: EntityType.TRACTOR, entityId: tractor.id, label: tractor.plate, score });
      }
    }
  }

  if (allow(EntityType.TRAILER)) {
    for (const trailer of referenceData.trailers) {
      const score = scorePlateEvidence(source, trailer.plate);
      if (score >= 58) {
        suggestions.push({ entityType: EntityType.TRAILER, entityId: trailer.id, label: trailer.plate, score });
      }
    }
  }

  if (allow(EntityType.DRIVER)) {
    for (const driver of referenceData.drivers) {
      const fullName = normalize(`${driver.firstName} ${driver.lastName}`);
      const reversedName = normalize(`${driver.lastName} ${driver.firstName}`);
      const lastName = normalize(driver.lastName);
      const firstName = normalize(driver.firstName);
      let score = 0;
      if (normalizedSource.includes(fullName) || normalizedSource.includes(reversedName)) score = 78;
      else if (normalizedSource.includes(lastName) && normalizedSource.includes(firstName)) score = 68;
      else if (lastName.length > 2 && normalizedSource.includes(lastName)) score = 36;

      if (score > 0) {
        suggestions.push({
          entityType: EntityType.DRIVER,
          entityId: driver.id,
          label: `${driver.lastName} ${driver.firstName}`,
          score
        });
      }
    }
  }

  if (allow(EntityType.OTHER)) {
    for (const entity of referenceData.otherEntities) {
      const name = normalize(entity.name);
      const category = normalize(entity.category);
      let score = 0;
      if (name.length > 2 && sourceHasPhrase(normalizedSource, name)) score = 70;
      else if (category.length > 2 && sourceHasPhrase(normalizedSource, category)) score = 28;

      if (score > 0) {
        suggestions.push({
          entityType: EntityType.OTHER,
          entityId: entity.id,
          label: `${entity.category}: ${entity.name}`,
          score
        });
      }
    }
  }

  return suggestions.sort((a, b) => b.score - a.score)[0] || null;
}

function fallbackTitle(originalFileName: string): string {
  return path
    .basename(originalFileName, path.extname(originalFileName))
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function compactExtractedText(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCronotachographInspection(documentType: DocumentType | null): boolean {
  return Boolean(documentType && normalize(documentType.name).includes('cronotachigrafo'));
}

function isFireExtinguisherDocument(documentType: DocumentType | null): boolean {
  return Boolean(documentType && normalize(documentType.name).includes('estintor'));
}

export async function extractInboxPdfTextFromBuffer(fileBuffer: Buffer): Promise<PdfTextExtraction> {
  let nativeText = '';
  let nativeStatus = '';

  try {
    const result = await pdfParse(fileBuffer);
    nativeText = compactExtractedText(result.text);
    if (nativeText.length >= 80) {
      return { text: nativeText, status: `Testo PDF letto automaticamente (${nativeText.length} caratteri).`, source: 'pdf-text' };
    }
    nativeStatus = nativeText
      ? `PDF con poco testo selezionabile (${nativeText.length} caratteri): avviato OCR locale.`
      : 'PDF senza testo selezionabile: avviato OCR locale.';
  } catch (error) {
    nativeStatus = `Testo PDF nativo non estraibile: ${error instanceof Error ? error.message : String(error)}. Avviato OCR locale.`;
  }

  const ocr = await readPdfTextWithOcr(fileBuffer);
  if (ocr.text) {
    return { text: ocr.text, status: `${nativeStatus} ${ocr.status}`, source: 'ocr' };
  }

  return {
    text: nativeText,
    status: `${nativeStatus} ${ocr.status}`,
    source: nativeText ? 'pdf-text' : 'none'
  };
}

async function extractPdfText(storedPdf: StoredPdf): Promise<PdfTextExtraction> {
  const { fileBuffer } = await readStoredPdf(storedPdf.filePath);
  return extractInboxPdfTextFromBuffer(fileBuffer);
}

export function analyzeInboxPdfExtraction(
  storedPdf: Pick<StoredPdf, 'originalFileName'>,
  extraction: PdfTextExtraction,
  referenceData: ReferenceData
): InboxAnalysis {
  const { text, status, source: extractionSource } = extraction;
  const source = [storedPdf.originalFileName, text].filter(Boolean).join('\n');
  const insuranceVehicleSuggestion = findInsuranceVehicleSuggestion(source);
  const broadEntity = findBestEntity(referenceData, source);
  const preferredEntityType = insuranceVehicleSuggestion?.entityType || broadEntity?.entityType;
  const documentTypeMatch = findDocumentType(referenceData.documentTypes, source, preferredEntityType);
  const typedEntity = documentTypeMatch.documentType?.suggestedEntityType
    ? findBestEntity(referenceData, source, documentTypeMatch.documentType.suggestedEntityType)
    : null;
  const shouldIgnoreConflictingBroadEntity =
    Boolean(insuranceVehicleSuggestion && isInsuranceDocumentType(documentTypeMatch.documentType)) &&
    Boolean(broadEntity && broadEntity.entityType !== insuranceVehicleSuggestion?.entityType);
  const entity = documentTypeMatch.documentType?.suggestedEntityType
    ? typedEntity || (shouldIgnoreConflictingBroadEntity ? null : broadEntity)
    : broadEntity;
  const dates = findInboxDateSuggestions(source, storedPdf.originalFileName);
  const barratoRosaExpiry = findBarratoRosaLibrettoExpiryOverride(
    documentTypeMatch.documentType?.name || null,
    entity,
    referenceData.barratoRosaExpiries
  );
  const derivedCronotachographExpiry =
    !dates.expiryDate && dates.issueDate && isCronotachographInspection(documentTypeMatch.documentType)
      ? deriveCronotachographExpiryDate(dates.issueDate)
      : null;
  const suggestedExpiryDate = barratoRosaExpiry?.expiryDate || dates.expiryDate || derivedCronotachographExpiry;
  const expiryEvidence =
    barratoRosaExpiry?.evidence ||
    dates.expiryEvidence ||
    (derivedCronotachographExpiry
      ? 'Scadenza derivata dalla data di calibrazione del cronotachigrafo con periodicita biennale, escluso il giorno finale; confermare in revisione.'
      : null);
  const suggestedTitle = [
    documentTypeMatch.documentType?.name,
    entity?.label
  ].filter(Boolean).join(' - ') || fallbackTitle(storedPdf.originalFileName);
  const fireExtinguisherRates =
    referenceData.fireExtinguisherRates || DEFAULT_FIRE_EXTINGUISHER_RATES;
  const fireExtinguisherUnits = isFireExtinguisherDocument(documentTypeMatch.documentType)
    ? findFireExtinguisherUnits(text)
    : [];
  const suggestedNotes = formatFireExtinguisherNotes(fireExtinguisherUnits, fireExtinguisherRates);
  const suggestedAmountCents = calculateFireExtinguisherCost(
    fireExtinguisherUnits,
    fireExtinguisherRates
  );

  const confidence = Math.min(
    100,
    Math.round(
      (extractionSource === 'pdf-text' ? 18 : extractionSource === 'ocr' ? 14 : 0) +
        Math.min(documentTypeMatch.score, 50) +
        (entity ? Math.min(entity.score, 35) : 0) +
        (suggestedExpiryDate ? (barratoRosaExpiry ? 28 : derivedCronotachographExpiry ? 16 : 22) : 0) +
        (dates.issueDate ? 8 : 0)
    )
  );

  const notes = [
    status,
    documentTypeMatch.documentType ? `Tipo suggerito: ${documentTypeMatch.documentType.name}.` : 'Tipo documento non riconosciuto.',
    entity ? `Entita suggerita: ${entity.label}.` : 'Entita non riconosciuta.',
    !entity && isInsuranceDocumentType(documentTypeMatch.documentType) && insuranceVehicleSuggestion
      ? `Targa non in anagrafica: ${insuranceVehicleSuggestion.plate}; ${insuranceVehicleSuggestion.evidence}.`
      : null,
    dates.issueEvidence ? `Evidenza emissione: ${dates.issueEvidence}` : 'Emissione non riconosciuta con evidenza sufficiente.',
    expiryEvidence
      ? `Evidenza scadenza: ${expiryEvidence}`
      : 'Scadenza non riconosciuta: campo lasciato vuoto per evitare date casuali.',
    dates.foundDates ? `${dates.foundDates} date candidate trovate.` : 'Nessuna data candidata trovata.',
    fireExtinguisherUnits.length > 0
      ? `Estintori: ${fireExtinguisherUnits
          .map((unit) => `matricola ${unit.serialNumber}, ${unit.capacityKg === null ? 'kg da verificare' : `${unit.capacityKg} kg`}`)
          .join('; ')}.${suggestedAmountCents === null ? ' Costo automatico non proposto: dati o tariffa incompleti.' : ''}`
      : isFireExtinguisherDocument(documentTypeMatch.documentType)
        ? 'Matricola/peso estintore non riconosciuti: completare manualmente.'
        : null
  ];

  return {
    extractedText: text ? text.slice(0, 20000) : null,
    extractionStatus: status,
    suggestedTitle: suggestedTitle || null,
    suggestedDocumentTypeId: documentTypeMatch.documentType?.id || null,
    suggestedEntityType: entity?.entityType || null,
    suggestedEntityId: entity?.entityId || null,
    suggestedIssueDate: dates.issueDate,
    suggestedExpiryDate,
    suggestedNoticeDays: documentTypeMatch.documentType?.defaultNoticeDays || null,
    suggestedNotes,
    suggestedAmountCents,
    confidence,
    analysisNotes: notes.join(' ')
  };
}

export async function analyzeInboxPdf(storedPdf: StoredPdf, referenceData: ReferenceData): Promise<InboxAnalysis> {
  return analyzeInboxPdfExtraction(storedPdf, await extractPdfText(storedPdf), referenceData);
}
