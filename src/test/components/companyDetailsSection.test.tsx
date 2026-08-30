/**
 * Fiscal fields added to the Company tab (Task 3 of the fiscal-periods plan).
 *
 * `CompanyDetailsSection` already rendered the company profile fields; this
 * pins the two new ones added when Tax Rates merged into Company:
 * fiscal-year-start month and accounting basis. The accounting-basis copy is
 * deliberately not "count invoices when paid" — `ReportService.ts` computes
 * cash revenue from invoices marked paid inside the report window, which is
 * not the same as recognising revenue when cash arrives, so the label must
 * not claim it does.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompanyDetailsSection } from '@/components/settings/CompanyDetailsSection';
import type { CompanySettings } from '@/types';

const buildSettings = (over: Partial<CompanySettings> = {}): CompanySettings => ({
  companyName: 'Acme',
  ownerName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  brandingImage: '',
  fiscalYearStartMonth: 1,
  accountingMethod: 'accrual',
  ...over
});

describe('CompanyDetailsSection fiscal fields', () => {
  it('offers all twelve months, in calendar order, as the fiscal year start', () => {
    render(<CompanyDetailsSection settings={buildSettings()} onInputChange={vi.fn()} />);

    const select = screen.getByLabelText(/fiscal year starts/i) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);

    expect(optionLabels).toEqual([
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]);
  });

  it('shows the stored fiscal month as selected', () => {
    render(<CompanyDetailsSection settings={buildSettings({ fiscalYearStartMonth: 7 })} onInputChange={vi.fn()} />);

    expect((screen.getByLabelText(/fiscal year starts/i) as HTMLSelectElement).value).toBe('7');
  });

  it('reports the chosen fiscal month as a number', async () => {
    const onInputChange = vi.fn();
    const user = userEvent.setup();
    render(<CompanyDetailsSection settings={buildSettings()} onInputChange={onInputChange} />);

    await user.selectOptions(screen.getByLabelText(/fiscal year starts/i), 'October');

    expect(onInputChange).toHaveBeenCalledWith('fiscalYearStartMonth', 10);
  });

  it('describes accrual as counting invoices when issued, and cash as counting invoices that have been paid', () => {
    // Not "count invoices when paid" (the brief's draft copy) — the report
    // engine buckets a paid invoice into the window it falls in, not the date
    // payment landed, so the label must describe that behaviour accurately.
    render(<CompanyDetailsSection settings={buildSettings()} onInputChange={vi.fn()} />);

    const select = screen.getByLabelText(/accounting basis/i) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);

    expect(optionLabels).toEqual([
      'Accrual — count invoices when issued',
      'Cash — count invoices that have been paid'
    ]);
  });

  it('shows the stored accounting method as selected', () => {
    render(<CompanyDetailsSection settings={buildSettings({ accountingMethod: 'cash' })} onInputChange={vi.fn()} />);

    expect((screen.getByLabelText(/accounting basis/i) as HTMLSelectElement).value).toBe('cash');
  });

  it('reports the chosen accounting method', async () => {
    const onInputChange = vi.fn();
    const user = userEvent.setup();
    render(<CompanyDetailsSection settings={buildSettings()} onInputChange={onInputChange} />);

    await user.selectOptions(
      screen.getByLabelText(/accounting basis/i),
      'Cash — count invoices that have been paid'
    );

    expect(onInputChange).toHaveBeenCalledWith('accountingMethod', 'cash');
  });
});
