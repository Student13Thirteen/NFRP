import { describe, expect, it } from 'vitest';
import {
  expenseDriverName,
  findAutomaticExpenseDriver,
  tractorIdForExpenseAllocation
} from '@/lib/expense-driver';

const assignments = [
  {
    id: 'assignment-old',
    tractorId: 'tractor-1',
    driverId: 'driver-old',
    validFrom: '2026-01-01',
    validTo: '2026-06-30',
    driver: { firstName: 'Mario', lastName: 'Rossi' }
  },
  {
    id: 'assignment-current',
    tractorId: 'tractor-1',
    driverId: 'driver-current',
    validFrom: '2026-07-01',
    validTo: null,
    driver: { firstName: 'Luca', lastName: 'Bianchi' }
  }
];

const trailerLinks = [{ trailerId: 'trailer-1', tractorId: 'tractor-1' }];

describe('autista automatico delle manutenzioni', () => {
  it('usa direttamente il trattore selezionato', () => {
    expect(tractorIdForExpenseAllocation('TRACTOR:tractor-1', trailerLinks)).toBe('tractor-1');
  });

  it('per un semirimorchio passa dal trattore associato', () => {
    expect(tractorIdForExpenseAllocation('TRAILER:trailer-1', trailerLinks)).toBe('tractor-1');
    expect(findAutomaticExpenseDriver(assignments, trailerLinks, 'TRAILER:trailer-1', '2026-08-18')?.driverId)
      .toBe('driver-current');
  });

  it('rispetta il periodo valido alla data della manutenzione', () => {
    const assignment = findAutomaticExpenseDriver(
      assignments,
      trailerLinks,
      'TRACTOR:tractor-1',
      '2026-05-10'
    );
    expect(assignment?.driverId).toBe('driver-old');
    expect(assignment?.driver && expenseDriverName(assignment.driver)).toBe('Rossi Mario');
  });
});
