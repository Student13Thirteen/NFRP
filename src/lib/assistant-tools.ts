import { DocumentStatus, EntityType, FuelEntryStatus, MaintenanceStatus, Prisma, TollEntryStatus, TripStatus, WarehouseStatus } from '@prisma/client';
import { buildDocumentChecklist } from '@/lib/document-checklist';
import { daysUntil, formatDate, startOfDay } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  documentInclude,
  type DocumentWithRelations,
  getDocumentVisualStatus,
  getEntityLabel,
  getEntityTypeLabel,
  getStatusLabel
} from '@/lib/documents';
import {
  formatTripTotalLoadQuantity,
  getTripProductLabel,
  getTripSalesPointSummary,
  getTripStatusLabel,
  getVehicleLabel,
  tripInclude,
  tripMatchesSearch,
  type TripWithRelations
} from '@/lib/trips';
import {
  getMaintenanceStatusLabel,
  getMaintenanceVehicleLabel,
  maintenanceInclude,
  maintenanceMatchesSearch,
  type MaintenanceWithRelations
} from '@/lib/maintenance';
import {
  formatWarehouseQuantity,
  getWarehouseStatusLabel,
  warehouseItemInclude,
  warehouseItemMatchesSearch,
  type WarehouseItemWithRelations
} from '@/lib/warehouse';
import {
  formatFuelCostPerKm,
  formatFuelLiters,
  formatFuelMoney,
  fuelEntryInclude,
  fuelEntryMatchesSearch,
  getFuelDriverLabel,
  getFuelEntryStatusLabel,
  getFuelVehicleLabel,
  type FuelEntryWithRelations
} from '@/lib/fuel';
import { isDefaultFuelProductCode } from '@/lib/fuel-parser';
import {
  filterCostCenterRows,
  formatCostMoney,
  getCostDirectionLabel,
  getCostCenterRows,
  getCostCenterTotals,
  getCostSourceLabel,
  type CostCenterRow,
  type CostSource
} from '@/lib/cost-center';
import {
  formatTollDistance,
  formatTollMoney,
  getTollEntryStatusLabel,
  getTollVehicleLabel,
  tollEntryInclude,
  tollEntryMatchesSearch,
  type TollEntryWithRelations
} from '@/lib/tolls';
import {
  type AssistantSearchStatus,
  type AssistantToolArguments,
  type AssistantToolName,
  normalizeAssistantPlate
} from '@/lib/assistant-planner';
import {
  analyzeFuelAnomalies,
  compareVehicleCosts,
  getVehicleCostTrend,
  rankFuelEfficiency,
  rankVehicleCosts
} from '@/lib/fleet-analytics';
import { getOperationalFleetDocumentWhere } from '@/lib/vehicle-lifecycle';

const MAX_ASSISTANT_ROWS = 15;
// Limite di sicurezza per le ricerche che filtrano lato JS: deve restare ben sopra
// il numero di record realistico della flotta (oggi qualche migliaio) cosi' il totale
// riportato e' corretto, ma con un tetto che protegge la memoria su hardware modesto.
// I totali "autorevoli" dei riepiloghi NON dipendono piu' da questo cap: usano aggregati DB.
const MAX_ASSISTANT_SCAN = 5000;
const ACTIVE_STATUS_FILTER = { notIn: [DocumentStatus.ARCHIVED, DocumentStatus.RENEWED] };

export type AssistantLink = {
  href: string;
  label: string;
};

export type AssistantResultRow = {
  id?: string;
  title: string;
  entityLabel: string;
  entityTypeLabel: string;
  documentTypeName: string;
  expiryDate: string;
  daysUntil: number | null;
  statusLabel: string;
  pdfLabel: string;
  href?: string;
  resultType?: 'document' | 'trip' | 'fuel' | 'toll' | 'cost' | 'maintenance' | 'warehouse' | 'summary';
  typeLabel?: string;
  dateLabel?: string;
  dateValue?: string;
  metricLabel?: string;
  metricValue?: string;
};

export type AssistantToolResult = {
  title: string;
  message: string;
  total: number;
  rows: AssistantResultRow[];
  link?: AssistantLink;
  tooMany: boolean;
};

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeWithinDays(value: number | null | undefined, fallback = 30): number {
  if (!Number.isFinite(value) || !value) return fallback;
  return Math.max(1, Math.min(365, Math.trunc(value)));
}

function normalizeDocumentTypeName(value: string | null | undefined): string | undefined {
  const normalized = (value || '').trim();
  return normalized || undefined;
}

