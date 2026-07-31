import {
  Prisma,
  TripBillingStatus,
  TripStatus,
  type Driver,
  type LoadingBase,
  type SalesPoint,
  type Tractor,
  type Trailer,
  type TripProduct
} from '@prisma/client';
import { buildMapsHref, formatStructuredAddress, type StructuredAddress } from '@/lib/addresses';
import { formatDate } from '@/lib/dates';

export const tripInclude = Prisma.validator<Prisma.TripInclude>()({
  loadingBase: true,
  salesPoint: true,
  driver: true,
  tractor: true,
  trailer: true,
  customer: true,
  product: true,
  productLines: {
    include: { product: true, salesPoint: true },
    orderBy: { position: 'asc' }
  }
});

export type TripWithRelations = Prisma.TripGetPayload<{ include: typeof tripInclude }>;

export type TripProductLoadLine = {
  id?: string;
  salesPointId?: string | null;
  salesPoint?: Pick<SalesPoint, 'name' | 'plantCode' | 'address' | 'postalCode' | 'city' | 'province' | 'country'> | null;
  salesPointName?: string;
  productId?: string | null;
  product?: Pick<TripProduct, 'name' | 'notes' | 'unitLabel'> | null;
  productName?: string;
  liters: number;
  position?: number | null;
};

type TripProductSummaryInput = {
  productLines?: TripProductLoadLine[];
  salesPoint?: Pick<SalesPoint, 'name' | 'plantCode' | 'address' | 'postalCode' | 'city' | 'province' | 'country'> | null;
  salesPointId?: string | null;
  productId?: string | null;
  product?: Pick<TripProduct, 'name' | 'notes' | 'unitLabel'> | null;
  liters?: number;
  gasolineLiters?: number;
  dieselLiters?: number;
  gplLiters?: number;
  jetLiters?: number;
};

export type TripSelectOption = {
  id: string;
  label: string;
  active?: boolean;
  unitLabel?: string;
};

export function getTripStatusLabel(status: TripStatus): string {
  switch (status) {
    case TripStatus.PLANNED:
      return 'Pianificato';
    case TripStatus.SENT:
      return 'PDF inviato';
    case TripStatus.COMPLETED:
      return 'Completato';
    case TripStatus.CANCELLED:
      return 'Annullato';
    default:
      return status;
  }
}

export function getTripBillingStatusLabel(status: TripBillingStatus): string {
  switch (status) {
    case TripBillingStatus.NOT_READY:
      return 'Da completare';
    case TripBillingStatus.TO_BILL:
      return 'Da fatturare';
    case TripBillingStatus.INVOICED:
      return 'Fatturato';
    case TripBillingStatus.PAID:
      return 'Incassato';
    case TripBillingStatus.NOT_BILLABLE:
      return 'Non fatturabile';
    default:
      return status;
  }
}

export function getDriverLabel(driver: Pick<Driver, 'firstName' | 'lastName'> | null | undefined): string {
  if (!driver) return '-';
  return `${driver.lastName} ${driver.firstName}`.trim();
}

export function getVehicleLabel(vehicle: Pick<Tractor | Trailer, 'plate' | 'brand' | 'model'> | null | undefined): string {
  if (!vehicle) return '-';
  const details = [vehicle.brand, vehicle.model].filter(Boolean).join(' ');
  return details ? `${vehicle.plate} - ${details}` : vehicle.plate;
}

type TripAddressFields = StructuredAddress;

export function formatTripAddress(entity: TripAddressFields): string {
  return formatStructuredAddress(entity);
}

export function buildTripMapsHref(entity: TripAddressFields): string | null {
  return buildMapsHref(entity);
}

export function getLoadingBaseLabel(
  loadingBase: Pick<LoadingBase, 'name' | 'address' | 'postalCode' | 'city' | 'province' | 'country'>
): string {
  return [loadingBase.name, formatTripAddress(loadingBase)].filter(Boolean).join(' - ');
}

export function getSalesPointLabel(salesPoint: Pick<SalesPoint, 'name' | 'plantCode' | 'city' | 'province'>): string {
  const code = salesPoint.plantCode ? `Cod. ${salesPoint.plantCode}` : null;
  const locality = [salesPoint.city, salesPoint.province].filter(Boolean).join(' ');
  return [salesPoint.name, code, locality].filter(Boolean).join(' - ');
}

