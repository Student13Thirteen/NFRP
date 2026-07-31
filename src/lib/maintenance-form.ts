import 'server-only';

import { MaintenanceStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { emptyStoredPdf, removeStoredPdf, storePdfFile, type NullableStoredPdf, type StoredPdf } from '@/lib/files';
import { formBoolean, formString, optionalFormString } from '@/lib/form';
import { formatDate } from '@/lib/dates';
import { parseMaintenanceVehicleKey } from '@/lib/maintenance';

const maintenanceSchema = z.object({
  title: z.string().min(1, 'Titolo richiesto.').max(180),
  status: z.nativeEnum(MaintenanceStatus),
  categoryId: z.string().min(1, 'Categoria manutenzione richiesta.'),
  maintenanceDate: z.date(),
  documentDate: z.date().nullable(),
  supplierId: z.string().min(1).nullable(),
  documentNumber: z.string().max(80).nullable(),
  driverId: z.string().min(1).nullable(),
  tractorId: z.string().min(1).nullable(),
  trailerId: z.string().min(1).nullable(),
  odometerKm: z.number().int().min(0).max(9999999).nullable(),
  amountCents: z.number().int().min(0).max(999999999).nullable(),
  description: z.string().min(1, 'Descrizione intervento richiesta.').max(8000),
  notes: z.string().max(4000).nullable()
});

const maintenanceCategorySchema = z.object({
  name: z.string().min(1, 'Nome categoria richiesto.').max(120),
  notes: z.string().max(2000).nullable()
});

const maintenanceCategoryUpdateSchema = maintenanceCategorySchema.extend({
  active: z.boolean()
});

const maintenanceSupplierSchema = z.object({
  name: z.string().min(1, 'Nome fornitore richiesto.').max(180),
  phone: z.string().max(80).nullable(),
  email: z.string().max(160).nullable(),
  address: z.string().max(240).nullable(),
  postalCode: z.string().max(20).nullable(),
  city: z.string().max(120).nullable(),
  province: z.string().max(80).nullable(),
  country: z.string().max(80).nullable(),
  notes: z.string().max(2000).nullable()
});

const maintenanceSupplierUpdateSchema = maintenanceSupplierSchema.extend({
  active: z.boolean()
});

function parseDate(value: string, required: boolean, label: string): Date | null {
  if (!value) {
    if (required) throw new Error(`${label} obbligatoria.`);
    return null;
  }

  const normalizedValue = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizedValue);
  const italianMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalizedValue);
  const parts = isoMatch
    ? { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) }
    : italianMatch
      ? { year: Number(italianMatch[3]), month: Number(italianMatch[2]), day: Number(italianMatch[1]) }
      : null;

  if (!parts) {
    throw new Error(`${label} non valida. Usa il formato gg/mm/aaaa.`);
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    throw new Error(`${label} non valida. Usa il formato gg/mm/aaaa.`);
  }

  return date;
}