export function buildSearchDocumentsWhere(args: AssistantToolArguments, now = new Date()): Prisma.DocumentWhereInput {
  const and: Prisma.DocumentWhereInput[] = [getOperationalFleetDocumentWhere()];
  const today = startOfDay(now);
  const plate = normalizeAssistantPlate(args.plate);
  const documentTypeName = normalizeDocumentTypeName(args.documentTypeName);

  if (args.status === 'inactive') {
    and.push({ status: { in: [DocumentStatus.ARCHIVED, DocumentStatus.RENEWED] } });
  } else if (args.status !== 'all') {
    and.push({ status: ACTIVE_STATUS_FILTER });
  }

  if (args.status === 'expired') {
    and.push({ expiryDate: { lt: today } });
  } else if (args.status === 'expiring' || args.withinDays) {
    and.push({ expiryDate: { gte: today, lte: addUtcDays(today, normalizeWithinDays(args.withinDays)) } });
  } else if (args.status === 'valid') {
    and.push({ expiryDate: { gt: today } });
  }

  if (args.missingPdf === true) {
    and.push({ filePath: null });
  } else if (args.missingPdf === false) {
    and.push({ filePath: { not: null } });
  }

  if (args.entityType) {
    and.push({ entityType: args.entityType as EntityType });
  }

  if (documentTypeName) {
    and.push({
      documentType: {
        name: {
          contains: documentTypeName,
          mode: 'insensitive'
        }
      }
    });
  }

  if (plate) {
    and.push({
      OR: [
        { tractor: { plate: { contains: plate, mode: 'insensitive' } } },
        { trailer: { plate: { contains: plate, mode: 'insensitive' } } }
      ]
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

function documentMatchesAssistantFilters(document: DocumentWithRelations, args: AssistantToolArguments, now = new Date()): boolean {
  const remainingDays = daysUntil(document.expiryDate, now);
  const isInactive = document.status === DocumentStatus.ARCHIVED || document.status === DocumentStatus.RENEWED;

  if (args.status === 'inactive') return isInactive;
  if (args.status !== 'all' && isInactive) return false;
  if (args.status === 'expired') return remainingDays < 0;
  if (args.status === 'valid') return getDocumentVisualStatus(document) === 'valid';

  if (args.status === 'expiring' || args.withinDays) {
    return remainingDays >= 0 && remainingDays <= normalizeWithinDays(args.withinDays);
  }

  return true;
}

export function createAssistantDocumentRow(document: DocumentWithRelations, now = new Date()): AssistantResultRow {
  const visualStatus = getDocumentVisualStatus(document);
  const remainingDays = daysUntil(document.expiryDate, now);

  return {
    id: document.id,
    title: document.title,
    entityLabel: getEntityLabel(document),
    entityTypeLabel: getEntityTypeLabel(document.entityType),
    documentTypeName: document.documentType.name,
    expiryDate: formatDate(document.expiryDate),
    daysUntil: remainingDays,
    statusLabel: visualStatus === 'inactive' ? getStatusLabel(document.status) : getStatusLabel(visualStatus),
    pdfLabel: document.filePath ? 'PDF presente' : 'PDF mancante',
    href: `/documents/${document.id}`
  };
}

function resultCountLabel(total: number): string {
  if (total === 1) return '1 risultato';
  return `${total} risultati`;
}

function buildSearchTitle(args: AssistantToolArguments): string {
  const parts = [
    args.documentTypeName || 'Documenti',
    args.plate ? `targa ${normalizeAssistantPlate(args.plate)}` : '',
    args.entityType ? getEntityTypeLabel(args.entityType as EntityType) : '',
    args.missingPdf ? 'senza PDF' : ''
  ].filter(Boolean);

  return parts.join(' - ');
}

function statusToDocumentFilter(status: AssistantSearchStatus | null | undefined, withinDays: number | null | undefined): string | undefined {
  if (status === 'expired') return 'expired';
  if (status === 'valid') return 'valid';
  if (status === 'inactive') return undefined;
  if (status === 'expiring' || withinDays) {
    const days = normalizeWithinDays(withinDays);
    if (days <= 7) return 'sevenDays';
    if (days <= 30) return 'within30';
  }
  return undefined;
}

export function buildDocumentFilterHref(args: AssistantToolArguments): string {
  const params = new URLSearchParams();
  const qParts = [
    args.plate ? normalizeAssistantPlate(args.plate) : '',
    args.documentTypeName || '',
    args.entityType ? getEntityTypeLabel(args.entityType as EntityType) : ''
  ].filter(Boolean);
  const status = statusToDocumentFilter(args.status, args.withinDays);

  if (qParts.length > 0) params.set('q', qParts.join(' '));
  if (status) params.set('status', status);
  if (args.missingPdf === true) params.set('pdf', 'missing');
  if (args.missingPdf === false) params.set('pdf', 'present');

  const query = params.toString();
  const basePath = args.status === 'inactive' ? '/documents/history' : '/documents';
  return query ? `${basePath}?${query}` : basePath;
}

function buildResultMessage(title: string, total: number, rowsLength: number): string {
  if (total === 0) return `${title}: nessun risultato trovato.`;
  if (total > rowsLength) return `${title}: ${resultCountLabel(total)}. Mostro i primi ${rowsLength}.`;
  return `${title}: ${resultCountLabel(total)}.`;
}

function normalizeQuery(value: string | null | undefined): string | undefined {
  const normalized = (value || '').trim();
  return normalized || undefined;
}

export async function searchDocuments(args: AssistantToolArguments): Promise<AssistantToolResult> {
  const now = new Date();
  const documents = await prisma.document.findMany({
    where: buildSearchDocumentsWhere(args, now),
    include: documentInclude,
    orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }],
    take: MAX_ASSISTANT_SCAN
  });
  const filteredDocuments = documents.filter((document) => documentMatchesAssistantFilters(document, args, now));
  const rows = filteredDocuments.slice(0, MAX_ASSISTANT_ROWS).map((document) => createAssistantDocumentRow(document, now));
  const title = buildSearchTitle(args);

  return {
    title,
    message: buildResultMessage(title, filteredDocuments.length, rows.length),
    total: filteredDocuments.length,
    rows,
    link: { href: buildDocumentFilterHref(args), label: 'Apri vista filtrata' },
    tooMany: filteredDocuments.length > rows.length
  };
}

export async function getExpiringSummary(args: AssistantToolArguments): Promise<AssistantToolResult> {
  const withinDays = normalizeWithinDays(args.withinDays);
  const title = `Scadenze entro ${withinDays} giorni`;
  const result = await searchDocuments({ status: 'expiring', withinDays });

  return {
    ...result,
    title,
    message: buildResultMessage(title, result.total, result.rows.length),
    link: { href: buildDocumentFilterHref({ status: 'expiring', withinDays }), label: 'Apri scadenze' }
  };
}

export async function getMissingPdfSummary(): Promise<AssistantToolResult> {
  const title = 'Documenti senza PDF';
  const result = await searchDocuments({ missingPdf: true });

  return {
    ...result,
    title,
    message: buildResultMessage(title, result.total, result.rows.length),
    link: { href: '/documents?pdf=missing', label: 'Apri PDF mancanti' }
  };
}

type VehicleRecord = {
  id: string;
  plate: string;
  entityType: EntityType;
};

async function findVehicleByPlate(plate: string): Promise<VehicleRecord | null> {
  const [tractor, trailer] = await Promise.all([
    prisma.tractor.findFirst({ where: { plate: { equals: plate, mode: 'insensitive' } } }),
    prisma.trailer.findFirst({ where: { plate: { equals: plate, mode: 'insensitive' } } })
  ]);

  if (tractor) return { id: tractor.id, plate: tractor.plate, entityType: EntityType.TRACTOR };
  if (trailer) return { id: trailer.id, plate: trailer.plate, entityType: EntityType.TRAILER };
  return null;
}

function buildVehicleRelationWhere(vehicle: VehicleRecord) {
  if (vehicle.entityType === EntityType.TRACTOR) return { tractorId: vehicle.id };
  return { trailerId: vehicle.id };
}

function buildVehicleDetailHref(vehicle: VehicleRecord): string {
  return vehicle.entityType === EntityType.TRACTOR ? `/vehicles/tractors/${vehicle.id}` : `/vehicles/trailers/${vehicle.id}`;
}

export async function getVehicleChecklist(args: AssistantToolArguments): Promise<AssistantToolResult> {
  const plate = normalizeAssistantPlate(args.plate);
  if (!plate) {
    return {
      title: 'Checklist targa',
      message: 'Per controllare cosa manca mi serve una targa.',
      total: 0,
      rows: [],
      tooMany: false
    };
  }

  const vehicle = await findVehicleByPlate(plate);
  if (!vehicle) {
    return {
      title: `Checklist targa ${plate}`,
      message: `Non ho trovato trattori o semirimorchi con targa ${plate}.`,
      total: 0,
      rows: [],
      link: { href: `/documents?q=${encodeURIComponent(plate)}`, label: 'Cerca nell archivio' },
      tooMany: false
    };
  }

  const relationWhere = buildVehicleRelationWhere(vehicle);
  const [documentTypes, documents, exclusions] = await Promise.all([
    prisma.documentType.findMany({
      where: { active: true, suggestedEntityType: vehicle.entityType },
      orderBy: { name: 'asc' },
      select: { id: true, name: true }
    }),
    prisma.document.findMany({
      where: { entityType: vehicle.entityType, ...relationWhere },
      orderBy: { expiryDate: 'desc' },
      select: { id: true, documentTypeId: true, expiryDate: true, filePath: true }
    }),
    prisma.documentRequirementExclusion.findMany({
      where: { entityType: vehicle.entityType, ...relationWhere },
      select: { documentTypeId: true }
    })
  ]);
  const checklist = buildDocumentChecklist(documentTypes, documents, exclusions);
  const entityLabel = `${getEntityTypeLabel(vehicle.entityType)} ${vehicle.plate}`;
  const rows = checklist.items.slice(0, MAX_ASSISTANT_ROWS).map((item) => {
    const href = item.latestDocument
      ? `/documents/${item.latestDocument.id}`
      : `/documents/new?entityType=${vehicle.entityType}&entityId=${vehicle.id}&documentTypeId=${item.id}`;

    return {
      id: item.latestDocument?.id,
      title: item.name,
      entityLabel,
      entityTypeLabel: getEntityTypeLabel(vehicle.entityType),
      documentTypeName: item.name,
      expiryDate: item.latestDocument ? formatDate(item.latestDocument.expiryDate) : '-',
      daysUntil: item.latestDocument ? daysUntil(item.latestDocument.expiryDate) : null,
      statusLabel: item.status === 'inserted' ? 'Inserito' : item.status === 'excluded' ? 'Non richiesto' : 'Mancante',
      pdfLabel: item.latestDocument ? (item.latestDocument.hasFile ? 'PDF presente' : 'PDF mancante') : 'PDF mancante',
      href
    } satisfies AssistantResultRow;
  });
  const title = `Checklist ${entityLabel}`;
  const message = `${title}: ${checklist.inserted} inseriti, ${checklist.missing} mancanti, ${checklist.excluded} non richiesti.`;

  return {
    title,
    message,
    total: checklist.items.length,
    rows,
    link: { href: buildVehicleDetailHref(vehicle), label: 'Apri scheda targa' },
    tooMany: checklist.items.length > rows.length
  };
}

function createAssistantTripRow(trip: TripWithRelations): AssistantResultRow {
  const vehicleParts = [getVehicleLabel(trip.tractor), getVehicleLabel(trip.trailer)].filter((value) => value !== '-');
  return {
    id: trip.id,
    title: `Viaggio ${trip.tripNumber} - ${getTripSalesPointSummary(trip)}`,
    entityLabel: vehicleParts.join(' / ') || 'Mezzo non assegnato',
    entityTypeLabel: 'Viaggio',
    documentTypeName: getTripProductLabel(trip),
    expiryDate: formatDate(trip.tripDate),
    daysUntil: null,
    statusLabel: getTripStatusLabel(trip.status),
    pdfLabel: 'PDF generabile',
    href: `/trips/${trip.id}`,
    resultType: 'trip',
    typeLabel: 'Prodotto',
    dateLabel: 'Data viaggio',
    dateValue: formatDate(trip.tripDate),
    metricLabel: 'Scarico',
    metricValue: `${getTripSalesPointSummary(trip)} - ${formatTripTotalLoadQuantity(trip)}`
  };
}

function buildTripFilterHref(args: AssistantToolArguments): string {
  const params = new URLSearchParams();
  const qParts = [args.plate ? normalizeAssistantPlate(args.plate) : '', normalizeQuery(args.query)].filter(Boolean);
  if (qParts.length > 0) params.set('q', qParts.join(' '));
  if (args.tripStatus) params.set('status', args.tripStatus);
  const query = params.toString();
  return query ? `/trips?${query}` : '/trips';
}

function tripMatchesAssistantFilters(trip: TripWithRelations, args: AssistantToolArguments, now = new Date()): boolean {
  const plate = normalizeAssistantPlate(args.plate);
  if (args.tripStatus && trip.status !== args.tripStatus) return false;
  if (plate && trip.tractor?.plate.toUpperCase() !== plate && trip.trailer?.plate.toUpperCase() !== plate) return false;
  if (args.withinDays) {
    const remainingDays = daysUntil(trip.tripDate, now);
    if (remainingDays < 0 || remainingDays > normalizeWithinDays(args.withinDays)) return false;
  }
  const query = normalizeQuery(args.query);
  if (query && !tripMatchesSearch(trip, query)) return false;
  return true;
}

export async function searchTrips(args: AssistantToolArguments): Promise<AssistantToolResult> {
  const now = new Date();
  const trips = await prisma.trip.findMany({
    include: tripInclude,
    orderBy: [{ tripDate: 'desc' }, { tripNumber: 'desc' }],
    take: MAX_ASSISTANT_SCAN
  });
  const filteredTrips = trips.filter((trip) => tripMatchesAssistantFilters(trip, args, now));
  const rows = filteredTrips.slice(0, MAX_ASSISTANT_ROWS).map(createAssistantTripRow);
  const title = args.tripStatus ? `Viaggi ${getTripStatusLabel(args.tripStatus as TripStatus)}` : 'Viaggi';

  return {
    title,
    message: buildResultMessage(title, filteredTrips.length, rows.length),
    total: filteredTrips.length,
    rows,
    link: { href: buildTripFilterHref(args), label: 'Apri viaggi' },
    tooMany: filteredTrips.length > rows.length
  };
}

export async function getTripsSummary(): Promise<AssistantToolResult> {
  const trips = await prisma.trip.findMany({
    include: tripInclude,
    orderBy: [{ tripDate: 'desc' }, { tripNumber: 'desc' }],
    take: 15
  });
  const [planned, sent, completed, cancelled] = await Promise.all([
    prisma.trip.count({ where: { status: TripStatus.PLANNED } }),
    prisma.trip.count({ where: { status: TripStatus.SENT } }),
    prisma.trip.count({ where: { status: TripStatus.COMPLETED } }),
    prisma.trip.count({ where: { status: TripStatus.CANCELLED } })
  ]);
  const title = 'Riepilogo viaggi';
  const rows = trips.slice(0, MAX_ASSISTANT_ROWS).map(createAssistantTripRow);

  return {
    title,
    message: `${title}: ${planned} pianificati, ${sent} PDF inviati, ${completed} completati, ${cancelled} annullati.`,
    total: planned + sent + completed + cancelled,
    rows,
    link: { href: '/trips', label: 'Apri viaggi' },
    tooMany: false
  };
}

function createAssistantFuelRow(entry: FuelEntryWithRelations): AssistantResultRow {
  return {
    id: entry.id,
    title: `Rifornimento ${entry.plate} - ${entry.fuelProduct?.name || entry.productName || entry.productCode}`,
    entityLabel: `${getFuelVehicleLabel(entry)} - ${getFuelDriverLabel(entry)}`,
    entityTypeLabel: 'Rifornimento',
    documentTypeName: entry.fuelSupplier?.name || entry.fuelCard?.fuelSupplier?.name || entry.supplierName || '-',
    expiryDate: formatDate(entry.fuelDate),
    daysUntil: null,
    statusLabel: getFuelEntryStatusLabel(entry.status),
    pdfLabel: entry.importBatch ? 'PDF importato' : 'Manuale',
    href: `/fuel/${entry.id}`,
    resultType: 'fuel',
    typeLabel: 'Tessera',
    dateLabel: 'Data rifornimento',
    dateValue: formatDate(entry.fuelDate),
    metricLabel: 'Costo',
    metricValue: `${formatFuelMoney(entry.totalAmountCents)} - ${formatFuelLiters(entry.volumeLitersMilli)} L - ${formatFuelCostPerKm(entry.costPerKmMilliEuro)}`
  };
}

async function buildFuelFilterHref(args: AssistantToolArguments): Promise<string> {
  const params = new URLSearchParams();
  const qParts = [
    args.plate ? normalizeAssistantPlate(args.plate) : '',
    normalizeQuery(args.query),
    normalizeQuery(args.fuelCardNumber),
    normalizeQuery(args.fuelProductName)
  ].filter(Boolean);
  if (qParts.length > 0) params.set('q', qParts.join(' '));
  if (args.fuelNeedsReview) params.set('review', 'needs_review');

  if (args.fuelSupplierName) {
    const supplier = await prisma.fuelSupplier.findFirst({
      where: { name: { contains: args.fuelSupplierName, mode: 'insensitive' } },
      select: { id: true }
    });
    if (supplier) params.set('fuelSupplierId', supplier.id);
    else params.set('q', [params.get('q'), args.fuelSupplierName].filter(Boolean).join(' '));
  }

  if (args.fuelProductName) {
    const product = await prisma.fuelProduct.findFirst({
      where: {
        OR: [
          { name: { contains: args.fuelProductName, mode: 'insensitive' } },
          { code: { contains: args.fuelProductName.toUpperCase(), mode: 'insensitive' } }
        ]
      },
      select: { id: true }
    });
    if (product) params.set('fuelProductId', product.id);
  }

  const query = params.toString();
  return query ? `/fuel?${query}` : '/fuel';
}

function fuelEntryMatchesAssistantFilters(entry: FuelEntryWithRelations, args: AssistantToolArguments, now = new Date()): boolean {
  const plate = normalizeAssistantPlate(args.plate);
  if (plate && entry.plate.toUpperCase() !== plate && entry.tractor?.plate.toUpperCase() !== plate) return false;
  if (args.fuelNeedsReview && entry.status !== FuelEntryStatus.NEEDS_REVIEW) return false;
  if (
    args.fuelSupplierName &&
    !(entry.fuelSupplier?.name || entry.fuelCard?.fuelSupplier?.name || entry.supplierName || '')
      .toLocaleLowerCase('it-IT')
      .includes(args.fuelSupplierName.toLocaleLowerCase('it-IT'))
  ) {
    return false;
  }
  if (args.fuelCardNumber && !(entry.fuelCard?.cardNumber || entry.cardNumber).includes(args.fuelCardNumber)) return false;
  if (
    args.fuelProductName &&
    ![entry.fuelProduct?.name || '', entry.productName || '', entry.productCode]
      .join(' ')
      .toLocaleLowerCase('it-IT')
      .includes(args.fuelProductName.toLocaleLowerCase('it-IT'))
  ) {
    return false;
  }
  if (args.withinDays) {
    const since = addUtcDays(startOfDay(now), -normalizeWithinDays(args.withinDays));
    if (entry.fuelDate < since) return false;
  }
  const query = normalizeQuery(args.query);
  if (query && !fuelEntryMatchesSearch(entry, query)) return false;
  return true;
}

export async function searchFuelEntries(args: AssistantToolArguments): Promise<AssistantToolResult> {
  const now = new Date();
  const entries = await prisma.fuelEntry.findMany({
    include: fuelEntryInclude,
    orderBy: [{ fuelDate: 'desc' }, { fuelTime: 'desc' }, { createdAt: 'desc' }],
    take: MAX_ASSISTANT_SCAN
  });
  const filteredEntries = entries.filter((entry) => fuelEntryMatchesAssistantFilters(entry, args, now));
  const rows = filteredEntries.slice(0, MAX_ASSISTANT_ROWS).map(createAssistantFuelRow);
  const title = args.fuelSupplierName || args.fuelProductName || args.fuelCardNumber || 'Rifornimenti';

  return {
    title,
    message: buildResultMessage(title, filteredEntries.length, rows.length),
    total: filteredEntries.length,
    rows,
    link: { href: await buildFuelFilterHref(args), label: 'Apri rifornimenti' },
    tooMany: filteredEntries.length > rows.length
  };
}

export async function getFuelSummary(): Promise<AssistantToolResult> {
  // Totali su tutto il dataset via aggregati DB (niente piu' troncamento a 300).
  const [totals, reviewCount, kmRows, displayEntries] = await Promise.all([
    prisma.fuelEntry.aggregate({
      _sum: { totalAmountCents: true, volumeLitersMilli: true },
      _count: true,
      where: { status: { not: FuelEntryStatus.PENDING } }
    }),
    prisma.fuelEntry.count({ where: { status: FuelEntryStatus.NEEDS_REVIEW } }),
    prisma.fuelEntry.findMany({
      where: { kmDelta: { not: null }, status: { notIn: [FuelEntryStatus.PENDING, FuelEntryStatus.NEEDS_REVIEW] } },
      select: { productCode: true, kmDelta: true, totalAmountCents: true }
    }),
    prisma.fuelEntry.findMany({
      where: { status: { not: FuelEntryStatus.PENDING } },
      include: fuelEntryInclude,
      orderBy: [{ fuelDate: 'desc' }, { fuelTime: 'desc' }, { createdAt: 'desc' }],
      take: MAX_ASSISTANT_ROWS
    })
  ]);

  const totalAmountCents = totals._sum.totalAmountCents || 0;
  const totalVolumeLitersMilli = totals._sum.volumeLitersMilli || 0;
  const accountedCount = totals._count;

  // km ed euro/km solo sui carburanti di trazione (AdBlue escluso), coerente con i totali di /fuel.
  const tractionKmRows = kmRows.filter((row) => row.kmDelta && isDefaultFuelProductCode(row.productCode));
  const totalKm = tractionKmRows.reduce((sum, row) => sum + (row.kmDelta || 0), 0);
  const amountWithKmCents = tractionKmRows.reduce((sum, row) => sum + row.totalAmountCents, 0);
  const costPerKm = totalKm > 0 ? formatFuelCostPerKm(Math.round((amountWithKmCents * 10) / totalKm)) : '-';

  const rows = displayEntries.map(createAssistantFuelRow);
  const title = 'Riepilogo rifornimenti';

  return {
    title,
    message: `${title}: ${formatFuelMoney(totalAmountCents)}, ${formatFuelLiters(totalVolumeLitersMilli)} L, ${totalKm.toLocaleString('it-IT')} km calcolati, ${costPerKm}, ${accountedCount.toLocaleString('it-IT')} rifornimenti, ${reviewCount} da verificare.`,
    total: accountedCount,
    rows,
    link: { href: '/fuel', label: 'Apri rifornimenti' },
    tooMany: accountedCount > rows.length
  };
}

function createAssistantTollRow(entry: TollEntryWithRelations): AssistantResultRow {
  return {
    id: entry.id,
    title: `Pedaggio ${entry.plate} - ${entry.routeName}`,
    entityLabel: `${getTollVehicleLabel(entry)} - tessera ${entry.card?.cardNumber || entry.cardNumber}`,
    entityTypeLabel: 'Autostrade',
    documentTypeName: entry.motorwayName || 'Pedaggio autostradale',
    expiryDate: formatDate(entry.tollDate),
    daysUntil: null,
    statusLabel: getTollEntryStatusLabel(entry.status),
    pdfLabel: entry.importBatch ? 'CSV importato' : 'Manuale',
    href: `/tolls?q=${encodeURIComponent(entry.plate)}`,
    resultType: 'toll',
    typeLabel: 'Tratta',
    dateLabel: 'Data pedaggio',
    dateValue: formatDate(entry.tollDate),
    metricLabel: 'Costo',
    metricValue: `${formatTollMoney(entry.grossAmountCents)} - ${formatTollDistance(entry.distanceKm)}`
  };
}

function tollEntryMatchesAssistantFilters(entry: TollEntryWithRelations, args: AssistantToolArguments, now = new Date()): boolean {
  const plate = normalizeAssistantPlate(args.plate);
  if (plate && entry.plate.toUpperCase() !== plate && entry.tractor?.plate.toUpperCase() !== plate) return false;
  if (args.tollNeedsReview && entry.status !== TollEntryStatus.NEEDS_REVIEW) return false;
  if (args.tollCardNumber && !(entry.card?.cardNumber || entry.cardNumber).includes(args.tollCardNumber)) return false;
  if (args.withinDays) {
    const since = addUtcDays(startOfDay(now), -normalizeWithinDays(args.withinDays));
    if (entry.tollDate < since) return false;
  }
  const query = normalizeQuery(args.query);
  if (query && !tollEntryMatchesSearch(entry, query)) return false;
  return true;
}

function buildTollFilterHref(args: AssistantToolArguments): string {
  const params = new URLSearchParams();
  const qParts = [
    args.plate ? normalizeAssistantPlate(args.plate) : '',
    normalizeQuery(args.query),
    normalizeQuery(args.tollCardNumber)
  ].filter(Boolean);
  if (qParts.length > 0) params.set('q', qParts.join(' '));
  if (args.tollNeedsReview) params.set('status', 'needs_review');
  const query = params.toString();
  return query ? `/tolls?${query}` : '/tolls';
}

export async function searchTollEntries(args: AssistantToolArguments): Promise<AssistantToolResult> {
  const now = new Date();
  const entries = await prisma.tollEntry.findMany({
    where: { status: { not: TollEntryStatus.PENDING } },
    include: tollEntryInclude,
    orderBy: [{ tollDate: 'desc' }, { tollTime: 'desc' }, { createdAt: 'desc' }],
    take: MAX_ASSISTANT_SCAN
  });
  const filteredEntries = entries.filter((entry) => tollEntryMatchesAssistantFilters(entry, args, now));
  const rows = filteredEntries.slice(0, MAX_ASSISTANT_ROWS).map(createAssistantTollRow);
  const title = args.plate ? `Autostrade ${normalizeAssistantPlate(args.plate)}` : 'Autostrade';

  return {
    title,
    message: buildResultMessage(title, filteredEntries.length, rows.length),
    total: filteredEntries.length,
    rows,
    link: { href: buildTollFilterHref(args), label: 'Apri autostrade' },
    tooMany: filteredEntries.length > rows.length
  };
}

export async function getTollSummary(): Promise<AssistantToolResult> {
  // Totali su tutto il dataset via aggregati DB (niente piu' troncamento a 300).
  const [totals, reviewCount, cardsCount, displayEntries] = await Promise.all([
    prisma.tollEntry.aggregate({
      _sum: { grossAmountCents: true, netAmountCents: true, vatAmountCents: true },
      _count: true,
      where: { status: { not: TollEntryStatus.PENDING } }
    }),
    prisma.tollEntry.count({ where: { status: TollEntryStatus.NEEDS_REVIEW } }),
    prisma.tollCard.count(),
    prisma.tollEntry.findMany({
      where: { status: { not: TollEntryStatus.PENDING } },
      include: tollEntryInclude,
      orderBy: [{ tollDate: 'desc' }, { tollTime: 'desc' }, { createdAt: 'desc' }],
      take: MAX_ASSISTANT_ROWS
    })
  ]);
  const rows = displayEntries.map(createAssistantTollRow);
  const totalGrossCents = totals._sum.grossAmountCents || 0;
  const totalNetCents = totals._sum.netAmountCents || 0;
  const totalVatCents = totals._sum.vatAmountCents || 0;
  const title = 'Riepilogo autostrade';

  return {
    title,
    message: `${title}: ${formatTollMoney(totalGrossCents)} ivato (${formatTollMoney(totalNetCents)} netto, ${formatTollMoney(totalVatCents)} IVA), ${totals._count.toLocaleString('it-IT')} pedaggi, ${cardsCount} tessere, ${reviewCount} da verificare.`,
    total: totals._count,
    rows,
    link: { href: '/tolls', label: 'Apri autostrade' },
    tooMany: totals._count > rows.length
  };
}

function createAssistantCostRow(row: CostCenterRow): AssistantResultRow {
  return {
    id: row.id,
    title: row.description,
    entityLabel: row.entityLabel,
    entityTypeLabel: row.sourceLabel,
    documentTypeName: row.categoryName,
    expiryDate: formatDate(row.date),
    daysUntil: null,
    statusLabel: row.statusLabel,
    pdfLabel: row.isForecast ? 'Impegno previsto' : row.isInternalAllocation ? 'Attribuzione interna' : getCostDirectionLabel(row.direction),
    href: row.href,
    resultType: 'cost',
    typeLabel: 'Categoria',
    dateLabel: 'Data costo',
    dateValue: formatDate(row.date),
    metricLabel: row.direction === 'REVENUE' ? 'Ricavo' : 'Ivato',
    metricValue: formatCostMoney(row.grossAmountCents)
  };
}

function buildCostFilterHref(args: AssistantToolArguments): string {
  const params = new URLSearchParams();
  const qParts = [args.plate ? normalizeAssistantPlate(args.plate) : '', normalizeQuery(args.query)].filter(Boolean);
  if (qParts.length > 0) params.set('q', qParts.join(' '));
  if (args.costSource) params.set('source', args.costSource);
  if (args.costCategoryName) params.set('category', args.costCategoryName);
  if (args.plate) params.set('plate', normalizeAssistantPlate(args.plate) || args.plate);
  if (args.includeInternal === false) params.set('scope', 'accounting');
  const query = params.toString();
  return query ? `/costs?${query}` : '/costs';
}

export async function searchCosts(args: AssistantToolArguments): Promise<AssistantToolResult> {
  const rows = await getCostCenterRows();
  const since = args.withinDays ? addUtcDays(startOfDay(new Date()), -normalizeWithinDays(args.withinDays)) : null;
  const filteredRows = filterCostCenterRows(rows, {
    query: args.query,
    source: args.costSource,
    category: args.costCategoryName,
    plate: args.plate,
    fromDate: since,
    scope: args.includeInternal === false ? 'accounting' : 'all'
  });
  const resultRows = filteredRows.slice(0, MAX_ASSISTANT_ROWS).map(createAssistantCostRow);
  const totals = getCostCenterTotals(filteredRows);
  const title = args.costSource ? `Centro costi - ${getCostSourceLabel(args.costSource as CostSource)}` : 'Centro costi';

  return {
    title,
    message: `${title}: ${filteredRows.length} righe, ${formatCostMoney(totals.accountingGrossAmountCents)} costi, ${formatCostMoney(totals.revenueGrossAmountCents)} ricavi, margine ${formatCostMoney(totals.marginGrossAmountCents)}, ${formatCostMoney(totals.internalGrossAmountCents)} attribuzioni interne e ${formatCostMoney(totals.forecastGrossAmountCents)} impegni leasing previsti.`,
    total: filteredRows.length,
    rows: resultRows,
    link: { href: buildCostFilterHref(args), label: 'Apri centro costi' },
    tooMany: filteredRows.length > resultRows.length
  };
}

export async function getCostSummary(args: AssistantToolArguments = {}): Promise<AssistantToolResult> {
  const rows = filterCostCenterRows(await getCostCenterRows(), {
    scope: args.includeInternal === false ? 'accounting' : 'all'
  });
  const resultRows = rows.slice(0, MAX_ASSISTANT_ROWS).map(createAssistantCostRow);
  const totals = getCostCenterTotals(rows);
  const title = 'Riepilogo centro costi';

  return {
    title,
    message: `${title}: ${formatCostMoney(totals.accountingGrossAmountCents)} costi, ${formatCostMoney(totals.revenueGrossAmountCents)} ricavi, margine ${formatCostMoney(totals.marginGrossAmountCents)}, ${formatCostMoney(totals.internalGrossAmountCents)} attribuzioni interne, ${formatCostMoney(totals.forecastGrossAmountCents)} impegni leasing previsti, ${rows.length} righe.`,
    total: rows.length,
    rows: resultRows,
    link: { href: '/costs', label: 'Apri centro costi' },
    tooMany: rows.length > resultRows.length
  };
}

function createAssistantMaintenanceRow(maintenance: MaintenanceWithRelations): AssistantResultRow {
  const supplierLabel = maintenance.supplier?.name ? ` - ${maintenance.supplier.name}` : '';
  return {
    id: maintenance.id,
    title: maintenance.title,
    entityLabel: `${getMaintenanceVehicleLabel(maintenance)}${supplierLabel}`,
    entityTypeLabel: 'Manutenzione',
    documentTypeName: maintenance.category.name,
    expiryDate: formatDate(maintenance.maintenanceDate),
    daysUntil: null,
    statusLabel: getMaintenanceStatusLabel(maintenance.status),
    pdfLabel: maintenance.filePath ? 'PDF presente' : 'PDF mancante',
    href: `/maintenances/${maintenance.id}`,
    resultType: 'maintenance',
    typeLabel: 'Categoria',
    dateLabel: 'Data intervento',
    dateValue: formatDate(maintenance.maintenanceDate)
  };
}

async function buildMaintenanceFilterHref(args: AssistantToolArguments): Promise<string> {
  const params = new URLSearchParams();
  const qParts = [
    args.plate ? normalizeAssistantPlate(args.plate) : '',
    normalizeQuery(args.query),
    normalizeQuery(args.supplierName)
  ].filter(Boolean);
  if (qParts.length > 0) params.set('q', qParts.join(' '));
  if (args.maintenanceStatus) params.set('status', args.maintenanceStatus);
  if (args.maintenanceCategoryName) {
    const category = await prisma.category.findFirst({
      where: { name: { contains: args.maintenanceCategoryName, mode: 'insensitive' } },
      select: { id: true }
    });
    if (category) params.set('categoryId', category.id);
    else params.set('q', [params.get('q'), args.maintenanceCategoryName].filter(Boolean).join(' '));
  }
  if (args.supplierName) {
    const supplier = await prisma.supplier.findFirst({
      where: { name: { contains: args.supplierName, mode: 'insensitive' } },
      select: { id: true }
    });
    if (supplier) {
      params.delete('q');
      const queryOnly = normalizeQuery(args.query);
      const plateOnly = args.plate ? normalizeAssistantPlate(args.plate) : '';
      if (queryOnly || plateOnly) params.set('q', [plateOnly, queryOnly].filter(Boolean).join(' '));
      params.set('supplierId', supplier.id);
    }
  }
  const query = params.toString();
  return query ? `/maintenances?${query}` : '/maintenances';
}

function maintenanceMatchesAssistantFilters(
  maintenance: MaintenanceWithRelations,
  args: AssistantToolArguments,
  now = new Date()
): boolean {
  const plate = normalizeAssistantPlate(args.plate);
  if (args.maintenanceStatus && maintenance.status !== args.maintenanceStatus) return false;
  if (plate && maintenance.tractor?.plate.toUpperCase() !== plate && maintenance.trailer?.plate.toUpperCase() !== plate) return false;
  if (args.missingPdf === true && maintenance.filePath) return false;
  if (args.missingPdf === false && !maintenance.filePath) return false;
  if (
    args.maintenanceCategoryName &&
    !maintenance.category.name.toLocaleLowerCase('it-IT').includes(args.maintenanceCategoryName.toLocaleLowerCase('it-IT'))
  ) {
    return false;
  }
  if (
    args.supplierName &&
    !maintenance.supplier?.name.toLocaleLowerCase('it-IT').includes(args.supplierName.toLocaleLowerCase('it-IT'))
  ) {
    return false;
  }
  if (args.withinDays) {
    const remainingDays = daysUntil(maintenance.maintenanceDate, now);
    if (remainingDays < 0 || remainingDays > normalizeWithinDays(args.withinDays)) return false;
  }
  const query = normalizeQuery(args.query);
  if (query && !maintenanceMatchesSearch(maintenance, query)) return false;
  return true;
}

export async function searchMaintenances(args: AssistantToolArguments): Promise<AssistantToolResult> {
  const now = new Date();
  const maintenances = await prisma.maintenance.findMany({
    include: maintenanceInclude,
    orderBy: [{ maintenanceDate: 'desc' }, { createdAt: 'desc' }],
    take: MAX_ASSISTANT_SCAN
  });
  const filteredMaintenances = maintenances.filter((maintenance) => maintenanceMatchesAssistantFilters(maintenance, args, now));
  const rows = filteredMaintenances.slice(0, MAX_ASSISTANT_ROWS).map(createAssistantMaintenanceRow);
  const title = args.maintenanceCategoryName || args.supplierName || 'Manutenzioni';

  return {
    title,
    message: buildResultMessage(title, filteredMaintenances.length, rows.length),
    total: filteredMaintenances.length,
    rows,
    link: { href: await buildMaintenanceFilterHref(args), label: 'Apri manutenzioni' },
    tooMany: filteredMaintenances.length > rows.length
  };
}

export async function getMaintenanceSummary(): Promise<AssistantToolResult> {
  const [open, inProgress, completed, invoiced, archived, missingPdf, maintenances] = await Promise.all([
    prisma.maintenance.count({ where: { status: MaintenanceStatus.OPEN } }),
    prisma.maintenance.count({ where: { status: MaintenanceStatus.IN_PROGRESS } }),
    prisma.maintenance.count({ where: { status: MaintenanceStatus.COMPLETED } }),
    prisma.maintenance.count({ where: { status: MaintenanceStatus.INVOICED } }),
    prisma.maintenance.count({ where: { status: MaintenanceStatus.ARCHIVED } }),
    prisma.maintenance.count({ where: { filePath: null } }),
    prisma.maintenance.findMany({
      include: maintenanceInclude,
      orderBy: [{ maintenanceDate: 'desc' }, { createdAt: 'desc' }],
      take: 15
    })
  ]);
  const title = 'Riepilogo manutenzioni';
  const rows = maintenances.slice(0, MAX_ASSISTANT_ROWS).map(createAssistantMaintenanceRow);

  return {
    title,
    message: `${title}: ${open} da fare, ${inProgress} in lavorazione, ${completed} completate, ${invoiced} fatturate, ${archived} archiviate, ${missingPdf} senza PDF.`,
    total: open + inProgress + completed + invoiced + archived,
    rows,
    link: { href: '/maintenances', label: 'Apri manutenzioni' },
    tooMany: false
  };
}

function createAssistantWarehouseRow(item: WarehouseItemWithRelations): AssistantResultRow {
  const supplierLabel = item.supplier?.name ? ` - ${item.supplier.name}` : '';
  const locationLabel = item.location ? ` - ${item.location}` : '';
  return {
    id: item.id,
    title: item.title,
    entityLabel: `Magazzino${supplierLabel}${locationLabel}`,
    entityTypeLabel: 'Magazzino',
    documentTypeName: item.category.name,
    expiryDate: formatDate(item.stockedAt),
    daysUntil: null,
    statusLabel: getWarehouseStatusLabel(item.status),
    pdfLabel: item.filePath ? 'PDF presente' : 'PDF mancante',
    href: `/warehouse/${item.id}`,
    resultType: 'warehouse',
    typeLabel: 'Categoria',
    dateLabel: 'Data carico',
    dateValue: formatDate(item.stockedAt),
    metricLabel: 'Quantita',
    metricValue: formatWarehouseQuantity(item)
  };
}

async function buildWarehouseFilterHref(args: AssistantToolArguments): Promise<string> {
  const params = new URLSearchParams();
  const qParts = [normalizeQuery(args.query), normalizeQuery(args.supplierName)].filter(Boolean);
  if (qParts.length > 0) params.set('q', qParts.join(' '));
  if (args.warehouseStatus) params.set('status', args.warehouseStatus);
  if (args.location) params.set('location', args.location);
  if (args.missingPdf === true) params.set('pdf', 'missing');
  if (args.missingPdf === false) params.set('pdf', 'present');

  if (args.warehouseCategoryName) {
    const category = await prisma.category.findFirst({
      where: { name: { contains: args.warehouseCategoryName, mode: 'insensitive' } },
      select: { id: true }
    });
    if (category) params.set('categoryId', category.id);
    else params.set('q', [params.get('q'), args.warehouseCategoryName].filter(Boolean).join(' '));
  }

  if (args.supplierName) {
    const supplier = await prisma.supplier.findFirst({
      where: { name: { contains: args.supplierName, mode: 'insensitive' } },
      select: { id: true }
    });
    if (supplier) {
      params.delete('q');
      const queryOnly = normalizeQuery(args.query);
      if (queryOnly) params.set('q', queryOnly);
      params.set('supplierId', supplier.id);
    }
  }

  const query = params.toString();
  return query ? `/warehouse?${query}` : '/warehouse';
}

function warehouseItemMatchesAssistantFilters(
  item: WarehouseItemWithRelations,
  args: AssistantToolArguments,
  now = new Date()
): boolean {
  if (args.warehouseStatus && item.status !== args.warehouseStatus) return false;
  if (args.missingPdf === true && item.filePath) return false;
  if (args.missingPdf === false && !item.filePath) return false;
  if (
    args.warehouseCategoryName &&
    !item.category.name.toLocaleLowerCase('it-IT').includes(args.warehouseCategoryName.toLocaleLowerCase('it-IT'))
  ) {
    return false;
  }
  if (args.supplierName && !item.supplier?.name.toLocaleLowerCase('it-IT').includes(args.supplierName.toLocaleLowerCase('it-IT'))) {
    return false;
  }
  if (args.location && !item.location?.toLocaleLowerCase('it-IT').includes(args.location.toLocaleLowerCase('it-IT'))) {
    return false;
  }
  if (args.withinDays) {
    const remainingDays = daysUntil(item.stockedAt, now);
    if (remainingDays < 0 || remainingDays > normalizeWithinDays(args.withinDays)) return false;
  }
  const query = normalizeQuery(args.query);
  if (query && !warehouseItemMatchesSearch(item, query)) return false;
  return true;
}

export async function searchWarehouse(args: AssistantToolArguments): Promise<AssistantToolResult> {
  const now = new Date();
  const items = await prisma.warehouseItem.findMany({
    include: warehouseItemInclude,
    orderBy: [{ stockedAt: 'desc' }, { createdAt: 'desc' }],
    take: MAX_ASSISTANT_SCAN
  });
  const filteredItems = items.filter((item) => warehouseItemMatchesAssistantFilters(item, args, now));
  const rows = filteredItems.slice(0, MAX_ASSISTANT_ROWS).map(createAssistantWarehouseRow);
  const title = args.warehouseCategoryName || args.supplierName || args.location || 'Magazzino';

  return {
    title,
    message: buildResultMessage(title, filteredItems.length, rows.length),
    total: filteredItems.length,
    rows,
    link: { href: await buildWarehouseFilterHref(args), label: 'Apri magazzino' },
    tooMany: filteredItems.length > rows.length
  };
}

export async function getWarehouseSummary(): Promise<AssistantToolResult> {
  const [inStock, lowStock, outOfStock, archived, missingPdf, items] = await Promise.all([
    prisma.warehouseItem.count({ where: { status: WarehouseStatus.IN_STOCK } }),
    prisma.warehouseItem.count({ where: { status: WarehouseStatus.LOW_STOCK } }),
    prisma.warehouseItem.count({ where: { status: WarehouseStatus.OUT_OF_STOCK } }),
    prisma.warehouseItem.count({ where: { status: WarehouseStatus.ARCHIVED } }),
    prisma.warehouseItem.count({ where: { filePath: null } }),
    prisma.warehouseItem.findMany({
      include: warehouseItemInclude,
      orderBy: [{ stockedAt: 'desc' }, { createdAt: 'desc' }],
      take: 15
    })
  ]);
  const title = 'Riepilogo magazzino';
  const rows = items.slice(0, MAX_ASSISTANT_ROWS).map(createAssistantWarehouseRow);

  return {
    title,
    message: `${title}: ${inStock} disponibili, ${lowStock} scorta bassa, ${outOfStock} esauriti, ${archived} archiviati, ${missingPdf} senza PDF.`,
    total: inStock + lowStock + outOfStock + archived,
    rows,
    link: { href: '/warehouse', label: 'Apri magazzino' },
    tooMany: false
  };
}

export async function runAssistantTool(toolName: AssistantToolName, args: AssistantToolArguments): Promise<AssistantToolResult> {
  switch (toolName) {
    case 'searchDocuments':
      return searchDocuments(args);
    case 'getVehicleChecklist':
      return getVehicleChecklist(args);
    case 'getExpiringSummary':
      return getExpiringSummary(args);
    case 'getMissingPdfSummary':
      return getMissingPdfSummary();
    case 'searchTrips':
      return searchTrips(args);
    case 'getTripsSummary':
      return getTripsSummary();
    case 'searchFuelEntries':
      return searchFuelEntries(args);
    case 'getFuelSummary':
      return getFuelSummary();
    case 'searchTollEntries':
      return searchTollEntries(args);
    case 'getTollSummary':
      return getTollSummary();
    case 'searchCosts':
      return searchCosts(args);
    case 'getCostSummary':
      return getCostSummary(args);
    case 'searchMaintenances':
      return searchMaintenances(args);
    case 'getMaintenanceSummary':
      return getMaintenanceSummary();
    case 'searchWarehouse':
      return searchWarehouse(args);
    case 'getWarehouseSummary':
      return getWarehouseSummary();
    case 'rankVehicleCosts':
      return rankVehicleCosts(args);
    case 'compareVehicleCosts':
      return compareVehicleCosts(args);
    case 'getVehicleCostTrend':
      return getVehicleCostTrend(args);
    case 'rankFuelEfficiency':
      return rankFuelEfficiency(args);
    case 'analyzeFuelAnomalies':
      return analyzeFuelAnomalies(args);
    default:
      throw new Error(`Unsupported assistant tool: ${toolName satisfies never}`);
  }
}
