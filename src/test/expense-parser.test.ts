import { describe, expect, it } from 'vitest';
import {
  isConfidentMaintenanceExpense,
  needsMaintenancePriceRecovery,
  parseExpenseDocument,
  parseItalianMoneyToCents,
  splitOcrTextByPage
} from '@/lib/expense-parser';
import { parseRegisteredExpenseLayout } from '@/lib/expense-layout-profiles';

describe('parseItalianMoneyToCents', () => {
  it('converte importi italiani in centesimi', () => {
    expect(parseItalianMoneyToCents('35,00')).toBe(3500);
    expect(parseItalianMoneyToCents('1.720,20')).toBe(172020);
    expect(parseItalianMoneyToCents('1.234.567,89')).toBe(123456789);
  });
});

describe('parseExpenseDocument — template ricambi', () => {
  const text = [
    'Ricambi Demo Delta S.R.L.',
    'DDT7/2026/03046 del 04/05/2026',
    'Spett.le NFRP S.R.L.',
    'SPK-FAN 18-8570-001 GEMBA EUROPCNT 9-5X 1 35,00 Netto 35,00 22',
    '286-COB 1005.96101 PROIETTORE 5X 1 145,00 Netto 145,00 22',
    'TOTALE DOCUMENTO 180,00'
  ].join('\n');

  const parsed = parseExpenseDocument(text);

  it('riconosce il fornitore noto', () => {
    expect(parsed.supplierName).toBe('Ricambi Demo Delta');
  });

  it('estrae il numero documento e la data', () => {
    expect(parsed.documentNumber).toContain('DDT');
    expect(parsed.documentDate?.toISOString().slice(0, 10)).toBe('2026-05-04');
  });

  it('estrae due righe con IVA e importi corretti', () => {
    expect(parsed.lines).toHaveLength(2);
    const [first, second] = parsed.lines;
    expect(first.imponibileCents).toBe(3500);
    expect(first.vatRatePercent).toBe(22);
    expect(first.vatCents).toBe(770);
    expect(first.totalCents).toBe(4270);
    expect(first.code).toBe('18-8570-001');
    expect(second.imponibileCents).toBe(14500);
    expect(second.totalCents).toBe(17690);
  });

  it('legge il totale dichiarato dal documento', () => {
    expect(parsed.declaredTotalCents).toBe(18000);
  });
});

