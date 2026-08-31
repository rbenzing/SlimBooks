/**
 * The fiscal year has to be visible, not merely honoured.
 *
 * `formatDateRangeLabel` and `fiscalYearLabel` were written, unit-tested and
 * then never called from any component — every selector rendered the static
 * `dateRangeFilterOptions` labels, so a business with a July year-end saw a
 * plain "This Year" while the settings page and the user guide both promised
 * it would be named for the year it ends in. Thirteen assertions covered
 * functions no screen used, and could not have failed for any regression a
 * user could see.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type * as UseSettingsHook from '@/hooks/useSettings.hook';

const { fiscalMonth } = vi.hoisted(() => ({ fiscalMonth: { value: 7 } }));

vi.mock('@/hooks/useSettings.hook', async () => {
  const actual = await vi.importActual<typeof UseSettingsHook>('@/hooks/useSettings.hook');
  return {
    ...actual,
    useCompanySettings: () => ({
      settings: { fiscalYearStartMonth: fiscalMonth.value, accountingMethod: 'accrual' },
      isLoading: false
    })
  };
});

import { DateRangeFilter } from '@/components/ui/DateRangeFilter';

const optionLabels = (): string[] =>
  Array.from(document.querySelectorAll('option')).map(o => o.textContent ?? '');

describe('the period selector names the fiscal year', () => {
  it('marks This Year and Last Year with the fiscal year under a July start', () => {
    fiscalMonth.value = 7;
    render(<DateRangeFilter value="this_year" onChange={vi.fn()} />);

    const labels = optionLabels();
    expect(labels.some(l => /^This Year \(FY\d{4}\)$/.test(l))).toBe(true);
    expect(labels.some(l => /^Last Year \(FY\d{4}\)$/.test(l))).toBe(true);
  });

  it('names consecutive fiscal years, so the two cannot both read the same', () => {
    fiscalMonth.value = 7;
    render(<DateRangeFilter value="this_year" onChange={vi.fn()} />);

    const labels = optionLabels();
    const thisYear = labels.find(l => l.startsWith('This Year'));
    const lastYear = labels.find(l => l.startsWith('Last Year'));
    const yearOf = (label?: string): number => Number(label?.match(/FY(\d{4})/)?.[1]);

    expect(yearOf(thisYear) - yearOf(lastYear)).toBe(1);
  });

  it('leaves a January business reading plainly, with no FY noise', () => {
    fiscalMonth.value = 1;
    render(<DateRangeFilter value="this_year" onChange={vi.fn()} />);

    const labels = optionLabels();
    expect(labels).toContain('This Year');
    expect(labels).toContain('Last Year');
    expect(labels.some(l => l.includes('FY'))).toBe(false);
  });

  it('leaves the periods a fiscal year cannot move alone', () => {
    fiscalMonth.value = 7;
    render(<DateRangeFilter value="this_year" onChange={vi.fn()} />);

    for (const plain of ['Today', 'Yesterday', 'This Month', 'Last Month']) {
      expect(optionLabels()).toContain(plain);
    }
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });
});
