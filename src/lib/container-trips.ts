import {
  ContainerTripExtraKind,
  ContainerTripExtraStatus,
  ContainerTripStatus,
  Prisma,
  TripBillingStatus
} from '@prisma/client';

export const containerTripInclude = Prisma.validator<Prisma.ContainerTripInclude>()({
  customer: true,
  driver: true,
  tractor: true,
  trailer: true,
  externalTractorOwner: { select: { id: true, name: true } },
  externalTrailerOwner: { select: { id: true, name: true } },
  containers: { orderBy: { position: 'asc' } },
  stops: { orderBy: { position: 'asc' } },
  extras: {
    include: {
      tariff: true,
      revisions: { orderBy: { createdAt: 'desc' } }
    },
    orderBy: { createdAt: 'asc' }
  },
  importRows: { include: { batch: true }, orderBy: { createdAt: 'asc' } }
});

export type ContainerTripWithRelations = Prisma.ContainerTripGetPayload<{ include: typeof containerTripInclude }>;

export function getContainerTripStatusLabel(status: ContainerTripStatus): string {
  return {
    PLANNED: 'Pianificato',
    IN_PROGRESS: 'In corso',
    AWAITING_DRIVER_DATA: 'In attesa dati autista',
    UNDER_REVIEW: 'Da verificare',
    READY_TO_BILL: 'Chiuso · da fatturare',
    INVOICED: 'Fatturato',
    CANCELLED: 'Annullato'
  }[status];
}

export function getContainerTripExtraKindLabel(kind: ContainerTripExtraKind): string {
  return {
    CUSTOMS: 'Dogana',
    WAITING: 'Attesa',
    STOP: 'Sosta',
    DETOUR: 'Deviazione',
    HANDLING: 'Movimentazione',
    OTHER: 'Altro'
  }[kind];
}

export function getContainerTripExtraStatusLabel(status: ContainerTripExtraStatus): string {
  return {
    PROPOSED: 'Proposto',
    NEGOTIATED: 'Negoziato',
    APPROVED: 'Approvato',
    REJECTED: 'Respinto'
  }[status];
}

export function getTripBillingStatusLabel(status: TripBillingStatus): string {
  return {
    NOT_READY: 'Non pronto',
    TO_BILL: 'Da fatturare',
    INVOICED: 'Fatturato',
    PAID: 'Pagato',
    NOT_BILLABLE: 'Non fatturabile'
  }[status];
}

export function formatContainerMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '-';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function getContainerTripActualKm(trip: {
  actualKm: number | null;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
}): number | null {
  if (trip.odometerStartKm !== null && trip.odometerEndKm !== null) {
    return trip.odometerEndKm - trip.odometerStartKm;
  }
  return trip.actualKm;
}

type ContainerTripClosureData = {
  actualKm: number | null;
  customerCode: string | null;
  customerName: string | null;
  freightRevenueCents: number | null;
  odometerEndKm: number | null;
  odometerStartKm: number | null;
  containers: Array<{
    containerNumber: string | null;
    containerType: string | null;
  }>;
  stops: Array<unknown>;
  extras: Array<{
    status: ContainerTripExtraStatus;
  }>;
};

export function isContainerTripClosedForCosts(status: ContainerTripStatus): boolean {
  return status === ContainerTripStatus.READY_TO_BILL || status === ContainerTripStatus.INVOICED;
}

export function getContainerTripClosureIssues(trip: ContainerTripClosureData): string[] {
  const issues: string[] = [];
  if (!trip.customerCode && !trip.customerName) issues.push('committente');
  if (!trip.containers.some((container) => container.containerNumber || container.containerType)) {
    issues.push('almeno un container');
  }
  if (trip.stops.length === 0) issues.push('almeno una tappa');
  const actualKm = getContainerTripActualKm(trip);
  if (actualKm === null || actualKm <= 0) issues.push('km finali');
  if (trip.freightRevenueCents === null || trip.freightRevenueCents <= 0) issues.push('ricavo base');
  if (trip.extras.some((extra) =>
    extra.status !== ContainerTripExtraStatus.APPROVED &&
    extra.status !== ContainerTripExtraStatus.REJECTED
  )) {
    issues.push('decisione su tutti gli extra');
  }
  return issues;
}

export function getContainerTripApprovedExtrasCents(
  trip: Pick<ContainerTripWithRelations, 'extras'>
): number {
  return trip.extras.reduce((total, extra) => total + (
    extra.status === ContainerTripExtraStatus.APPROVED
      ? extra.approvedAmountCents ?? extra.negotiatedAmountCents ?? extra.proposedAmountCents ?? 0
      : 0
  ), 0);
}

export function getContainerTripMarginCents(trip: ContainerTripWithRelations): number | null {
  if (trip.freightRevenueCents === null) return null;
  const costs = (trip.carrierCostCents || 0) + (trip.tollCostCents || 0) + (trip.additionalCostCents || 0);
  return trip.freightRevenueCents + getContainerTripApprovedExtrasCents(trip) - costs;
}

