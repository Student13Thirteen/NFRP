import { describe, expect, it } from 'vitest';
import { isCoherentTollAdjustment, parseTollCsvText } from '@/lib/toll-parser';

const headers = [
  'Contatore Riga',
  'Tipo Movimento',
  'Data uscita',
  'Ora Uscita',
  'Descrizione Casello Ingresso',
  'Descrizione Casello Uscita',
  'Importo Esente Iva',
  'Importo Lordo Soggetto Iva',
  'Aliquota Iva',
  'Tessera Supporto Principale',
  'Targa Principale'
].join(';');

describe('rettifiche pedaggi', () => {
  it('mantiene IVA e importi con segno negativo per una rettifica coerente', () => {
    const parsed = parseTollCsvText([
      headers,
      '1;PD;12/03/2026;18:05:20;FI SCANDICCI;BO CASALECCHIO;-13,46721;-16,4299962;22;0664364171;ZZ106ZZ'
    ].join('\n'));

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.netAmountCents).toBe(-1_347);
    expect(parsed.rows[0]?.grossAmountCents).toBe(-1_643);
    expect(parsed.rows[0]?.vatAmountCents).toBe(-296);
    expect(isCoherentTollAdjustment(parsed.rows[0]!)).toBe(true);
  });

  it('non considera automatica una rettifica con IVA incoerente', () => {
    expect(isCoherentTollAdjustment({
      grossAmountCents: -1_700,
      netAmountCents: -1_347,
      vatRatePercent: 22
    })).toBe(false);
  });
});
