import 'server-only';

import {
  Prisma,
  RoadAccidentResponsibility,
  RoadAccidentStatus,
  RoadEventAttachmentKind,
  RoadFineResponsibility,
  RoadFineStatus
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { removeStoredPdf } from '@/lib/files';
import { formBoolean, formString, optionalFormString } from '@/lib/form';
import { getRoadEventFiles, storeRoadEventFile, type StoredRoadEventFile } from '@/lib/road-event-files';
import {
  getRoadAccidentStatusLabel,
  getRoadEventAttachmentKindLabel,
  getRoadFineStatusLabel
} from '@/lib/road-events-core';

export {
  formatRoadEventMoney,
  getRoadAccidentAccountingMovements,
  getRoadAccidentResponsibilityLabel,
  getRoadAccidentStatusLabel,
  getRoadEventAttachmentKindLabel,
  getRoadEventVehicleLabel,
  getRoadFineAccountingMovement,
  getRoadFineResponsibilityLabel,
  getRoadFineStatusLabel,
  roadEventMoneyInput
} from '@/lib/road-events-core';

export const ROAD_FINE_STATUSES = Object.values(RoadFineStatus);
export const ROAD_FINE_RESPONSIBILITIES = Object.values(RoadFineResponsibility);
export const ROAD_ACCIDENT_STATUSES = Object.values(RoadAccidentStatus);
export const ROAD_ACCIDENT_RESPONSIBILITIES = Object.values(RoadAccidentResponsibility);
export const ROAD_EVENT_ATTACHMENT_KINDS = Object.values(RoadEventAttachmentKind);

export const roadEventVehicleSelect = { id: true, plate: true, brand: true, model: true } as const;
export const roadEventDriverSelect = { id: true, firstName: true, lastName: true } as const;
export const roadFineInclude = {
  tractor: { select: roadEventVehicleSelect },
  trailer: { select: roadEventVehicleSelect },
  driver: { select: roadEventDriverSelect },
  attachments: { orderBy: { createdAt: 'desc' as const } },
  revisions: { orderBy: { createdAt: 'desc' as const } }
} satisfies Prisma.RoadFineInclude;
export const roadAccidentInclude = {
  tractor: { select: roadEventVehicleSelect },
  trailer: { select: roadEventVehicleSelect },
  driver: { select: roadEventDriverSelect },
  attachments: { orderBy: { createdAt: 'desc' as const } },
  revisions: { orderBy: { createdAt: 'desc' as const } },
  expenseDocuments: {
    select: { id: true, status: true, documentNumber: true, documentDate: true, registeredAt: true, totalAmountCents: true },
    orderBy: { registeredAt: 'desc' as const }
  }
} satisfies Prisma.RoadAccidentInclude;

function bounded(value: string | null, max: number, label: string, required = false): string | null {
  const normalized = value?.trim() || '';
  if (required && !normalized) throw new Error(`${label} obbligatorio.`);
  if (normalized.length > max) throw new Error(`${label} troppo lungo.`);
  return normalized || null;
}

function parseDate(value: string, label: string, required = false): Date | null {
  if (!value) {
    if (required) throw new Error(`${label} obbligatoria.`);
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`${label} non valida. Usa gg/mm/aaaa.`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) throw new Error(`${label} non valida. Usa gg/mm/aaaa.`);
  return date;
}

function parseTime(value: string | null, label: string): string | null {
  if (!value) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`${label} non valida.`);
  return value;
}

function parseMoney(value: string, label: string): number | null {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`${label} non valido. Usa il punto e massimo due decimali, senza separatori delle migliaia.`);
  }
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 999_999_999) throw new Error(`${label} fuori limite.`);
  return cents;
}

function parseOptionalInteger(value: string, label: string, max = 999): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) throw new Error(`${label} non valido.`);
  return parsed;
}

function enumValue<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value as T)) throw new Error(`${label} non valido.`);
  return value as T;
}

function expectedUpdatedAt(formData: FormData): Date {
  const value = formString(formData, 'expectedUpdatedAt');
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error('Versione non valida. Ricarica la pagina e riprova.');
  return date;
}

