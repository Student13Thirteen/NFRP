import { ContainerTripExtraStatus, ContainerTripStatus, FuelEntryStatus, MaintenanceStatus, TollEntryStatus, TripStatus, WarehouseMovementType } from '@prisma/client';
import { containerTripInclude, getContainerTripStatusLabel } from '@/lib/container-trips';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { formatEuroCents } from '@/lib/expense-shared';
import { getFuelEntryStatusLabel } from '@/lib/fuel';
import { getMaintenanceStatusLabel } from '@/lib/maintenance';
import { getTollEntryStatusLabel } from '@/lib/tolls';
import { getTripBillingStatusLabel, getTripSalesPointSummary, getVehicleLabel, tripInclude } from '@/lib/trips';
import { getWarehouseStatusLabel } from '@/lib/warehouse';
import { documentInclude, getEntityLabel, getStatusLabel } from '@/lib/documents';

export const COST_SOURCE_VALUES = ['TRIPS', 'CONTAINER_TRIPS', 'FUEL', 'TOLLS', 'LEASE', 'EXPENSE', 'MAINTENANCE', 'DOCUMENT', 'WAREHOUSE', 'WAREHOUSE_MOUNT'] as const;
export const COST_SCOPE_VALUES = ['all', 'accounting', 'internal', 'forecast'] as const;

export type CostSource = (typeof COST_SOURCE_VALUES)[number];
export type CostScope = (typeof COST_SCOPE_VALUES)[number];
export type CostDirection = 'COST' | 'REVENUE';

export type CostCenterFilters = {
  query?: string | null;
  source?: string | null;
  category?: string | null;
  plate?: string | null;
  fromDate?: Date | null;
  toDate?: Date | null;
  scope?: CostScope | null;
};

export type CostCenterRow = {
  key: string;
  id: string;
  source: CostSource;
  sourceLabel: string;
  direction: CostDirection;
  categoryName: string;
  date: Date;
  description: string;
  entityLabel: string;
  plate: string | null;
  tractorId: string | null;
  trailerId: string | null;
  supplierName: string | null;
  reference: string | null;
  netAmountCents: number;
  vatAmountCents: number;
  grossAmountCents: number;
  statusLabel: string;
  href: string;
  isInternalAllocation: boolean;
  isForecast?: boolean;
};

export function getCostSourceLabel(source: CostSource): string {
  switch (source) {
    case 'TRIPS':
      return 'Viaggi carburante';
    case 'CONTAINER_TRIPS':
      return 'Trasporti container';
    case 'FUEL':
      return 'Rifornimenti';
    case 'TOLLS':
      return 'Autostrade';
    case 'LEASE':
      return 'Leasing previsto';
    case 'EXPENSE':
      return 'Fatture/DDT';
    case 'MAINTENANCE':
      return 'Manutenzioni';
    case 'DOCUMENT':
      return 'Documenti flotta';
    case 'WAREHOUSE':
      return 'Magazzino';
    case 'WAREHOUSE_MOUNT':
      return 'Montaggi magazzino';
    default:
      return source;
  }
}

export function getCostDirectionLabel(direction: CostDirection): string {
  return direction === 'REVENUE' ? 'Ricavo' : 'Costo';
}

export function formatCostMoney(value: number | null | undefined): string {
  return formatEuroCents(value);
}

