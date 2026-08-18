import { z } from 'zod';

export function normalizeItalianVatNumber(value: string): string {
  return value.trim().toLocaleUpperCase('it-IT').replace(/^IT/, '').replace(/[\s.-]/g, '');
}

export function normalizeItalianTaxCode(value: string): string {
  return value.trim().toLocaleUpperCase('it-IT').replace(/[\s.-]/g, '');
}

export const optionalVatNumberSchema = z
  .string()
  .trim()
  .max(32)
  .optional()
  .default('')
  .transform(normalizeItalianVatNumber)
  .refine((value) => !value || /^\d{11}$/.test(value), 'La Partita IVA italiana deve contenere 11 cifre.')
  .transform((value) => value || null);

export const optionalTaxCodeSchema = z
  .string()
  .trim()
  .max(32)
  .optional()
  .default('')
  .transform(normalizeItalianTaxCode)
  .refine(
    (value) => !value || /^\d{11}$/.test(value) || /^[A-Z0-9]{16}$/.test(value),
    'Il codice fiscale deve contenere 11 cifre oppure 16 caratteri alfanumerici.'
  )
  .transform((value) => value || null);

export const optionalPecEmailSchema = z
  .string()
  .trim()
  .max(160)
  .optional()
  .default('')
  .refine((value) => !value || z.string().email().safeParse(value).success, 'Inserisci un indirizzo PEC valido.')
  .transform((value) => value.toLocaleLowerCase('it-IT') || null);