function fineData(formData: FormData) {
  const status = enumValue(formString(formData, 'status'), ROAD_FINE_STATUSES, 'Stato');
  const paidAmountCents = parseMoney(formString(formData, 'paidAmount'), 'Importo pagato');
  const paymentDate = parseDate(formString(formData, 'paymentDate'), 'Data pagamento');
  if (status === RoadFineStatus.PAID && (!paidAmountCents || !paymentDate)) {
    throw new Error('Per segnare il verbale come pagato servono importo e data del pagamento.');
  }
  return {
    status,
    responsibility: enumValue(formString(formData, 'responsibility'), ROAD_FINE_RESPONSIBILITIES, 'Responsabilità'),
    noticeNumber: bounded(optionalFormString(formData, 'noticeNumber'), 160, 'Numero verbale'),
    authority: bounded(formString(formData, 'authority'), 240, 'Autorità emittente', true)!,
    violationDate: parseDate(formString(formData, 'violationDate'), 'Data infrazione', true)!,
    violationTime: parseTime(optionalFormString(formData, 'violationTime'), 'Ora infrazione'),
    notificationDate: parseDate(formString(formData, 'notificationDate'), 'Data notifica'),
    location: bounded(formString(formData, 'location'), 400, 'Luogo', true)!,
    violationCode: bounded(optionalFormString(formData, 'violationCode'), 240, 'Articolo o violazione'),
    description: bounded(formString(formData, 'description'), 4000, 'Descrizione', true)!,
    tractorId: optionalFormString(formData, 'tractorId'),
    trailerId: optionalFormString(formData, 'trailerId'),
    driverId: optionalFormString(formData, 'driverId'),
    pointsDeducted: parseOptionalInteger(formString(formData, 'pointsDeducted'), 'Punti patente', 100),
    reducedAmountCents: parseMoney(formString(formData, 'reducedAmount'), 'Importo ridotto'),
    standardAmountCents: parseMoney(formString(formData, 'standardAmount'), 'Importo ordinario'),
    discountedPaymentDueDate: parseDate(formString(formData, 'discountedPaymentDueDate'), 'Scadenza pagamento ridotto'),
    paymentDueDate: parseDate(formString(formData, 'paymentDueDate'), 'Scadenza pagamento'),
    appealDueDate: parseDate(formString(formData, 'appealDueDate'), 'Scadenza ricorso'),
    paidAmountCents,
    paymentDate,
    paymentReference: bounded(optionalFormString(formData, 'paymentReference'), 400, 'Riferimento pagamento'),
    driverChargeCents: parseMoney(formString(formData, 'driverCharge'), 'Addebito autista'),
    notes: bounded(optionalFormString(formData, 'notes'), 6000, 'Note')
  };
}

function accidentData(formData: FormData) {
  const directCostCents = parseMoney(formString(formData, 'directCost'), 'Costo diretto contabilizzato');
  const directCostDate = parseDate(formString(formData, 'directCostDate'), 'Data costo diretto');
  const reimbursementCents = parseMoney(formString(formData, 'reimbursement'), 'Rimborso incassato');
  const reimbursementDate = parseDate(formString(formData, 'reimbursementDate'), 'Data rimborso');
  if (directCostCents && !directCostDate) throw new Error('Indica la data del costo diretto contabilizzato.');
  if (reimbursementCents && !reimbursementDate) throw new Error('Indica la data del rimborso incassato.');
  return {
    status: enumValue(formString(formData, 'status'), ROAD_ACCIDENT_STATUSES, 'Stato'),
    responsibility: enumValue(formString(formData, 'responsibility'), ROAD_ACCIDENT_RESPONSIBILITIES, 'Responsabilità'),
    accidentDate: parseDate(formString(formData, 'accidentDate'), 'Data sinistro', true)!,
    accidentTime: parseTime(optionalFormString(formData, 'accidentTime'), 'Ora sinistro'),
    location: bounded(formString(formData, 'location'), 400, 'Luogo', true)!,
    description: bounded(formString(formData, 'description'), 6000, 'Dinamica', true)!,
    tractorId: optionalFormString(formData, 'tractorId'),
    trailerId: optionalFormString(formData, 'trailerId'),
    driverId: optionalFormString(formData, 'driverId'),
    thirdPartyDetails: bounded(optionalFormString(formData, 'thirdPartyDetails'), 6000, 'Controparti'),
    witnesses: bounded(optionalFormString(formData, 'witnesses'), 4000, 'Testimoni'),
    authorityDetails: bounded(optionalFormString(formData, 'authorityDetails'), 2000, 'Autorità intervenute'),
    hasInjuries: formBoolean(formData, 'hasInjuries'),
    cargoInvolved: formBoolean(formData, 'cargoInvolved'),
    vehicleImmobilized: formBoolean(formData, 'vehicleImmobilized'),
    towRequired: formBoolean(formData, 'towRequired'),
    insurerName: bounded(optionalFormString(formData, 'insurerName'), 240, 'Compagnia assicurativa'),
    policyNumber: bounded(optionalFormString(formData, 'policyNumber'), 160, 'Numero polizza'),
    claimNumber: bounded(optionalFormString(formData, 'claimNumber'), 160, 'Numero pratica'),
    reportedDate: parseDate(formString(formData, 'reportedDate'), 'Data denuncia'),
    nextDeadline: parseDate(formString(formData, 'nextDeadline'), 'Prossima scadenza'),
    closedDate: parseDate(formString(formData, 'closedDate'), 'Data chiusura'),
    estimatedDamageCents: parseMoney(formString(formData, 'estimatedDamage'), 'Danno stimato'),
    deductibleCents: parseMoney(formString(formData, 'deductible'), 'Franchigia'),
    directCostCents,
    directCostDate,
    reimbursementCents,
    reimbursementDate,
    notes: bounded(optionalFormString(formData, 'notes'), 6000, 'Note')
  };
}

