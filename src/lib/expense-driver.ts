import { findDatedDriverAssignment, type DatedDriverAssignment } from '@/lib/driver-assignment-core';

export const EXPENSE_DRIVER_AUTO = 'AUTO';
export const EXPENSE_DRIVER_NONE = 'NONE';

export type ExpenseDriverOption = {
  id: string;
  label: string;
  active?: boolean;
};

export type TrailerTractorLink = {
  trailerId: string;
  tractorId: string | null;
};

export function tractorIdForExpenseAllocation(
  allocationKey: string | null | undefined,
  trailerTractorLinks: TrailerTractorLink[]
): string | null {
  const [kind, id] = (allocationKey || '').split(':');
  if (kind === 'TRACTOR' && id) return id;
  if (kind !== 'TRAILER' || !id) return null;
  return trailerTractorLinks.find((link) => link.trailerId === id)?.tractorId || null;
}

export function findAutomaticExpenseDriver<T extends DatedDriverAssignment>(
  assignments: T[],
  trailerTractorLinks: TrailerTractorLink[],
  allocationKey: string | null | undefined,
  date: Date | string | null | undefined
): T | null {
  return findDatedDriverAssignment(
    assignments,
    tractorIdForExpenseAllocation(allocationKey, trailerTractorLinks),
    date
  );
}

export function expenseDriverName(driver: { firstName: string; lastName: string }): string {
  return `${driver.lastName} ${driver.firstName}`.trim();
}