export function getContainerTripCustomerLabel(trip: {
  customerName: string | null;
  customerCode: string | null;
  customer?: { name: string; code: string | null } | null;
}): string {
  const name = trip.customer?.name || trip.customerName;
  const code = trip.customer?.code || trip.customerCode;
  if (name && code && name !== `Committente ${code}`) return `${name} (${code})`;
  return name || (code ? `Committente ${code}` : '-');
}

export function getContainerSummary(trip: Pick<ContainerTripWithRelations, 'containers'>): string {
  const labels = trip.containers.map((container) => {
    const number = container.containerNumber || 'numero da completare';
    return [number, container.containerType, container.specification?.replace('_', ' e ')].filter(Boolean).join(' · ');
  });
  return labels.join(' / ') || '-';
}

export type ContainerTripSuggestionSources = {
  trips: Array<{
    loadingTerminalName: string | null;
    deliveryTerminalName: string | null;
    returnBaseName: string | null;
    carrierName: string | null;
    stops: Array<{ name: string }>;
  }>;
  // Le bolle gia acquisite sono l'unica fonte reale di basi, terminal e vettori finche
  // non esistono abbastanza viaggi salvati: senza di loro le tendine guidate del foglio
  // operativo partirebbero vuote e l'operatore dovrebbe scrivere tutto a mano.
  importRows?: Array<{
    loadingBaseName: string | null;
    loadingTerminalName: string | null;
    deliveryTerminalName: string | null;
    deliveryName: string | null;
    carrierName: string | null;
  }>;
};

export function buildContainerTripFormSuggestions(
  sources: ContainerTripSuggestionSources
): { locations: string[]; carriers: string[] } {
  const locations = new Set<string>();
  const carriers = new Set<string>(['NFRP SRL']);

  function addLocation(value: string | null) {
    const cleaned = value?.replace(/\s+/g, ' ').trim();
    // `VEDI DELIVERY` e un rimando stampato sulla bolla, non un luogo reale.
    if (!cleaned || cleaned.toLocaleUpperCase('it-IT') === 'VEDI DELIVERY') return;
    locations.add(cleaned);
  }

  function addCarrier(value: string | null) {
    const cleaned = value?.replace(/\s+/g, ' ').trim();
    if (cleaned) carriers.add(cleaned);
  }

  for (const trip of sources.trips) {
    addLocation(trip.loadingTerminalName);
    addLocation(trip.deliveryTerminalName);
    addLocation(trip.returnBaseName);
    for (const stop of trip.stops) addLocation(stop.name);
    addCarrier(trip.carrierName);
  }

  for (const row of sources.importRows || []) {
    addLocation(row.loadingBaseName);
    addLocation(row.loadingTerminalName);
    addLocation(row.deliveryTerminalName);
    addLocation(row.deliveryName);
    addCarrier(row.carrierName);
  }

  return {
    locations: Array.from(locations).sort((left, right) => left.localeCompare(right, 'it')),
    carriers: Array.from(carriers).sort((left, right) => left.localeCompare(right, 'it'))
  };
}

export function getContainerStopsSummary(trip: Pick<ContainerTripWithRelations, 'stops'>): string {
  return trip.stops.map((stop) => stop.name).join(' → ') || '-';
}

export function containerTripMatchesSearch(trip: ContainerTripWithRelations, query: string | undefined): boolean {
  const normalized = (query || '').trim().toLocaleLowerCase('it-IT');
  if (!normalized) return true;
  return [
    trip.tripNumber,
    trip.waybillNumber,
    trip.customerCode,
    trip.customerName,
    trip.customer?.name,
    trip.driver?.firstName,
    trip.driver?.lastName,
    trip.tractor?.plate,
    trip.trailer?.plate,
    trip.externalTractorPlate,
    trip.externalTrailerPlate,
    trip.externalTractorOwner?.name,
    trip.externalTrailerOwner?.name,
    trip.booking,
    trip.ship,
    trip.shippingCompany,
    trip.forwarder,
    ...trip.containers.flatMap((container) => [container.containerNumber, container.containerType]),
    ...trip.stops.flatMap((stop) => [stop.name, stop.city, stop.province])
  ].some((value) => String(value || '').toLocaleLowerCase('it-IT').includes(normalized));
}

/**
 * Etichetta del mezzo usato nel viaggio: il mezzo di flotta quando c'e,
 * altrimenti la targa non aziendale con il suo proprietario.
 */
export function getContainerTripVehicleLabel(input: {
  vehicle: { plate: string; brand: string | null; model: string | null } | null;
  externalPlate: string | null;
  externalOwnerName: string | null;
}): string {
  if (input.vehicle) {
    const details = [input.vehicle.brand, input.vehicle.model].filter(Boolean).join(' ');
    return details ? `${input.vehicle.plate} - ${details}` : input.vehicle.plate;
  }
  if (!input.externalPlate) return '-';
  return input.externalOwnerName
    ? `${input.externalPlate} (mezzo di ${input.externalOwnerName})`
    : `${input.externalPlate} (mezzo non nostro)`;
}