export function formatLiters(value: number): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(value);
}

export function formatTripMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value / 100);
}

export function getTripActualKm(trip: { odometerStartKm?: number | null; odometerEndKm?: number | null }): number | null {
  if (trip.odometerStartKm === null || trip.odometerStartKm === undefined) return null;
  if (trip.odometerEndKm === null || trip.odometerEndKm === undefined) return null;
  const delta = trip.odometerEndKm - trip.odometerStartKm;
  return delta >= 0 ? delta : null;
}

export function getTripTotalCostCents(trip: {
  carrierCostCents?: number | null;
  tollCostCents?: number | null;
  extraCostCents?: number | null;
}): number {
  return (trip.carrierCostCents || 0) + (trip.tollCostCents || 0) + (trip.extraCostCents || 0);
}

export function getTripMarginCents(trip: {
  freightRevenueCents?: number | null;
  carrierCostCents?: number | null;
  tollCostCents?: number | null;
  extraCostCents?: number | null;
}): number | null {
  if (trip.freightRevenueCents === null || trip.freightRevenueCents === undefined) return null;
  return trip.freightRevenueCents - getTripTotalCostCents(trip);
}

export function getTripProductLineLabel(line: TripProductLoadLine): string {
  return line.product?.name || line.productName || (line.productId ? 'Prodotto eliminato' : '-');
}

export function getTripProductLineUnitLabel(line: TripProductLoadLine): string {
  return line.product?.unitLabel?.trim() || 'L';
}

export function formatTripLoadQuantity(line: TripProductLoadLine): string {
  return `${formatLiters(line.liters)} ${getTripProductLineUnitLabel(line)}`;
}

export function getTripProductLineSalesPointLabel(line: TripProductLoadLine): string {
  if (line.salesPoint) return getSalesPointLabel(line.salesPoint);
  return line.salesPointName || (line.salesPointId ? 'Punto vendita eliminato' : '-');
}

export function getTripProductLines(trip: TripProductSummaryInput): TripProductLoadLine[] {
  if (trip.productLines?.length) {
    return [...trip.productLines]
      .filter((line) => line.liters > 0)
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
  }

  if (trip.productId) {
    return [
      {
        salesPointId: trip.salesPointId,
        salesPoint: trip.salesPoint,
        salesPointName: trip.salesPoint ? getSalesPointLabel(trip.salesPoint) : undefined,
        productId: trip.productId,
        product: trip.product,
        productName: trip.product?.name || 'Prodotto eliminato',
        liters: trip.liters || 0,
        position: 0
      }
    ];
  }

  return [
    { salesPointId: trip.salesPointId, salesPoint: trip.salesPoint, productId: null, productName: 'Gasolio', liters: trip.dieselLiters || 0, position: 0 },
    { salesPointId: trip.salesPointId, salesPoint: trip.salesPoint, productId: null, productName: 'Benzina', liters: trip.gasolineLiters || 0, position: 1 },
    { salesPointId: trip.salesPointId, salesPoint: trip.salesPoint, productId: null, productName: 'GPL', liters: trip.gplLiters || 0, position: 2 },
    { salesPointId: trip.salesPointId, salesPoint: trip.salesPoint, productId: null, productName: 'Jet A1', liters: trip.jetLiters || 0, position: 3 }
  ].filter((line) => line.liters > 0);
}

export function getTripTotalLiters(trip: TripProductSummaryInput): number {
  return getTripProductLines(trip).reduce((total, line) => total + line.liters, 0);
}

export function formatTripTotalLoadQuantity(trip: TripProductSummaryInput): string {
  const productLines = getTripProductLines(trip);
  if (productLines.length === 0) return '-';
  const unitLabels = Array.from(new Set(productLines.map(getTripProductLineUnitLabel)));
  if (unitLabels.length === 1) return `${formatLiters(getTripTotalLiters(trip))} ${unitLabels[0]}`;
  return `${productLines.length} righe`;
}

export function getTripProductLabel(trip: TripProductSummaryInput): string {
  const productLines = getTripProductLines(trip);
  if (productLines.length === 1) return getTripProductLineLabel(productLines[0]);
  if (productLines.length > 1) return `${productLines.length} prodotti`;
  return '-';
}

