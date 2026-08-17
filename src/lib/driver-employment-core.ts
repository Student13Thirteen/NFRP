import { DriverEmploymentEndReason } from '@prisma/client';
import { applicationDateKey, assignmentDateKey } from '@/lib/driver-assignment-core';

export type DriverEmploymentSummary = 'EMPLOYED' | 'PLANNED' | 'ENDED' | 'NOT_RECORDED';

export type DriverEmploymentPeriodLike = {
  id?: string;
  startDate: Date | string;
  endDate: Date | string | null;
};

export function employmentPeriodsOverlap(
  left: DriverEmploymentPeriodLike,
  right: DriverEmploymentPeriodLike
): boolean {
  const leftFrom = assignmentDateKey(left.startDate);
  const leftTo = left.endDate ? assignmentDateKey(left.endDate) : '9999-12-31';
  const rightFrom = assignmentDateKey(right.startDate);
  const rightTo = right.endDate ? assignmentDateKey(right.endDate) : '9999-12-31';
  return Boolean(leftFrom && rightFrom && leftFrom <= rightTo && rightFrom <= leftTo);
}

export function getDriverEmploymentPeriodStatus(
  period: DriverEmploymentPeriodLike,
  today: Date | string = new Date()
): 'CURRENT' | 'FUTURE' | 'PAST' {
  const current = applicationDateKey(today);
  const from = assignmentDateKey(period.startDate);
  const to = period.endDate ? assignmentDateKey(period.endDate) : null;
  if (from > current) return 'FUTURE';
  if (to && to < current) return 'PAST';
  return 'CURRENT';
}

export function getDriverEmploymentSummary(
  periods: DriverEmploymentPeriodLike[],
  today: Date | string = new Date()
): DriverEmploymentSummary {
  if (periods.some((period) => getDriverEmploymentPeriodStatus(period, today) === 'CURRENT')) return 'EMPLOYED';
  if (periods.some((period) => getDriverEmploymentPeriodStatus(period, today) === 'FUTURE')) return 'PLANNED';
  if (periods.length > 0) return 'ENDED';
  return 'NOT_RECORDED';
}

export function getDriverEmploymentSummaryLabel(summary: DriverEmploymentSummary): string {
  return {
    EMPLOYED: 'In forza',
    PLANNED: 'Assunzione programmata',
    ENDED: 'Rapporto concluso',
    NOT_RECORDED: 'Periodo non registrato'
  }[summary];
}

export function getDriverEmploymentEndReasonLabel(reason: DriverEmploymentEndReason): string {
  return {
    RESIGNATION: 'Dimissioni',
    DISMISSAL: 'Licenziamento',
    PROBATION_FAILED: 'Mancato superamento del periodo di prova',
    CONTRACT_ENDED: 'Termine del contratto',
    OTHER: 'Altra cessazione'
  }[reason];
}