describe('parseExpenseDocument — scansioni sintetiche Ricambi Demo Delta', () => {
  const pages = [
    [
      'Ricambi Demo Delta - SPARE PARTS FOR TRUCKS AND TRAILERS',
      'D.D.T. Del Pag. Cod.Cliente Partita IVA Nr.Rif.Int.',
      'DDT7/2099/00003 20/06/2026 | 1/1 23733 IT00000000001',
      '286-COS 096300 TRASPARENTE DX-SX 1 22,95 40,0% 13,77€) 22'
    ].join('\n'),
    [
      'Ricambi Demo Delta',
      'DDT7/2099/00004 16/07/2026 | 1/1 23733 IT00000000001',
      'OPZ-MV 4870032 ALZACRISTALLO SX 2 9 FT 1 55,00 Netto 55,00€) 22'
    ].join('\n'),
    [
      'Ricambi Demo Delta',
      'DDT7/2099/00005 15/07/2026 | 1/1 23733 IT00000000001',
      '2-S 500355303 TUBO ACQUA RAFFREDDA 4 29 2 } ui 1 210,50 70,0% 63,15€) 22'
    ].join('\n')
  ];

  it('separa il sidecar OCR in tre documenti pagina', () => {
    expect(splitOcrTextByPage(pages.join('\n\f'))).toEqual(pages);
  });

  it('estrae numero, data, codice, descrizione e importo netto da ogni pagina', () => {
    const parsed = pages.map(parseExpenseDocument);
    expect(parsed.map((document) => document.documentNumber)).toEqual([
      'DDT7/2099/00003',
      'DDT7/2099/00004',
      'DDT7/2099/00005'
    ]);
    expect(parsed.map((document) => document.documentDate?.toISOString().slice(0, 10))).toEqual([
      '2026-06-20',
      '2026-07-16',
      '2026-07-15'
    ]);
    expect(parsed.map((document) => document.lines[0].code)).toEqual(['096300', '4870032', '500355303']);
    expect(parsed.map((document) => document.lines[0].description)).toEqual([
      'TRASPARENTE DX-SX',
      'ALZACRISTALLO SX',
      'TUBO ACQUA RAFFREDDA'
    ]);
    expect(parsed.map((document) => document.lines[0].imponibileCents)).toEqual([1377, 5500, 6315]);
    expect(parsed.every((document) => document.requiresVehicleAllocation)).toBe(true);
    expect(parsed.every((document) => document.suggestedCategoryName === 'Ricambi')).toBe(true);
  });

  it('fonde le varianti OCR dello stesso articolo e conserva la descrizione più pulita', () => {
    const parsed = parseExpenseDocument([
      'Ricambi Demo Delta',
      'DDT7/2099/00007 23/07/2026 | 1/1 23733 IT00000000001',
      '286-COS 1605-96100 PROIETTORE DX od 1 10,00 Netto 10,00€) 22',
      '286-COS 1605-96101 PROIETTORE SX 1 10,00 Netto 10,00€) 22',
      '286-COS 1605-96100 PROIETTORE DX io 1 10,00 Netto 10,00€) 22',
      '286-COS 1605-96100 PROIETTORE DX 1 10,00 Netto 10,00€) 22'
    ].join('\n'));

    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines.map((line) => [line.code, line.description])).toEqual([
      ['1605-96100', 'PROIETTORE DX'],
      ['1605-96101', 'PROIETTORE SX']
    ]);
  });
});

describe('parseExpenseDocument — tabella con annotazioni blu sovrapposte', () => {
  const primaryOcr = [
    'Ricambi Demo Delta',
    'DDT7/2099/00006 27/07/2026 | 1/1 23733 IT00000000001',
    '(287-MV 90601 GEN ADESIVO ANGOLOMORTO PD GKAISEN =. 3, 5,20 50,0% 7,80€| 22',
    '| LUB-LUB /15F618 f70T - OLIO EDGE 5W30C3LT-1 345 994 KH | 16 13,00} Netto | BERL 22'
  ].join('\n');
  const tableWithoutBlueInk = [
    'Ricambi Demo Delta',
    'DDT7/2099/00006 27/07/2026',
    '| 287-MV e0601 | ADESIVO ANGOLO MORTO | 3 5,20 50,0% 7,80€ 22',
    '| LUB-LUB /15F618 | OLIO EDGE 5W30 C3 LT.1 | 16 13,00 Netto 208,00€ 22'
  ].join('\n');

  it('recupera prezzi effettivi e due righe usando solo colonne stampate coerenti', () => {
    const parsed = parseExpenseDocument(`${primaryOcr}\n${tableWithoutBlueInk}`);

    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines).toMatchObject([
      {
        code: '90601',
        description: 'ADESIVO ANGOLO MORTO',
        quantityMilli: 3000,
        unitPriceCents: 260,
        imponibileCents: 780
      },
      {
        code: '15F618',
        description: 'OLIO EDGE 5W30 C3 LT.1',
        quantityMilli: 16000,
        unitPriceCents: 1300,
        imponibileCents: 20800
      }
    ]);
    expect(needsMaintenancePriceRecovery(parsed)).toBe(false);
  });

  it('non trasforma targa e km manoscritti in assegnazioni automatiche', () => {
    const parsed = parseExpenseDocument(`${primaryOcr}\nZZ104ZZ 260.778 KM\n${tableWithoutBlueInk}`);
    expect(parsed.lines.every((line) => line.allocationType === 'GENERIC')).toBe(true);
  });
});

