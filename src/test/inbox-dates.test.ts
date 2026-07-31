import { describe, expect, it } from 'vitest';
import { deriveCronotachographExpiryDate, findInboxDateSuggestions } from '@/lib/inbox-dates';

describe('inbox date suggestions', () => {
  it('separates insurance decorrenza from contextual expiry', () => {
    const dates = findInboxDateSuggestions(
      'Certificato di assicurazione. Decorrenza 15/01/2026. Validita fino al 15/01/2027.',
      'polizza.pdf'
    );

    expect(dates.issueDate?.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(dates.expiryDate?.toISOString()).toBe('2027-01-15T00:00:00.000Z');
    expect(dates.expiryEvidence).toContain('Validita fino al 15/01/2027');
  });

  it('reads the insurance paid period when the end date is not labeled scadenza', () => {
    const dates = findInboxDateSuggestions(
      'Certificato di assicurazione PERIODO DI ASSICURAZIONE PER IL QUALE E STATO PAGATO IL PREMIO DALLE ORE 24 DAL 21/06/2023 ALLE ORE 24 21/12/2023',
      'certificato.pdf'
    );

    expect(dates.issueDate?.toISOString()).toBe('2023-06-21T00:00:00.000Z');
    expect(dates.expiryDate?.toISOString()).toBe('2023-12-21T00:00:00.000Z');
    expect(dates.expiryEvidence).toContain('Periodo di assicurazione');
  });

  it('ignores the insurance print timestamp before the paid period dates', () => {
    const dates = findInboxDateSuggestions(
      'PERIODO DI ASSICURAZIONE PER IL QUALE E STATO PAGATO IL PREMIO 900000000000000001 06/11/2025 02:08:05 DALLE ORE 24 ALLE ORE DAL | 21/12/2025 | ALLE ORE | 21/06/2026 |',
      'ZZ101ZZ scadente il 21.062026.pdf'
    );

    expect(dates.issueDate?.toISOString()).toBe('2025-12-21T00:00:00.000Z');
    expect(dates.expiryDate?.toISOString()).toBe('2026-06-21T00:00:00.000Z');
    expect(dates.expiryEvidence).toContain('Periodo di assicurazione');
  });

  it('reads insurance paid period dates when OCR drops letters from assicurazione', () => {
    const dates = findInboxDateSuggestions(
      'PERIODO DI ASSCURAZIONE PERL QUALE E STATO FAGRTO IL PREMIO BALEORE2 | 21/12/2022 | LEK | 21/06/2023 |',
      'ZZ 102 ZZ.pdf'
    );

    expect(dates.issueDate?.toISOString()).toBe('2022-12-21T00:00:00.000Z');
    expect(dates.expiryDate?.toISOString()).toBe('2023-06-21T00:00:00.000Z');
    expect(dates.expiryEvidence).toContain('Periodo di assicurazione');
  });

  it('reads Assicurazioni Demo Due fleet dates when labels and values are separated', () => {
    const dates = findInboxDateSuggestions(
      [
        'CERTIFICATO DI ASSICURAZIONE',
        'Targa',
        'Decorrenza dalle ore  del',
        'Scadenza alle ore    del',
        'Assicurazioni Demo Due S.p.A. Societa Benefit',
        'Leasing Demo S.p.A.',
        'Trattore stradale con ralla',
        'VIA ESEMPIO 7 00000 CITTA DEMO ZZ',
        '00000000009',
        '9000000000000000001',
        '05/06/2026',
        '30/11/2026',
        'Leasing Demo S.p.A.',
        '00000000009',
        '24:00',
        'CAMION DEMO',
        'C',
        'ZZ103ZZ'
      ].join('\n'),
      'ZZ103ZZ_DEMO-POLIZZA.pdf'
    );

    expect(dates.issueDate?.toISOString()).toBe('2026-06-05T00:00:00.000Z');
    expect(dates.expiryDate?.toISOString()).toBe('2026-11-30T00:00:00.000Z');
    expect(dates.expiryEvidence).toContain('Assicurazioni Demo Due');
  });

  it('turns a labeled month expiry into the last day of that month', () => {
    const dates = findInboxDateSuggestions('Esito revisione. Prossima revisione 05/2028.', 'revisione.pdf');

    expect(dates.expiryDate?.toISOString()).toBe('2028-05-31T00:00:00.000Z');
    expect(dates.expiryEvidence).toContain('ultimo giorno del mese');
  });

  it('reads the barrato rosa validity (DTT 307) ignoring the issuing-stamp and signature dates', () => {
    // Layout OCR sintetico: la data del "Timbro del servizio emettitore" (03.06.2026) e la firma (08/06/2026)
    // sono PRIMA della validità vera (06/06/2027). La scadenza è la data più futura del campo 12.
    const dates = findInboxDateSuggestions(
      [
        'CERTIFICATO DI APPROVAZIONE PER I VEICOLI CHE TRASPORTANO ALCUNE MERCI PERICOLOSE',
        '4. N° di immatricolazione R/ZZ117ZZ',
        '11. Osservazioni',
        '12. Valido fino al: Timbro del servizio emettitore 03.06.2026',
        ') 17:33:50',
        '',
        "06/06/2027 '0. GMT+02.00",
        'M Operativa : 00/ZZ/000001 ROMA, 08/06/2026 Firma'
      ].join('\n'),
      'ZZ-117-ZZ-scadente-il-2027.06.06.pdf'
    );

    expect(dates.expiryDate?.toISOString()).toBe('2027-06-06T00:00:00.000Z');
    expect(dates.expiryEvidence).toContain('Valido fino al');
  });

  it('reads a rotated revision sticker when OCR places the month before scadenza', () => {
    const dates = findInboxDateSuggestions(
      'Carta di circolazione. REVISIONI. REVISIONE REGOLARE ESITO 02/2027 SCADENZA.',
      'scan.pdf'
    );

    expect(dates.expiryDate?.toISOString()).toBe('2027-02-28T00:00:00.000Z');
    expect(dates.expiryEvidence).toContain('SCADENZA');
    expect(dates.expiryEvidence).toContain('ultimo giorno del mese');
  });

  it('reads abbreviated Italian OCR dates for tachograph calibration', () => {
    const dates = findInboxDateSuggestions(
      'Rapporto Tecnico di Intervento. 4-dic-2023 Data calibrazione Firma e timbro.',
      'rapporto.pdf'
    );

    expect(dates.issueDate?.toISOString()).toBe('2023-12-04T00:00:00.000Z');
  });

  it('reads generic Data labels only in tachograph technical reports', () => {
    const dates = findInboxDateSuggestions(
      'Rapporto Tecnico di Intervento su Tachigrafo Digitale. Dati tachigrafo. Data: 26/06/18. Lettura odometro.',
      'rapporto.pdf'
    );

    expect(dates.issueDate?.toISOString()).toBe('2018-06-26T00:00:00.000Z');
  });

  it('derives cronotachograph expiry as two years minus one day', () => {
    const expiryDate = deriveCronotachographExpiryDate(new Date('2026-05-05T00:00:00.000Z'));

    expect(expiryDate.toISOString()).toBe('2028-05-04T00:00:00.000Z');
  });

  it('reads extinguisher service issue date from the place/date header', () => {
    const dates = findInboxDateSuggestions(
      'Roma 15/05/2026 Oggetto: RIMESSA IN EFFICIENZA ESTINTORI SECONDO UNI 9994.1 installati sul vs automezzo targato ZZ 118 ZZ MESE DI MAGGIO 2026 SCADENZA 30 NOVEMBRE 2026',
      'estintori.pdf'
    );

    expect(dates.issueDate?.toISOString()).toBe('2026-05-15T00:00:00.000Z');
    expect(dates.expiryDate?.toISOString()).toBe('2026-11-30T00:00:00.000Z');
  });

  it('does not turn unrelated dates into an expiry', () => {
    const dates = findInboxDateSuggestions('Documento stampato il 01/02/2026. Protocollo del 03/02/2026.', 'documento.pdf');

    expect(dates.issueDate).toBeNull();
    expect(dates.expiryDate).toBeNull();
  });

  it('uses one plausible date in the file name as cautious expiry fallback', () => {
    const dates = findInboxDateSuggestions('Documento senza date contestuali.', 'scadenza-30-09-2027.pdf', new Date('2026-05-22'));

    expect(dates.expiryDate?.toISOString()).toBe('2027-09-30T00:00:00.000Z');
    expect(dates.expiryEvidence).toContain('nome file');
  });

  it('uses compact day month-year dates from sample file names as expiry fallback', () => {
    const dates = findInboxDateSuggestions(
      'Documento senza date contestuali.',
      'ZZ101ZZ scadente il 21.062026.pdf',
      new Date('2026-05-22')
    );

    expect(dates.expiryDate?.toISOString()).toBe('2026-06-21T00:00:00.000Z');
    expect(dates.expiryEvidence).toContain('nome file');
  });
});
