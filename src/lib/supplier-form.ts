import { z } from 'zod';
import { optionalPecEmailSchema, optionalTaxCodeSchema, optionalVatNumberSchema } from '@/lib/fiscal-data';

const optionalText = (max: number) => z.string().trim().max(max).optional().default('').transform((value) => value || null);

export const supplierInputSchema = z.object({
  name: z.string().trim().min(1, 'Inserisci il nome del fornitore.').max(180),
  phone: optionalText(80),
  email: z.string().trim().max(160).optional().default('').refine(
    (value) => !value || z.string().email().safeParse(value).success,
    'Inserisci un indirizzo email valido.'
  ).transform((value) => value || null),
  vatNumber: optionalVatNumberSchema,
  taxCode: optionalTaxCodeSchema,
  pecEmail: optionalPecEmailSchema,
  address: optionalText(240),
  postalCode: optionalText(20),
  city: optionalText(120),
  province: optionalText(80),
  country: optionalText(80),
  notes: optionalText(2000)
});

export type SupplierInput = z.infer<typeof supplierInputSchema>;

export function getSupplierInputError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message || 'Dati fornitore non validi.';
  if (error instanceof Error && error.message) return error.message.slice(0, 240);
  return 'Non e stato possibile salvare il fornitore.';
}
