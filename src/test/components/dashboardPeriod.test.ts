import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { toCalendarDay } from '@/utils/data';
import { parseDisplayDate } from '@/utils/formatting/date.util';

const DASHBOARD = 'src/components/DashboardOverview.tsx';
const CHART = 'src/components/DashboardChart.tsx';

describe('the dashboard uses the shared period module', () => {
  it('does not compute a year start of its own', () => {
    const source = readFileSync(DASHBOARD, 'utf8');
    expect(source).not.toMatch(/getFullYear\(\)\s*[,)-]/);
    expect(source).toMatch(/getDateRangeForPeriod/);
  });

  it('offers the one shared list of periods', () => {
    const source = readFileSync(DASHBOARD, 'utf8');
    expect(source).toMatch(/dateRangeFilterOptions/);
    expect(source).not.toMatch(/'year-to-date'|'month-to-date'/);
  });

  it('honours the fiscal year', () => {
    const source = readFileSync(DASHBOARD, 'utf8');
    expect(source).toMatch(/useFiscalSettings/);
    expect(source).toMatch(/fiscalYearStartMonth/);
  });
});

describe('the dashboard dates rows by when they happened', () => {
  it('filters invoices on issue_date and expenses on date', () => {
    const source = readFileSync(DASHBOARD, 'utf8');
    expect(source).toMatch(/filterByDateRange\([^)]*'issue_date'/);
    expect(source).toMatch(/filterByDateRange\([^)]*'date'/);
    expect(source).not.toMatch(/new Date\(invoice\.created_at\)/);
    expect(source).not.toMatch(/new Date\(expense\.created_at\)/);
  });

  it('charts invoices by issue date', () => {
    const source = readFileSync(CHART, 'utf8');
    expect(source).not.toMatch(/invoice\.created_at/);
  });
});

/**
 * The chart reads `issue_date` correctly and then threw the fix away: it
 * derived its day key with `toISOString().split('T')[0]`, which converts to
 * UTC first. `parseDisplayDate('2026-08-30')` is local midnight, so at UTC+9
 * that becomes 2026-08-29 — while the bucket labels were built from the
 * current time of day, which does NOT shift. An invoice issued today then
 * matched no bucket at all. Two report components had already shipped this
 * exact bug; see the warning on `toCalendarDay` in period.util.ts.
 */
describe('the chart derives its day keys locally', () => {
  it('never builds a day with toISOString', () => {
    const source = readFileSync(CHART, 'utf8');
    expect(source).not.toMatch(/toISOString/);
    expect(source).toMatch(/toCalendarDay\(/);
  });

  it('round-trips a calendar day through the parse the chart uses', () => {
    for (const day of ['2026-01-01', '2026-08-30', '2026-12-31', '2024-02-29']) {
      expect(toCalendarDay(parseDisplayDate(day))).toBe(day);
    }
  });

  it('keys an invoice issued today into today, whatever the offset', () => {
    const today = toCalendarDay(new Date());
    expect(toCalendarDay(parseDisplayDate(today))).toBe(today);
  });
});
