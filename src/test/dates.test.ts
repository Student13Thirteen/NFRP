import { describe, expect, it } from 'vitest';
import { daysUntil, formatDate, toDateInputValue } from '@/lib/dates';

describe('date helpers', () => {
  it('calculates remaining days by calendar date', () => {
    expect(daysUntil(new Date('2026-05-20T23:00:00'), new Date('2026-05-15T01:00:00'))).toBe(5);
  });

  it('formats date input values', () => {
    expect(toDateInputValue(new Date('2026-05-15T00:00:00.000Z'))).toBe('2026-05-15');
  });

  it('formats dates in Italian calendar format', () => {
    expect(formatDate(new Date('2026-06-14T00:00:00.000Z'))).toBe('14/06/2026');
  });

  it('keeps date-only values stable around UTC offsets', () => {
    expect(formatDate(new Date('2026-06-13T22:00:00.000Z'))).toBe('13/06/2026');
    expect(toDateInputValue(new Date('2026-06-14T00:00:00.000Z'))).toBe('2026-06-14');
  });

  it('formats missing dates with placeholder', () => {
    expect(formatDate(null)).toBe('-');
  });
});
