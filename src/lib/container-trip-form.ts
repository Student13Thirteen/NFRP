import 'server-only';

import {
  ContainerTripExtraKind,
  ContainerTripExtraStatus,
  ContainerTripStatus,
  TripBillingStatus
} from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { formString, optionalFormString } from '@/lib/form';
import { getContainerTripClosureIssues } from '@/lib/container-trips';

const stopKinds = ['PICKUP', 'DELIVERY', 'TERMINAL', 'CUSTOMS', 'OTHER'] as const;

const containerTripSchema = z.object({
  tripDate: z.date(),
  status: z.nativeEnum(ContainerTripStatus),
  billingStatus: z.nativeEnum(TripBillingStatus),
  waybillNumber: z.string().max(80).nullable(),
  waybillDate: z.date().nullable(),
  customerCode: z.string().max(40).nullable(),
  customerName: z.string().max(180).nullable(),
  customerReference: z.string().max(180).nullable(),
  carrierName: z.string().max(180).nullable(),
  driverId: z.string().nullable(),
  tractorId: z.string().nullable(),
  trailerId: z.string().nullable(),
  loadingTerminalName: z.string().max(180).nullable(),
  deliveryTerminalName: z.string().max(180).nullable(),
  booking: z.string().max(100).nullable(),
  ship: z.string().max(180).nullable(),
  pickupCode: z.string().max(100).nullable(),
  deliveryCode: z.string().max(100).nullable(),
  shippingCompany: z.string().max(120).nullable(),
  forwarder: z.string().max(180).nullable(),
  plannedKm: z.number().int().min(0).max(9999999).nullable(),
  odometerStartKm: z.number().int().min(0).max(9999999).nullable(),
  odometerEndKm: z.number().int().min(0).max(9999999).nullable(),
  actualKm: z.number().int().min(0).max(9999999).nullable(),
  distanceSource: z.string().max(80).nullable(),
  freightRevenueCents: z.number().int().min(0).max(999999999).nullable(),
  carrierCostCents: z.number().int().min(0).max(999999999).nullable(),
  tollCostCents: z.number().int().min(0).max(999999999).nullable(),
  economicNotes: z.string().max(3000).nullable(),
  notes: z.string().max(5000).nullable(),
  containers: z.array(z.object({
    containerNumber: z.string().max(40).nullable(),
    containerType: z.string().max(40).nullable(),
    sealNumber: z.string().max(80).nullable(),
    notes: z.string().max(500).nullable()
  })).max(8),
  stops: z.array(z.object({
    kind: z.enum(stopKinds),
    name: z.string().min(1, 'Il nome della tappa e richiesto.').max(200),
    address: z.string().max(240).nullable(),
    postalCode: z.string().max(20).nullable(),
    city: z.string().max(120).nullable(),
    province: z.string().max(10).nullable(),
    plannedTime: z.string().max(20).nullable(),
    notes: z.string().max(1000).nullable()
  })).max(20)
});

function parseDate(value: string, label: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`${label} non valida. Usa giorno, mese e anno.`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) throw new Error(`${label} non valida.`);
  return date;
}

function parseOptionalDate(formData: FormData, key: string, label: string): Date | null {
  const value = optionalFormString(formData, key);
  return value ? parseDate(value, label) : null;
}

function parseOptionalInt(formData: FormData, key: string): number | null {
  const value = optionalFormString(formData, key);
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error('I chilometri devono essere numeri interi.');
  return parsed;
}

function parseMoney(formData: FormData, key: string, label: string): number | null {
  const value = optionalFormString(formData, key);
  if (value === null) return null;
  const normalized = value.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`${label}: importo non valido.`);
  return Math.round(Number(normalized) * 100);
}

function repeatedStrings(formData: FormData, key: string): (string | null)[] {
  return formData.getAll(key).map((value) => {
    const text = String(value || '').trim();
    return text || null;
  });
}

function parseContainers(formData: FormData) {
  const numbers = repeatedStrings(formData, 'containerNumber');
  const types = repeatedStrings(formData, 'containerType');
  const seals = repeatedStrings(formData, 'sealNumber');
  const notes = repeatedStrings(formData, 'containerNotes');
  const count = Math.max(numbers.length, types.length, seals.length, notes.length);
  return Array.from({ length: count }, (_, index) => ({
    containerNumber: numbers[index]?.toLocaleUpperCase('it-IT').replace(/\s+/g, '') || null,
    containerType: types[index]?.toLocaleUpperCase('it-IT').replace(/\s+/g, '') || null,
    sealNumber: seals[index] || null,
    notes: notes[index] || null
  })).filter((container) => Object.values(container).some(Boolean));
}

