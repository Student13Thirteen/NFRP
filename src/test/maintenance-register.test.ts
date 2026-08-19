import { describe, expect, it } from 'vitest';
import type { ExpenseDocumentWithRelations } from '@/lib/expense';
import type { MaintenanceWithRelations } from '@/lib/maintenance';
import { maintenanceToCloseFilterValue } from '@/lib/maintenance';
import {
  buildMaintenanceRegisterRows,
  filterAndSortMaintenanceRegisterRows,
  normalizeMaintenanceRegisterFilters,
  summarizeMaintenanceRegister
} from '@/lib/maintenance-register';

const createdAt = new Date('2026-08-01T09:00:00.000Z');

/** Documento di spesa ridotto ai soli campi letti dal registro. */
function documentFixture(input: {
  id: string;
  status: 'PENDING' | 'CONFIRMED';
  registeredAt: string;
  updatedAt: string;
  plate?: string;
  tractorId?: string;
  descriptions: string[];
  imponibileCents: number;
  totalCents: number;
  filePath?: string | null;
}): ExpenseDocumentWithRelations {
  return {
    id: input.id,
    status: input.status,
    source: 'MANUAL',
    supplierId: null,
    supplierName: 'OFFICINA DEMO BETA',
    documentNumber: `DOC-${input.id}`,
    documentDate: new Date(input.registeredAt),
    registeredAt: new Date(input.registeredAt),
    totalImponibileCents: input.imponibileCents,
    totalVatCents: input.totalCents - input.imponibileCents,
    totalAmountCents: input.totalCents,
    notes: null,
    filePath: input.filePath ?? null,
    originalFileName: null,
    createdAt,
    updatedAt: new Date(input.updatedAt),
    supplier: null,
    lines: input.descriptions.map((description, index) => ({
      id: `${input.id}-${index}`,
      documentId: input.id,
      position: index,
      code: null,
      description,
      quantityMilli: 1000,
      allocationType: input.tractorId ? 'TRACTOR' : 'GENERIC',
      tractorId: input.tractorId ?? null,
      trailerId: null,
      warehouseItemId: null,
      odometerKm: 412000,
      category: null,
      tractor: input.tractorId
        ? { id: input.tractorId, plate: input.plate ?? 'ZZ104ZZ' }
        : null,
      trailer: null,
      warehouseItem: null,
      allocations: []
    }))
  } as unknown as ExpenseDocumentWithRelations;
}

/** Scheda manutenzione storica, inserita prima dell'unificazione. */
function cardFixture(input: {
  id: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
  maintenanceDate: string;
  updatedAt: string;
  title: string;
  amountCents: number | null;
  tractorId?: string;
  plate?: string;
}): MaintenanceWithRelations {
  return {
    id: input.id,
    title: input.title,
    status: input.status,
    categoryId: 'categoria-1',
    maintenanceDate: new Date(input.maintenanceDate),
    documentDate: null,
    supplierId: null,
    documentNumber: null,
    driverId: null,
    tractorId: input.tractorId ?? null,
    trailerId: null,
    odometerKm: 250000,
    amountCents: input.amountCents,
    description: 'Intervento storico',
    notes: null,
    filePath: null,
    originalFileName: null,
    migratedToExpense: false,
    createdAt,
    updatedAt: new Date(input.updatedAt),
    category: { id: 'categoria-1', name: 'Meccanica' },
    supplier: null,
    driver: null,
    tractor: input.tractorId ? { id: input.tractorId, plate: input.plate ?? 'ZZ105ZZ' } : null,
    trailer: null
  } as unknown as MaintenanceWithRelations;
}

const pendingDocument = documentFixture({
  id: 'doc-pending',
  status: 'PENDING',
  registeredAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-18T10:00:00.000Z',
  descriptions: ['Filtro olio', 'Manodopera'],
  imponibileCents: 20000,
  totalCents: 24400,
  plate: 'ZZ101ZZ',
  tractorId: 'tractor-fn'
});

const confirmedDocument = documentFixture({
  id: 'doc-confirmed',
  status: 'CONFIRMED',
  registeredAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T12:00:00.000Z',
  descriptions: ['Cambio gomme'],
  imponibileCents: 50000,
  totalCents: 61000,
  plate: 'ZZ102ZZ',
  tractorId: 'tractor-fx',
  filePath: 'expenses/doc-confirmed.pdf'
});

const openCard = cardFixture({
  id: 'card-open',
  status: 'IN_PROGRESS',
  maintenanceDate: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T08:00:00.000Z',
  title: 'Revisione impianto frenante',
  amountCents: 30000,
  tractorId: 'tractor-fn',
  plate: 'ZZ101ZZ'
});

const rows = buildMaintenanceRegisterRows({
  documents: [pendingDocument, confirmedDocument],
  cards: [openCard]
});

