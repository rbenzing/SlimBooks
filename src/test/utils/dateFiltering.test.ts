/**
 * Date-range filtering tests.
 *
 * `filterByDateRange` decides which records a list screen or report actually
 * shows for a given range; an off-by-one at a boundary silently hides or
 * double-counts money. Period-builder coverage (`getDateRangeForPeriod`,
 * `formatDateRangeLabel`, `dateRangeFilterOptions`) moved to
 * `src/test/utils/period.test.ts` alongside the fiscal-year-aware module that
 * replaced `getDefaultDateRange`/`getDateRangeForPeriod` in `filtering.util.ts`.
 */

import { describe, it, expect } from 'vitest';
import { filterByDateRange } from '@/utils/data/filtering.util';

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
      { id: 1, created_at: Date.parse('2026-07-10') },
      { id: 2, created_at: Date.parse('2026-09-10') }
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