async function storeFiles(files: File[]): Promise<StoredRoadEventFile[]> {
  const stored: StoredRoadEventFile[] = [];
  try {
    for (const file of files) stored.push(await storeRoadEventFile(file));
    return stored;
  } catch (error) {
    await Promise.allSettled(stored.map((item) => removeStoredPdf(item.filePath)));
    throw error;
  }
}

function attachmentKind(formData: FormData): RoadEventAttachmentKind {
  const value = formString(formData, 'attachmentKind') || RoadEventAttachmentKind.OTHER;
  return enumValue(value, ROAD_EVENT_ATTACHMENT_KINDS, 'Tipo allegato');
}

export async function createRoadFine(formData: FormData): Promise<string> {
  const data = fineData(formData);
  const kind = attachmentKind(formData);
  const stored = await storeFiles(getRoadEventFiles(formData));
  try {
    const created = await prisma.roadFine.create({
      data: {
        ...data,
        attachments: { create: stored.map((file) => ({ ...file, kind })) },
        revisions: { create: { event: 'CREATED', summary: 'Verbale registrato.' } }
      },
      select: { id: true }
    });
    return created.id;
  } catch (error) {
    await Promise.allSettled(stored.map((item) => removeStoredPdf(item.filePath)));
    throw error;
  }
}

export async function updateRoadFine(id: string, formData: FormData): Promise<void> {
  const data = fineData(formData);
  const expected = expectedUpdatedAt(formData);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.roadFine.updateMany({ where: { id, updatedAt: expected }, data });
    if (updated.count !== 1) throw new Error('Il verbale è stato modificato da un’altra scheda. Ricarica la pagina.');
    await tx.roadFineRevision.create({ data: { fineId: id, event: 'UPDATED', summary: `Verbale aggiornato: ${getRoadFineStatusLabel(data.status)}.` } });
  });
}

export async function createRoadAccident(formData: FormData): Promise<string> {
  const data = accidentData(formData);
  const kind = attachmentKind(formData);
  const stored = await storeFiles(getRoadEventFiles(formData));
  try {
    const created = await prisma.roadAccident.create({
      data: {
        ...data,
        attachments: { create: stored.map((file) => ({ ...file, kind })) },
        revisions: { create: { event: 'CREATED', summary: 'Sinistro stradale registrato.' } }
      },
      select: { id: true }
    });
    return created.id;
  } catch (error) {
    await Promise.allSettled(stored.map((item) => removeStoredPdf(item.filePath)));
    throw error;
  }
}

export async function updateRoadAccident(id: string, formData: FormData): Promise<void> {
  const data = accidentData(formData);
  const expected = expectedUpdatedAt(formData);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.roadAccident.updateMany({ where: { id, updatedAt: expected }, data });
    if (updated.count !== 1) throw new Error('Il sinistro è stato modificato da un’altra scheda. Ricarica la pagina.');
    await tx.roadAccidentRevision.create({ data: { accidentId: id, event: 'UPDATED', summary: `Sinistro aggiornato: ${getRoadAccidentStatusLabel(data.status)}.` } });
  });
}

export async function addRoadFineAttachments(id: string, formData: FormData): Promise<void> {
  const files = getRoadEventFiles(formData);
  if (files.length === 0) throw new Error('Seleziona almeno un allegato.');
  if (!await prisma.roadFine.findUnique({ where: { id }, select: { id: true } })) throw new Error('Verbale non trovato.');
  const kind = attachmentKind(formData);
  const stored = await storeFiles(files);
  try {
    await prisma.$transaction([
      prisma.roadEventAttachment.createMany({ data: stored.map((file) => ({ ...file, fineId: id, kind })) }),
      prisma.roadFineRevision.create({ data: { fineId: id, event: 'ATTACHMENT_ADDED', summary: `${stored.length} allegati aggiunti (${getRoadEventAttachmentKindLabel(kind)}).` } })
    ]);
  } catch (error) {
    await Promise.allSettled(stored.map((item) => removeStoredPdf(item.filePath)));
    throw error;
  }
}