describe('parseExpenseDocument — nuovi fornitori e lavorazioni del fascicolo manutenzioni', () => {
  it('riconosce una fattura officina e conserva i dati anagrafici per creare il fornitore', () => {
    const parsed = parseExpenseDocument([
      'Officina Demo Beta S.R.L. P.IVA 00000000004',
      'Via Esempio 3 - Citta Demo (ZZ)',
      'FATTURA 15/07/2026 636/F',
      '0101 SOSTITUZIONE CINGHIA DI SERVIZIO E TENDICINGHIA NR 1 390,00 € 390,00 22',
      'SMALTIMENTO RIFIUTI TASSA FISSA NR 1 1,50 € 1,50 22',
      'Tot. documento 477,63'
    ].join('\n'));

    expect(parsed).toMatchObject({
      supplierName: 'Officina Demo Beta S.R.L.',
      documentNumber: '636/F',
      declaredTotalCents: 47763,
      suggestedCategoryName: 'Riparazioni'
    });
    expect(parsed.supplierDetails).toMatchObject({
      phone: '+39 000 0000002',
      email: 'officina@example.com',
      address: 'Via Esempio 3',
      city: 'Citta Demo',
      province: 'ZZ'
    });
    expect(parsed.lines.map((line) => line.imponibileCents)).toEqual([39000, 150]);
  });

  it('riconosce riparazione pneumatico e fornitore demo', () => {
    const parsed = parseExpenseDocument([
      'Pneumatici Demo Gamma SRL P.IVA 00000000008',
      'FATTURA 27/04/2026 494/2026',
      'RIP RIPARAZIONE 315/80 R 22,5 NR 1 40,98 € 40,98 22',
      'Tot. documento 50,00'
    ].join('\n'));

    expect(parsed.supplierName).toBe('Pneumatici Demo Gamma Srl');
    expect(parsed.documentNumber).toBe('494/2026');
    expect(parsed.suggestedCategoryName).toBe('Pneumatici');
    expect(parsed.lines[0]).toMatchObject({
      code: 'RIP',
      quantityMilli: 1000,
      unitPriceCents: 4098,
      imponibileCents: 4098
    });
  });

  it('mantiene una riga DDT senza prezzo affinché possa essere completata in revisione', () => {
    const parsed = parseExpenseDocument([
      'Ricambi Demo Delta P.IVA 00000000005',
      'DDT7/2099/00008 23/07/2026',
      '286-FAN 5AA047 FRONT PIPE 1 b 22'
    ].join('\n'));

    expect(parsed.lines[0]).toMatchObject({
      code: '5AA047',
      description: 'FRONT PIPE',
      quantityMilli: 1000,
      imponibileCents: 0
    });
  });
});

