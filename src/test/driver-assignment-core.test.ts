import { describe, expect, it } from 'vitest';
import {
  assignmentCoversDate,
  assignmentPeriodsOverlap,
  findDatedDriverAssignment,
  getDriverAssignmentStatus
} from '@/lib/driver-assignment-core';

const assignment = {
  id: 'assignment-1',
  tractorId: 'tractor-1',
  driverId: 'driver-1',
  validFrom: '2026-08-01',
  validTo: '2026-08-15'
};

describe('dated tractor-driver assignments', () => {
  it('treats both ends of the interval as inclusive', () => {
    expect(assignmentCoversDate(assignment, '2026-08-01')).toBe(true);
    expect(assignmentCoversDate(assignment, '2026-08-15')).toBe(true);
    expect(assignmentCoversDate(assignment, '2026-08-16')).toBe(false);
  });

  it('resolves the driver only for the requested tractor and date', () => {
    expect(findDatedDriverAssignment([assignment], 'tractor-1', '2026-08-10')?.driverId).toBe('driver-1');
    expect(findDatedDriverAssignment([assignment], 'tractor-2', '2026-08-10')).toBeNull();
  });

  it('detects collisions, including open-ended periods', () => {
    expect(assignmentPeriodsOverlap(assignment, { validFrom: '2026-08-15', validTo: null })).toBe(true);
    expect(assignmentPeriodsOverlap(assignment, { validFrom: '2026-08-16', validTo: null })).toBe(false);
  });

  it('provides current, future and past status labels deterministically', () => {
    expect(getDriverAssignmentStatus(assignment, '2026-08-10')).toBe('CURRENT');
    expect(getDriverAssignmentStatus(assignment, '2026-07-31')).toBe('FUTURE');
    expect(getDriverAssignmentStatus(assignment, '2026-08-16')).toBe('PAST');
  });

  it('calcola oggi nel fuso operativo italiano anche dopo mezzanotte locale', () => {
    const oneAmInRome = new Date('2026-08-17T23:00:00.000Z');

    expect(getDriverAssignmentStatus({ ...assignment, validFrom: '2026-08-18', validTo: null }, oneAmInRome)).toBe('CURRENT');
    expect(getDriverAssignmentStatus({ ...assignment, validFrom: '2026-08-01', validTo: '2026-08-17' }, oneAmInRome)).toBe('PAST');
  });
});
