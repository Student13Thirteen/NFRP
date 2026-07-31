import { describe, expect, it } from 'vitest';
import { buildDateFilterYears, getDatePartValue, parseFilterDateParts } from '@/lib/date-filters';

describe('date filters', () => {
  it('parses complete day, month and year parameters', () => {
    expect(
      parseFilterDateParts({ fromDay: '29', fromMonth: '2', fromYear: '2024' }, 'from')?.toISOString()
    ).toBe('2024-02-29T00:00:00.000Z');
  });

  it('rejects incomplete or impossible dates', () => {
    expect(parseFilterDateParts({ fromDay: '10', fromMonth: '6' }, 'from')).toBeNull();
    expect(parseFilterDateParts({ toDay: '31', toMonth: '2', toYear: '2026' }, 'to')).toBeNull();
  });

  it('keeps compatibility with old ISO query parameters', () => {
    const date = parseFilterDateParts({ from: '2026-05-31' }, 'from');
    expect(date?.toISOString()).toBe('2026-05-31T00:00:00.000Z');
    expect(getDatePartValue(date, 'day')).toBe('31');
    expect(getDatePartValue(date, 'month')).toBe('5');
    expect(getDatePartValue(date, 'year')).toBe('2026');
  });

  it('includes years found in data alongside the current period', () => {
    const years = buildDateFilterYears([new Date('2022-01-01T00:00:00.000Z')]);
    expect(years).toContain(2022);
    expect(years).toContain(new Date().getFullYear());
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });
});
