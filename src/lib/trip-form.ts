import 'server-only';

import { TripBillingStatus, TripStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { formBoolean, formString, optionalFormString } from '@/lib/form';
import { getNextTripNumber } from '@/lib/trip-numbering';

const tripSchema = z.object({
  tripDate: z.date(),
  status: z.nativeEnum(TripStatus),
  billingStatus: z.nativeEnum(TripBillingStatus),
  sequenceNumber: z.number().int().min(1).max(9999).nullable(),
  expectedKm: z.number().int().min(0).max(99999).nullable(),
  odometerStartKm: z.number().int().min(0).max(9999999).nullable(),
  odometerEndKm: z.number().int().min(0).max(9999999).nullable(),
  loadingBaseId: z.string().min(1, 'Base di carico richiesta.'),
  driverId: z.string().min(1).nullable(),
  tractorId: z.string().min(1).nullable(),
  trailerId: z.string().min(1).nullable(),
  productLines: z
    .array(
      z.object({
        salesPointId: z.string().min(1, 'Destinazione richiesta.'),
        productId: z.string().min(1, 'Prodotto richiesto.'),
        liters: z.number().int().min(1, 'Quantita richiesta.').max(999999)
      })
    )
    .min(1, 'Inserisci almeno un prodotto.'),
  customerName: z.string().max(180).nullable(),
  customerReference: z.string().max(120).nullable(),
  carrierName: z.string().max(180).nullable(),
  transportDocumentNumber: z.string().max(80).nullable(),
  transportDocumentDate: z.date().nullable(),
  invoiceNumber: z.string().max(80).nullable(),
  invoiceDate: z.date().nullable(),
  freightRevenueCents: z.number().int().min(0).max(999999999).nullable(),
  carrierCostCents: z.number().int().min(0).max(999999999).nullable(),
  tollCostCents: z.number().int().min(0).max(999999999).nullable(),
  extraCostCents: z.number().int().min(0).max(999999999).nullable(),
  economicNotes: z.string().max(2000).nullable(),
  notes: z.string().max(4000).nullable()
});

const loadingBaseSchema = z.object({
  name: z.string().min(1, 'Nome base richiesto.').max(160),
  address: z.string().max(240).nullable(),
  postalCode: z.string().max(20).nullable(),
  city: z.string().max(120).nullable(),
  province: z.string().max(80).nullable(),
  country: z.string().max(80).nullable(),
  notes: z.string().max(2000).nullable()
});

const loadingBaseUpdateSchema = loadingBaseSchema.extend({
  active: z.boolean()
});

const salesPointSchema = z.object({
  name: z.string().min(1, 'Nome punto vendita richiesto.').max(180),
  plantCode: z.string().max(40).nullable(),
  address: z.string().max(240).nullable(),
  postalCode: z.string().max(20).nullable(),
  city: z.string().max(120).nullable(),
  province: z.string().max(80).nullable(),
  country: z.string().max(80).nullable(),
  notes: z.string().max(2000).nullable()
});

const salesPointUpdateSchema = salesPointSchema.extend({
  active: z.boolean()
});

const tripProductSchema = z.object({
  name: z.string().min(1, 'Nome prodotto richiesto.').max(120),
  unitLabel: z.string().min(1, 'Unita richiesta.').max(30),
  notes: z.string().max(2000).nullable()
});

const tripProductUpdateSchema = tripProductSchema.extend({
  active: z.boolean()
});

function parseDate(value: string): Date {
  const normalizedValue = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizedValue);
  const italianMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalizedValue);
  const parts = isoMatch
    ? { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) }
    : italianMatch
      ? { year: Number(italianMatch[3]), month: Number(italianMatch[2]), day: Number(italianMatch[1]) }
      : null;

  if (!parts) {
    throw new Error('Data viaggio non valida. Usa il formato gg/mm/aaaa.');
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    throw new Error('Data viaggio non valida. Usa il formato gg/mm/aaaa.');
  }

  return date;
}

function parseOptionalDate(formData: FormData, key: string, label: string): Date | null {
  const value = optionalFormString(formData, key);
  if (value === null) return null;
  try {
    return parseDate(value);
  } catch {
    throw new Error(`${label} non valida. Usa il formato gg/mm/aaaa.`);
  }
}

function optionalId(formData: FormData, key: string): string | null {
  return optionalFormString(formData, key);
}

function parseOptionalInt(formData: FormData, key: string): number | null {
  const value = optionalFormString(formData, key);
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error('Inserisci solo numeri interi.');
  return parsed;
}

