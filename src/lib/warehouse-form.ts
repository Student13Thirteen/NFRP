import 'server-only';

import { WarehouseStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { emptyStoredPdf, removeStoredPdf, storePdfFile, type NullableStoredPdf, type StoredPdf } from '@/lib/files';
import { formatDate } from '@/lib/dates';
import { formBoolean, formString, optionalFormString } from '@/lib/form';

const warehouseItemSchema = z.object({
  title: z.string().min(1, 'Titolo richiesto.').max(180),
  status: z.nativeEnum(WarehouseStatus),
  categoryId: z.string().min(1, 'Categoria magazzino richiesta.'),
  stockedAt: z.date(),
  documentDate: z.date().nullable(),
  supplierId: z.string().min(1).nullable(),
  documentNumber: z.string().max(80).nullable(),
  code: z.string().max(120).nullable(),
  quantity: z.number().int().min(0).max(9999999),
  unit: z.string().min(1, 'Unita richiesta.').max(20),
  minimumQuantity: z.number().int().min(0).max(9999999).nullable(),
  location: z.string().max(160).nullable(),
  amountCents: z.number().int().min(0).max(999999999).nullable(),
  description: z.string().min(1, 'Descrizione materiale richiesta.').max(8000),
  notes: z.string().max(4000).nullable()
});

const warehouseCategorySchema = z.object({
  name: z.string().min(1, 'Nome categoria richiesto.').max(120),
  notes: z.string().max(2000).nullable()
});

const warehouseCategoryUpdateSchema = warehouseCategorySchema.extend({
  active: z.boolean()
});

const warehouseSupplierSchema = z.object({
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

const warehouseSupplierUpdateSchema = warehouseSupplierSchema.extend({
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

  if (!parts) throw new Error(`${label} non valida. Usa il formato gg/mm/aaaa.`);

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

function parseRequiredInt(formData: FormData, key: string, label: string): number {
  const value = formString(formData, key);
  if (!value) throw new Error(`${label} richiesto.`);
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

function inferWarehouseStatus(quantity: number, minimumQuantity: number | null): WarehouseStatus {
  if (quantity <= 0) return WarehouseStatus.OUT_OF_STOCK;
  if (minimumQuantity !== null && quantity <= minimumQuantity) return WarehouseStatus.LOW_STOCK;
  return WarehouseStatus.IN_STOCK;
}

function parseWarehouseStatus(formData: FormData, quantity: number, minimumQuantity: number | null): WarehouseStatus {
  const rawStatus = optionalFormString(formData, 'status');
  if (rawStatus && Object.values(WarehouseStatus).includes(rawStatus as WarehouseStatus)) {
    return rawStatus as WarehouseStatus;
  }
  return inferWarehouseStatus(quantity, minimumQuantity);
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

export function getWarehouseActionErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message || 'Dati non validi.';
  if (error instanceof Error && error.message) {
    if (error.message.includes('Unique constraint failed')) return 'Esiste gia un record con questo nome.';
    if (error.message.includes('Foreign key constraint')) {
      return 'Non posso eliminare: ci sono record collegati. Disattivalo oppure sposta/elimina prima i record collegati.';
    }
    return error.message.slice(0, 300);
  }
  return 'Operazione non riuscita. Riprova.';
}

async function assertWarehouseReferences(input: { categoryId: string; supplierId: string | null }) {
  const [category, supplier] = await Promise.all([
    prisma.category.findUnique({ where: { id: input.categoryId } }),
    input.supplierId ? prisma.supplier.findUnique({ where: { id: input.supplierId } }) : Promise.resolve(null)
  ]);

  if (!category) throw new Error('Categoria magazzino non valida.');
  if (input.supplierId && !supplier) throw new Error('Fornitore magazzino non valido.');
}

async function getCategoryName(categoryId: string): Promise<string> {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { name: true } });
  if (!category) throw new Error('Categoria magazzino non valida.');
  return category.name;
}

async function getSupplierName(supplierId: string | null): Promise<string | null> {
  if (!supplierId) return null;
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { name: true } });
  if (!supplier) throw new Error('Fornitore magazzino non valido.');
  return supplier.name;
}

function buildGeneratedTitle(input: {
  categoryName: string;
  stockedAt: Date;
  supplierName: string | null;
  description: string;
  code: string | null;
}) {
  const parts = [input.categoryName, input.code, input.supplierName, formatDate(input.stockedAt)].filter(Boolean);
  const baseTitle = parts.join(' - ') || input.description;
  return baseTitle.slice(0, 180);
}

export async function parseWarehouseItemForm(formData: FormData) {
  const categoryId = formString(formData, 'categoryId');
  const supplierId = optionalFormString(formData, 'supplierId');
  const stockedAt = parseDate(formString(formData, 'stockedAt'), true, 'Data carico');
  if (!stockedAt) throw new Error('Data carico obbligatoria.');

  const description = formString(formData, 'description');
  const code = optionalFormString(formData, 'code');
  const quantity = parseRequiredInt(formData, 'quantity', 'Quantita');
  const minimumQuantity = parseOptionalInt(formData, 'minimumQuantity', 'Soglia minima');

  await assertWarehouseReferences({ categoryId, supplierId });
  const [categoryName, supplierName] = await Promise.all([getCategoryName(categoryId), getSupplierName(supplierId)]);
  const title =
    optionalFormString(formData, 'title') ||
    buildGeneratedTitle({
      categoryName,
      stockedAt,
      supplierName,
      description,
      code
    });

  return warehouseItemSchema.parse({
    title,
    status: parseWarehouseStatus(formData, quantity, minimumQuantity),
    categoryId,
    stockedAt,
    documentDate: parseDate(formString(formData, 'documentDate'), false, 'Data documento'),
    supplierId,
    documentNumber: optionalFormString(formData, 'documentNumber'),
    code,
    quantity,
    unit: formString(formData, 'unit') || 'pz',
    minimumQuantity,
    location: optionalFormString(formData, 'location'),
    amountCents: parseAmountCents(formData),
    description,
    notes: optionalFormString(formData, 'notes')
  });
}

export function parseWarehouseCategoryForm(formData: FormData) {
  return warehouseCategorySchema.parse({
    name: formString(formData, 'name'),
    notes: optionalFormString(formData, 'notes')
  });
}

export function parseWarehouseCategoryUpdateForm(formData: FormData) {
  return warehouseCategoryUpdateSchema.parse({
    ...parseWarehouseCategoryForm(formData),
    active: formBoolean(formData, 'active')
  });
}

export function parseWarehouseSupplierForm(formData: FormData) {
  return warehouseSupplierSchema.parse({
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

export function parseWarehouseSupplierUpdateForm(formData: FormData) {
  return warehouseSupplierUpdateSchema.parse({
    ...parseWarehouseSupplierForm(formData),
    active: formBoolean(formData, 'active')
  });
}

export async function removeWarehousePdfAfterFailure(storedPdf: Pick<StoredPdf, 'filePath'> | NullableStoredPdf | null) {
  if (!storedPdf?.filePath) return;

  try {
    await removeStoredPdf(storedPdf.filePath);
  } catch (error) {
    console.error('Impossibile eliminare il PDF magazzino dopo un salvataggio fallito.', {
      filePath: storedPdf.filePath,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function createWarehouseItemFromForm(formData: FormData) {
  const metadata = await parseWarehouseItemForm(formData);
  const storedPdf = await storeOptionalPdf(formData);

  try {
    return await prisma.warehouseItem.create({
      data: {
        ...metadata,
        ...storedPdf
      }
    });
  } catch (error) {
    await removeWarehousePdfAfterFailure(storedPdf);
    throw error;
  }
}

export async function updateWarehouseItemFromForm(id: string, formData: FormData) {
  const current = await prisma.warehouseItem.findUnique({ where: { id } });
  if (!current) throw new Error('Record magazzino non trovato.');

  const metadata = await parseWarehouseItemForm(formData);
  const uploadedPdf = getOptionalPdf(formData);
  const storedPdf = uploadedPdf ? await storePdfFile(uploadedPdf) : null;

  try {
    await prisma.warehouseItem.update({
      where: { id },
      data: {
        ...metadata,
        ...(storedPdf ? storedPdf : {})
      }
    });
  } catch (error) {
    await removeWarehousePdfAfterFailure(storedPdf);
    throw error;
  }

  if (storedPdf && current.filePath) {
    try {
      await removeStoredPdf(current.filePath);
    } catch (error) {
      console.error('Impossibile eliminare il vecchio PDF magazzino dal filesystem.', {
        warehouseItemId: id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