function parseOptionalInt(formData: FormData, key: string, label: string): number | null {
  const value = optionalFormString(formData, key);
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label}: inserisci solo numeri interi.`);
  return parsed;
}

function parseAmountCents(formData: FormData): number | null {
  const value = optionalFormString(formData, 'amount');
  if (value === null) return null;
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error('Importo non valido.');
  return Math.round(Number(normalized) * 100);
}

function getOptionalPdf(formData: FormData): File | null {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size <= 0 || !file.name) return null;
  return file;
}

async function storeOptionalPdf(formData: FormData): Promise<NullableStoredPdf> {
  const file = getOptionalPdf(formData);
  if (!file) return emptyStoredPdf();
  return storePdfFile(file);
}

export function getMaintenanceActionErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message || 'Dati non validi.';
  }

  if (error instanceof Error && error.message) {
    if (error.message.includes('Unique constraint failed')) return 'Esiste gia un record con questo nome.';
    if (error.message.includes('Foreign key constraint')) {
      return 'Non posso eliminare: ci sono record collegati. Disattivalo oppure sposta/elimina prima i record collegati.';
    }
    return error.message.slice(0, 300);
  }

  return 'Operazione non riuscita. Riprova.';
}

async function buildVehicleRelation(vehicleKeyValue: string | null) {
  const vehicleKey = parseMaintenanceVehicleKey(vehicleKeyValue);
  if (!vehicleKey) return { tractorId: null, trailerId: null, vehicleLabel: null };

  if (vehicleKey.type === 'TRACTOR') {
    const tractor = await prisma.tractor.findUnique({ where: { id: vehicleKey.id } });
    if (!tractor) throw new Error('Targa trattore non valida.');
    return { tractorId: tractor.id, trailerId: null, vehicleLabel: `Trattore ${tractor.plate}` };
  }

  const trailer = await prisma.trailer.findUnique({ where: { id: vehicleKey.id } });
  if (!trailer) throw new Error('Targa semirimorchio non valida.');
  return { tractorId: null, trailerId: trailer.id, vehicleLabel: `Semirimorchio ${trailer.plate}` };
}

async function assertMaintenanceReferences(input: {
  categoryId: string;
  supplierId: string | null;
  driverId: string | null;
}) {
  const [category, supplier, driver] = await Promise.all([
    prisma.category.findUnique({ where: { id: input.categoryId } }),
    input.supplierId ? prisma.supplier.findUnique({ where: { id: input.supplierId } }) : Promise.resolve(null),
    input.driverId ? prisma.driver.findUnique({ where: { id: input.driverId } }) : Promise.resolve(null)
  ]);

  if (!category) throw new Error('Categoria manutenzione non valida.');
  if (input.supplierId && !supplier) throw new Error('Fornitore manutenzione non valido.');
  if (input.driverId && !driver) throw new Error('Autista non valido.');
}

async function getCategoryName(categoryId: string): Promise<string> {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { name: true } });
  if (!category) throw new Error('Categoria manutenzione non valida.');
  return category.name;
}

async function getSupplierName(supplierId: string | null): Promise<string | null> {
  if (!supplierId) return null;
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { name: true } });
  if (!supplier) throw new Error('Fornitore manutenzione non valido.');
  return supplier.name;
}

function buildGeneratedTitle(input: {
  categoryName: string;
  maintenanceDate: Date;
  supplierName: string | null;
  vehicleLabel: string | null;
  description: string;
}) {
  const parts = [
    input.categoryName,
    input.vehicleLabel,
    input.supplierName,
    formatDate(input.maintenanceDate)
  ].filter(Boolean);
  const baseTitle = parts.join(' - ') || input.description;
  return baseTitle.slice(0, 180);
}

export async function parseMaintenanceForm(formData: FormData) {
  const categoryId = formString(formData, 'categoryId');
  const supplierId = optionalFormString(formData, 'supplierId');
  const driverId = optionalFormString(formData, 'driverId');
  const maintenanceDate = parseDate(formString(formData, 'maintenanceDate'), true, 'Data intervento');
  if (!maintenanceDate) throw new Error('Data intervento obbligatoria.');

  const description = formString(formData, 'description');
  const vehicleRelation = await buildVehicleRelation(optionalFormString(formData, 'vehicleKey'));
  await assertMaintenanceReferences({ categoryId, supplierId, driverId });
  const [categoryName, supplierName] = await Promise.all([getCategoryName(categoryId), getSupplierName(supplierId)]);
  const title =
    optionalFormString(formData, 'title') ||
    buildGeneratedTitle({
      categoryName,
      maintenanceDate,
      supplierName,
      vehicleLabel: vehicleRelation.vehicleLabel,
      description
    });

  return maintenanceSchema.parse({
    title,
    status: formString(formData, 'status') || MaintenanceStatus.COMPLETED,
    categoryId,
    maintenanceDate,
    documentDate: parseDate(formString(formData, 'documentDate'), false, 'Data documento'),
    supplierId,
    documentNumber: optionalFormString(formData, 'documentNumber'),
    driverId,
    tractorId: vehicleRelation.tractorId,
    trailerId: vehicleRelation.trailerId,
    odometerKm: parseOptionalInt(formData, 'odometerKm', 'Km'),
    amountCents: parseAmountCents(formData),
    description,
    notes: optionalFormString(formData, 'notes')
  });
}

export function parseMaintenanceCategoryForm(formData: FormData) {
  return maintenanceCategorySchema.parse({
    name: formString(formData, 'name'),
    notes: optionalFormString(formData, 'notes')
  });
}

export function parseMaintenanceCategoryUpdateForm(formData: FormData) {
  return maintenanceCategoryUpdateSchema.parse({
    ...parseMaintenanceCategoryForm(formData),
    active: formBoolean(formData, 'active')
  });
}

export function parseMaintenanceSupplierForm(formData: FormData) {
  return maintenanceSupplierSchema.parse({
    name: formString(formData, 'name'),
    phone: optionalFormString(formData, 'phone'),
    email: optionalFormString(formData, 'email'),
    address: optionalFormString(formData, 'address'),
    postalCode: optionalFormString(formData, 'postalCode'),
    city: optionalFormString(formData, 'city'),
    province: optionalFormString(formData, 'province'),
    country: optionalFormString(formData, 'country'),
    notes: optionalFormString(formData, 'notes')
  });
}

export function parseMaintenanceSupplierUpdateForm(formData: FormData) {
  return maintenanceSupplierUpdateSchema.parse({
    ...parseMaintenanceSupplierForm(formData),
    active: formBoolean(formData, 'active')
  });
}

export async function removeMaintenancePdfAfterFailure(storedPdf: Pick<StoredPdf, 'filePath'> | NullableStoredPdf | null) {
  if (!storedPdf?.filePath) return;

  try {
    await removeStoredPdf(storedPdf.filePath);
  } catch (error) {
    console.error('Impossibile eliminare il PDF manutenzione dopo un salvataggio fallito.', {
      filePath: storedPdf.filePath,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function createMaintenanceFromForm(formData: FormData) {
  const metadata = await parseMaintenanceForm(formData);
  const storedPdf = await storeOptionalPdf(formData);

  try {
    return await prisma.maintenance.create({
      data: {
        ...metadata,
        ...storedPdf
      }
    });
  } catch (error) {
    await removeMaintenancePdfAfterFailure(storedPdf);
    throw error;
  }
}

export async function updateMaintenanceFromForm(id: string, formData: FormData) {
  const current = await prisma.maintenance.findUnique({ where: { id } });
  if (!current) throw new Error('Manutenzione non trovata.');

  const metadata = await parseMaintenanceForm(formData);
  const uploadedPdf = getOptionalPdf(formData);
  const storedPdf = uploadedPdf ? await storePdfFile(uploadedPdf) : null;

  try {
    await prisma.maintenance.update({
      where: { id },
      data: {
        ...metadata,
        ...(storedPdf ? storedPdf : {})
      }
    });
  } catch (error) {
    await removeMaintenancePdfAfterFailure(storedPdf);
    throw error;
  }

  if (storedPdf && current.filePath) {
    try {
      await removeStoredPdf(current.filePath);
    } catch (error) {
      console.error('Impossibile eliminare il vecchio PDF manutenzione dal filesystem.', {
        maintenanceId: id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
