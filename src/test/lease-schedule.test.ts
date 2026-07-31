import { describe, expect, it } from 'vitest';
import { buildLeaseSchedule } from '@/lib/lease-schedule';

describe('buildLeaseSchedule', () => {
  it('genera anticipo e canoni mensili senza perdere il giorno a fine mese', () => {
    const rows = buildLeaseSchedule({
      startDate: new Date(Date.UTC(2026, 0, 31)),
      advancePaymentNetCents: 880_000,
      recurringPaymentNetCents: 248_500,
      recurringInstallmentCount: 2,
      frequencyMonths: 1,
      vatRatePercent: 22
    });

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.kind)).toEqual(['ADVANCE', 'REGULAR', 'REGULAR']);
    expect(rows.map((row) => row.dueDate.toISOString().slice(0, 10))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31'
    ]);
    expect(rows[1].vatCents).toBe(54_670);
    expect(rows[1].grossAmountCents).toBe(303_170);
  });
});
