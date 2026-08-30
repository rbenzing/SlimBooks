/**
 * Tax Rates moved from its own tab into a section of Company & Tax
 * (Task 3 of the fiscal-periods plan), but the storage category did not
 * move with it. Rates are stored at `tax.tax_rates` — migration 002
 * back-filled `category = 'tax'` onto exactly those rows, and
 * `sqlite.svc.ts` composes the stored key as `${category}.${key}`. Reading
 * or writing under `company` instead would silently miss every existing
 * install's saved rates, so every call here still passes `'tax'`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { getSetting, setSetting, isReady, initialize } = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  isReady: vi.fn(() => true),
  initialize: vi.fn(async () => {})
}));

vi.mock('@/services/sqlite.svc', () => ({
  sqliteService: { getSetting, setSetting, isReady, initialize }
}));

import { TaxRatesSection } from '@/components/settings/TaxRatesSection';

beforeEach(() => {
  vi.clearAllMocks();
  isReady.mockReturnValue(true);
});

describe('TaxRatesSection', () => {
  it('reads stored rates from the tax category, not company', async () => {
    getSetting.mockResolvedValue([{ id: '1', name: 'No Tax', rate: 0, isDefault: true }]);

    render(<TaxRatesSection />);

    await screen.findByText('No Tax');
    expect(getSetting).toHaveBeenCalledWith('tax_rates', 'tax');
  });

  it('seeds default rates under the tax category when none are stored yet', async () => {
    getSetting.mockResolvedValue(null);

    render(<TaxRatesSection />);

    await screen.findByText('State Tax');
    expect(setSetting).toHaveBeenCalledWith('tax_rates', expect.any(Array), 'tax');
  });

  it('adds a new rate and saves the full list under the tax category', async () => {
    getSetting.mockResolvedValue([{ id: '1', name: 'No Tax', rate: 0, isDefault: true }]);
    const user = userEvent.setup();

    render(<TaxRatesSection />);
    await screen.findByText('No Tax');

    await user.click(screen.getByRole('button', { name: /add tax rate/i }));

    await waitFor(() => expect(setSetting).toHaveBeenCalledWith(
      'tax_rates',
      expect.arrayContaining([expect.objectContaining({ name: 'New Tax Rate' })]),
      'tax'
    ));
  });

  it('deletes a rate and saves the remaining list under the tax category', async () => {
    getSetting.mockResolvedValue([
      { id: '1', name: 'No Tax', rate: 0, isDefault: true },
      { id: '2', name: 'State Tax', rate: 8.25, isDefault: false }
    ]);
    const user = userEvent.setup();

    render(<TaxRatesSection />);
    await screen.findByText('State Tax');

    await user.click(screen.getByTitle(/delete/i));

    await waitFor(() => {
      const lastCall = setSetting.mock.calls.at(-1);
      expect(lastCall?.[0]).toBe('tax_rates');
      expect(lastCall?.[2]).toBe('tax');
      expect(lastCall?.[1]).toEqual([{ id: '1', name: 'No Tax', rate: 0, isDefault: true }]);
    });
  });
});
