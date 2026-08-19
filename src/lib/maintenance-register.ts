/**
 * Registro unico delle manutenzioni.
 *
 * L'operatore inserisce una sola cosa: una manutenzione. Che abbia una riga o venti,
 * il record salvato e sempre un `ExpenseDocument` con le sue righe. Restano pero le
 * schede `Maintenance` storiche, inserite prima dell'unificazione: questo modulo le
 * porta nello stesso elenco, con le stesse colonne, filtri e ricerca, senza mescolare
 * i totali contabili (l'importo di una scheda storica e ivato, non ha imponibile).
 */
import { MaintenanceStatus } from '@prisma/client';
import {
  getExpenseAllocationLabel,
  getExpenseLineAllocations,
  type ExpenseDocumentWithRelations,
  type ExpenseLineWithRelations
} from '@/lib/expense';
import {
  getMaintenanceDriverLabel,
  getMaintenanceStatusLabel,
  getMaintenanceVehicleLabel,
  maintenanceToCloseFilterValue,
  maintenanceToCloseStatuses,
  type MaintenanceWithRelations
} from '@/lib/maintenance';

export type MaintenanceRegisterSort = 'activity' | 'documentDate';

export type MaintenanceRegisterFilters = {
  categoryId: string;
  driverId: string;
  pdf: '' | 'missing' | 'present';
  q: string;
  sort: MaintenanceRegisterSort;
  status: string;
  supplierId: string;
  vehicleKey: string;
};

export type MaintenanceRegisterRow = {
  id: string;
  /** `DOCUMENT` = manutenzione registrata oggi; `CARD` = scheda storica pre-unificazione. */
  kind: 'DOCUMENT' | 'CARD';
  href: string;
  date: Date;
  activityAt: Date;
  supplierLabel: string;
  documentNumber: string | null;
  title: string;
  lineCount: number;
  allocationLabel: string;
  odometerLabel: string;
  imponibileCents: number | null;
  totalCents: number | null;
  statusLabel: string;
  statusClassName: string;
  categoryLabel: string;
  driverLabel: string;
  documentStatus: 'PENDING' | 'CONFIRMED' | null;
  cardStatus: MaintenanceStatus | null;
  filePath: string | null;
  fileHref: string | null;
  missingFileHref: string;
  vehicleKeys: string[];
  categoryIds: string[];
  supplierId: string | null;
  driverIds: string[];
  searchText: string;
};

/** Opzioni del filtro `Stato`, uguali per documenti e schede storiche. */
export const maintenanceRegisterStatusOptions: Array<{ value: string; label: string }> = [
  { value: 'PENDING', label: 'Da controllare' },
  { value: 'CONFIRMED', label: 'Registrate' },
  { value: maintenanceToCloseFilterValue, label: 'Da chiudere (da fare o in lavorazione)' }
];

export function normalizeMaintenanceRegisterFilters(input: {
  categoryId?: string | null;
  driverId?: string | null;
  pdf?: string | null;
  q?: string | null;
  sort?: string | null;
  status?: string | null;
  supplierId?: string | null;
  vehicleKey?: string | null;
}): MaintenanceRegisterFilters {
  const status = input.status || '';
  const known =
    status === 'PENDING' ||
    status === 'CONFIRMED' ||
    status === maintenanceToCloseFilterValue ||
    Object.values(MaintenanceStatus).includes(status as MaintenanceStatus);

  return {
    categoryId: input.categoryId || '',
    driverId: input.driverId || '',
    pdf: input.pdf === 'missing' || input.pdf === 'present' ? input.pdf : '',
    q: (input.q || '').trim(),
    sort: input.sort === 'documentDate' ? 'documentDate' : 'activity',
    status: known ? status : '',
    supplierId: input.supplierId || '',
    vehicleKey: input.vehicleKey || ''
  };
}

