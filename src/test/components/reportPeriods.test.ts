import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getDateRangeForPeriod, toCalendarDay } from '@/utils/data/period.util';

const REPORTS = [
  'src/components/reports/ProfitLossReport.tsx',
  'src/components/reports/ExpenseReport.tsx',
  'src/components/reports/InvoiceReport.tsx',
  'src/components/reports/ClientReport.tsx'
];

describe('the hyphenated period vocabulary is gone', () => {
  it.each(REPORTS)('%s contains no hyphenated period string', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).not.toMatch(/'(this|last)-(month|quarter|year)'/);
  });

  it.each(REPORTS)('%s does not build a calendar day with toISOString', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).not.toContain('toISOString()');
  });

  it.each(REPORTS)('%s has no local switch over presets', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).not.toMatch(/switch \(preset\)/);
  });
});

describe('every report agrees on a period', () => {
  const TODAY = new Date(2026, 7, 12, 12, 0, 0);

  it('this_year ends today, not on 31 December', () => {
    const range = getDateRangeForPeriod('this_year', 1, TODAY);
    expect(toCalendarDay(range.end)).toBe('2026-08-12');
  });
});
