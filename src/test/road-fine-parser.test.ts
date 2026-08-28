import { describe, expect, it } from 'vitest';
import { parseRoadFineText } from '@/lib/road-fine-parser';

describe('parser verbali stradali', () => {
  it('legge un verbale comunale e usa i totali comprensivi di spese', () => {
    const parsed = parseRoadFineText(`
      COMUNE DI RIVAFORTE SERVIZIO POLIZIA LOCALE
      VERBALE DI CONTESTAZIONE AL CODICE DELLA STRADA
      Verbale n° V/120AB/2026 Pr. 400/2026 del 20/07/2026
      Il giorno 20/07/2026 alle ore 13:34 in SP 12 altezza Km 02+338 direz. NORD – SUD
      il conducente del veicolo RIMORCHIO MODELLO targa ZZ123YY ha violato l'art. 142/7-11 del C.d.S. poichè:
      circolava alla velocità di km/h 75 superando il limite massimo consentito.
      La velocità come sopra determinata è stata rilevata con apparecchiatura omologata.
      Non è stato possibile contestare immediatamente la violazione.
      Modalità pagamento: sanzione € 58,80 più € 5,00 per spese (totale € 63,80) entro 5 gg.
      Sanzione € 84,00 più € 5,00 (totale € 89,00) entro 60 gg.
    `);

    expect(parsed).toMatchObject({
      isRoadFine: true,
      noticeNumber: 'V/120AB/2026',
      authority: 'Comune di Rivaforte · Servizio Polizia Locale',
      violationTime: '13:34',
      location: 'SP 12 altezza Km 02+338 direz. NORD – SUD',
      violationCode: 'Art. 142/7-11',
      plate: 'ZZ123YY',
      vehicleKind: 'TRAILER',
      reducedAmountCents: 6380,
      standardAmountCents: 8900,
      notificationDate: null,
      discountedPaymentDueDate: null,
      paymentDueDate: null,
      appealDueDate: null,
      pointsDeducted: null
    });
    expect(parsed.violationDate?.toISOString().slice(0, 10)).toBe('2026-07-20');
    expect(parsed.description).toContain('circolava alla velocità');
  });

  it('legge il layout provinciale senza confondere ora di accertamento e sanzione base', () => {
    const parsed = parseRoadFineText(`
      Verbale di violazione nr. 98765/V/2026
      VERBALE DI VIOLAZIONE AL CODICE DELLA STRADA
      Dati identificativi della violazione
      Verbale Numero:98765/V/2026 Prot. Numero:2233/2026 Codice Web:ABC-123
      Data:20/07/2026 Ora: 13:21 Veicolo Targa:ZZ123YY
      In data 20/07/2026 alle ore 14:38 presso gli uffici ho accertato che il conducente del Rimorchio targato ZZ123YY
      ha violato il seguente articolo del C.d.S.: Art. 142 c. 7: superava il limite di velocità stabilito.
      poiché il giorno 20/07/2026 alle ore 13:21 in Strada Provinciale SP 12 al Km 39+200 comune di Rivaforte, direzione Sud,
      ove vige il limite di 70 km/h, superava il limite. Sanzioni accessorie: NESSUNA
      Provincia di COLLEVERDE CORPO DI POLIZIA PROVINCIALE
      L'importo entro 5 giorni sarà di € 58,80 oltre € 6,50 per un totale di € 65,30.
      Dal 6° al 60° giorno sarà € 84,00 oltre € 6,50 per un totale di € 90,50.
      Il presente atto viene notificato a mezzo PEC.
    `);

    expect(parsed).toMatchObject({
      isRoadFine: true,
      noticeNumber: '98765/V/2026',
      authority: 'Provincia di Colleverde · Corpo di Polizia Provinciale',
      violationTime: '13:21',
      location: 'Strada Provinciale SP 12 al Km 39+200 comune di Rivaforte, direzione Sud',
      violationCode: 'Art. 142 c. 7',
      plate: 'ZZ123YY',
      vehicleKind: 'TRAILER',
      reducedAmountCents: 6530,
      standardAmountCents: 9050,
      notificationDate: null
    });
    expect(parsed.violationDate?.toISOString().slice(0, 10)).toBe('2026-07-20');
  });

  it('non classifica un verbale di consegna privo dei marker stradali', () => {
    const parsed = parseRoadFineText('Verbale di consegna del bene previsto dal contratto di leasing.');
    expect(parsed.isRoadFine).toBe(false);
  });

  it('accetta una data di notifica soltanto quando è dichiarata esplicitamente e non calcola scadenze', () => {
    const parsed = parseRoadFineText(`
      VERBALE DI VIOLAZIONE AL CODICE DELLA STRADA. Verbale n° X/10/2026.
      Il giorno 02/08/2026 alle ore 09:05 in Via Esempio 1 il conducente del veicolo targato ZZ123YY
      ha violato l'art. 7 del C.d.S. poichè: circolava in area vietata. Non è stato possibile contestare.
      COMUNE DI RIVAFORTE SERVIZIO POLIZIA LOCALE. Notificato in data 10/08/2026.
    `);
    expect(parsed.notificationDate?.toISOString().slice(0, 10)).toBe('2026-08-10');
    expect(parsed.paymentDueDate).toBeNull();
    expect(parsed.appealDueDate).toBeNull();
  });

  it('propone conducente, punti e scadenze solo da etichette esplicite', () => {
    const parsed = parseRoadFineText(`
      VERBALE DI VIOLAZIONE AL CODICE DELLA STRADA. Verbale n° X/11/2026.
      COMUNE DI RIVAFORTE SERVIZIO POLIZIA LOCALE.
      Il giorno 02/08/2026 alle ore 09:05 in Via Esempio 1 il conducente del veicolo targato ZZ123YY
      ha violato l'art. 7 del C.d.S. poichè: circolava in area vietata. Non è stato possibile contestare.
      Conducente: MARIO ROSSI Patente: AB123456. Decurtazione di 3 punti.
      Scadenza pagamento ridotto: 15/08/2026. Scadenza pagamento: 10/10/2026. Scadenza ricorso: 09/09/2026.
    `);
    expect(parsed.driverName).toBe('MARIO ROSSI');
    expect(parsed.pointsDeducted).toBe(3);
    expect(parsed.discountedPaymentDueDate?.toISOString().slice(0, 10)).toBe('2026-08-15');
    expect(parsed.paymentDueDate?.toISOString().slice(0, 10)).toBe('2026-10-10');
    expect(parsed.appealDueDate?.toISOString().slice(0, 10)).toBe('2026-09-09');
  });
});
