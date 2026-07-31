import { Prisma, WarehouseStatus, type Category, type Supplier } from '@prisma/client';
import { formatDate } from '@/lib/dates';

export const warehouseItemInclude = Prisma.validator<Prisma.WarehouseItemInclude>()({
  category: true,
  supplier: true
});

export type WarehouseItemWithRelations = Prisma.WarehouseItemGetPayload<{ include: typeof warehouseItemInclude }>;

export type WarehouseSelectOption = {
  id: string;
  label: string;
  active?: boolean;
};

export function getWarehouseStatusLabel(status: WarehouseStatus): string {
  switch (status) {
    case WarehouseStatus.IN_STOCK:
      return 'Disponibile';
    case WarehouseStatus.LOW_STOCK:
      return 'Scorta bassa';
    case WarehouseStatus.OUT_OF_STOCK:
      return 'Esaurito';
    case WarehouseStatus.ARCHIVED:
      return 'Archiviato';
    default:
      return status;
  }
}

export function buildWarehouseCategoryOptions(
  categories: Array<Pick<Category, 'id' | 'name' | 'active'>>
): WarehouseSelectOption[] {
  return categories.map((category) => ({
    id: category.id,
    label: category.name,
    active: category.active
  }));
}

export function buildWarehouseSupplierOptions(
  suppliers: Array<Pick<Supplier, 'id' | 'name' | 'active'>>
): WarehouseSelectOption[] {
  return suppliers.map((supplier) => ({
    id: supplier.id,
    label: supplier.name,
    active: supplier.active
  }));
}

export function formatWarehouseQuantity(item: Pick<WarehouseItemWithRelations, 'quantity' | 'unit'>): string {
  return `${item.quantity.toLocaleString('it-IT')} ${item.unit}`;
}

export function formatMoneyCents(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value / 100);
}

function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function warehouseItemMatchesSearch(item: WarehouseItemWithRelations, query: string | undefined): boolean {
  const tokens = normalizeSearch(query || '')
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return true;

  const searchableText = normalizeSearch(
    [
      item.title,
      item.category.name,
      getWarehouseStatusLabel(item.status),
      item.supplier?.name || '',
      item.supplier?.phone || '',
      item.supplier?.email || '',
      item.supplier?.address || '',
      item.supplier?.postalCode || '',
      item.supplier?.city || '',
      item.supplier?.province || '',
      item.supplier?.country || '',
      item.documentNumber || '',
      item.code || '',
      item.location || '',
      formatWarehouseQuantity(item),
      item.minimumQuantity !== null && item.minimumQuantity !== undefined ? `minimo ${item.minimumQuantity} ${item.unit}` : '',
      item.description,
      item.notes || '',
      item.originalFileName || '',
      formatDate(item.stockedAt),
      formatDate(item.documentDate),
      formatMoneyCents(item.amountCents)
    ].join(' ')
  );

  return tokens.every((token) => searchableText.includes(token));
}
