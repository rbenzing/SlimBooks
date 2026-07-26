/**
 * Formatting Utilities Tests
 * Tests currency, date, and text formatting functions
 */

import { describe, it, expect } from 'vitest';
import {
  formatCurrencySync,
  formatDateSync,
  formatClientAddressSingleLine
} from '@/utils/formatting';

describe('Currency Formatting', () => {
  describe('formatCurrencySync', () => {
    it('should format positive amounts correctly', () => {
      expect(formatCurrencySync(1000)).toBe('$1,000.00');
      expect(formatCurrencySync(1234.56)).toBe('$1,234.56');
      expect(formatCurrencySync(0.99)).toBe('$0.99');
    });

    it('should format negative amounts correctly', () => {
      expect(formatCurrencySync(-500)).toContain('500.00');
      expect(formatCurrencySync(-1234.56)).toContain('1,234.56');
    });

    it('should handle zero', () => {
      expect(formatCurrencySync(0)).toBe('$0.00');
    });

    it('should handle very large numbers', () => {
      expect(formatCurrencySync(1000000)).toBe('$1,000,000.00');
      expect(formatCurrencySync(1234567.89)).toBe('$1,234,567.89');
    });

    it('should handle decimal precision', () => {
      expect(formatCurrencySync(10.1)).toBe('$10.10');
      expect(formatCurrencySync(10.999)).toBe('$11.00');
    });

    it('should support different currencies', () => {
      expect(formatCurrencySync(1000, 'EUR')).toContain('1,000.00');
      expect(formatCurrencySync(1000, 'GBP')).toContain('1,000.00');
    });

    it('should handle null and undefined', () => {
      expect(formatCurrencySync(null as any)).toBe('$0.00');
      expect(formatCurrencySync(undefined as any)).toBe('$0.00');
    });
  });
});

describe('Date Formatting', () => {
  describe('formatDateSync', () => {
    it('should format ISO date strings', () => {
      const result = formatDateSync('2026-02-16');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format Date objects', () => {
      const date = new Date('2026-02-16');
      const result = formatDateSync(date);
      expect(result).toBeTruthy();
    });

    it('should handle invalid dates', () => {
      expect(formatDateSync('invalid')).toBe('Invalid Date');
      expect(formatDateSync(null as any)).toBe('Invalid Date');
    });

    it('should use MM/DD/YYYY format', () => {
      // Use a Date object instead of ISO string to avoid timezone issues
      const date = new Date(2026, 1, 16); // Month is 0-indexed, so 1 = February
      const result = formatDateSync(date);
      expect(result).toMatch(/2\/16\/2026|02\/16\/2026/);
    });
  });
});

describe('Address Formatting', () => {
  describe('formatClientAddressSingleLine', () => {
    it('should format complete address', () => {
      const client = {
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001'
      };

      const result = formatClientAddressSingleLine(client);
      expect(result).toContain('123 Main St');
      expect(result).toContain('New York');
      expect(result).toContain('NY');
    });

    it('should handle partial address', () => {
      const client = {
        address: '123 Main St',
        city: 'New York'
      };

      const result = formatClientAddressSingleLine(client);
      expect(result).toBeTruthy();
      expect(result).toContain('123 Main St');
    });

    it('should return empty string for missing address', () => {
      const client = {};

      const result = formatClientAddressSingleLine(client);
      expect(result).toBe('');
    });

    it('should handle null/undefined client', () => {
      expect(formatClientAddressSingleLine(null as any)).toBe('');
      expect(formatClientAddressSingleLine(undefined as any)).toBe('');
    });
  });
});


describe('Edge Cases', () => {
  it('should handle empty strings', () => {
    expect(formatDateSync('')).toBe('Invalid Date');
  });

  it('should handle null values', () => {
    expect(formatCurrencySync(null as any)).toBe('$0.00');
  });

  it('should handle undefined values', () => {
    expect(formatCurrencySync(undefined as any)).toBe('$0.00');
    expect(formatDateSync(undefined as any)).toBe('Invalid Date');
  });
});