export async function addRoadAccidentAttachments(id: string, formData: FormData): Promise<void> {
  const files = getRoadEventFiles(formData);
  if (files.length === 0) throw new Error('Seleziona almeno un allegato.');
  if (!await prisma.roadAccident.findUnique({ where: { id }, select: { id: true } })) throw new Error('Sinistro non trovato.');
  const kind = attachmentKind(formData);
  const stored = await storeFiles(files);
  try {
    await prisma.$transaction([
      prisma.roadEventAttachment.createMany({ data: stored.map((file) => ({ ...file, accidentId: id, kind })) }),
      prisma.roadAccidentRevision.create({ data: { accidentId: id, event: 'ATTACHMENT_ADDED', summary: `${stored.length} allegati aggiunti (${getRoadEventAttachmentKindLabel(kind)}).` } })
    ]);
  } catch (error) {
    await Promise.allSettled(stored.map((item) => removeStoredPdf(item.filePath)));
    throw error;
  }
}

export async function deleteRoadEventAttachment(id: string): Promise<{ fineId: string | null; accidentId: string | null }> {
  const attachment = await prisma.roadEventAttachment.findUnique({ where: { id } });
  if (!attachment) throw new Error('Allegato non trovato.');
  await prisma.$transaction(async (tx) => {
    await tx.roadEventAttachment.delete({ where: { id } });
    if (attachment.fineId) await tx.roadFineRevision.create({ data: { fineId: attachment.fineId, event: 'ATTACHMENT_REMOVED', summary: `Allegato rimosso: ${attachment.originalFileName}.` } });
    if (attachment.accidentId) await tx.roadAccidentRevision.create({ data: { accidentId: attachment.accidentId, event: 'ATTACHMENT_REMOVED', summary: `Allegato rimosso: ${attachment.originalFileName}.` } });
  });
  await removeStoredPdf(attachment.filePath);
  return { fineId: attachment.fineId, accidentId: attachment.accidentId };
}

export async function deleteRoadFine(id: string): Promise<void> {
  const filePaths = await prisma.$transaction(async (tx) => {
    const fine = await tx.roadFine.findUnique({ where: { id }, include: { attachments: true } });
    if (!fine) throw new Error('Verbale non trovato.');
    if (fine.status !== RoadFineStatus.TO_REVIEW) throw new Error('Puoi eliminare soltanto un verbale ancora da controllare. Negli altri casi usa Annullato o Chiuso.');
    const deleted = await tx.roadFine.deleteMany({ where: { id, status: RoadFineStatus.TO_REVIEW } });
    if (deleted.count !== 1) throw new Error('Il verbale è cambiato mentre lo eliminavi. Ricarica la pagina.');
    return fine.attachments.map((item) => item.filePath);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await Promise.allSettled(filePaths.map((filePath) => removeStoredPdf(filePath)));
}

export async function deleteRoadAccident(id: string): Promise<void> {
  const filePaths = await prisma.$transaction(async (tx) => {
    const accident = await tx.roadAccident.findUnique({ where: { id }, include: { attachments: true, expenseDocuments: { select: { id: true } } } });
    if (!accident) throw new Error('Sinistro non trovato.');
    if (accident.status !== RoadAccidentStatus.REPORTED || accident.expenseDocuments.length > 0) {
      throw new Error('Puoi eliminare soltanto una prima segnalazione senza manutenzioni collegate. Negli altri casi usa Annullato.');
    }
    const deleted = await tx.roadAccident.deleteMany({
      where: { id, status: RoadAccidentStatus.REPORTED, expenseDocuments: { none: {} } }
    });
    if (deleted.count !== 1) throw new Error('Il sinistro è cambiato mentre lo eliminavi. Ricarica la pagina.');
    return accident.attachments.map((item) => item.filePath);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await Promise.allSettled(filePaths.map((filePath) => removeStoredPdf(filePath)));
}

export function roadEventError(error: unknown): string {
  if (error instanceof Error && error.message) {
    if (error.message.includes('Foreign key constraint')) return 'Mezzo o autista selezionato non valido.';
    return error.message.slice(0, 300);
  }
  return 'Operazione non riuscita. Riprova.';
}
