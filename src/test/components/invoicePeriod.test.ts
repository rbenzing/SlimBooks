import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { filterByDateRange } from '@/utils/data/filtering.util';
import { getDateRangeForPeriod } from '@/utils/data/period.util';

const TODAY = new Date(2026, 7, 12, 12, 0, 0);

/** Issued in January, entered today — the shape a historical import produces. */
const backdated = {
  id: 1,
  issue_date: '2026-01-15',
  created_at: new Date(2026, 7, 12).getTime()
};

describe('invoices are filtered by when they were issued', () => {
  it('a January invoice entered today is not in August', () => {
    const august = getDateRangeForPeriod('this_month', 1, TODAY);
    expect(filterByDateRange([backdated], august, 'issue_date')).toHaveLength(0);
  });

  it('a January invoice entered today is in the fiscal year to date', () => {
    const year = getDateRangeForPeriod('this_year', 1, TODAY);
    expect(filterByDateRange([backdated], year, 'issue_date')).toHaveLength(1);
  });

  it('filtering on created_at would have misfiled it, which is the bug', () => {
    const august = getDateRangeForPeriod('this_month', 1, TODAY);
    expect(filterByDateRange([backdated], august, 'created_at')).toHaveLength(1);
  });
});

/**
 * The three cases above document `filterByDateRange`, which already handled both
 * value kinds — they pass with the bug still in place. This is the one that fails
 * until the screen is actually changed, so it is what makes the task testable.
 */
describe('the invoice list asks for the issue date', () => {
  it('does not pass created_at to filterByDateRange', () => {
    const source = readFileSync('src/components/invoices/InvoicesTab.tsx', 'utf8');
    expect(source).not.toMatch(/filterByDateRange\([^)]*'created_at'/);
    expect(source).toMatch(/filterByDateRange\([^)]*'issue_date'/);
  });
});

/**
 * The list filters on the issue date, so the issue date is what it shows. A
 * period filter over a column the screen never displays is invisible: pick
 * "Last Month" and the rows arrive with no on-screen reason for being there.
 */
describe('the invoice list shows the date it filters on', () => {
  const source = readFileSync('src/components/invoices/InvoicesTab.tsx', 'utf8');

  it('heads its date column Issued', () => {
    expect(source).toMatch(/>Issued</);
    expect(source).not.toMatch(/>Created</);
  });

  it('renders the issue date, keeping the explicitly labelled Created line', () => {
    expect(source).toMatch(/formatDateSync\(invoice\.issue_date\)/);
    expect(source).toMatch(/Created \{formatDateSync\(invoice\.created_at\)\}/);
  });
});
