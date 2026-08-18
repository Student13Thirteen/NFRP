import { z } from 'zod';
import { formBoolean, formString, optionalFormString } from '@/lib/form';
import { optionalPecEmailSchema, optionalTaxCodeSchema, optionalVatNumberSchema } from '@/lib/fiscal-data';

const optionalText = (max: number) => z.string().trim().max(max).optional().default('').transform((value) => value || null);

export const customerInputSchema = z.object({
  code: optionalText(40).transform((value) => value?.toLocaleUpperCase('it-IT') || null),
  name: z.string().trim().min(1, 'Inserisci la ragione sociale del cliente.').max(180),
  vatNumber: optionalVatNumberSchema,
  taxCode: optionalTaxCodeSchema,
  pecEmail: optionalPecEmailSchema,
  address: optionalText(240),
  postalCode: optionalText(20),
  city: optionalText(120),
  province: optionalText(80).transform((value) => value?.toLocaleUpperCase('it-IT') || null),
  country: optionalText(80),
  notes: optionalText(2000)
});

export const customerUpdateSchema = customerInputSchema.extend({ active: z.boolean() });

function customerFormValues(formData: FormData) {
  return {
    code: optionalFormString(formData, 'code') || '',
    name: formString(formData, 'name'),
    vatNumber: optionalFormString(formData, 'vatNumber') || '',
    taxCode: optionalFormString(formData, 'taxCode') || '',
    pecEmail: optionalFormString(formData, 'pecEmail') || '',
    address: optionalFormString(formData, 'address') || '',
    postalCode: optionalFormString(formData, 'postalCode') || '',
    city: optionalFormString(formData, 'city') || '',
    province: optionalFormString(formData, 'province') || '',
    country: optionalFormString(formData, 'country') || '',
    notes: optionalFormString(formData, 'notes') || ''
  };
}

export function parseCustomerForm(formData: FormData) {
  return customerInputSchema.parse(customerFormValues(formData));
}

export function parseCustomerUpdateForm(formData: FormData) {
  return customerUpdateSchema.parse({ ...customerFormValues(formData), active: formBoolean(formData, 'active') });
}

export function getCustomerFormError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message || 'Dati cliente non validi.';
  if (error instanceof Error && error.message.includes('Unique constraint failed')) {
    return 'Esiste gia un cliente con questo codice.';
  }
  if (error instanceof Error && error.message) return error.message.slice(0, 240);
  return 'Non e stato possibile salvare il cliente.';
}