describe('registro unico delle manutenzioni', () => {
  it('mette manutenzioni con una riga, con piu righe e schede storiche nello stesso elenco', () => {
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.kind === 'DOCUMENT')).toHaveLength(2);
    expect(rows.filter((row) => row.kind === 'CARD')).toHaveLength(1);
    expect(rows.find((row) => row.id === 'doc-pending')?.title).toBe('Filtro olio +1');
    expect(rows.find((row) => row.id === 'doc-confirmed')?.title).toBe('Cambio gomme');
    expect(rows.find((row) => row.id === 'card-open')?.title).toBe('Revisione impianto frenante');
  });

  it('porta ogni riga alla propria scheda e al proprio PDF', () => {
    const pending = rows.find((row) => row.id === 'doc-pending');
    const confirmed = rows.find((row) => row.id === 'doc-confirmed');
    const card = rows.find((row) => row.id === 'card-open');

    expect(pending?.href).toBe('/maintenances/expenses/doc-pending');
    expect(pending?.fileHref).toBeNull();
    expect(pending?.missingFileHref).toBe('/maintenances/expenses/review');
    expect(confirmed?.fileHref).toBe('/api/maintenances/expenses/doc-confirmed/file');
    expect(card?.href).toBe('/maintenances/card-open');
    expect(card?.missingFileHref).toBe('/maintenances/card-open#modifica-manutenzione');
  });

  it('non attribuisce un imponibile alle schede storiche, dove l’IVA non era tracciata', () => {
    const card = rows.find((row) => row.kind === 'CARD');

    expect(card?.imponibileCents).toBeNull();
    expect(card?.totalCents).toBe(30000);
  });

  it('ordina per attivita piu recente e sa tornare alla data della manutenzione', () => {
    const byActivity = filterAndSortMaintenanceRegisterRows(rows, normalizeMaintenanceRegisterFilters({}));
    const byDate = filterAndSortMaintenanceRegisterRows(
      rows,
      normalizeMaintenanceRegisterFilters({ sort: 'documentDate' })
    );

    expect(byActivity.map((row) => row.id)).toEqual(['doc-pending', 'doc-confirmed', 'card-open']);
    expect(byDate.map((row) => row.id)).toEqual(['doc-confirmed', 'doc-pending', 'card-open']);
  });

  it('filtra per stato con lo stesso vocabolario del quadro operativo', () => {
    const pending = filterAndSortMaintenanceRegisterRows(rows, normalizeMaintenanceRegisterFilters({ status: 'PENDING' }));
    const confirmed = filterAndSortMaintenanceRegisterRows(rows, normalizeMaintenanceRegisterFilters({ status: 'CONFIRMED' }));
    const toClose = filterAndSortMaintenanceRegisterRows(
      rows,
      normalizeMaintenanceRegisterFilters({ status: maintenanceToCloseFilterValue })
    );

    expect(pending.map((row) => row.id)).toEqual(['doc-pending']);
    expect(confirmed.map((row) => row.id)).toEqual(['doc-confirmed']);
    expect(toClose.map((row) => row.id)).toEqual(['card-open']);
  });

  it('ignora un filtro stato non riconosciuto invece di svuotare l’elenco', () => {
    const filters = normalizeMaintenanceRegisterFilters({ status: 'QUALSIASI' });

    expect(filters.status).toBe('');
    expect(filterAndSortMaintenanceRegisterRows(rows, filters)).toHaveLength(3);
  });

  it('cerca su documenti e schede storiche e filtra per mezzo', () => {
    const searched = filterAndSortMaintenanceRegisterRows(
      rows,
      normalizeMaintenanceRegisterFilters({ q: 'frenante' })
    );
    const byVehicle = filterAndSortMaintenanceRegisterRows(
      rows,
      normalizeMaintenanceRegisterFilters({ vehicleKey: 'TRACTOR:tractor-fn' })
    );

    expect(searched.map((row) => row.id)).toEqual(['card-open']);
    expect(byVehicle.map((row) => row.id)).toEqual(['doc-pending', 'card-open']);
  });

  it('conserva i filtri operativi del vecchio elenco: categoria, fornitore, autista e PDF', () => {
    const byCategory = filterAndSortMaintenanceRegisterRows(
      rows,
      normalizeMaintenanceRegisterFilters({ categoryId: 'categoria-1' })
    );
    const missingPdf = filterAndSortMaintenanceRegisterRows(
      rows,
      normalizeMaintenanceRegisterFilters({ pdf: 'missing' })
    );
    const withPdf = filterAndSortMaintenanceRegisterRows(
      rows,
      normalizeMaintenanceRegisterFilters({ pdf: 'present' })
    );

    expect(byCategory.map((row) => row.id)).toEqual(['card-open']);
    expect(missingPdf.map((row) => row.id)).toEqual(['doc-pending', 'card-open']);
    expect(withPdf.map((row) => row.id)).toEqual(['doc-confirmed']);
    expect(normalizeMaintenanceRegisterFilters({ pdf: 'qualsiasi' }).pdf).toBe('');
  });

  it('somma solo le manutenzioni registrate, senza mescolare le bozze', () => {
    const summary = summarizeMaintenanceRegister(rows);

    expect(summary).toEqual({
      total: 3,
      pending: 1,
      cards: 1,
      confirmedImponibileCents: 50000,
      confirmedTotalCents: 61000
    });
  });
});
