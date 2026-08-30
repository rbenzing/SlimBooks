import { describe, it, expect } from 'vitest';
import {
  getDateRangeForPeriod,
  toCalendarDay,
  fiscalYearLabel
} from '@/utils/data/period.util';

/** Fixed "today" so no test mocks the clock. Tue 12 Aug 2026, local midday. */
const TODAY = new Date(2026, 7, 12, 12, 0, 0);

const range = (period: Parameters<typeof getDateRangeForPeriod>[0], fyStart: number) => {
  const r = getDateRangeForPeriod(period, fyStart, TODAY);
  return `${toCalendarDay(r.start)}..${toCalendarDay(r.end)}`;
};

describe('getDateRangeForPeriod — calendar year (fiscal year starts in January)', () => {
  it('this_month runs from the 1st to today, never into the future', () => {
    expect(range('this_month', 1)).toBe('2026-08-01..2026-08-12');
  });

  it('last_month is the whole previous month', () => {
    expect(range('last_month', 1)).toBe('2026-07-01..2026-07-31');
  });

  it('this_quarter is Q3 to date', () => {
    expect(range('this_quarter', 1)).toBe('2026-07-01..2026-08-12');
  });

  it('last_quarter is the whole of Q2', () => {
    expect(range('last_quarter', 1)).toBe('2026-04-01..2026-06-30');
  });

  it('this_year runs from 1 January to today, not to 31 December', () => {
    expect(range('this_year', 1)).toBe('2026-01-01..2026-08-12');
  });

  it('last_year is the whole previous year', () => {
    expect(range('last_year', 1)).toBe('2025-01-01..2025-12-31');
  });
});

describe('getDateRangeForPeriod — fiscal year starting in July', () => {
  // 12 Aug 2026 falls in the fiscal year that opened 1 Jul 2026 — FY2027,
  // named for the year it ends in.
  it('this_year opens on 1 July of the current calendar year', () => {
    expect(range('this_year', 7)).toBe('2026-07-01..2026-08-12');
  });

  it('last_year is the whole preceding fiscal year', () => {
    expect(range('last_year', 7)).toBe('2025-07-01..2026-06-30');
  });

  it('this_quarter is fiscal Q1, July to September, to date', () => {
    expect(range('this_quarter', 7)).toBe('2026-07-01..2026-08-12');
  });

  it('last_quarter is the final quarter of the preceding fiscal year', () => {
    // FY2026 ran Jul 2025 - Jun 2026, so its Q4 was Apr-Jun 2026.
    expect(range('last_quarter', 7)).toBe('2026-04-01..2026-06-30');
  });
});

describe('getDateRangeForPeriod — fiscal year starting in October', () => {
  it('a quarter that straddles the calendar year end is one range', () => {
    // FY starts 1 Oct. On 12 Aug 2026 we are in FY2026 Q4 (Jul-Sep 2026).
    expect(range('this_quarter', 10)).toBe('2026-07-01..2026-08-12');
    expect(range('last_quarter', 10)).toBe('2026-04-01..2026-06-30');
    expect(range('this_year', 10)).toBe('2025-10-01..2026-08-12');
  });
});

describe('toCalendarDay', () => {
  it('builds the day from local parts, never through toISOString', () => {
    // A local midnight that is the previous day in UTC for any positive offset.
    expect(toCalendarDay(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('pads single-digit months and days', () => {
    expect(toCalendarDay(new Date(2026, 2, 5))).toBe('2026-03-05');
  });

  it('handles a leap day', () => {
    expect(toCalendarDay(new Date(2028, 1, 29))).toBe('2028-02-29');
  });
});

describe('fiscalYearLabel', () => {
  it('names a January fiscal year after its own calendar year', () => {
    expect(fiscalYearLabel('this_year', 1, TODAY)).toBe('2026');
  });

  it('names a July fiscal year after the year it ends in', () => {
    expect(fiscalYearLabel('this_year', 7, TODAY)).toBe('FY2027');
  });

  it('names the previous July fiscal year', () => {
    expect(fiscalYearLabel('last_year', 7, TODAY)).toBe('FY2026');
  });
});
