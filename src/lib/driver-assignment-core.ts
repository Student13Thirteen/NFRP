export type DatedDriverAssignment = {
  id?: string;
  tractorId: string;
  driverId: string;
  validFrom: Date | string;
  validTo: Date | string | null;
  driver?: {
    firstName: string;
    lastName: string;
  };
};

const applicationDateFormatter = new Intl.DateTimeFormat('en', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export function assignmentDateKey(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] || '';
}

export function applicationDateKey(value: Date | string): string {
  if (typeof value === 'string') return assignmentDateKey(value);
  const parts = applicationDateFormatter.formatToParts(value);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : '';
}

export function assignmentCoversDate(
  assignment: Pick<DatedDriverAssignment, 'validFrom' | 'validTo'>,
  date: Date | string
): boolean {
  const target = assignmentDateKey(date);
  const from = assignmentDateKey(assignment.validFrom);
  const to = assignment.validTo ? assignmentDateKey(assignment.validTo) : null;
  return Boolean(target && from && from <= target && (!to || to >= target));
}

export function findDatedDriverAssignment<T extends DatedDriverAssignment>(
  assignments: T[],
  tractorId: string | null | undefined,
  date: Date | string | null | undefined
): T | null {
  if (!tractorId || !date) return null;

  return (
    assignments
      .filter((assignment) => assignment.tractorId === tractorId && assignmentCoversDate(assignment, date))
      .sort((left, right) => assignmentDateKey(right.validFrom).localeCompare(assignmentDateKey(left.validFrom)))[0] || null
  );
}

export function assignmentPeriodsOverlap(
  left: Pick<DatedDriverAssignment, 'validFrom' | 'validTo'>,
  right: Pick<DatedDriverAssignment, 'validFrom' | 'validTo'>
): boolean {
  const leftFrom = assignmentDateKey(left.validFrom);
  const leftTo = left.validTo ? assignmentDateKey(left.validTo) : '9999-12-31';
  const rightFrom = assignmentDateKey(right.validFrom);
  const rightTo = right.validTo ? assignmentDateKey(right.validTo) : '9999-12-31';
  return Boolean(leftFrom && rightFrom && leftFrom <= rightTo && rightFrom <= leftTo);
}

export function getDriverAssignmentStatus(
  assignment: Pick<DatedDriverAssignment, 'validFrom' | 'validTo'>,
  today: Date | string = new Date()
): 'CURRENT' | 'FUTURE' | 'PAST' {
  const current = applicationDateKey(today);
  const from = assignmentDateKey(assignment.validFrom);
  const to = assignment.validTo ? assignmentDateKey(assignment.validTo) : null;
  if (from > current) return 'FUTURE';
  if (to && to < current) return 'PAST';
  return 'CURRENT';
}