function uniqueLabels(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function joinLabels(values: string[]): string {
  if (values.length === 0) return '-';
  if (values.length <= 2) return values.join(', ');
  return `${values.slice(0, 2).join(', ')} +${values.length - 2}`;
}

function summarizeAllocations(lines: ExpenseLineWithRelations[]): string {
  const labels = Array.from(new Set(lines.flatMap((line) =>
    getExpenseLineAllocations(line).map((allocation) => getExpenseAllocationLabel(allocation))
  )));
  if (labels.length === 0) return '-';
  if (labels.length <= 2) return labels.join(', ');
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
}

function summarizeOdometer(lines: ExpenseLineWithRelations[]): string {
  const values = Array.from(new Set(lines.flatMap((line) =>
    getExpenseLineAllocations(line).flatMap((allocation) => allocation.odometerKm === null ? [] : [allocation.odometerKm])
  )));
  if (values.length === 0) return '-';
  const formatted = values.map((value) => value.toLocaleString('it-IT'));
  if (values.length <= 2) return formatted.join(', ');
  return `${formatted.slice(0, 2).join(', ')} +${values.length - 2}`;
}

function documentTitle(document: ExpenseDocumentWithRelations): string {
  const first = document.lines[0]?.description?.trim();
  if (!first) return 'Manutenzione senza righe';
  return document.lines.length > 1 ? `${first} +${document.lines.length - 1}` : first;
}

function searchable(values: Array<string | number | null | undefined>): string {
  return values.filter((value) => value !== null && value !== undefined && value !== '')
    .join(' ')
    .toLocaleLowerCase('it');
}

function documentVehicleKeys(document: ExpenseDocumentWithRelations): string[] {
  return Array.from(new Set(document.lines.flatMap((line) =>
    getExpenseLineAllocations(line).flatMap((allocation) => {
      if (allocation.tractorId) return [`TRACTOR:${allocation.tractorId}`];
      if (allocation.trailerId) return [`TRAILER:${allocation.trailerId}`];
      return [];
    })
  )));
}

export function buildMaintenanceRegisterRows(input: {
  documents: ExpenseDocumentWithRelations[];
  cards: MaintenanceWithRelations[];
}): MaintenanceRegisterRow[] {
  const documentRows: MaintenanceRegisterRow[] = input.documents.map((document) => ({
    id: document.id,
    kind: 'DOCUMENT',
    href: `/maintenances/expenses/${document.id}`,
    date: document.registeredAt,
    activityAt: document.updatedAt,
    supplierLabel: document.supplier?.name || document.supplierName || '-',
    documentNumber: document.documentNumber,
    title: documentTitle(document),
    lineCount: document.lines.length,
    allocationLabel: summarizeAllocations(document.lines),
    odometerLabel: summarizeOdometer(document.lines),
    imponibileCents: document.totalImponibileCents,
    totalCents: document.totalAmountCents,
    statusLabel: document.status === 'PENDING' ? 'Da controllare' : 'Registrata',
    statusClassName: `expense-status-${document.status.toLowerCase()}`,
    categoryLabel: joinLabels(uniqueLabels(document.lines.map((line) => line.category?.name))),
    driverLabel: joinLabels(uniqueLabels(document.lines.flatMap((line) =>
      getExpenseLineAllocations(line).map((allocation) => allocation.driver
        ? `${allocation.driver.lastName} ${allocation.driver.firstName}`.trim()
        : null)
    ))),
    documentStatus: document.status === 'PENDING' ? 'PENDING' : 'CONFIRMED',
    cardStatus: null,
    filePath: document.filePath,
    fileHref: document.filePath ? `/api/maintenances/expenses/${document.id}/file` : null,
    missingFileHref: document.status === 'PENDING'
      ? '/maintenances/expenses/review'
      : `/maintenances/expenses/${document.id}/edit`,
    vehicleKeys: documentVehicleKeys(document),
    categoryIds: uniqueLabels(document.lines.map((line) => line.categoryId)),
    supplierId: document.supplierId,
    driverIds: uniqueLabels(document.lines.flatMap((line) =>
      getExpenseLineAllocations(line).map((allocation) => allocation.driverId)
    )),
    searchText: searchable([
      document.supplier?.name,
      document.supplierName,
      document.documentNumber,
      document.originalFileName,
      ...document.lines.flatMap((line) => [
        line.code,
        line.description,
        ...getExpenseLineAllocations(line).flatMap((allocation) => [
          allocation.tractor?.plate,
          allocation.trailer?.plate,
          allocation.driver?.firstName,
          allocation.driver?.lastName,
          allocation.odometerKm
        ])
      ])
    ])
  }));

  const cardRows: MaintenanceRegisterRow[] = input.cards.map((card) => ({
    id: card.id,
    kind: 'CARD',
    href: `/maintenances/${card.id}`,
    date: card.maintenanceDate,
    activityAt: card.updatedAt,
    supplierLabel: card.supplier?.name || '-',
    documentNumber: card.documentNumber,
    title: card.title,
    lineCount: 1,
    allocationLabel: getMaintenanceVehicleLabel(card),
    odometerLabel: card.odometerKm === null ? '-' : card.odometerKm.toLocaleString('it-IT'),
    // Sulle schede storiche l'IVA non era tracciata: l'importo e ivato e l'imponibile non esiste.
    imponibileCents: null,
    totalCents: card.amountCents,
    statusLabel: getMaintenanceStatusLabel(card.status),
    statusClassName: `maintenance-status-${card.status.toLowerCase().replace('_', '-')}`,
    categoryLabel: card.category?.name || '-',
    driverLabel: getMaintenanceDriverLabel(card),
    documentStatus: null,
    cardStatus: card.status,
    filePath: card.filePath,
    fileHref: card.filePath ? `/api/maintenances/${card.id}/file` : null,
    missingFileHref: `/maintenances/${card.id}#modifica-manutenzione`,
    vehicleKeys: [
      ...(card.tractorId ? [`TRACTOR:${card.tractorId}`] : []),
      ...(card.trailerId ? [`TRAILER:${card.trailerId}`] : [])
    ],
    categoryIds: card.categoryId ? [card.categoryId] : [],
    supplierId: card.supplierId,
    driverIds: card.driverId ? [card.driverId] : [],
    searchText: searchable([
      card.title,
      card.description,
      card.notes,
      card.documentNumber,
      card.supplier?.name,
      card.category?.name,
      card.tractor?.plate,
      card.trailer?.plate,
      card.driver?.firstName,
      card.driver?.lastName,
      card.odometerKm
    ])
  }));

  return [...documentRows, ...cardRows];
}

function matchesStatus(row: MaintenanceRegisterRow, status: string): boolean {
  if (!status) return true;
  if (status === maintenanceToCloseFilterValue) {
    return row.cardStatus !== null && maintenanceToCloseStatuses.includes(row.cardStatus);
  }
  if (status === 'PENDING' || status === 'CONFIRMED') return row.documentStatus === status;
  return row.cardStatus === status;
}

export function filterAndSortMaintenanceRegisterRows(
  rows: MaintenanceRegisterRow[],
  filters: MaintenanceRegisterFilters
): MaintenanceRegisterRow[] {
  const query = filters.q.toLocaleLowerCase('it');

  return rows
    .filter((row) => {
      if (!matchesStatus(row, filters.status)) return false;
      if (filters.vehicleKey && !row.vehicleKeys.includes(filters.vehicleKey)) return false;
      if (filters.categoryId && !row.categoryIds.includes(filters.categoryId)) return false;
      if (filters.supplierId && row.supplierId !== filters.supplierId) return false;
      if (filters.driverId && !row.driverIds.includes(filters.driverId)) return false;
      if (filters.pdf === 'missing' && row.filePath) return false;
      if (filters.pdf === 'present' && !row.filePath) return false;
      if (!query) return true;
      return row.searchText.includes(query);
    })
    .sort((left, right) => {
      if (filters.sort === 'documentDate') {
        return right.date.getTime() - left.date.getTime() || right.activityAt.getTime() - left.activityAt.getTime();
      }
      return right.activityAt.getTime() - left.activityAt.getTime() || right.date.getTime() - left.date.getTime();
    });
}

export function summarizeMaintenanceRegister(rows: MaintenanceRegisterRow[]): {
  total: number;
  pending: number;
  cards: number;
  confirmedImponibileCents: number;
  confirmedTotalCents: number;
} {
  const confirmed = rows.filter((row) => row.documentStatus === 'CONFIRMED');

  return {
    total: rows.length,
    pending: rows.filter((row) => row.documentStatus === 'PENDING').length,
    cards: rows.filter((row) => row.kind === 'CARD').length,
    confirmedImponibileCents: confirmed.reduce((sum, row) => sum + (row.imponibileCents ?? 0), 0),
    confirmedTotalCents: confirmed.reduce((sum, row) => sum + (row.totalCents ?? 0), 0)
  };
}

/** Filtri del registro applicati da una richiesta del NFRP Bot. */
export function maintenanceRegisterRowMatchesText(row: MaintenanceRegisterRow, value: string | null | undefined): boolean {
  const needle = (value || '').trim().toLocaleLowerCase('it');
  if (!needle) return true;
  return row.searchText.includes(needle);
}