describe('parseExpenseDocument — pagine manutenzione sintetiche', () => {
  const pages = [
    [
      'SPARE PARTS FOR TRUCKS AND TRAILERS',
      'Via Esempio 2 - 00000 Citta Demo (ZZ)',
      'CF. Piva 00000000007',
      'DDT7/2099/00001 28/05/2026 1/1 23733 IT00000000001',
      'Marca Codice Art. Prod. Descrizione Qta Prezzo Net/Sc./Imp. Totale IVA',
      '| 528-MV #90185 KIT RIMORCHIO : 1 29,00, Netio 29,00€ 22'
    ].join('\n'),
    [
      'demo-ricambi-delta.example.com',
      'DDT7/2099/00002 28/05/2026 1/1 23733 IT00000000001',
      'ZZ 102',
      'Marca Codice Art. Prod. Descrizione Qta Prezzo Net/Sc./Imp. Totale IVA',
      '509-SP DEMO20877 SOSPENSIONI il 89,00 Netto 89,00€ 22'
    ].join('\n')
  ];

  it('riconosce entrambe le pagine e tollera gli errori OCR su codice, Netto e quantità', () => {
    const parsed = pages.map(parseExpenseDocument);

    expect(parsed.map((document) => document.supplierName)).toEqual([
      'Ricambi Demo Delta',
      'Ricambi Demo Delta'
    ]);
    expect(parsed.map((document) => document.documentNumber)).toEqual([
      'DDT7/2099/00001',
      'DDT7/2099/00002'
    ]);
    expect(parsed.map((document) => document.documentDate?.toISOString().slice(0, 10))).toEqual([
      '2026-05-28',
      '2026-05-28'
    ]);
    expect(parsed.map((document) => document.lines[0])).toMatchObject([
      {
        code: '90185',
        description: 'KIT RIMORCHIO',
        quantityMilli: 1000,
        unitPriceCents: 2900,
        imponibileCents: 2900,
        allocationType: 'GENERIC'
      },
      {
        code: 'DEMO20877',
        description: 'SOSPENSIONI',
        quantityMilli: 1000,
        unitPriceCents: 8900,
        imponibileCents: 8900,
        allocationType: 'GENERIC'
      }
    ]);
    expect(parsed.every(isConfidentMaintenanceExpense)).toBe(true);
  });

  it('non usa la targa manoscritta come allocazione automatica', () => {
    const parsed = parseExpenseDocument(pages[1]);
    expect(parsed.lines[0].allocationType).toBe('GENERIC');
    expect(parsed.lines[0].description).toBe('SOSPENSIONI');
  });
});

describe('parseExpenseDocument — fattura Pneumatici Demo sintetica', () => {
  const text = [
    'Pneumatici Demo S.R.L.',
    'Via Esempio 1 * 00000 Citta Demo (ZZ)',
    'Partita IVA: 00000000003',
    'Tel.: +39 000 0000000',
    'Email: pneumatici@example.com',
    '|FATTURA | 5948 29/07/2026 11/1 |',
    'Articolo Descrizione — Udm ata Prezzo Sconto IVA Imponibile',
    '3937000-ANTEO ANTEO 385/55R22.5TL 160KFRT M+S A.PRTS NR 2 290,0000 € 122 580,00 €',
    'CONTR_AMB_PFU CONT. AMB. ART. 228 D LGS 3/4/06 N. 152 NR 2 20,0000 € 122 40,00 €',
    '| Imponibile 620,00 € |',
    '| IVA 136,40 € |',
    '| Totale 756,40 € |'
  ].join('\n');

  it('applica il profilo registrato e ricostruisce entrambe le righe con i totali esatti', () => {
    const profile = parseRegisteredExpenseLayout(text);
    const parsed = parseExpenseDocument(text);

    expect(profile?.profileId).toBe('demo-pneumatici-invoice');
    expect(parsed).toMatchObject({
      supplierName: 'Pneumatici Demo S.R.L.',
      documentNumber: '5948',
      declaredTotalCents: 75640,
      suggestedCategoryName: 'Pneumatici',
      requiresVehicleAllocation: true
    });
    expect(parsed.documentDate?.toISOString().slice(0, 10)).toBe('2026-07-29');
    expect(parsed.supplierDetails).toMatchObject({
      phone: '+39 000 0000000',
      email: 'pneumatici@example.com',
      address: 'Via Esempio 1',
      postalCode: '00000',
      city: 'Citta Demo',
      province: 'ZZ'
    });
    expect(parsed.lines).toMatchObject([
      {
        code: '3937000-ANTEO',
        description: 'ANTEO 385/55R22.5TL 160KFRT M+S A.PRTS',
        quantityMilli: 2000,
        unitPriceCents: 29000,
        imponibileCents: 58000,
        vatRatePercent: 22,
        vatCents: 12760,
        totalCents: 70760,
        allocationType: 'GENERIC'
      },
      {
        code: 'CONTR_AMB_PFU',
        description: 'CONT. AMB. ART. 228 D LGS 3/4/06 N. 152',
        quantityMilli: 2000,
        unitPriceCents: 2000,
        imponibileCents: 4000,
        vatRatePercent: 22,
        vatCents: 880,
        totalCents: 4880,
        allocationType: 'GENERIC'
      }
    ]);
    expect(isConfidentMaintenanceExpense(parsed)).toBe(true);
    expect(needsMaintenancePriceRecovery(parsed)).toBe(false);
  });

  it('non accetta una riga se quantità per prezzo non coincide con l’imponibile stampato', () => {
    const inconsistentText = text.replace('580,00 €', '500,00 €');
    const parsed = parseRegisteredExpenseLayout(inconsistentText);

    expect(parsed?.lines).toHaveLength(1);
    expect(parsed?.lines[0].code).toBe('CONTR_AMB_PFU');
  });

  it('riusa la grammatica tabellare anche per un nuovo fornitore con lo stesso formato', () => {
    const parsed = parseRegisteredExpenseLayout(text
      .replace('Pneumatici Demo S.R.L.', 'OFFICINA ALFA S.R.L.')
      .replace('Partita IVA: 00000000003', 'Partita IVA: 01234567890'));

    expect(parsed?.profileId).toBe('italian-labeled-workshop-invoice');
    expect(parsed?.lines).toHaveLength(2);
  });
});

