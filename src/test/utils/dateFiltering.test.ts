/**
 * Date-range filtering tests.
 *
 * Every list screen (invoices, expenses, payments) and the reports run through
 * these: `getDateRangeForPeriod` turns the dropdown selection into bounds, and
 * `filterByDateRange` decides which records the user actually sees. An
 * off-by-one at a boundary silently hides or double-counts money.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getDefaultDateRange,
  getDateRangeForPeriod,
  filterByDateRange,
  formatDateRangeLabel,
  dateRangeFilterOptions,
  type DateRangePeriod
} from '@/utils/data/filtering.util';

// Pinned "now" so period maths is deterministic: Wed 15 Jul 2026, midday local.
const NOW = new Date(2026, 6, 15, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const ALL_PERIODS: DateRangePeriod[] = [
  'today', 'yesterday', 'this_week', 'last_week', 'this_month',
  'last_month', 'this_quarter', 'last_quarter', 'this_year', 'last_year', 'custom'
];

describe('getDefaultDateRange', () => {
  it('spans the current calendar month', () => {
    const { start, end } = getDefaultDateRange();
    expect(start.getMonth()).toBe(6);
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(6);
    expect(end.getDate()).toBe(31);
  });
});

describe('getDateRangeForPeriod', () => {
  it('starts today at midnight and ends before midnight', () => {
    const { start, end } = getDateRangeForPeriod('today');
    expect(start.getDate()).toBe(15);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(15);
    expect(end.getHours()).toBe(23);
  });

  it('covers the whole current year', () => {
    const { start, end } = getDateRangeForPeriod('this_year');
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(0);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(11);
    expect(end.getDate()).toBe(31);
  });

  it('covers the whole previous year', () => {
    const { start, end } = getDateRangeForPeriod('last_year');
    expect(start.getFullYear()).toBe(2025);
    expect(end.getFullYear()).toBe(2025);
    expect(end.getMonth()).toBe(11);
  });

  it('returns start <= end for every period', () => {
    for (const period of ALL_PERIODS) {
      const { start, end } = getDateRangeForPeriod(period);
      expect(start.getTime()).toBeLessThanOrEqual(end.getTime());
    }
  });

  it('returns real dates for every period', () => {
    for (const period of ALL_PERIODS) {
      const { start, end } = getDateRangeForPeriod(period);
      expect(Number.isNaN(start.getTime())).toBe(false);
      expect(Number.isNaN(end.getTime())).toBe(false);
    }
  });

  it('falls back to the current month for an unrecognised period', () => {
    const fallback = getDateRangeForPeriod('nonsense' as DateRangePeriod);
    const thisMonth = getDefaultDateRange();
    expect(fallback.start.getTime()).toBe(thisMonth.start.getTime());
  });

  it('places today inside the current-period ranges', () => {
    for (const period of ['today', 'this_week', 'this_month', 'this_quarter', 'this_year'] as DateRangePeriod[]) {
      const { start, end } = getDateRangeForPeriod(period);
      expect(NOW.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(NOW.getTime()).toBeLessThanOrEqual(end.getTime());
    }
  });

  it('keeps last_* ranges entirely before today', () => {
    for (const period of ['yesterday', 'last_week', 'last_month', 'last_quarter', 'last_year'] as DateRangePeriod[]) {
      const { end } = getDateRangeForPeriod(period);
      expect(end.getTime()).toBeLessThan(NOW.getTime());
    }
  });
});

describe('filterByDateRange', () => {
  const range = { start: new Date(2026, 6, 1), end: new Date(2026, 6, 31, 23, 59, 59) };

  const rows = [
    { id: 1, date: '2026-06-30' }, // before
    { id: 2, date: '2026-07-01' }, // first day
    { id: 3, date: '2026-07-15' }, // middle
    { id: 4, date: '2026-07-31' }, // last day
    { id: 5, date: '2026-08-01' }  // after
  ];

  it('includes both boundary days', () => {
    const ids = filterByDateRange(rows, range).map(r => r.id);
    expect(ids).toContain(2);
    expect(ids).toContain(4);
  });

  it('excludes records outside the range', () => {
    const ids = filterByDateRange(rows, range).map(r => r.id);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(5);
  });

  it('filters on an alternative date field', () => {
    const invoices = [
      { id: 1, created_at: '2026-07-10' },
      { id: 2, created_at: '2026-09-10' }
    ];
    expect(filterByDateRange(invoices, range, 'created_at').map(r => r.id)).toEqual([1]);
  });

  it('drops records with no value in the chosen field', () => {
    const mixed = [{ id: 1, date: '2026-07-10' }, { id: 2, date: undefined }];
    expect(filterByDateRange(mixed, range).map(r => r.id)).toEqual([1]);
  });

  it('returns everything when the range is incomplete', () => {
    const openEnded = { start: undefined as unknown as Date, end: undefined as unknown as Date };
    expect(filterByDateRange(rows, openEnded)).toHaveLength(rows.length);
  });

  it('handles an empty list', () => {
    expect(filterByDateRange([], range)).toEqual([]);
  });

  it('accepts ISO timestamps, not just calendar dates', () => {
    const stamped = [{ id: 1, date: '2026-07-15T13:45:00.000Z' }];
    expect(filterByDateRange(stamped, range)).toHaveLength(1);
  });

  it('does not mutate the input array', () => {
    const input = [...rows];
    filterByDateRange(input, range);
    expect(input).toHaveLength(rows.length);
  });
});

describe('formatDateRangeLabel', () => {
  it('labels every supported period', () => {
    for (const period of ALL_PERIODS) {
      const label = formatDateRangeLabel(period);
      expect(label).not.toBe('Unknown Period');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('falls back for an unrecognised period', () => {
    expect(formatDateRangeLabel('nonsense' as DateRangePeriod)).toBe('Unknown Period');
  });
});

describe('dateRangeFilterOptions', () => {
  it('every option value is a period the range builder understands', () => {
    for (const option of dateRangeFilterOptions) {
      expect(ALL_PERIODS).toContain(option.value);
    }
  });

  it('every option label matches formatDateRangeLabel', () => {
    for (const option of dateRangeFilterOptions) {
      expect(option.label).toBe(formatDateRangeLabel(option.value));
    }
  });
});
