import { describe, expect, it } from 'vitest';
import { parseFuelCoInvoiceText } from '@/lib/fuel-parser';

describe('FuelCo fuel parser', () => {
  it('assigns transaction rows to the plate declared in the PAN total row', () => {
    const text = [
      'ALLEGATO ALLA FATTURA n. PJ00000001 del 30/04/26',
      'Allegato alla FATTURA N. PJ00000001 del 30/04/2026 relativa a forniture effettuate fino al 30/04/2026',
      '9000000000000000001 90001 18/04/26 1510  GLS  0000 635293 9001 VIA DEMO 1 CITTA DEMO              PP   612,03     377,06 1,623       2,119   799,00',
      '9000000000000000001 90002 22/04/26 1003  GLS  0000 636290 9002 VIA DEMO 2 CITTA DEMO              PP   655,77     389,95 1,682 0,165 1,847   720,12',
      '*      TOTALE PAN 9000000000000000001 TARGA/NOME ZZ115ZZ                  *********                   1.267,80     767,01                   1.519,12'
    ].join('\n');

    const parsed = parseFuelCoInvoiceText(text);

    expect(parsed.invoiceNumber).toBe('PJ00000001');
    expect(parsed.invoiceDate?.toISOString()).toBe('2026-04-30T00:00:00.000Z');
    expect(parsed.periodEndDate?.toISOString()).toBe('2026-04-30T00:00:00.000Z');
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.skippedLines).toBe(0);
    expect(parsed.rows[0]).toMatchObject({
      plate: 'ZZ115ZZ',
      cardNumber: '9000000000000000001',
      ticketNumber: '90001',
      productCode: 'GLS',
      odometerKm: 635293,
      volumeLitersMilli: 377060,
      basePricePerLiterMilliEuro: 1623,
      discountPerLiterMilliEuro: null,
      finalPricePerLiterMilliEuro: 2119,
      totalAmountCents: 79900
    });
    // Prezzo finale ivato = totale / litri (79900 / 377.06 = 2,119 €/l).
    expect(parsed.rows[0].finalPricePerLiterMilliEuro).toBe(
      Math.round((parsed.rows[0].totalAmountCents * 10_000) / parsed.rows[0].volumeLitersMilli)
    );
    expect(parsed.rows[1]).toMatchObject({
      plate: 'ZZ115ZZ',
      basePricePerLiterMilliEuro: 1682,
      discountPerLiterMilliEuro: 165,
      finalPricePerLiterMilliEuro: 1847,
      totalAmountCents: 72012
    });
  });
});
