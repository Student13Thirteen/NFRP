import { describe, expect, it } from 'vitest';
import { parseLeaseDocument } from '@/lib/lease-parser';

describe('parseLeaseDocument', () => {
  it('legge il contratto DLL di riferimento senza dipendere dal nome fornitore', () => {
    const parsed = parseLeaseDocument(`
COPIA PER IL CLIENTE - DOCUMENTO DI SINTESI
PRINCIPALI CONDIZIONI ECONOMICHE DEL CONTRATTO DI LOCAZIONE FINANZIARIA DI BENI MOBILI REGISTRATI
N° DEMO-LEASE-001 DEL 10/06/2026
I. LOCATORE: Leasing Demo International B.V. - Succursale di Milano
1. Fornitore
Fornitore Demo Alfa S.P.A., RIVIERA DI CHIAIA 256, 80100 NAPOLI (NA), 00000000002;
Prezzo di acquisto dei Veicoli EURO 88.000,00 + IVA
Durata e decorrenza della locazione finanziaria Pari a n. 36 mesi, decorrenti dalla data di sottoscrizione del Verbale di Consegna
1 canoni Mensile da EURO 8.800,00 +IVA, 35 canoni Mensile da EURO 2.485,00 +IVA,
Corrispettivo totale: Euro 95.775,00 + IVA
Prezzo dell’opzione finale di acquisto: EURO 880,00 + IVA
Tasso Annuo Nominale (T.A.N.): 6,98%
Tasso leasing *: 7,21%
    `);

    expect(parsed.kind).toBe('CONTRACT');
    if (parsed.kind !== 'CONTRACT') return;
    expect(parsed.lessorName).toBe('Leasing Demo International B.V. - Succursale di Milano');
    expect(parsed.vehicleSupplierName).toContain('Fornitore Demo Alfa');
    expect(parsed.contractNumber).toBe('DEMO-LEASE-001');
    expect(parsed.contractDate?.toISOString().slice(0, 10)).toBe('2026-06-10');
    expect(parsed.startDate).toBeNull();
    expect(parsed.durationMonths).toBe(36);
    expect(parsed.installmentCount).toBe(36);
    expect(parsed.recurringInstallmentCount).toBe(35);
    expect(parsed.advancePaymentNetCents).toBe(880_000);
    expect(parsed.recurringPaymentNetCents).toBe(248_500);
    expect(parsed.totalInstallmentsNetCents).toBe(9_577_500);
    expect(parsed.purchasePriceNetCents).toBe(8_800_000);
    expect(parsed.buyoutNetCents).toBe(88_000);
    expect(parsed.tanBasisPoints).toBe(698);
    expect(parsed.leaseRateBasisPoints).toBe(721);
  });

  it('riconosce una fattura canone di un altro locatore e mantiene la revisione', () => {
    const parsed = parseLeaseDocument(`
FATTURA N. L-2026/77
Data fattura 31/07/2026
LOCATORE: Finanza Veicoli Italia S.p.A.
Canone leasing contratto n. ABC-991
Targa: ZZ103ZZ
Totale imponibile 2.000,00
IVA 22% 440,00
Totale fattura 2.440,00
    `);

    expect(parsed.kind).toBe('INVOICE');
    if (parsed.kind !== 'INVOICE') return;
    expect(parsed.lessorName).toBe('Finanza Veicoli Italia S.p.A');
    expect(parsed.documentNumber).toBe('L-2026/77');
    expect(parsed.documentDate?.toISOString().slice(0, 10)).toBe('2026-07-31');
    expect(parsed.contractNumber).toBe('ABC-991');
    expect(parsed.plate).toBe('ZZ103ZZ');
    expect(parsed.netAmountCents).toBe(200_000);
    expect(parsed.vatCents).toBe(44_000);
    expect(parsed.grossAmountCents).toBe(244_000);
  });
});
