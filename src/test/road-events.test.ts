import { describe, expect, it } from 'vitest';
import {
  assertRoadFineImportValidation,
  withInactiveLinkedOption,
  getRoadAccidentAccountingMovements,
  getRoadFineAccountingMovement,
  getRoadFineStatusLabel,
  roadEventMoneyInput
} from '@/lib/road-events-core';

describe('validazione delle bozze verbali acquisite', () => {
  it('blocca una bozza importata che resta Da controllare', () => {
    expect(() => assertRoadFineImportValidation({
      source: 'IMPORT', currentStatus: 'TO_REVIEW', nextStatus: 'TO_REVIEW', acknowledged: true
    })).toThrow('stato operativo diverso');
  });

  it('richiede la conferma esplicita prima della promozione', () => {
    expect(() => assertRoadFineImportValidation({
      source: 'IMPORT', currentStatus: 'TO_REVIEW', nextStatus: 'TO_PAY', acknowledged: false
    })).toThrow('Conferma di avere controllato');
  });

  it('riconosce la validazione completata senza interferire con i verbali manuali', () => {
    expect(assertRoadFineImportValidation({
      source: 'IMPORT', currentStatus: 'TO_REVIEW', nextStatus: 'TO_PAY', acknowledged: true
    })).toBe(true);
    expect(assertRoadFineImportValidation({
      source: 'MANUAL', currentStatus: 'TO_REVIEW', nextStatus: 'TO_REVIEW', acknowledged: false
    })).toBe(false);
  });
});

describe('opzioni di mezzi e autisti nella scheda verbale', () => {
  const active = [{ id: 'tractor-1', label: 'AA111AA \u00b7 Iveco' }];

  it('mantiene selezionabile il mezzo collegato anche se non piu attivo', () => {
    expect(withInactiveLinkedOption(active, { id: 'tractor-9', label: 'ZZ999ZZ \u00b7 Scania' })).toEqual([
      { id: 'tractor-1', label: 'AA111AA \u00b7 Iveco' },
      { id: 'tractor-9', label: 'ZZ999ZZ \u00b7 Scania \u00b7 non attivo' }
    ]);
  });

  it('non duplica un mezzo gia presente tra gli attivi e regge il valore assente', () => {
    expect(withInactiveLinkedOption(active, { id: 'tractor-1', label: 'AA111AA \u00b7 Iveco' })).toEqual(active);
    expect(withInactiveLinkedOption(active, null)).toEqual(active);
  });
});

describe('regole contabili di verbali e sinistri', () => {
  it('non registra nel centro costi un verbale soltanto proposto o senza data di pagamento', () => {
    expect(getRoadFineAccountingMovement({ status: 'TO_PAY', paidAmountCents: 9500, paymentDate: new Date('2026-08-24') })).toBeNull();
    expect(getRoadFineAccountingMovement({ status: 'PAID', paidAmountCents: 9500, paymentDate: null })).toBeNull();
  });

  it('registra il solo importo effettivamente pagato del verbale', () => {
    const paymentDate = new Date('2026-08-24');
    expect(getRoadFineAccountingMovement({ status: 'PAID', paidAmountCents: 9500, paymentDate })).toEqual({
      date: paymentDate,
      amountCents: 9500
    });
  });

  it('ignora stime e franchigie e separa costo reale e rimborso del sinistro', () => {
    const costDate = new Date('2026-08-20');
    const reimbursementDate = new Date('2026-08-23');
    expect(getRoadAccidentAccountingMovements({
      status: 'CLAIM_OPEN',
      directCostCents: 120000,
      directCostDate: costDate,
      reimbursementCents: 80000,
      reimbursementDate
    })).toEqual([
      { kind: 'DIRECT_COST', direction: 'COST', date: costDate, amountCents: 120000 },
      { kind: 'REIMBURSEMENT', direction: 'REVENUE', date: reimbursementDate, amountCents: 80000 }
    ]);
  });

  it('esclude completamente un sinistro annullato', () => {
    expect(getRoadAccidentAccountingMovements({
      status: 'CANCELLED',
      directCostCents: 120000,
      directCostDate: new Date('2026-08-20'),
      reimbursementCents: 80000,
      reimbursementDate: new Date('2026-08-23')
    })).toEqual([]);
  });

  it('mantiene etichette italiane e valori monetari editabili coerenti', () => {
    expect(getRoadFineStatusLabel('TO_REVIEW')).toBe('Da controllare');
    expect(roadEventMoneyInput(12345)).toBe('123.45');
    expect(roadEventMoneyInput(null)).toBe('');
  });
});
