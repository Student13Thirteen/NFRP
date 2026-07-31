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
Luogo CompilazioneGENOVAData18/06/2026CompilatoreChiara Benedetto
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
      container1Type: '20BOX',
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
GENOVASALVATORE PISCITELLO
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
    expect(parsed.rows[0]?.reviewReasons).toContain('Autista non riconosciuto nel PDF.');
    expect(parsed.rows[0]?.reviewReasons).toContain('Targa trattore non riconosciuta nel PDF.');
  });

  it('keeps multiple DATI PRESA stops separate and reads compact container references', () => {
    const parsed = parseTripWaybillText(`
LETTERA DI VETTURA Nr. 002028 DATA 23/07/2026
AutistaDANILOMotriceSemirimorchioZZ111ZZ
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
Luogo CompilazioneGENOVAData23/07/2026CompilatoreChiara Benedetto
`);

    expect(parsed.rows[0]).toMatchObject({
      customerCode: '000028',
      carrierName: 'NFRP SRL',
      container1: 'GAOU7420942',
      container1Type: '40HC',
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
AutistaGIOVANNIMotriceSemirimorchioZZ103ZZ
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
Luogo CompilazioneGENOVAData27/07/2026CompilatoreChiara Benedetto
`);

    expect(parsed.rows[0]).toMatchObject({
      booking: '0163709552',
      ship: 'NAVE DEMO',
      container1: null,
      container1Type: '20BOX',
      container2: null,
      seal2: null,
      loadingTerminalName: 'RHE RIVALTA',
      deliveryTerminalName: 'BETTOLO GENOVA'
    });
  });
});