function parseMoneyCents(formData: FormData, key: string, label: string): number | null {
  const value = optionalFormString(formData, key);
  if (value === null) return null;
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error(`${label}: importo non valido.`);
  return Math.round(Number(normalized) * 100);
}

function parseRequiredLineInt(value: FormDataEntryValue | undefined): number {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error('Inserisci solo numeri interi nelle quantita.');
  return parsed;
}

function parseTripProductLines(formData: FormData) {
  const salesPointIds = formData.getAll('salesPointId');
  const productIds = formData.getAll('productId');
  const litersValues = formData.getAll('liters');
  const rowCount = Math.max(salesPointIds.length, productIds.length, litersValues.length);

  return Array.from({ length: rowCount }, (_, index) => ({
    salesPointId: typeof salesPointIds[index] === 'string' ? salesPointIds[index].trim() : '',
    productId: typeof productIds[index] === 'string' ? productIds[index].trim() : '',
    liters: parseRequiredLineInt(litersValues[index])
  })).filter((line) => line.salesPointId || line.productId || line.liters > 0);
}

function normalizePlantCode(value: string | null): string | null {
  return value ? value.toUpperCase().replace(/\s+/g, '') : null;
}

function getTripFormErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message || 'Dati non validi.';
  }

  if (error instanceof Error && error.message) {
    return error.message.slice(0, 300);
  }

  return 'Operazione non riuscita. Riprova.';
}

export function getTripActionErrorMessage(error: unknown): string {
  const message = getTripFormErrorMessage(error);
  if (message.includes('Unique constraint failed')) return 'Esiste gia un record con questi dati.';
  return message;
}

async function assertTripReferences(input: z.infer<typeof tripSchema>) {
  const salesPointIds = Array.from(new Set(input.productLines.map((line) => line.salesPointId)));
  const productIds = Array.from(new Set(input.productLines.map((line) => line.productId)));
  const [loadingBase, salesPoints, driver, tractor, trailer, products] = await Promise.all([
    prisma.loadingBase.findUnique({ where: { id: input.loadingBaseId } }),
    prisma.salesPoint.findMany({ where: { id: { in: salesPointIds } }, select: { id: true } }),
    input.driverId ? prisma.driver.findUnique({ where: { id: input.driverId } }) : Promise.resolve(null),
    input.tractorId ? prisma.tractor.findUnique({ where: { id: input.tractorId } }) : Promise.resolve(null),
    input.trailerId ? prisma.trailer.findUnique({ where: { id: input.trailerId } }) : Promise.resolve(null),
    prisma.tripProduct.findMany({ where: { id: { in: productIds } }, select: { id: true } })
  ]);

  if (!loadingBase) throw new Error('Base di carico non valida.');
  if (salesPoints.length !== salesPointIds.length) throw new Error('Destinazione non valida.');
  if (input.driverId && !driver) throw new Error('Autista non valido.');
  if (input.tractorId && !tractor) throw new Error('Targa trattore non valida.');
  if (input.trailerId && !trailer) throw new Error('Targa rimorchio non valida.');
  if (products.length !== productIds.length) throw new Error('Prodotto non valido.');
}

export async function parseTripForm(formData: FormData) {
  const parsed = tripSchema.parse({
    tripDate: parseDate(formString(formData, 'tripDate')),
    status: formString(formData, 'status') || TripStatus.PLANNED,
    billingStatus: formString(formData, 'billingStatus') || TripBillingStatus.NOT_READY,
    sequenceNumber: parseOptionalInt(formData, 'sequenceNumber'),
    expectedKm: parseOptionalInt(formData, 'expectedKm'),
    odometerStartKm: parseOptionalInt(formData, 'odometerStartKm'),
    odometerEndKm: parseOptionalInt(formData, 'odometerEndKm'),
    loadingBaseId: formString(formData, 'loadingBaseId'),
    driverId: optionalId(formData, 'driverId'),
    tractorId: optionalId(formData, 'tractorId'),
    trailerId: optionalId(formData, 'trailerId'),
    productLines: parseTripProductLines(formData),
    customerName: optionalFormString(formData, 'customerName'),
    customerReference: optionalFormString(formData, 'customerReference'),
    carrierName: optionalFormString(formData, 'carrierName'),
    transportDocumentNumber: optionalFormString(formData, 'transportDocumentNumber'),
    transportDocumentDate: parseOptionalDate(formData, 'transportDocumentDate', 'Data DDT'),
    invoiceNumber: optionalFormString(formData, 'invoiceNumber'),
    invoiceDate: parseOptionalDate(formData, 'invoiceDate', 'Data fattura'),
    freightRevenueCents: parseMoneyCents(formData, 'freightRevenue', 'Ricavo viaggio'),
    carrierCostCents: parseMoneyCents(formData, 'carrierCost', 'Costo trasportatore'),
    tollCostCents: parseMoneyCents(formData, 'tollCost', 'Pedaggi imputati'),
    extraCostCents: parseMoneyCents(formData, 'extraCost', 'Costi extra'),
    economicNotes: optionalFormString(formData, 'economicNotes'),
    notes: optionalFormString(formData, 'notes')
  });

  if (
    parsed.odometerStartKm !== null &&
    parsed.odometerEndKm !== null &&
    parsed.odometerEndKm < parsed.odometerStartKm
  ) {
    throw new Error('Km arrivo non puo essere inferiore ai km partenza.');
  }

  await assertTripReferences(parsed);
  return parsed;
}