function parseStops(formData: FormData) {
  const kinds = repeatedStrings(formData, 'stopKind');
  const names = repeatedStrings(formData, 'stopName');
  const addresses = repeatedStrings(formData, 'stopAddress');
  const postalCodes = repeatedStrings(formData, 'stopPostalCode');
  const cities = repeatedStrings(formData, 'stopCity');
  const provinces = repeatedStrings(formData, 'stopProvince');
  const plannedTimes = repeatedStrings(formData, 'stopPlannedTime');
  const notes = repeatedStrings(formData, 'stopNotes');
  const count = Math.max(kinds.length, names.length, addresses.length, cities.length);
  return Array.from({ length: count }, (_, index) => ({
    kind: stopKinds.includes(kinds[index] as typeof stopKinds[number])
      ? kinds[index] as typeof stopKinds[number]
      : 'PICKUP' as const,
    name: names[index] || '',
    address: addresses[index] || null,
    postalCode: postalCodes[index] || null,
    city: cities[index] || null,
    province: provinces[index]?.toLocaleUpperCase('it-IT') || null,
    plannedTime: plannedTimes[index] || null,
    notes: notes[index] || null
  })).filter((stop) => stop.name || stop.address || stop.city);
}

async function assertReferences(input: z.infer<typeof containerTripSchema>) {
  const [driver, tractor, trailer] = await Promise.all([
    input.driverId ? prisma.driver.findUnique({ where: { id: input.driverId } }) : null,
    input.tractorId ? prisma.tractor.findUnique({ where: { id: input.tractorId } }) : null,
    input.trailerId ? prisma.trailer.findUnique({ where: { id: input.trailerId } }) : null
  ]);
  if (input.driverId && !driver) throw new Error('Autista non valido.');
  if (input.tractorId && !tractor) throw new Error('Trattore non valido.');
  if (input.trailerId && !trailer) throw new Error('Semirimorchio non valido.');
}

export async function parseContainerTripForm(formData: FormData) {
  const parsed = containerTripSchema.parse({
    tripDate: parseDate(formString(formData, 'tripDate'), 'Data viaggio'),
    status: formString(formData, 'status') || ContainerTripStatus.PLANNED,
    billingStatus: formString(formData, 'billingStatus') || TripBillingStatus.NOT_READY,
    waybillNumber: optionalFormString(formData, 'waybillNumber'),
    waybillDate: parseOptionalDate(formData, 'waybillDate', 'Data lettera di vettura'),
    customerCode: optionalFormString(formData, 'customerCode'),
    customerName: optionalFormString(formData, 'customerName'),
    customerReference: optionalFormString(formData, 'customerReference'),
    carrierName: optionalFormString(formData, 'carrierName'),
    driverId: optionalFormString(formData, 'driverId'),
    tractorId: optionalFormString(formData, 'tractorId'),
    trailerId: optionalFormString(formData, 'trailerId'),
    loadingTerminalName: optionalFormString(formData, 'loadingTerminalName'),
    deliveryTerminalName: optionalFormString(formData, 'deliveryTerminalName'),
    booking: optionalFormString(formData, 'booking'),
    ship: optionalFormString(formData, 'ship'),
    pickupCode: optionalFormString(formData, 'pickupCode'),
    deliveryCode: optionalFormString(formData, 'deliveryCode'),
    shippingCompany: optionalFormString(formData, 'shippingCompany'),
    forwarder: optionalFormString(formData, 'forwarder'),
    plannedKm: parseOptionalInt(formData, 'plannedKm'),
    odometerStartKm: parseOptionalInt(formData, 'odometerStartKm'),
    odometerEndKm: parseOptionalInt(formData, 'odometerEndKm'),
    actualKm: parseOptionalInt(formData, 'actualKm'),
    distanceSource: optionalFormString(formData, 'distanceSource'),
    freightRevenueCents: parseMoney(formData, 'freightRevenue', 'Ricavo viaggio'),
    carrierCostCents: parseMoney(formData, 'carrierCost', 'Costo vettore'),
    tollCostCents: parseMoney(formData, 'tollCost', 'Pedaggi'),
    economicNotes: optionalFormString(formData, 'economicNotes'),
    notes: optionalFormString(formData, 'notes'),
    containers: parseContainers(formData),
    stops: parseStops(formData)
  });

  if (!parsed.customerCode && !parsed.customerName) throw new Error('Inserisci almeno codice o nome del committente.');
  if (parsed.odometerStartKm !== null && parsed.odometerEndKm !== null) {
    if (parsed.odometerEndKm < parsed.odometerStartKm) throw new Error('Il contachilometri finale non puo essere inferiore a quello iniziale.');
    parsed.actualKm = parsed.odometerEndKm - parsed.odometerStartKm;
    parsed.distanceSource ||= 'CONTACHILOMETRI';
  }
  await assertReferences(parsed);
  return parsed;
}

