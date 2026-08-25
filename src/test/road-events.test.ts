import { describe, expect, it } from 'vitest';
import {
  getRoadAccidentAccountingMovements,
  getRoadFineAccountingMovement,
  getRoadFineStatusLabel,
  roadEventMoneyInput
} from '@/lib/road-events-core';

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