function buildTripProductLineCreates(productLines: z.infer<typeof tripSchema>['productLines']) {
  return productLines.map((line, index) => ({
    salesPointId: line.salesPointId,
    productId: line.productId,
    liters: line.liters,
    position: index
  }));
}

function buildTripWriteData(parsed: z.infer<typeof tripSchema>) {
  const { productLines, ...tripData } = parsed;
  const firstLine = productLines[0];

  return {
    ...tripData,
    salesPointId: firstLine.salesPointId,
    productId: firstLine.productId,
    liters: firstLine.liters,
    gasolineLiters: 0,
    dieselLiters: 0,
    gplLiters: 0,
    jetLiters: 0
  };
}

export async function createTripFromForm(formData: FormData) {
  const parsed = await parseTripForm(formData);
  return prisma.$transaction(async (tx) => {
    const tripNumber = await getNextTripNumber(tx);
    return tx.trip.create({
      data: {
        ...buildTripWriteData(parsed),
        tripNumber,
        productLines: {
          create: buildTripProductLineCreates(parsed.productLines)
        }
      }
    });
  });
}

export async function updateTripFromForm(id: string, formData: FormData) {
  const currentTrip = await prisma.trip.findUnique({ where: { id } });
  if (!currentTrip) throw new Error('Viaggio non trovato.');

  const parsed = await parseTripForm(formData);
  return prisma.$transaction(async (tx) => {
    await tx.tripProductLine.deleteMany({ where: { tripId: id } });
    return tx.trip.update({
      where: { id },
      data: {
        ...buildTripWriteData(parsed),
        productLines: {
          create: buildTripProductLineCreates(parsed.productLines)
        }
      }
    });
  });
}

export function parseLoadingBaseForm(formData: FormData) {
  return loadingBaseSchema.parse({
    name: formString(formData, 'name'),
    address: optionalFormString(formData, 'address'),
    postalCode: optionalFormString(formData, 'postalCode'),
    city: optionalFormString(formData, 'city'),
    province: optionalFormString(formData, 'province'),
    country: optionalFormString(formData, 'country'),
    notes: optionalFormString(formData, 'notes')
  });
}

export function parseLoadingBaseUpdateForm(formData: FormData) {
  return loadingBaseUpdateSchema.parse({
    ...parseLoadingBaseForm(formData),
    active: formBoolean(formData, 'active')
  });
}

export function parseSalesPointForm(formData: FormData) {
  return salesPointSchema.parse({
    name: formString(formData, 'name'),
    plantCode: normalizePlantCode(optionalFormString(formData, 'plantCode')),
    address: optionalFormString(formData, 'address'),
    postalCode: optionalFormString(formData, 'postalCode'),
    city: optionalFormString(formData, 'city'),
    province: optionalFormString(formData, 'province'),
    country: optionalFormString(formData, 'country'),
    notes: optionalFormString(formData, 'notes')
  });
}

export function parseSalesPointUpdateForm(formData: FormData) {
  return salesPointUpdateSchema.parse({
    ...parseSalesPointForm(formData),
    active: formBoolean(formData, 'active')
  });
}

export function parseTripProductForm(formData: FormData) {
  return tripProductSchema.parse({
    name: formString(formData, 'name'),
    unitLabel: optionalFormString(formData, 'unitLabel') || 'L',
    notes: optionalFormString(formData, 'notes')
  });
}

export function parseTripProductUpdateForm(formData: FormData) {
  return tripProductUpdateSchema.parse({
    ...parseTripProductForm(formData),
    active: formBoolean(formData, 'active')
  });
}
