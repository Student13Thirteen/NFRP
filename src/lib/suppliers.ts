import type { Supplier } from '@prisma/client';
import { buildMapsHref, formatStructuredAddress, type StructuredAddress } from '@/lib/addresses';

type SupplierAddressFields = Pick<Supplier, 'address' | 'postalCode' | 'city' | 'province' | 'country'> | StructuredAddress;

export function formatSupplierAddress(supplier: SupplierAddressFields): string {
  return formatStructuredAddress(supplier);
}

export function buildSupplierMapsHref(supplier: SupplierAddressFields): string | null {
  return buildMapsHref(supplier);
}

export function formatSupplierContacts(supplier: Pick<Supplier, 'phone' | 'email'>): string {
  return [supplier.phone, supplier.email].filter(Boolean).join(' - ') || '-';
}
