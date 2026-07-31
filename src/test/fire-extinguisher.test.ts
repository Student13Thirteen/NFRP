import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIRE_EXTINGUISHER_RATES,
  calculateFireExtinguisherCost,
  findFireExtinguisherUnits,
  formatFireExtinguisherNotes,
  parseFireExtinguisherRates,
  serializeFireExtinguisherRates
} from '@/lib/fire-extinguisher';

describe('fire extinguisher document parsing', () => {
  it.each([
    {
      label: 'due estintori 12 e 2 kg',
      text: `
        RIMESSA IN EFFICIENZA ESTINTORI SECONDO UNI 9994.1
        Matricola 1096 2245
        Numero
        POLVERE 12 2
        capacita kg.
        installati sul vs automezzo targato GP 928 RR
      `,
      expected: [
        { serialNumber: '1096', capacityKg: 12 },
        { serialNumber: '2245', capacityKg: 2 }
      ]
    },
    {
      label: 'un estintore 6 kg sulla stessa riga',
      text: `
        REVISIONE ESTINTORI
        Matricola 25321
        Polvere 6
        capacità kg.
        installati sul Vs.automezzo targato XA 641 PP
      `,
      expected: [{ serialNumber: '25321', capacityKg: 6 }]
    },
    {
      label: 'due colonne 2 e 12 kg',
      text: `
        RICARICA DEGLI ESTINTORI
        Matricola 2558 12718
        Polvere 2 12
        capacità kg.
        installati sul Vs.automezzo targato GB 987 FJ
      `,
      expected: [
        { serialNumber: '2558', capacityKg: 2 },
        { serialNumber: '12718', capacityKg: 12 }
      ]
    },
    {
      label: 'matricola e peso su righe separate con OCR mirato',
      text: `
        RIMESSA IN EFFICIENZA ESTINTORI
        Matricola
        2023
        Polvere
        capacità kg.
        installati sul Vs.automezzo targato XA 453 RE
        OCR MIRATO TABELLA ESTINTORI
        Matricola 2023 - capacità 6 kg
      `,
      expected: [{ serialNumber: '2023', capacityKg: 6 }]
    },
    {
      label: 'seconda scheda con peso recuperato dal ritaglio',
      text: `
        REVISIONE ESTINTORI
        Matricola
        22569
        Polvere
        capacità kg.
        installati sul Vs.automezzo targato XA 319 SS
        OCR MIRATO TABELLA ESTINTORI
        Matricola 22569 - capacità 6 kg
      `,
      expected: [{ serialNumber: '22569', capacityKg: 6 }]
    },
    {
      label: 'due colonne 6 e 12 kg',
      text: `
        REVISIONE E RICARICA ESTINTORI
        Matricola 219899 186
        Polvere 6 12
        capacità kg.
        installati sul Vs.automezzo targato XA 633 PP
      `,
      expected: [
        { serialNumber: '219899', capacityKg: 6 },
        { serialNumber: '186', capacityKg: 12 }
      ]
    }
  ])('reads $label', ({ text, expected }) => {
    expect(findFireExtinguisherUnits(text)).toEqual(expected);
  });

  it('keeps the serial number but leaves an unread weight to human review', () => {
    expect(
      findFireExtinguisherUnits(`
        RIMESSA IN EFFICIENZA ESTINTORI
        Matricola 2023
        Polvere
        capacità kg.
        installati sul Vs.automezzo targato XA 453 RE
      `)
    ).toEqual([{ serialNumber: '2023', capacityKg: null }]);
  });
});

describe('fire extinguisher rates and costs', () => {
  it('uses the requested 2/6/12 kg defaults and sums every extinguisher', () => {
    const units = [
      { serialNumber: '1096', capacityKg: 12 },
      { serialNumber: '2245', capacityKg: 2 },
      { serialNumber: '25321', capacityKg: 6 }
    ];

    expect(calculateFireExtinguisherCost(units, DEFAULT_FIRE_EXTINGUISHER_RATES)).toBe(2600);
    expect(formatFireExtinguisherNotes(units, DEFAULT_FIRE_EXTINGUISHER_RATES)).toContain(
      'Totale servizio: 26,00'
    );
  });

  it('does not propose a partial cost when a weight or tariff is missing', () => {
    expect(
      calculateFireExtinguisherCost(
        [
          { serialNumber: '1', capacityKg: 6 },
          { serialNumber: '2', capacityKg: null }
        ],
        DEFAULT_FIRE_EXTINGUISHER_RATES
      )
    ).toBeNull();
    expect(
      calculateFireExtinguisherCost(
        [{ serialNumber: '3', capacityKg: 9 }],
        DEFAULT_FIRE_EXTINGUISHER_RATES
      )
    ).toBeNull();
  });

  it('round-trips editable rates and falls back safely on invalid settings', () => {
    const changed = [
      { capacityKg: 2, priceCents: 550 },
      { capacityKg: 6, priceCents: 850 },
      { capacityKg: 12, priceCents: 1400 }
    ];
    expect(parseFireExtinguisherRates(serializeFireExtinguisherRates(changed))).toEqual(changed);
    expect(parseFireExtinguisherRates('not-json')).toEqual(DEFAULT_FIRE_EXTINGUISHER_RATES);
  });
});