export function getTripSalesPointSummary(trip: TripProductSummaryInput): string {
  const productLines = getTripProductLines(trip);
  const salesPointLabels = productLines.map(getTripProductLineSalesPointLabel).filter((label) => label !== '-');
  const uniqueLabels = Array.from(new Set(salesPointLabels));
  if (uniqueLabels.length === 1) return uniqueLabels[0];
  if (uniqueLabels.length > 1) return `${uniqueLabels.length} punti vendita`;
  return trip.salesPoint ? getSalesPointLabel(trip.salesPoint) : '-';
}

export function buildLoadingBaseOptions(
  loadingBases: Array<Pick<LoadingBase, 'id' | 'name' | 'address' | 'postalCode' | 'city' | 'province' | 'country' | 'active'>>
): TripSelectOption[] {
  return loadingBases.map((loadingBase) => ({
    id: loadingBase.id,
    label: getLoadingBaseLabel(loadingBase),
    active: loadingBase.active
  }));
}

export function buildSalesPointOptions(
  salesPoints: Array<Pick<SalesPoint, 'id' | 'name' | 'plantCode' | 'city' | 'province' | 'active'>>
): TripSelectOption[] {
  return salesPoints.map((salesPoint) => ({
    id: salesPoint.id,
    label: getSalesPointLabel(salesPoint),
    active: salesPoint.active
  }));
}

export function buildTripProductOptions(products: Array<Pick<TripProduct, 'id' | 'name' | 'active' | 'unitLabel'>>): TripSelectOption[] {
  return products.map((product) => ({
    id: product.id,
    label: product.name,
    active: product.active,
    unitLabel: product.unitLabel
  }));
}

export function buildDriverOptions(drivers: Array<Pick<Driver, 'id' | 'firstName' | 'lastName' | 'active'>>): TripSelectOption[] {
  return drivers.map((driver) => ({
    id: driver.id,
    label: getDriverLabel(driver),
    active: driver.active
  }));
}

export function buildTractorOptions(tractors: Array<Pick<Tractor, 'id' | 'plate' | 'brand' | 'model' | 'active'>>): TripSelectOption[] {
  return tractors.map((tractor) => ({
    id: tractor.id,
    label: getVehicleLabel(tractor),
    active: tractor.active
  }));
}

export function buildTrailerOptions(trailers: Array<Pick<Trailer, 'id' | 'plate' | 'brand' | 'model' | 'active'>>): TripSelectOption[] {
  return trailers.map((trailer) => ({
    id: trailer.id,
    label: getVehicleLabel(trailer),
    active: trailer.active
  }));
}

export function getTripTitle(trip: TripWithRelations): string {
  return `Viaggio ${trip.tripNumber} - ${formatDate(trip.tripDate)} - ${getTripSalesPointSummary(trip)}`;
}

export function tripMatchesSearch(trip: TripWithRelations, query: string | undefined): boolean {
  if (!query) return true;
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const haystack = [
    String(trip.tripNumber),
    formatDate(trip.tripDate),
    trip.loadingBase.name,
    trip.loadingBase.address,
    trip.loadingBase.postalCode,
    trip.loadingBase.city,
    trip.loadingBase.province,
    trip.loadingBase.country,
    trip.salesPoint.name,
    trip.salesPoint.plantCode,
    trip.salesPoint.postalCode,
    trip.salesPoint.city,
    trip.salesPoint.province,
    trip.salesPoint.country,
    trip.salesPoint.address,
    trip.customer?.code,
    trip.customer?.name,
    trip.customerName,
    trip.customerReference,
    trip.carrierName,
    trip.transportDocumentNumber,
    trip.invoiceNumber,
    trip.economicNotes,
    ...getTripProductLines(trip).flatMap((line) => [
      getTripProductLineSalesPointLabel(line),
      line.salesPoint?.name,
      line.salesPoint?.plantCode,
      line.salesPoint?.address,
      line.salesPoint?.postalCode,
      line.salesPoint?.city,
      line.salesPoint?.province,
      line.salesPoint?.country
    ]),
    getDriverLabel(trip.driver),
    trip.tractor?.plate,
    trip.trailer?.plate,
    trip.product?.name,
    ...getTripProductLines(trip).map(getTripProductLineLabel),
    getTripBillingStatusLabel(trip.billingStatus),
    formatTripMoney(trip.freightRevenueCents),
    formatTripMoney(getTripTotalCostCents(trip)),
    trip.notes
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}
