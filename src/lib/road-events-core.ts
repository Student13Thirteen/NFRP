import type {
  RoadAccidentResponsibility,
  RoadAccidentStatus,
  RoadEventAttachmentKind,
  RoadFineResponsibility,
  RoadFineStatus
} from '@prisma/client';

type RoadFineImportValidationInput = {
  source: string;
  currentStatus: string;
  nextStatus: string;
  acknowledged: boolean;
};

export function assertRoadFineImportValidation(input: RoadFineImportValidationInput): boolean {
  if (input.source !== 'IMPORT' || input.currentStatus !== 'TO_REVIEW') return false;
  if (input.nextStatus === 'TO_REVIEW') {
    throw new Error('Per completare la validazione scegli uno stato operativo diverso da Da controllare.');
  }
  if (!input.acknowledged) {
    throw new Error('Conferma di avere controllato e completato i dati acquisiti dal PDF.');
  }
  return true;
}

export function getRoadFineStatusLabel(value: RoadFineStatus | string): string {
  return ({ TO_REVIEW: 'Da controllare', TO_PAY: 'Da pagare', CONTESTED: 'Contestato', PAID: 'Pagato', CANCELLED: 'Annullato', CLOSED: 'Chiuso' } as Record<string, string>)[value] || value;
}

export function getRoadFineResponsibilityLabel(value: RoadFineResponsibility | string): string {
  return ({ TO_ASSESS: 'Da definire', COMPANY: 'Azienda', DRIVER: 'Autista' } as Record<string, string>)[value] || value;
}

export function getRoadAccidentStatusLabel(value: RoadAccidentStatus | string): string {
  return ({ REPORTED: 'Segnalato', DOCUMENTS_PENDING: 'Documenti mancanti', CLAIM_OPEN: 'Pratica aperta', ASSESSMENT: 'In perizia', REPAIR: 'In riparazione', SETTLEMENT_PENDING: 'In liquidazione', CLOSED: 'Chiuso', CANCELLED: 'Annullato' } as Record<string, string>)[value] || value;
}

export function getRoadAccidentResponsibilityLabel(value: RoadAccidentResponsibility | string): string {
  return ({ TO_ASSESS: 'Da accertare', COMPANY: 'Azienda/autista', THIRD_PARTY: 'Controparte', SHARED: 'Concorso di colpa', NOT_APPLICABLE: 'Non applicabile' } as Record<string, string>)[value] || value;
}

export function getRoadEventAttachmentKindLabel(value: RoadEventAttachmentKind | string): string {
  return ({ NOTICE: 'Verbale', NOTIFICATION: 'Notifica', PAYMENT_RECEIPT: 'Ricevuta pagamento', APPEAL: 'Ricorso', CAI: 'CAI', PHOTO: 'Foto', POLICE_REPORT: 'Rilievi autorità', ESTIMATE: 'Preventivo', APPRAISAL: 'Perizia', INVOICE: 'Fattura', INSURER_COMMUNICATION: 'Comunicazione assicurazione', OTHER: 'Altro' } as Record<string, string>)[value] || value;
}

export type RoadEventOption = { id: string; label: string };

export function withInactiveLinkedOption(activeOptions: RoadEventOption[], linked: RoadEventOption | null): RoadEventOption[] {
  if (!linked || activeOptions.some((option) => option.id === linked.id)) return activeOptions;
  return [...activeOptions, { id: linked.id, label: `${linked.label} \u00b7 non attivo` }];
}

export function getRoadEventVehicleLabel(input: { tractor?: { plate: string; brand?: string | null; model?: string | null } | null; trailer?: { plate: string; brand?: string | null; model?: string | null } | null }): string {
  const vehicle = input.tractor || input.trailer;
  if (!vehicle) return 'Azienda / non associato';
  return [vehicle.plate, vehicle.brand, vehicle.model].filter(Boolean).join(' · ');
}

export function formatRoadEventMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value / 100);
}

export function roadEventMoneyInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : (value / 100).toFixed(2);
}

export function getRoadFineAccountingMovement(input: {
  status: string;
  paidAmountCents: number | null;
  paymentDate: Date | null;
}): { date: Date; amountCents: number } | null {
  if (!['PAID', 'CLOSED'].includes(input.status) || !input.paymentDate || (input.paidAmountCents || 0) <= 0) return null;
  return { date: input.paymentDate, amountCents: input.paidAmountCents! };
}

export type RoadAccidentAccountingMovement = {
  kind: 'DIRECT_COST' | 'REIMBURSEMENT';
  direction: 'COST' | 'REVENUE';
  date: Date;
  amountCents: number;
};

export function getRoadAccidentAccountingMovements(input: {
  status: string;
  directCostCents: number | null;
  directCostDate: Date | null;
  reimbursementCents: number | null;
  reimbursementDate: Date | null;
}): RoadAccidentAccountingMovement[] {
  if (input.status === 'CANCELLED') return [];
  const movements: RoadAccidentAccountingMovement[] = [];
  if ((input.directCostCents || 0) > 0 && input.directCostDate) {
    movements.push({ kind: 'DIRECT_COST', direction: 'COST', date: input.directCostDate, amountCents: input.directCostCents! });
  }
  if ((input.reimbursementCents || 0) > 0 && input.reimbursementDate) {
    movements.push({ kind: 'REIMBURSEMENT', direction: 'REVENUE', date: input.reimbursementDate, amountCents: input.reimbursementCents! });
  }
  return movements;
}