async function ensureCustomer(input: z.infer<typeof containerTripSchema>) {
  if (input.customerCode) {
    return prisma.containerCustomer.upsert({
      where: { code: input.customerCode },
      create: { code: input.customerCode, name: input.customerName || `Committente ${input.customerCode}` },
      update: input.customerName ? { name: input.customerName } : {}
    });
  }
  if (!input.customerName) return null;
  const existing = await prisma.containerCustomer.findFirst({
    where: { name: { equals: input.customerName, mode: 'insensitive' } }
  });
  return existing || prisma.containerCustomer.create({ data: { name: input.customerName } });
}

function baseWriteData(input: z.infer<typeof containerTripSchema>, customerId: string | null) {
  const { containers, stops, ...data } = input;
  return {
    data: { ...data, customerId },
    containers,
    stops
  };
}

export async function createContainerTripFromForm(formData: FormData) {
  const parsed = await parseContainerTripForm(formData);
  const customer = await ensureCustomer(parsed);
  const write = baseWriteData(parsed, customer?.id || null);
  return prisma.containerTrip.create({
    data: {
      ...write.data,
      sourceType: 'MANUAL',
      containers: { create: write.containers.map((container, position) => ({ ...container, position })) },
      stops: { create: write.stops.map((stop, position) => ({ ...stop, position })) }
    }
  });
}

export async function updateContainerTripFromForm(id: string, formData: FormData) {
  const parsed = await parseContainerTripForm(formData);
  const current = await prisma.containerTrip.findUnique({
    where: { id },
    include: { containers: true, stops: true, extras: true }
  });
  if (!current) throw new Error('Trasporto container non trovato.');
  if (parsed.status === ContainerTripStatus.READY_TO_BILL) {
    const closureIssues = getContainerTripClosureIssues({
      ...parsed,
      extras: current.extras
    });
    if (closureIssues.length > 0) {
      throw new Error(`Prima di chiudere il viaggio completa: ${closureIssues.join(', ')}.`);
    }
  }
  const customer = await ensureCustomer(parsed);
  const write = baseWriteData(parsed, customer?.id || null);
  return prisma.$transaction(async (tx) => {
    await tx.containerTripContainer.deleteMany({ where: { containerTripId: id } });
    await tx.containerTripStop.deleteMany({ where: { containerTripId: id } });
    return tx.containerTrip.update({
      where: { id },
      data: {
        ...write.data,
        reviewedAt: parsed.status === ContainerTripStatus.READY_TO_BILL ? new Date() : current.reviewedAt,
        containers: { create: write.containers.map((container, position) => ({ ...container, position })) },
        stops: { create: write.stops.map((stop, position) => ({ ...stop, position })) }
      }
    });
  });
}

export async function closeContainerTrip(id: string) {
  const trip = await prisma.containerTrip.findUnique({
    where: { id },
    include: { containers: true, stops: true, extras: true }
  });
  if (!trip) throw new Error('Trasporto container non trovato.');
  if (trip.status === ContainerTripStatus.CANCELLED) throw new Error('Un viaggio annullato non puo essere chiuso.');
  if (trip.status === ContainerTripStatus.INVOICED) throw new Error('Il viaggio risulta gia fatturato.');
  const closureIssues = getContainerTripClosureIssues(trip);
  if (closureIssues.length > 0) {
    throw new Error(`Prima di chiudere il viaggio completa: ${closureIssues.join(', ')}.`);
  }
  return prisma.containerTrip.update({
    where: { id },
    data: {
      status: ContainerTripStatus.READY_TO_BILL,
      billingStatus: TripBillingStatus.TO_BILL,
      reviewedAt: new Date()
    }
  });
}

