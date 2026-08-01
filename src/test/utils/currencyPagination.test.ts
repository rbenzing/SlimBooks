/**
 * Currency formatting and pagination tests.
 *
 * `formatCurrency` is what every money figure in the UI passes through, and the
 * pagination maths decides which slice of a list the user sees — an off-by-one
 * either hides a record or shows an empty page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/sqlite.svc', () => ({
  sqliteService: {
    isReady: () => false,
    getSetting: vi.fn(),
    setSetting: vi.fn()
  }
}));

import {
  getCurrencySymbol,
  formatCurrency,
  formatCurrencySync,
  getCurrencyFormatPreview,
  clearCurrencyCache
} from '@/utils/formatting/currency.util';
import { getPaginationInfo, generatePageNumbers } from '@/utils/pagination.util';
import type { CurrencySettings } from '@/types';

beforeEach(() => {
  clearCurrencyCache();
});

describe('getCurrencySymbol', () => {
  it('maps known currency codes to symbols', () => {
    expect(getCurrencySymbol('USD')).toBe('$');
    expect(getCurrencySymbol('EUR')).toBe('€');
    expect(getCurrencySymbol('GBP')).toBe('£');
  });

  it('falls back to the code itself when unknown', () => {
    expect(getCurrencySymbol('XYZ')).toBe('XYZ');
  });
});

describe('formatCurrencySync', () => {
  it('formats to two decimal places with thousands separators', () => {
    expect(formatCurrencySync(1234.5)).toBe('$1,234.50');
  });

  it('treats null and undefined as zero rather than printing NaN', () => {
    expect(formatCurrencySync(undefined)).toBe('$0.00');
    expect(formatCurrencySync(null)).toBe('$0.00');
  });

  it('renders negative amounts (credits) with the sign outside the symbol', () => {
    // `$-250.00` reads as broken; credit notes and refunds hit this path.
    expect(formatCurrencySync(-250)).toBe('-$250.00');
    expect(formatCurrencySync(-1234.5)).toBe('-$1,234.50');
  });

  it('honours a currency override', () => {
    expect(formatCurrencySync(10, 'EUR')).toBe('€10.00');
  });

  it('rounds to two decimals rather than truncating', () => {
    expect(formatCurrencySync(1.005)).toBe('$1.01');
    expect(formatCurrencySync(0.994)).toBe('$0.99');
  });

  it('formats large amounts without losing separators', () => {
    expect(formatCurrencySync(1234567.89)).toBe('$1,234,567.89');
  });
});

describe('formatCurrency', () => {
  it('falls back to defaults when the settings service is unavailable', async () => {
    await expect(formatCurrency(1234.5)).resolves.toBe('$1,234.50');
  });

  it('places the symbol after the number when configured', async () => {
    await expect(formatCurrency(1234.5, { symbolPosition: 'after' })).resolves.toBe('1,234.50$');
  });

  it('applies European separators', async () => {
    const formatted = await formatCurrency(1234.5, {
      currency: 'EUR',
      thousandsSeparator: '.',
      decimalSeparator: ','
    });
    expect(formatted).toBe('€1.234,50');
  });

  it('supports zero decimal places', async () => {
    await expect(formatCurrency(1234.56, { decimalPlaces: 0 })).resolves.toBe('$1,235');
  });

  it('treats a null amount as zero', async () => {
    await expect(formatCurrency(null)).resolves.toBe('$0.00');
  });
});

describe('getCurrencyFormatPreview', () => {
  it('renders the sample amount in the supplied format', () => {
    const settings: CurrencySettings = {
      currency: 'GBP',
      symbolPosition: 'before',
      decimalPlaces: 2,
      thousandsSeparator: ',',
      decimalSeparator: '.'
    };
    expect(getCurrencyFormatPreview(settings)).toBe('£1,234.56');
  });
});

describe('getPaginationInfo', () => {
  it('describes the first page of a partial last page', () => {
    expect(getPaginationInfo(1, 10, 25)).toEqual({
      startIndex: 0,
      endIndex: 10,
      totalPages: 3,
      displayStart: 1,
      displayEnd: 10
    });
  });

  it('clamps the display end on the final page', () => {
    const info = getPaginationInfo(3, 10, 25);
    expect(info.displayStart).toBe(21);
    expect(info.displayEnd).toBe(25);
  });

  it('reports a single page when everything fits', () => {
    expect(getPaginationInfo(1, 25, 10).totalPages).toBe(1);
  });

  it('reports zero pages for an empty list', () => {
    const info = getPaginationInfo(1, 10, 0);
    expect(info.totalPages).toBe(0);
    expect(info.displayEnd).toBe(0);
  });

  it('does not create a trailing empty page on an exact multiple', () => {
    expect(getPaginationInfo(1, 10, 30).totalPages).toBe(3);
  });
});

describe('generatePageNumbers', () => {
  it('lists every page when they all fit', () => {
    expect(generatePageNumbers(1, 3, 5)).toEqual([1, 2, 3]);
  });

  it('centres the window on the current page', () => {
    expect(generatePageNumbers(10, 20, 5)).toEqual([8, 9, 10, 11, 12]);
  });

  it('clamps the window at the start', () => {
    expect(generatePageNumbers(1, 20, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('clamps the window at the end without shrinking it', () => {
    expect(generatePageNumbers(20, 20, 5)).toEqual([16, 17, 18, 19, 20]);
  });

  it('always returns at most maxPageNumbers entries', () => {
    for (let page = 1; page <= 20; page++) {
      expect(generatePageNumbers(page, 20, 5).length).toBeLessThanOrEqual(5);
    }
  });

  it('always includes the current page', () => {
    for (let page = 1; page <= 20; page++) {
      expect(generatePageNumbers(page, 20, 5)).toContain(page);
    }
  });

  it('returns an empty list when there are no pages', () => {
    expect(generatePageNumbers(1, 0, 5)).toEqual([]);
  });
});
