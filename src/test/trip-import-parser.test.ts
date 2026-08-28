import { describe, expect, it } from 'vitest';
import { parseTripWaybillText } from '@/lib/trip-import-parser';

describe('trip waybill parser', () => {
  it('parses the standard lettera di vettura fields', () => {
    const parsed = parseTripWaybillText(`
LETTERA DI VETTURA
Nr.
001585
DATA
18/06/2026
AutistaGIOVANNIMotriceSemirimorchioZZ103ZZ
Vettore
NFRP SRL
Committente
000004
DATI PRESA 1
DENTAL FILM SRL
VIA VERGA 30
10036 SETTIMO TORINESE (TO )
h. 8:30
DataOraFirma
CNT 1OCGU 207608 020BOXSigillo n.
Nave Booking
Terminal di CaricoPSA GENOVA PRA
  (GE )
Cod. ritiro    PIN 55000Rif. Comp.   YANG MING
Terminal di ConsegnaVEDI DELIVERY
Cod. consegna  Rif. Comp.
TransitarioP&A
Luogo CompilazioneGENOVAData18/06/2026CompilatoreOperatore Demo
`);

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      documentFormat: 'STANDARD',
      documentNumber: '001585',
      driverName: 'GIOVANNI',
      tractorPlate: 'ZZ103ZZ',
      carrierName: 'NFRP SRL',
      customerCode: '000004',
      loadingBaseName: 'PSA GENOVA PRA',
      deliveryName: 'DENTAL FILM SRL',
      deliveryCity: 'SETTIMO TORINESE',
      deliveryProvince: 'TO',
      container1: 'OCGU2076080',
      container1Type: '20 BOX',
      booking: null,
      pickupCode: '55000',
      companyReference: 'YANG MING',
      forwarder: 'P&A'
    });
    expect(parsed.rows[0]?.tripDate?.toISOString().slice(0, 10)).toBe('2026-06-18');
  });

  it('parses the SSL scheda di trasporto format as a reviewable row', () => {
    const parsed = parseTripWaybillText(`
LETTERA DI VETTURA / SCHEDA DI TRASPORTO
SSL783
DATI DEL COMMITTENTEDATI DEL VETTORE
40H
550600058840
DERRICK BORZOLIVTE
VTE
DATI DEL PROPRIETARIO DELLA MERCE
TUTTO TRASPORTI GENOVA SRL-S
N.129/06/2026Nr. 1 Partenza
Container Nume
Terminal Scarico
SS LOGISTICA SRL
VECTORLAGHEZZA
OOCL HON KONG
FLEXTECH VIA BOVES 19 VILLANOVA DI MONDOVI CN
PESARE A VOLTRI
EVERGREEN
QINGDAO
LUOGO E DATA DI COMPILAZIONE
LUOGODATADATI DEL COMPILATORE(5)
GENOVAOPERATORE DEMO
`);

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      documentFormat: 'SSL',
      documentNumber: 'SSL783',
      customerName: 'TUTTO TRASPORTI GENOVA SRL-S',
      loadingBaseName: 'VTE',
      deliveryName: 'FLEXTECH',
      booking: '550600058840',
      container1Type: '40H',
      companyReference: 'EVERGREEN',
      ship: 'OOCL HON KONG'
    });
    expect(parsed.rows[0]?.tripDate?.toISOString().slice(0, 10)).toBe('2026-06-29');
    expect(parsed.rows[0]?.reviewReasons).toContain('Autista non riconosciuto nel documento.');
    expect(parsed.rows[0]?.reviewReasons).toContain('Targa trattore non riconosciuta nel documento.');
  });

  it('keeps multiple DATI PRESA stops separate and reads compact container references', () => {
    const parsed = parseTripWaybillText(`
LETTERA DI VETTURA Nr. 002028 DATA 23/07/2026
AutistaMARIOMotriceSemirimorchioZZ111ZZ
Vettore NFRP SRL VIA SANT' ERASMO 1
Committente 000028
DATI PRESA 1 ONT MAGAZZINI GENERALI VIA TRIBONIANO 107 20157 MILANO (MI ) h. 12:30
DataOraFirma Arrivo Mezzo____ Partenza Mezzo____
DATI PRESA 2 WILK MAGAZZINO VIA RINAMONTI 100 00155 ROMA (RM ) h. 9:00
DataOraFirma Arrivo Mezzo____ Partenza Mezzo____
ADRTipo merce Peso 0,000
CNT 1GAOU 742094 240HCSigillo n.
CNT 2 Sigillo n.
Nave Booking
Terminal di CaricoPSA GENOVA PRA (GE )
Cod. ritiro PIN 43218Rif. Comp. MSC
Terminal di ConsegnaVEDI DELIVERY
TransitarioP&A
Luogo CompilazioneGENOVAData23/07/2026CompilatoreOperatore Demo
`);

    expect(parsed.rows[0]).toMatchObject({
      customerCode: '000028',
      carrierName: 'NFRP SRL',
      container1: 'GAOU7420942',
      container1Type: '40 HC',
      loadingTerminalName: 'PSA GENOVA PRA',
      deliveryTerminalName: 'VEDI DELIVERY',
      pickupCode: '43218',
      companyReference: 'MSC',
      ship: null
    });
    expect(parsed.rows[0]?.stops).toEqual([
      {
        position: 0,
        name: 'ONT MAGAZZINI GENERALI',
        address: 'VIA TRIBONIANO 107',
        postalCode: '20157',
        city: 'MILANO',
        province: 'MI',
        plannedTime: '12:30'
      },
      {
        position: 1,
        name: 'WILK MAGAZZINO',
        address: 'VIA RINAMONTI 100',
        postalCode: '00155',
        city: 'ROMA',
        province: 'RM',
        plannedTime: '09:00'
      }
    ]);
  });

  it('reads a joined ship and booking without inventing a second container or seal', () => {
    const parsed = parseTripWaybillText(`
LETTERA DI VETTURA Nr. 002081 DATA 27/07/2026
AutistaANDREAMotriceSemirimorchioZZ103ZZ
Vettore NFRP SRL VIA SANT' ERASMO 1
Committente 000004
DATI PRESA 1 ARESIO CERAMICHE VIA CASALGRASSO 12030 POLONGHERA (CN ) h. 14,00
DataOraFirma
ADRTipo merce Peso 0,000
CNT 1 20BOXSigillo n. CNT 2 Sigillo n.
NaveNAVE DEMOBooking0163709552
Terminal di CaricoRHE RIVALTA (AL )
Rif. Comp. MAERSK
Terminal di ConsegnaBETTOLO GENOVA
TransitarioAPONEO
Luogo CompilazioneGENOVAData27/07/2026CompilatoreOperatore Demo
`);

    expect(parsed.rows[0]).toMatchObject({
      booking: '0163709552',
      ship: 'NAVE DEMO',
      container1: null,
      container1Type: '20 BOX',
      container2: null,
      seal2: null,
      loadingTerminalName: 'RHE RIVALTA',
      deliveryTerminalName: 'BETTOLO GENOVA'
    });
  });

  it('mantiene il tipo 45HC presente nella fotografia reale', () => {
    const parsed = parseTripWaybillText(`
LETTERA DI VETTURA Nr. 002080 DATA 24/07/2026
Autista ANDREA VERDI Molrice ZZ104ZZ Somirmorchio
Vettore NFRP SRL VIA SANT ERASMO 12
Committente '000036
DATI PRESA 1 CAMPIONE PELLETTERIA VIA DELLE PROVE 18/7 50100 FIRENZE (FI)
Data Ora Firma
GNI 1 KKFU 915473 0 45HC Sigillo n.
Terminal di Carico PSA GENOVA PRA (GE)
Terminal di Consegna VEDI DELIVERY
Transitario STS
`);

    expect(parsed.rows[0]).toMatchObject({
      documentNumber: '002080',
      customerCode: '000036',
      driverName: 'ANDREA VERDI',
      tractorPlate: 'ZZ104ZZ',
      container1: 'KKFU9154730',
      container1Type: '45 HC'
    });
  });
  it('recupera la tappa anche quando la fotografia perde l\u2019intestazione DATI PRESA', () => {
    // Testo ricalcato sulla resa OCR reale di una foto: l\u2019etichetta del riquadro e
    // illeggibile e le diciture prestampate del modulo si mescolano ai dati.
    const parsed = parseTripWaybillText(`
LETTERA DI VETTURA
Nr. 002099 DATA 24/07/2026
Autleta MARIO ROSSI ____\u2014\u2019Molrice AB123CD Somirmorchio XA OFS
Vettore
NFRP SRL
Committente
\u201800011
I
CAMPIONE LOGISTICA Auro Mozzo Youle d:44 n
1
VIA DELLE PROVE 18/7 Inizio Car/Soar 9 1h
\u00a9 oa
50100 FIRENZE (FI ) Termina Car/Scar HA \u2018#4
Partenza Mezzo
Ordine n
Per conto
Destinazione
Note
ADR oi o Tipo merce Peso 0.000
GNI 1 KKFU 9154730 45HC Sigino n.
CNT2 Sigilo n.
Nave Booking
Terminal di Carico PSA GENOVA PRA
(GE)
Cod, muro Rif, Comp. ONE
Terminal di Consegna VEDI DELIVERY
Cod, consegna Ri, Comp.
Transitario sts
`);

    expect(parsed.rows).toHaveLength(1);
    const row = parsed.rows[0]!;
    expect(row.stops).toHaveLength(1);
    expect(row.stops[0]).toMatchObject({
      name: 'CAMPIONE LOGISTICA',
      address: 'VIA DELLE PROVE 18/7',
      postalCode: '50100',
      city: 'FIRENZE',
      province: 'FI'
    });
    // Il rumore delle etichette prestampate non deve entrare nei dati proposti.
    expect(row.stops[0]?.name).not.toContain('Mozzo');
    expect(row.stops[0]?.address).not.toContain('Car');
    // Le sigle sporcate dall\u2019OCR non devono restare attaccate al nome del terminal.
    expect(row.loadingTerminalName).toBe('PSA GENOVA PRA');
    expect(row.deliveryTerminalName).toBe('VEDI DELIVERY');
    expect(row.companyReference).toBe('ONE');
    // Nessun orario: `d:44` e scritto a mano e non va proposto come dato certo.
    expect(row.stops[0]?.plannedTime).toBeNull();
  });

  it('non inventa una tappa quando il riquadro non contiene un indirizzo leggibile', () => {
    const parsed = parseTripWaybillText(`
LETTERA DI VETTURA
Nr. 002100 DATA 24/07/2026
AutistaMARIOMotriceSemirimorchioAB123CD
Vettore
NFRP SRL
Committente
000011
oi o \u00a9 oa HA \u2018#4
ADR Tipo merce Peso 0.000
CNT 1 Sigillo n.
Terminal di Carico PSA GENOVA PRA
`);

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.stops).toEqual([]);
    expect(parsed.rows[0]?.deliveryName).toBeNull();
  });

  it('normalizza il tipo container sulle voci del foglio operativo', () => {
    const parsed = parseTripWaybillText(`
LETTERA DI VETTURA
Nr. 002101 DATA 24/07/2026
AutistaMARIOMotriceSemirimorchioAB123CD
Committente
000011
DATI PRESA 1
CAMPIONE SRL
VIA PROVA 1
10100 TORINO (TO )
DataOraFirma
CNT 1MSCU 123456 740HCSigillo n.
Terminal di CaricoPSA GENOVA PRA
`);

    // Senza lo spazio il valore non coinciderebbe con nessuna voce della tendina guidata.
    expect(parsed.rows[0]?.container1Type).toBe('40 HC');
    expect(parsed.rows[0]?.container1).toBe('MSCU1234567');
  });
});
