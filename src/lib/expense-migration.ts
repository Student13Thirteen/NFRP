// Mappatura PURA dei record legacy (Maintenance / WarehouseItem) verso un documento di spesa
// a 1 riga, in stato PENDING source=MIGRATION. Riusa SOLO i campi strutturati del gestionale,
// non interpreta il testo libero. L'IVA non era tracciata: si ipotizza al 22% e si segnala.

import {
  type AllocationKind,
  computeLineVat,
  imponibileCentsFromTotal
} from '@/lib/expense-shared';
import { buildExpenseReviewReasons, type AnomalyLine } from '@/lib/expense-anomalies';

export const MIGRATION_DEFAULT_VAT = 22;

export type MigrationLineInput = {
  description: string;
  code: string | null;
  quantityMilli: number;
  unit: string;
  unitPriceCents: number;
  imponibileCents: number;
  vatRatePercent: number;
  vatCents: number;
  totalCents: number;
  categoryId: string | null;
  allocationType: AllocationKind;
  tractorId: string | null;
  trailerId: string | null;
  warehouseItemId: string | null;
  odometerKm: number | null;
};

export type MigrationDocInput = {
  source: 'MIGRATION';
  status: 'PENDING';
  supplierId: string | null;
  supplierName: string | null;
  documentNumber: string | null;
  documentDate: Date | null;
  registeredAt: Date;
  notes: string | null;
  reviewReasons: string | null;
  totalImponibileCents: number;
  totalVatCents: number;
  totalAmountCents: number;
  filePath: string | null;
  originalFileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  line: MigrationLineInput;
};

export type LegacyMaintenance = {
  description: string;
  title: string;
  amountCents: number | null;
  categoryId: string | null;
  supplierId: string | null;
  documentNumber: string | null;
  documentDate: Date | null;
  maintenanceDate: Date;
  odometerKm: number | null;
  notes: string | null;
  tractorId: string | null;
  trailerId: string | null;
  filePath: string | null;
  originalFileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
};

export type LegacyWarehouseItem = {
  id: string;
  title: string;
  description: string;
  code: string | null;
  quantity: number;
  unit: string;
  amountCents: number | null;
  categoryId: string | null;
  supplierId: string | null;
  documentNumber: string | null;
  documentDate: Date | null;
  stockedAt: Date;
  notes: string | null;
  filePath: string | null;
  originalFileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
};

function buildLineFromTotal(params: {
  description: string;
  code: string | null;
  quantityMilli: number;
  unit: string;
  totalCents: number | null;
  categoryId: string | null;
  allocationType: AllocationKind;
  tractorId: string | null;
  trailerId: string | null;
  warehouseItemId: string | null;
  odometerKm: number | null;
}): MigrationLineInput {
  const declaredTotal = params.totalCents ?? 0;
  const imponibileCents = imponibileCentsFromTotal(declaredTotal, MIGRATION_DEFAULT_VAT);
  const { vatCents, totalCents } = computeLineVat(imponibileCents, MIGRATION_DEFAULT_VAT);
  const unitPriceCents = params.quantityMilli > 0 ? Math.round((imponibileCents * 1000) / params.quantityMilli) : imponibileCents;
  return {
    description: params.description,
    code: params.code,
    quantityMilli: params.quantityMilli,
    unit: params.unit,
    unitPriceCents,
    imponibileCents,
    vatRatePercent: MIGRATION_DEFAULT_VAT,
    vatCents,
    totalCents,
    categoryId: params.categoryId,
    allocationType: params.allocationType,
    tractorId: params.tractorId,
    trailerId: params.trailerId,
    warehouseItemId: params.warehouseItemId,
    odometerKm: params.odometerKm
  };
}

function reasonsFor(line: MigrationLineInput): string | null {
  const anomalyLine: AnomalyLine = {
    description: line.description,
    imponibileCents: line.imponibileCents,
    vatCents: line.vatCents,
    totalCents: line.totalCents,
    vatRatePercent: line.vatRatePercent,
    quantityMilli: line.quantityMilli,
    allocationType: line.allocationType
  };
  return buildExpenseReviewReasons([anomalyLine], { vatAssumed: true, requireAllocation: true });
}

function totalsFor(line: MigrationLineInput) {
  return {
    totalImponibileCents: line.imponibileCents,
    totalVatCents: line.vatCents,
    totalAmountCents: line.totalCents
  };
}

export function mapMaintenanceToExpense(maintenance: LegacyMaintenance): MigrationDocInput {
  const allocationType: AllocationKind = maintenance.tractorId
    ? 'TRACTOR'
    : maintenance.trailerId
      ? 'TRAILER'
      : 'GENERIC';

  const line = buildLineFromTotal({
    description: maintenance.description || maintenance.title,
    code: null,
    quantityMilli: 1000,
    unit: 'pz',
    totalCents: maintenance.amountCents,
    categoryId: maintenance.categoryId,
    allocationType,
    tractorId: maintenance.tractorId,
    trailerId: maintenance.trailerId,
    warehouseItemId: null,
    odometerKm: maintenance.odometerKm
  });

  return {
    source: 'MIGRATION',
    status: 'PENDING',
    supplierId: maintenance.supplierId,
    supplierName: null,
    documentNumber: maintenance.documentNumber,
    documentDate: maintenance.documentDate,
    registeredAt: maintenance.maintenanceDate,
    notes: maintenance.notes,
    reviewReasons: reasonsFor(line),
    ...totalsFor(line),
    filePath: maintenance.filePath,
    originalFileName: maintenance.originalFileName,
    fileSize: maintenance.fileSize,
    mimeType: maintenance.mimeType,
    line
  };
}

export function mapWarehouseItemToExpense(item: LegacyWarehouseItem): MigrationDocInput {
  const line = buildLineFromTotal({
    description: item.description || item.title,
    code: item.code,
    quantityMilli: Math.max(1, item.quantity) * 1000,
    unit: item.unit,
    totalCents: item.amountCents,
    categoryId: item.categoryId,
    allocationType: 'WAREHOUSE',
    tractorId: null,
    trailerId: null,
    warehouseItemId: item.id, // aggancia l'articolo esistente: la conferma NON ricarica il magazzino
    odometerKm: null
  });

  return {
    source: 'MIGRATION',
    status: 'PENDING',
    supplierId: item.supplierId,
    supplierName: null,
    documentNumber: item.documentNumber,
    documentDate: item.documentDate,
    registeredAt: item.stockedAt,
    notes: item.notes,
    reviewReasons: reasonsFor(line),
    ...totalsFor(line),
    filePath: item.filePath,
    originalFileName: item.originalFileName,
    fileSize: item.fileSize,
    mimeType: item.mimeType,
    line
  };
}
