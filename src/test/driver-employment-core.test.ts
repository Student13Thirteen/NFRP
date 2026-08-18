import { describe, expect, it } from 'vitest';
import {
  employmentPeriodsOverlap,
  getDriverEmploymentPeriodStatus,
  getDriverEmploymentSummary,
  getDriverEmploymentSummaryLabel
} from '@/lib/driver-employment-core';

describe('storico assunzione autisti', () => {
  const current = { startDate: '2026-01-01', endDate: null };

  it('considera inclusive le date e impedisce periodi sovrapposti', () => {
    expect(employmentPeriodsOverlap(current, { startDate: '2026-08-17', endDate: '2026-09-01' })).toBe(true);
    expect(employmentPeriodsOverlap(
      { startDate: '2025-01-01', endDate: '2025-12-31' },
      { startDate: '2026-01-01', endDate: null }
    )).toBe(false);
  });

  it('distingue rapporti in corso, programmati e conclusi', () => {
    expect(getDriverEmploymentPeriodStatus(current, '2026-08-17')).toBe('CURRENT');
    expect(getDriverEmploymentPeriodStatus({ startDate: '2026-09-01', endDate: null }, '2026-08-17')).toBe('FUTURE');
    expect(getDriverEmploymentPeriodStatus({ startDate: '2025-01-01', endDate: '2025-12-31' }, '2026-08-17')).toBe('PAST');
  });

  it('calcola il riepilogo dello storico senza confonderlo con il flag operativo', () => {
    expect(getDriverEmploymentSummary([], '2026-08-17')).toBe('NOT_RECORDED');
    expect(getDriverEmploymentSummary([current], '2026-08-17')).toBe('EMPLOYED');
    expect(getDriverEmploymentSummary([{ startDate: '2027-01-01', endDate: null }], '2026-08-17')).toBe('PLANNED');
    expect(getDriverEmploymentSummary([{ startDate: '2025-01-01', endDate: '2025-12-31' }], '2026-08-17')).toBe('ENDED');
    expect(getDriverEmploymentSummaryLabel('PLANNED')).toBe('Assunzione programmata');
    expect(getDriverEmploymentSummaryLabel('NOT_RECORDED')).toBe('Periodo non registrato');
  });

  it('usa il giorno italiano per lo stato del rapporto di lavoro', () => {
    const oneAmInRome = new Date('2026-08-17T23:00:00.000Z');

    expect(getDriverEmploymentPeriodStatus({ startDate: '2026-08-18', endDate: null }, oneAmInRome)).toBe('CURRENT');
    expect(getDriverEmploymentPeriodStatus({ startDate: '2026-08-01', endDate: '2026-08-17' }, oneAmInRome)).toBe('PAST');
  });
});
