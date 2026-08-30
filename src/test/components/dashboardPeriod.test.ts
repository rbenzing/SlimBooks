import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

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
