import { describe, expect, it } from 'vitest';
import { customerInputSchema } from '@/lib/customer-form';
import { supplierInputSchema } from '@/lib/supplier-form';

describe('dati fiscali clienti e fornitori', () => {
  it('normalizza Partita IVA, codice fiscale e PEC', () => {
    const customer = customerInputSchema.parse({
      name: 'Cliente Test',
      vatNumber: 'IT 012.345.678-90',
      taxCode: 'rss mra 80a01 h501u',
      pecEmail: 'AMMINISTRAZIONE@PEC.EXAMPLE'
    });
    expect(customer.vatNumber).toBe('01234567890');
    expect(customer.taxCode).toBe('RSSMRA80A01H501U');
    expect(customer.pecEmail).toBe('amministrazione@pec.example');
  });

  it('mantiene facoltativi i dati fiscali nella creazione rapida del fornitore', () => {
    expect(supplierInputSchema.parse({ name: 'Officina Test' })).toMatchObject({
      name: 'Officina Test',
      vatNumber: null,
      taxCode: null,
      pecEmail: null
    });
  });

  it('rifiuta formati fiscali italiani incompleti', () => {
    expect(() => customerInputSchema.parse({ name: 'Cliente', vatNumber: '1234' })).toThrow(/11 cifre/);
    expect(() => customerInputSchema.parse({ name: 'Cliente', taxCode: 'ABC123' })).toThrow(/codice fiscale/i);
    expect(() => customerInputSchema.parse({ name: 'Cliente', pecEmail: 'pec-non-valida' })).toThrow(/PEC/);
  });
});
