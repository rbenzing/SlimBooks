import { describe, it, expect } from 'vitest';
import {
  getDateRangeForPeriod,
  toCalendarDay,
  fiscalYearLabel,
  formatDateRangeLabel,
  dateRangeFilterOptions,
  type DateRangePeriod
} from '@/utils/data/period.util';

/** Fixed "today" so no test mocks the clock. Wed 12 Aug 2026, local midday. */
const TODAY = new Date(2026, 7, 12, 12, 0, 0);

const ALL_PERIODS: DateRangePeriod[] = [
  'today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month',
  'this_quarter', 'last_quarter', 'this_year', 'last_year', 'custom'
];

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

describe('getDateRangeForPeriod — today, yesterday, week, and custom', () => {
  // These are fiscal-year agnostic, so fyStart is fixed at 1 throughout.
  it('today is just today', () => {
    expect(range('today', 1)).toBe('2026-08-12..2026-08-12');
  });

  it('yesterday is just yesterday', () => {
    expect(range('yesterday', 1)).toBe('2026-08-11..2026-08-11');
  });

  it('this_week starts on Sunday and runs to today', () => {
    // TODAY is a Wednesday (getDay() === 3), so the week started 3 days earlier.
    expect(TODAY.getDay()).toBe(3);
    expect(range('this_week', 1)).toBe('2026-08-09..2026-08-12');
  });

  it('last_week is the whole preceding Sunday-to-Saturday week', () => {
    expect(range('last_week', 1)).toBe('2026-08-02..2026-08-08');
  });

  it('custom returns the current month, since callers supply their own range', () => {
    expect(range('custom', 1)).toBe('2026-08-01..2026-08-12');
  });
});

describe('getDateRangeForPeriod — invariants across every period', () => {
  const CURRENT_PERIODS: DateRangePeriod[] = ['today', 'this_week', 'this_month', 'this_quarter', 'this_year', 'custom'];
  const COMPLETED_PERIODS: DateRangePeriod[] = ['yesterday', 'last_week', 'last_month', 'last_quarter', 'last_year'];

  it('never returns start after end', () => {
    for (const period of ALL_PERIODS) {
      const { start, end } = getDateRangeForPeriod(period, 1, TODAY);
      expect(start.getTime()).toBeLessThanOrEqual(end.getTime());
    }
  });

  it('always returns real dates', () => {
    for (const period of ALL_PERIODS) {
      const { start, end } = getDateRangeForPeriod(period, 1, TODAY);
      expect(Number.isNaN(start.getTime())).toBe(false);
      expect(Number.isNaN(end.getTime())).toBe(false);
    }
  });

  it('places TODAY inside every current-period range', () => {
    for (const period of CURRENT_PERIODS) {
      const { start, end } = getDateRangeForPeriod(period, 1, TODAY);
      expect(TODAY.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(TODAY.getTime()).toBeLessThanOrEqual(end.getTime());
    }
  });

  it('keeps every completed-period range entirely before TODAY', () => {
    for (const period of COMPLETED_PERIODS) {
      const { end } = getDateRangeForPeriod(period, 1, TODAY);
      expect(end.getTime()).toBeLessThan(TODAY.getTime());
    }
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
  it('handles a fiscal start month that is neither January nor July', () => {
    // FY starts 1 Oct. On 12 Aug 2026 we are in FY2026 Q4 (Jul-Sep 2026).
    expect(range('this_quarter', 10)).toBe('2026-07-01..2026-08-12');
    expect(range('last_quarter', 10)).toBe('2026-04-01..2026-06-30');
    expect(range('this_year', 10)).toBe('2025-10-01..2026-08-12');
  });
});

describe('getDateRangeForPeriod — fiscal year starting in November, a quarter that genuinely straddles the calendar year end', () => {
  // FY starts 1 Nov. On 15 Jan 2027 we are partway through FY2027 Q1
  // (Nov 2026 - Jan 2027), which crosses 31 Dec/1 Jan inside a single quarter.
  const today = new Date(2027, 0, 15, 12, 0, 0);
  const at = (period: DateRangePeriod) => {
    const r = getDateRangeForPeriod(period, 11, today);
    return `${toCalendarDay(r.start)}..${toCalendarDay(r.end)}`;
  };

  it('this_quarter spans the calendar year end', () => {
    expect(at('this_quarter')).toBe('2026-11-01..2027-01-15');
  });

  it('last_quarter is the prior fiscal quarter', () => {
    expect(at('last_quarter')).toBe('2026-08-01..2026-10-31');
  });

  it('this_year opened in the prior calendar year', () => {
    expect(at('this_year')).toBe('2026-11-01..2027-01-15');
  });

  it('last_year is the whole preceding fiscal year', () => {
    expect(at('last_year')).toBe('2025-11-01..2026-10-31');
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

describe('formatDateRangeLabel', () => {
  it('gives a January fiscal year a plain label, with no year suffix', () => {
    expect(formatDateRangeLabel('this_year', 1, TODAY)).toBe('This Year');
    expect(formatDateRangeLabel('last_year', 1, TODAY)).toBe('Last Year');
  });

  it('appends the fiscal label for a non-January fiscal year', () => {
    expect(formatDateRangeLabel('this_year', 7, TODAY)).toBe('This Year (FY2027)');
    expect(formatDateRangeLabel('last_year', 7, TODAY)).toBe('Last Year (FY2026)');
  });

  it('labels the fixed, non-year periods the same regardless of fiscal start', () => {
    expect(formatDateRangeLabel('custom', 1, TODAY)).toBe('Custom Range');
    expect(formatDateRangeLabel('this_month', 7, TODAY)).toBe('This Month');
  });
});

describe('dateRangeFilterOptions', () => {
  it('lists every period exactly once', () => {
    const values = dateRangeFilterOptions.map(option => option.value);
    expect(values).toHaveLength(ALL_PERIODS.length);
    expect(new Set(values).size).toBe(ALL_PERIODS.length);
    for (const period of ALL_PERIODS) {
      expect(values).toContain(period);
    }
  });

  it('lists this_year first, since it is the default', () => {
    expect(dateRangeFilterOptions[0].value).toBe('this_year');
  });

  it('every option value is a period getDateRangeForPeriod accepts', () => {
    for (const option of dateRangeFilterOptions) {
      const { start, end } = getDateRangeForPeriod(option.value, 1, TODAY);
      expect(Number.isNaN(start.getTime())).toBe(false);
      expect(Number.isNaN(end.getTime())).toBe(false);
    }
  });
});
