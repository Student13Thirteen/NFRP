import { describe, expect, it } from 'vitest';
import { parseWinSoftwareDocument } from '@/lib/winsoftware-parser';

const HEADER = `
Cedente/prestatore (fornitore) Cessionario/committente (cliente)
Identificativo fiscale ai fini IVA: IT00000000010 Identificativo fiscale ai fini IVA: IT00000000001
Codice fiscale: 00000000010 Denominazione: NFRP Demo S.R.L.
Denominazione: Energia Demo SRL Indirizzo: VIA ESEMPIO 6
Tipologia documento Art. 73 Numero documento Data documento Codice destinatario
TD24 fattura differita - art.21 c4 DEMO1386 30-04-2026 DEMO123
Cod. articolo Descrizione Quantità Prezzo unitario UM %IVA Prezzo totale
`;

describe('WinSoftware invoice parser and classifier', () => {
  it('recognizes a multi-row fuel invoice and keeps every plate on its row', () => {
    const parsed = parseWinSoftwareDocument(`${HEADER}
DDT 10001/A del 24-04-2026
- (AswArtFor) GASOLIO Targa ZZ 112 ZZ 47,902! 16877] | 22,00 80,8442054
Tipo dato: AswPrLordo
Rif. numero: 2,059
DDT 10002/A del 29-04-2026
- (AswArtFor) AD-BLUE Targa ZZ 113 ZZ 30,00 0,90164) | 22,00 27,0492
Tipo dato: AswPrLordo
Rif. numero: 1,10
DDT 10003/A del 29-04-2026
- (AswArtFor) GASOLIO Targa ZZ 102 ZZ 315,687 1,6877| | 22,00 532,7849499
Tipo dato: AswPrLordo
Rif. numero: 2,059
RIEPILOGHI IVA E TOTALI
`);

    expect(parsed.isWinSoftware).toBe(true);
    expect(parsed.kind).toBe('FUEL');
    expect(parsed.confidence).toBe('HIGH');
    expect(parsed.supplierName).toBe('Energia Demo SRL');
    expect(parsed.supplierVatNumber).toBe('IT00000000010');
    expect(parsed.invoiceNumber).toBe('DEMO1386');
    expect(parsed.invoiceDate?.toISOString()).toBe('2026-04-30T00:00:00.000Z');
    expect(parsed.fuelInvoice?.rows).toHaveLength(3);
    expect(parsed.fuelInvoice?.rows.map((row) => row.plate)).toEqual(['ZZ112ZZ', 'ZZ113ZZ', 'ZZ102ZZ']);
    expect(parsed.fuelInvoice?.rows.map((row) => row.productCode)).toEqual(['GLS', 'ADB', 'GLS']);
    expect(parsed.fuelInvoice?.rows[0]).toMatchObject({
      ticketNumber: '10001/A',
      volumeLitersMilli: 47_902,
      finalPricePerLiterMilliEuro: 2_059,
      totalAmountCents: 9_863
    });
    expect(parsed.fuelInvoice?.rows[1]).toMatchObject({
      ticketNumber: '10002/A',
      volumeLitersMilli: 30_000,
      totalAmountCents: 3_300
    });
    expect(new Set(parsed.fuelInvoice?.rows.map((row) => row.sourceKey)).size).toBe(3);
  });

  it('routes a WinSoftware document without fuel rows to maintenance review', () => {
    const parsed = parseWinSoftwareDocument(`${HEADER.replace('DEMO1386', 'M-442')}
DDT 99/A del 29-04-2026
- (AswArtFor) SOSTITUZIONE PASTIGLIE FRENI 1,00 150,00 | 22,00 150,00
RIEPILOGHI IVA E TOTALI
Imposta bollo Sconto/Maggiorazione Arr. Totale documento
183,00
`);

    expect(parsed.kind).toBe('MAINTENANCE');
    expect(parsed.confidence).toBe('HIGH');
    expect(parsed.invoiceNumber).toBe('M-442');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      description: 'SOSTITUZIONE PASTIGLIE FRENI',
      quantityMilli: 1_000,
      unitPriceCents: 15_000,
      imponibileCents: 15_000,
      vatRatePercent: 22
    });
    expect(parsed.declaredTotalCents).toBe(18_300);
  });

  it('does not guess when fuel and non-fuel article rows are mixed', () => {
    const parsed = parseWinSoftwareDocument(`${HEADER}
DDT 1/A del 24-04-2026
- (AswArtFor) GASOLIO Targa ZZ 112 ZZ 10,00 1,6877 | 22,00 16,877
Rif. numero: 2,059
- (AswArtFor) LAVAGGIO AUTOMEZZO 1,00 25,00 | 22,00 25,00
RIEPILOGHI IVA E TOTALI
`);

    expect(parsed.kind).toBe('UNKNOWN');
    expect(parsed.classificationReason).toContain('righe miste');
  });
});
