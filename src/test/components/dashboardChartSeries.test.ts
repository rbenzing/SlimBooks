import { describe, it, expect } from 'vitest';
import { buildMonthlyRevenueSeries } from '@/components/DashboardChart';
import { getDateRangeForPeriod } from '@/utils/data/period.util';
import { type Invoice } from '@/types';

/** Fixed "today" so no test mocks the clock. Sun 15 Feb 2026. */
const TODAY = new Date(2026, 1, 15, 12, 0, 0);

const invoice = (issue_date: string, total_amount: number): Invoice =>
  ({ issue_date, total_amount } as Invoice);

/**
 * Defect: the dashboard chart plotted calendar months (January onward) while
 * its own stat cards totalled the configured fiscal year. Under a July
 * fiscal year, revenue from July-December sat in the cards' total with no
 * bar to show for it, because the old bucket loop only ever walked January
 * to the current month.
 *
 * `buildMonthlyRevenueSeries` takes the same date range the cards already
 * compute, so the chart can no longer disagree with them about which months
 * exist.
 */
describe('buildMonthlyRevenueSeries', () => {
  it('buckets the fiscal year to date, not the calendar year to date', () => {
    // FY starts 1 July 2025; "today" is 15 Feb 2026, so the fiscal year to
    // date runs July 2025 - February 2026: 8 months.
    const range = getDateRangeForPeriod('this_year', 7, TODAY);

    const invoices = [
      invoice('2025-08-10', 500), // August: outside the calendar year, inside the fiscal year
      invoice('2026-01-05', 300)  // January: inside both
    ];

    const series = buildMonthlyRevenueSeries(invoices, range);

    expect(series).toHaveLength(8);
    expect(series[0].period).toBe('Jul');
    expect(series[series.length - 1].period).toBe('Feb');

    // The August invoice must land in a bucket at all — a calendar-year
    // walk starting in January would never visit August 2025 and this
    // revenue would silently vanish from the chart.
    const august = series[1];
    expect(august.period).toBe('Aug');
    expect(august.revenue).toBe(500);

    const january = series[6];
    expect(january.period).toBe('Jan');
    expect(january.revenue).toBe(300);
  });

  it('buckets a full prior fiscal year, not the prior calendar year', () => {
    // FY2025 ran 1 Jul 2024 - 30 Jun 2025.
    const range = getDateRangeForPeriod('last_year', 7, TODAY);

    const invoices = [invoice('2024-09-20', 750)];
    const series = buildMonthlyRevenueSeries(invoices, range);

    expect(series).toHaveLength(12);
    expect(series[0].period).toBe('Jul');
    expect(series[series.length - 1].period).toBe('Jun');
    expect(series.find(bucket => bucket.revenue === 750)).toBeDefined();
  });

  it('sums more than one invoice landing in the same month', () => {
    const range = getDateRangeForPeriod('this_year', 1, TODAY);
    const invoices = [invoice('2026-01-03', 100), invoice('2026-01-20', 50)];

    const series = buildMonthlyRevenueSeries(invoices, range);
    const january = series.find(bucket => bucket.period === 'Jan');

    expect(january?.revenue).toBe(150);
  });

  it('excludes an invoice outside the supplied range', () => {
    const range = getDateRangeForPeriod('this_year', 1, TODAY);
    const invoices = [invoice('2024-06-01', 999)];

    const series = buildMonthlyRevenueSeries(invoices, range);
    const totalRevenue = series.reduce((sum, bucket) => sum + bucket.revenue, 0);

    expect(totalRevenue).toBe(0);
  });
});