export async function reopenContainerTrip(id: string) {
  const trip = await prisma.containerTrip.findUnique({ where: { id } });
  if (!trip) throw new Error('Trasporto container non trovato.');
  if (trip.status !== ContainerTripStatus.READY_TO_BILL) {
    throw new Error('Si possono riaprire solo i viaggi chiusi e non ancora fatturati.');
  }
  return prisma.containerTrip.update({
    where: { id },
    data: {
      status: ContainerTripStatus.UNDER_REVIEW,
      billingStatus: TripBillingStatus.NOT_READY,
      reviewedAt: null
    }
  });
}

export function getContainerTripActionError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message || 'Dati non validi.';
  if (error instanceof Error) return error.message.slice(0, 300);
  return 'Operazione non riuscita.';
}

function parseExtraMoney(formData: FormData, key: string, label: string) {
  return parseMoney(formData, key, label);
}

export async function createContainerExtraFromForm(containerTripId: string, formData: FormData) {
  const tariffId = optionalFormString(formData, 'tariffId');
  const tariff = tariffId ? await prisma.containerExtraTariff.findUnique({ where: { id: tariffId } }) : null;
  const kindValue = formString(formData, 'kind') || tariff?.kind || ContainerTripExtraKind.OTHER;
  const kind = Object.values(ContainerTripExtraKind).includes(kindValue as ContainerTripExtraKind)
    ? kindValue as ContainerTripExtraKind
    : ContainerTripExtraKind.OTHER;
  const description = formString(formData, 'description') || tariff?.name || '';
  if (!description) throw new Error('Descrizione extra richiesta.');
  const proposedAmountCents = parseExtraMoney(formData, 'proposedAmount', 'Importo proposto') ?? tariff?.defaultUnitPriceCents ?? null;
  return prisma.containerTripExtra.create({
    data: {
      containerTripId,
      tariffId: tariff?.id,
      kind,
      description,
      unitLabel: tariff?.unitLabel || optionalFormString(formData, 'unitLabel') || 'evento',
      proposedAmountCents,
      status: ContainerTripExtraStatus.PROPOSED,
      source: tariff ? 'TARIFFARIO' : 'MANUALE',
      revisions: {
        create: {
          proposedAmountCents,
          status: ContainerTripExtraStatus.PROPOSED,
          reason: optionalFormString(formData, 'reason')
        }
      }
    }
  });
}

export async function updateContainerExtraFromForm(id: string, formData: FormData) {
  const current = await prisma.containerTripExtra.findUnique({ where: { id } });
  if (!current) throw new Error('Extra non trovato.');
  const statusValue = formString(formData, 'status');
  const status = Object.values(ContainerTripExtraStatus).includes(statusValue as ContainerTripExtraStatus)
    ? statusValue as ContainerTripExtraStatus
    : current.status;
  const proposedAmountCents = parseExtraMoney(formData, 'proposedAmount', 'Importo proposto');
  const negotiatedAmountCents = parseExtraMoney(formData, 'negotiatedAmount', 'Importo negoziato');
  const approvedAmountCents = parseExtraMoney(formData, 'approvedAmount', 'Importo approvato');
  const reason = optionalFormString(formData, 'reason');
  if (status !== ContainerTripExtraStatus.PROPOSED && !reason) {
    throw new Error('Indica il motivo della negoziazione o decisione.');
  }
  return prisma.containerTripExtra.update({
    where: { id },
    data: {
      status,
      proposedAmountCents,
      negotiatedAmountCents,
      approvedAmountCents,
      reason,
      revisions: {
        create: { status, proposedAmountCents, negotiatedAmountCents, approvedAmountCents, reason }
      }
    }
  });
}

export async function createContainerTariffFromForm(formData: FormData) {
  const name = formString(formData, 'name');
  if (!name) throw new Error('Nome tariffa richiesto.');
  const kindValue = formString(formData, 'kind');
  const kind = Object.values(ContainerTripExtraKind).includes(kindValue as ContainerTripExtraKind)
    ? kindValue as ContainerTripExtraKind
    : ContainerTripExtraKind.OTHER;
  const defaultUnitPriceCents = parseMoney(formData, 'defaultUnitPrice', 'Prezzo standard');
  if (defaultUnitPriceCents === null) throw new Error('Prezzo standard richiesto.');
  return prisma.containerExtraTariff.create({
    data: {
      name,
      kind,
      unitLabel: optionalFormString(formData, 'unitLabel') || 'evento',
      defaultUnitPriceCents,
      notes: optionalFormString(formData, 'notes')
    }
  });
}