describe('parseExpenseDocument — fallback senza righe riconosciute', () => {
  const text = ['Officina Tuttofare', 'Riparazione varia', 'TOTALE 1.720,20'].join('\n');
  const parsed = parseExpenseDocument(text);

  it('crea una riga unica da compilare con il totale scorporato al 22%', () => {
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0].imponibileCents).toBe(141000); // 172020 / 1.22
    expect(parsed.lines[0].vatRatePercent).toBe(22);
    expect(parsed.lines[0].totalCents).toBe(172020);
    expect(parsed.declaredTotalCents).toBe(172020);
  });

  it('non aggancia un fornitore sconosciuto', () => {
    expect(parsed.supplierName).toBeNull();
  });

  it('non considera affidabile il fallback per l’instradamento automatico', () => {
    expect(isConfidentMaintenanceExpense(parsed)).toBe(false);
  });
});

describe('parseExpenseDocument — manutenzione WinSoftware', () => {
  const parsed = parseExpenseDocument([
    'Cedente/prestatore (fornitore) Cessionario/committente (cliente)',
    'Identificativo fiscale ai fini IVA: IT01234567890 Identificativo fiscale ai fini IVA: IT00000000001',
    'Codice fiscale: 01234567890 Denominazione: NFRP Demo S.R.L.',
    'Denominazione: OFFICINA ALFA SRL Indirizzo: VIA ESEMPIO 8',
    'Tipologia documento Art. 73 Numero documento Data documento Codice destinatario',
    'TD01 fattura DEMO884 18-07-2026 DEMO123',
    'Cod. articolo Descrizione Quantità Prezzo unitario UM %IVA Prezzo totale',
    '- (AswArtFor) SOSTITUZIONE FILTRI E OLIO 2,00 75,00 | 22,00 150,00',
    'RIEPILOGHI IVA E TOTALI',
    'Imposta bollo Sconto/Maggiorazione Arr. Totale documento',
    '183,00'
  ].join('\n'));

  it('prepara una bozza manutenzione con allocazione veicolo obbligatoria', () => {
    expect(parsed.supplierName).toBe('OFFICINA ALFA SRL');
    expect(parsed.documentNumber).toBe('DEMO884');
    expect(parsed.documentDate?.toISOString().slice(0, 10)).toBe('2026-07-18');
    expect(parsed.suggestedCategoryName).toBe('Manutenzioni');
    expect(parsed.requiresVehicleAllocation).toBe(true);
    expect(parsed.lines[0]).toMatchObject({
      description: 'SOSTITUZIONE FILTRI E OLIO',
      quantityMilli: 2000,
      unitPriceCents: 7500,
      imponibileCents: 15000,
      vatCents: 3300,
      totalCents: 18300
    });
  });
});