function compactPlate(value: string | null | undefined): string | null {
  const plate = (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return plate || null;
}

function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function rowSearchText(row: CostCenterRow): string {
  return normalizeSearch(
    [
      row.sourceLabel,
      getCostDirectionLabel(row.direction),
      row.categoryName,
      formatDate(row.date),
      row.description,
      row.entityLabel,
      row.plate || '',
      row.supplierName || '',
      row.reference || '',
      row.statusLabel,
      formatCostMoney(row.grossAmountCents)
    ].join(' ')
  );
}

function matchesQuery(row: CostCenterRow, query: string | null | undefined): boolean {
  const tokens = normalizeSearch(query || '')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const searchableText = rowSearchText(row);
  return tokens.every((token) => searchableText.includes(token));
}

function sourceFromInput(value: string | null | undefined): CostSource | null {
  if (!value) return null;
  return COST_SOURCE_VALUES.includes(value as CostSource) ? (value as CostSource) : null;
}

function sourceMatches(row: CostCenterRow, value: string | null | undefined): boolean {
  const source = sourceFromInput(value);
  return !source || row.source === source;
}

function scopeMatches(row: CostCenterRow, scope: CostScope | null | undefined): boolean {
  if (scope === 'accounting') return !row.isInternalAllocation && !row.isForecast;
  if (scope === 'internal') return row.isInternalAllocation;
  if (scope === 'forecast') return Boolean(row.isForecast);
  return true;
}

function categoryMatches(row: CostCenterRow, category: string | null | undefined): boolean {
  if (!category) return true;
  return row.categoryName === category;
}

function plateMatches(row: CostCenterRow, plate: string | null | undefined): boolean {
  const normalizedPlate = compactPlate(plate);
  if (!normalizedPlate) return true;
  return compactPlate(row.plate) === normalizedPlate;
}

function dateMatches(row: CostCenterRow, fromDate: Date | null | undefined, toDate: Date | null | undefined): boolean {
  if (fromDate && row.date < fromDate) return false;
  if (toDate) {
    const end = new Date(toDate);
    end.setUTCDate(end.getUTCDate() + 1);
    if (row.date >= end) return false;
  }
  return true;
}

function ivatoFromNetto(nettoCents: number, vatRatePercent: number | null): number {
  const rate = vatRatePercent ?? 0;
  return Math.round((nettoCents * (100 + rate)) / 100);
}

function vehicleLabel(input: {
  tractor?: { plate: string; brand: string | null; model: string | null } | null;
  trailer?: { plate: string; brand: string | null; model: string | null } | null;
  plate?: string | null;
}) {
  if (input.tractor) return getVehicleLabel(input.tractor);
  if (input.trailer) return getVehicleLabel(input.trailer);
  return input.plate || 'Azienda / generico';
}

export function filterCostCenterRows(rows: CostCenterRow[], filters: CostCenterFilters): CostCenterRow[] {
  return rows.filter(
    (row) =>
      sourceMatches(row, filters.source) &&
      scopeMatches(row, filters.scope || 'all') &&
      categoryMatches(row, filters.category) &&
      plateMatches(row, filters.plate) &&
      dateMatches(row, filters.fromDate, filters.toDate) &&
      matchesQuery(row, filters.query)
  );
}

export function getCostCenterTotals(rows: CostCenterRow[]) {
  return rows.reduce(
    (totals, row) => {
      totals.netAmountCents += row.netAmountCents;
      totals.vatAmountCents += row.vatAmountCents;
      totals.grossAmountCents += row.grossAmountCents;
      if (row.isForecast) {
        totals.forecastNetAmountCents += row.netAmountCents;
        totals.forecastVatAmountCents += row.vatAmountCents;
        totals.forecastGrossAmountCents += row.grossAmountCents;
      } else if (row.isInternalAllocation) {
        totals.internalGrossAmountCents += row.grossAmountCents;
      } else if (row.direction === 'REVENUE') {
        totals.revenueNetAmountCents += row.netAmountCents;
        totals.revenueVatAmountCents += row.vatAmountCents;
        totals.revenueGrossAmountCents += row.grossAmountCents;
      } else {
        totals.accountingNetAmountCents += row.netAmountCents;
        totals.accountingVatAmountCents += row.vatAmountCents;
        totals.accountingGrossAmountCents += row.grossAmountCents;
      }
      totals.marginNetAmountCents = totals.revenueNetAmountCents - totals.accountingNetAmountCents;
      totals.marginGrossAmountCents = totals.revenueGrossAmountCents - totals.accountingGrossAmountCents;
      return totals;
    },
    {
      netAmountCents: 0,
      vatAmountCents: 0,
      grossAmountCents: 0,
      accountingNetAmountCents: 0,
      accountingVatAmountCents: 0,
      accountingGrossAmountCents: 0,
      revenueNetAmountCents: 0,
      revenueVatAmountCents: 0,
      revenueGrossAmountCents: 0,
      marginNetAmountCents: 0,
      marginGrossAmountCents: 0,
      internalGrossAmountCents: 0,
      forecastNetAmountCents: 0,
      forecastVatAmountCents: 0,
      forecastGrossAmountCents: 0
    }
  );
}

export async function getCostCenterRows(): Promise<CostCenterRow[]> {
  const [trips, containerTrips, fuelEntries, tollEntries, leaseInstallments, expenseLines, maintenances, documents, warehouseItems, warehouseMovements] = await Promise.all([
    prisma.trip.findMany({
      where: {
        status: { not: TripStatus.CANCELLED },
        OR: [
          { freightRevenueCents: { not: null } },
          { carrierCostCents: { not: null } },
          { tollCostCents: { not: null } },
          { extraCostCents: { not: null } }
        ]
      },
      include: tripInclude,
      orderBy: [{ tripDate: 'desc' }, { tripNumber: 'desc' }]
    }),
    prisma.containerTrip.findMany({
      where: {
        status: { in: [ContainerTripStatus.READY_TO_BILL, ContainerTripStatus.INVOICED] },
        OR: [
          { freightRevenueCents: { not: null } },
          { carrierCostCents: { not: null } },
          { tollCostCents: { not: null } },
          { extras: { some: { status: ContainerTripExtraStatus.APPROVED } } }
        ]
      },
      include: containerTripInclude,
      orderBy: [{ tripDate: 'desc' }, { tripNumber: 'desc' }]
    }),
    prisma.fuelEntry.findMany({
      where: { status: { not: FuelEntryStatus.PENDING } },
      include: { tractor: true, fuelSupplier: true, fuelCard: { include: { fuelSupplier: true } }, fuelProduct: true },
      orderBy: [{ fuelDate: 'desc' }, { fuelTime: 'desc' }]
    }),
    prisma.tollEntry.findMany({
      where: { status: { not: TollEntryStatus.PENDING } },
      include: { tractor: true, card: true },
      orderBy: [{ tollDate: 'desc' }, { tollTime: 'desc' }]
    }),
    prisma.leaseInstallment.findMany({
      where: { contract: { status: 'ACTIVE' } },
      include: {
        contract: {
          include: { lessor: true, tractor: true, trailer: true }
        }
      },
      orderBy: [{ dueDate: 'desc' }, { position: 'desc' }]
    }),
    prisma.expenseLine.findMany({
      where: { document: { status: 'CONFIRMED' } },
      include: {
        category: true,
        tractor: true,
        trailer: true,
        document: { include: { supplier: true } }
      },
      orderBy: [{ document: { registeredAt: 'desc' } }, { position: 'asc' }]
    }),
    prisma.maintenance.findMany({
      where: { migratedToExpense: false, amountCents: { not: null }, status: { not: MaintenanceStatus.ARCHIVED } },
      include: { category: true, supplier: true, tractor: true, trailer: true },
      orderBy: [{ maintenanceDate: 'desc' }]
    }),
    prisma.document.findMany({
      where: { amountCents: { gt: 0 } },
      include: documentInclude,
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.warehouseItem.findMany({
      where: { migratedToExpense: false, amountCents: { not: null } },
      include: { category: true, supplier: true },
      orderBy: [{ stockedAt: 'desc' }]
    }),
    prisma.warehouseMovement.findMany({
      where: { type: WarehouseMovementType.UNLOAD },
      include: { tractor: true, trailer: true, warehouseItem: { include: { category: true, supplier: true } } },
      orderBy: [{ movementDate: 'desc' }]
    })
  ]);

  const rows: CostCenterRow[] = [];

  for (const trip of trips) {
    const common = {
      source: 'TRIPS' as const,
      sourceLabel: getCostSourceLabel('TRIPS'),
      date: trip.tripDate,
      description: `Viaggio ${trip.tripNumber} - ${getTripSalesPointSummary(trip)}`,
      entityLabel: vehicleLabel({ tractor: trip.tractor, trailer: trip.trailer }),
      plate: trip.tractor?.plate || trip.trailer?.plate || null,
      tractorId: trip.tractorId,
      trailerId: trip.trailerId,
      statusLabel: getTripBillingStatusLabel(trip.billingStatus),
      href: `/trips/${trip.id}`,
      isInternalAllocation: false
    };
    const reference = [trip.customerReference, trip.invoiceNumber, trip.transportDocumentNumber].filter(Boolean).join(' · ') || null;

    if ((trip.freightRevenueCents || 0) > 0) {
      rows.push({
        ...common,
        key: `trip-revenue-${trip.id}`,
        id: `${trip.id}-revenue`,
        direction: 'REVENUE',
        categoryName: 'Ricavo viaggio',
        supplierName: trip.customerName || null,
        reference,
        netAmountCents: trip.freightRevenueCents || 0,
        vatAmountCents: 0,
        grossAmountCents: trip.freightRevenueCents || 0
      });
    }

    if ((trip.carrierCostCents || 0) > 0) {
      rows.push({
        ...common,
        key: `trip-carrier-cost-${trip.id}`,
        id: `${trip.id}-carrier`,
        direction: 'COST',
        categoryName: 'Costo trasportatore',
        supplierName: trip.carrierName || null,
        reference,
        netAmountCents: trip.carrierCostCents || 0,
        vatAmountCents: 0,
        grossAmountCents: trip.carrierCostCents || 0
      });
    }

    if ((trip.tollCostCents || 0) > 0) {
      rows.push({
        ...common,
        key: `trip-toll-cost-${trip.id}`,
        id: `${trip.id}-tolls`,
        direction: 'COST',
        categoryName: 'Pedaggi imputati al viaggio',
        supplierName: null,
        reference,
        netAmountCents: trip.tollCostCents || 0,
        vatAmountCents: 0,
        grossAmountCents: trip.tollCostCents || 0
      });
    }

    if ((trip.extraCostCents || 0) > 0) {
      rows.push({
        ...common,
        key: `trip-extra-cost-${trip.id}`,
        id: `${trip.id}-extra`,
        direction: 'COST',
        categoryName: 'Costi extra viaggio',
        supplierName: null,
        reference,
        netAmountCents: trip.extraCostCents || 0,
        vatAmountCents: 0,
        grossAmountCents: trip.extraCostCents || 0
      });
    }
  }

  for (const trip of containerTrips) {
    const common = {
      source: 'CONTAINER_TRIPS' as const,
      sourceLabel: getCostSourceLabel('CONTAINER_TRIPS'),
      date: trip.tripDate,
      description: `Container ${trip.tripNumber} - ${trip.stops.map((stop) => stop.name).join(' → ') || trip.loadingTerminalName || 'tratta da completare'}`,
      entityLabel: vehicleLabel({ tractor: trip.tractor, trailer: trip.trailer }),
      plate: trip.tractor?.plate || trip.trailer?.plate || null,
      tractorId: trip.tractorId,
      trailerId: trip.trailerId,
      statusLabel: getContainerTripStatusLabel(trip.status),
      href: `/trips/container/${trip.id}`,
      isInternalAllocation: false
    };
    const reference = [
      trip.waybillNumber ? `LDV ${trip.waybillNumber}` : null,
      trip.booking ? `Booking ${trip.booking}` : null,
      trip.customerReference
    ].filter(Boolean).join(' · ') || null;
    const customer = trip.customer?.name || trip.customerName || (trip.customerCode ? `Committente ${trip.customerCode}` : null);

    if ((trip.freightRevenueCents || 0) > 0) {
      rows.push({
        ...common,
        key: `container-trip-revenue-${trip.id}`,
        id: `${trip.id}-revenue`,
        direction: 'REVENUE',
        categoryName: 'Ricavo trasporto container',
        supplierName: customer,
        reference,
        netAmountCents: trip.freightRevenueCents || 0,
        vatAmountCents: 0,
        grossAmountCents: trip.freightRevenueCents || 0
      });
    }

    for (const extra of trip.extras.filter((item) => item.status === ContainerTripExtraStatus.APPROVED)) {
      const amount = extra.approvedAmountCents ?? extra.negotiatedAmountCents ?? extra.proposedAmountCents ?? 0;
      if (amount <= 0) continue;
      rows.push({
        ...common,
        key: `container-trip-extra-${extra.id}`,
        id: extra.id,
        direction: 'REVENUE',
        categoryName: `Extra container - ${extra.description}`,
        supplierName: customer,
        reference: [reference, extra.reason].filter(Boolean).join(' · ') || null,
        netAmountCents: amount,
        vatAmountCents: 0,
        grossAmountCents: amount
      });
    }

    if ((trip.carrierCostCents || 0) > 0) {
      rows.push({
        ...common,
        key: `container-trip-carrier-${trip.id}`,
        id: `${trip.id}-carrier`,
        direction: 'COST',
        categoryName: 'Costo vettore container',
        supplierName: trip.carrierName,
        reference,
        netAmountCents: trip.carrierCostCents || 0,
        vatAmountCents: 0,
        grossAmountCents: trip.carrierCostCents || 0
      });
    }

    if ((trip.tollCostCents || 0) > 0) {
      rows.push({
        ...common,
        key: `container-trip-tolls-${trip.id}`,
        id: `${trip.id}-tolls`,
        direction: 'COST',
        categoryName: 'Pedaggi trasporto container',
        supplierName: null,
        reference,
        netAmountCents: trip.tollCostCents || 0,
        vatAmountCents: 0,
        grossAmountCents: trip.tollCostCents || 0
      });
    }
  }

  for (const entry of fuelEntries) {
    const net = entry.amountCents ?? entry.totalAmountCents;
    rows.push({
      key: `fuel-${entry.id}`,
      id: entry.id,
      source: 'FUEL',
      sourceLabel: getCostSourceLabel('FUEL'),
      direction: 'COST',
      categoryName: entry.fuelProduct?.name || entry.productName || entry.productCode || 'Carburante',
      date: entry.fuelDate,
      description: entry.stationName || entry.fuelProduct?.name || entry.productName || entry.productCode,
      entityLabel: vehicleLabel({ tractor: entry.tractor, plate: entry.plate }),
      plate: entry.plate,
      tractorId: entry.tractorId,
      trailerId: null,
      supplierName: entry.fuelSupplier?.name || entry.fuelCard?.fuelSupplier?.name || entry.supplierName || null,
      reference: entry.invoiceNumber || entry.ticketNumber || entry.cardNumber,
      netAmountCents: net,
      vatAmountCents: Math.max(0, entry.totalAmountCents - net),
      grossAmountCents: entry.totalAmountCents,
      statusLabel: getFuelEntryStatusLabel(entry.status),
      href: `/fuel/${entry.id}`,
      isInternalAllocation: false
    });
  }

  for (const entry of tollEntries) {
    rows.push({
      key: `toll-${entry.id}`,
      id: entry.id,
      source: 'TOLLS',
      sourceLabel: getCostSourceLabel('TOLLS'),
      direction: 'COST',
      categoryName: 'Pedaggi autostradali',
      date: entry.tollDate,
      description: entry.routeName,
      entityLabel: vehicleLabel({ tractor: entry.tractor, plate: entry.plate }),
      plate: entry.plate,
      tractorId: entry.tractorId,
      trailerId: null,
      supplierName: entry.providerName,
      reference: entry.invoiceNumber || entry.cardNumber,
      netAmountCents: entry.netAmountCents,
      vatAmountCents: entry.vatAmountCents,
      grossAmountCents: entry.grossAmountCents,
      statusLabel: getTollEntryStatusLabel(entry.status),
      href: `/tolls?q=${encodeURIComponent(entry.sourceKey)}`,
      isInternalAllocation: false
    });
  }

  for (const installment of leaseInstallments) {
    const contract = installment.contract;
    rows.push({
      key: `lease-${installment.id}`,
      id: installment.id,
      source: 'LEASE',
      sourceLabel: getCostSourceLabel('LEASE'),
      direction: 'COST',
      categoryName: 'Canone leasing previsto',
      date: installment.dueDate,
      description: installment.kind === 'ADVANCE' ? 'Primo canone / anticipo leasing' : 'Canone leasing periodico',
      entityLabel: vehicleLabel({ tractor: contract.tractor, trailer: contract.trailer }),
      plate: contract.tractor?.plate || contract.trailer?.plate || null,
      tractorId: contract.tractorId,
      trailerId: contract.trailerId,
      supplierName: contract.lessor?.name || contract.lessorName,
      reference: contract.contractNumber,
      netAmountCents: installment.netAmountCents,
      vatAmountCents: installment.vatCents,
      grossAmountCents: installment.grossAmountCents,
      statusLabel: 'Previsto da contratto',
      href: `/leases/${contract.id}`,
      isInternalAllocation: false,
      isForecast: true
    });
  }

  for (const line of expenseLines) {
    rows.push({
      key: `expense-${line.id}`,
      id: line.id,
      source: 'EXPENSE',
      sourceLabel: getCostSourceLabel('EXPENSE'),
      direction: 'COST',
      categoryName: line.category?.name || 'Spese',
      date: line.document.registeredAt,
      description: line.description,
      entityLabel: vehicleLabel({ tractor: line.tractor, trailer: line.trailer }),
      plate: line.tractor?.plate || line.trailer?.plate || null,
      tractorId: line.tractorId,
      trailerId: line.trailerId,
      supplierName: line.document.supplier?.name || line.document.supplierName,
      reference: line.document.documentNumber,
      netAmountCents: line.imponibileCents,
      vatAmountCents: line.vatCents,
      grossAmountCents: line.totalCents,
      statusLabel: 'Confermato',
      href: `/maintenances/expenses/${line.documentId}`,
      isInternalAllocation: false
    });
  }

  for (const maintenance of maintenances) {
    const amount = maintenance.amountCents || 0;
    rows.push({
      key: `maintenance-${maintenance.id}`,
      id: maintenance.id,
      source: 'MAINTENANCE',
      sourceLabel: getCostSourceLabel('MAINTENANCE'),
      direction: 'COST',
      categoryName: maintenance.category.name,
      date: maintenance.maintenanceDate,
      description: maintenance.title,
      entityLabel: vehicleLabel({ tractor: maintenance.tractor, trailer: maintenance.trailer }),
      plate: maintenance.tractor?.plate || maintenance.trailer?.plate || null,
      tractorId: maintenance.tractorId,
      trailerId: maintenance.trailerId,
      supplierName: maintenance.supplier?.name || null,
      reference: maintenance.documentNumber,
      netAmountCents: amount,
      vatAmountCents: 0,
      grossAmountCents: amount,
      statusLabel: getMaintenanceStatusLabel(maintenance.status),
      href: `/maintenances/${maintenance.id}`,
      isInternalAllocation: false
    });
  }

  for (const document of documents) {
    const amount = document.amountCents || 0;
    rows.push({
      key: `document-${document.id}`,
      id: document.id,
      source: 'DOCUMENT',
      sourceLabel: getCostSourceLabel('DOCUMENT'),
      direction: 'COST',
      categoryName: document.documentType.name,
      date: document.issueDate || document.createdAt,
      description: document.title,
      entityLabel: getEntityLabel(document),
      plate: document.tractor?.plate || document.trailer?.plate || null,
      tractorId: document.tractorId,
      trailerId: document.trailerId,
      supplierName: null,
      reference: document.originalFileName,
      netAmountCents: amount,
      vatAmountCents: 0,
      grossAmountCents: amount,
      statusLabel: getStatusLabel(document.status),
      href: `/documents/${document.id}`,
      isInternalAllocation: false
    });
  }

  for (const item of warehouseItems) {
    const amount = item.amountCents || 0;
    rows.push({
      key: `warehouse-${item.id}`,
      id: item.id,
      source: 'WAREHOUSE',
      sourceLabel: getCostSourceLabel('WAREHOUSE'),
      direction: 'COST',
      categoryName: item.category.name,
      date: item.stockedAt,
      description: item.title,
      entityLabel: 'Magazzino',
      plate: null,
      tractorId: null,
      trailerId: null,
      supplierName: item.supplier?.name || null,
      reference: item.documentNumber,
      netAmountCents: amount,
      vatAmountCents: 0,
      grossAmountCents: amount,
      statusLabel: getWarehouseStatusLabel(item.status),
      href: `/warehouse/${item.id}`,
      isInternalAllocation: false
    });
  }

  for (const movement of warehouseMovements) {
    const net = movement.amountCents || 0;
    const gross = ivatoFromNetto(net, movement.warehouseItem.vatRatePercent);
    rows.push({
      key: `warehouse-mount-${movement.id}`,
      id: movement.id,
      source: 'WAREHOUSE_MOUNT',
      sourceLabel: getCostSourceLabel('WAREHOUSE_MOUNT'),
      direction: 'COST',
      categoryName: movement.warehouseItem.category.name,
      date: movement.movementDate,
      description: movement.warehouseItem.title,
      entityLabel: vehicleLabel({ tractor: movement.tractor, trailer: movement.trailer }),
      plate: movement.tractor?.plate || movement.trailer?.plate || null,
      tractorId: movement.tractorId,
      trailerId: movement.trailerId,
      supplierName: movement.warehouseItem.supplier?.name || null,
      reference: 'Montaggio da magazzino',
      netAmountCents: net,
      vatAmountCents: Math.max(0, gross - net),
      grossAmountCents: gross,
      statusLabel: 'Attribuzione interna',
      href: `/warehouse/${movement.warehouseItemId}`,
      isInternalAllocation: true
    });
  }

  return rows.sort((left, right) => right.date.getTime() - left.date.getTime());
}
