/**
 * Presentation-helper tests: payment display, theme classes, logging, and the
 * form schemas.
 *
 * These are small functions, but they are the ones that decide what a user
 * reads off a list. The property worth asserting across all of them is
 * exhaustiveness: every value in an enum must map to something, and no value
 * may fall through to a default that reads as "unknown" for a state the app
 * uses routinely. That is exactly how the payment list once showed blanks for
 * `received`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPaymentMethodDisplayName,
  getPaymentStatusDisplayName,
  getPaymentStatusColor,
  getPaymentMethodIcon,
  validatePaymentAmount,
  calculatePaymentFee
} from '@/utils/business/payment.util';
import {
  cn,
  getStatusColor,
  getStatCardClasses,
  getButtonClasses,
  getIconColorClasses,
  getBorderClasses,
  themeClasses
} from '@/utils/themeUtils.util';
import { logger, log, debug, warn, error } from '@/utils/logger.util';
import { clientSchema, expenseSchema, paymentSchema } from '@/utils/validation/schemas';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '@/types';

describe('payment display helpers', () => {
  it('names every payment method', () => {
    for (const method of PAYMENT_METHODS) {
      const name = getPaymentMethodDisplayName(method);
      expect(name).toBeTruthy();
      // A raw enum value leaking through means the switch missed a case.
      expect(name).not.toBe(method);
    }
  });

  it('names every payment status', () => {
    for (const status of PAYMENT_STATUSES) {
      const name = getPaymentStatusDisplayName(status);
      expect(name).toBeTruthy();
      expect(name).not.toBe(status);
    }
  });

  it('gives received its own name rather than falling through', () => {
    // `received` is the status most payments carry; a fall-through here blanks
    // the column for nearly every row.
    expect(getPaymentStatusDisplayName('received')).toBe('Received');
  });

  it('reads back a method name a human would recognise', () => {
    expect(getPaymentMethodDisplayName('bank_transfer')).toBe('Bank Transfer');
    expect(getPaymentMethodDisplayName('credit_card')).toBe('Credit Card');
    expect(getPaymentMethodDisplayName('paypal')).toBe('PayPal');
  });

  it('falls back to the raw value for an unknown method', () => {
    expect(getPaymentMethodDisplayName('crypto' as never)).toBe('crypto');
    expect(getPaymentStatusDisplayName('disputed' as never)).toBe('disputed');
  });

  it('colours every status distinctly', () => {
    const colours = PAYMENT_STATUSES.map(getPaymentStatusColor);

    expect(new Set(colours).size).toBe(PAYMENT_STATUSES.length);
    expect(colours).not.toContain('gray');
  });

  it('colours success and failure differently', () => {
    expect(getPaymentStatusColor('received')).toBe('green');
    expect(getPaymentStatusColor('failed')).toBe('red');
  });

  it('falls back to a neutral colour for an unknown status', () => {
    expect(getPaymentStatusColor('disputed' as never)).toBe('gray');
  });

  it('gives every method an icon', () => {
    for (const method of PAYMENT_METHODS) {
      expect(getPaymentMethodIcon(method)).toBeTruthy();
    }
  });

  it('falls back to a placeholder icon for an unknown method', () => {
    expect(getPaymentMethodIcon('crypto' as never)).toBe('HelpCircle');
  });
});

describe('validatePaymentAmount', () => {
  it('accepts a positive amount', () => {
    expect(validatePaymentAmount(100)).toEqual({ isValid: true });
  });

  it('rejects zero and negative amounts', () => {
    expect(validatePaymentAmount(0).isValid).toBe(false);
    expect(validatePaymentAmount(-1).isValid).toBe(false);
  });

  it('explains why it refused', () => {
    expect(validatePaymentAmount(0).error).toMatch(/greater than zero/i);
  });

  it('rejects an amount above the invoice total', () => {
    // Overpaying an invoice silently would corrupt the balance owed.
    const result = validatePaymentAmount(600, 500);

    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/500/);
  });

  it('accepts payment of the exact total', () => {
    expect(validatePaymentAmount(500, 500)).toEqual({ isValid: true });
  });

  it('accepts a part payment', () => {
    expect(validatePaymentAmount(250, 500)).toEqual({ isValid: true });
  });
});

describe('calculatePaymentFee', () => {
  it('charges nothing when no fees are configured', () => {
    expect(calculatePaymentFee(100, 'credit_card')).toBe(0);
  });

  it('charges nothing for a method with no configured fee', () => {
    expect(calculatePaymentFee(100, 'cash', { credit_card: 2.9 })).toBe(0);
  });

  it('applies the configured percentage', () => {
    expect(calculatePaymentFee(100, 'credit_card', { credit_card: 2.9 })).toBeCloseTo(2.9);
  });

  it('scales with the amount', () => {
    expect(calculatePaymentFee(1000, 'credit_card', { credit_card: 2.9 })).toBeCloseTo(29);
  });

  it('charges nothing on a zero-rated method', () => {
    expect(calculatePaymentFee(100, 'cash', { cash: 0 })).toBe(0);
  });
});

describe('theme helpers', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toContain('a');
    expect(cn('a', 'b')).toContain('b');
  });

  it('drops falsy class names', () => {
    // Conditional classes arrive as `cond && 'name'`, so falsy entries are the
    // normal case rather than an edge case.
    const disabled = false;
    expect(cn('a', disabled && 'b', undefined, null, 'c')).toBe('a c');
  });

  it('lets a later utility class win over an earlier one', () => {
    // This is the whole point of using tailwind-merge rather than string joins.
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('gives every documented status a colour class', () => {
    for (const status of ['paid', 'pending', 'overdue', 'draft', 'sent', 'cancelled']) {
      expect(getStatusColor(status)).toBeTruthy();
    }
  });

  it('handles a missing status without throwing', () => {
    expect(getStatusColor(undefined)).toBeTruthy();
    expect(getStatusColor(null)).toBeTruthy();
    expect(getStatusColor('')).toBeTruthy();
  });

  it('falls back to a neutral class for an unknown status', () => {
    expect(getStatusColor('invented')).toBeTruthy();
  });

  it('builds a stat card class string', () => {
    expect(getStatCardClasses()).toBeTruthy();
    expect(getStatCardClasses('text-blue-600')).toContain('text-blue-600');
  });

  it('builds a distinct class string per button variant', () => {
    const variants = ['primary', 'secondary', 'outline', 'destructive'] as const;
    const classes = variants.map(v => getButtonClasses(v));

    expect(new Set(classes).size).toBe(variants.length);
  });

  it('defaults the button variant to primary', () => {
    expect(getButtonClasses()).toBe(getButtonClasses('primary'));
  });

  it('builds a distinct class string per icon colour', () => {
    const colours = ['blue', 'green', 'purple', 'red', 'yellow', 'orange'] as const;
    const classes = colours.map(c => getIconColorClasses(c));

    expect(new Set(classes).size).toBe(colours.length);
  });

  it('defaults the icon colour to blue', () => {
    expect(getIconColorClasses()).toBe(getIconColorClasses('blue'));
  });

  it('builds a distinct class string per border intensity', () => {
    const intensities = ['subtle', 'light', 'medium', 'heavy', 'strong'] as const;
    const classes = intensities.map(i => getBorderClasses(i));

    expect(new Set(classes).size).toBe(intensities.length);
  });

  it('defaults the border intensity to light', () => {
    expect(getBorderClasses()).toBe(getBorderClasses('light'));
  });

  it('exposes the shared theme class table', () => {
    expect(themeClasses).toBeTruthy();
    expect(Object.keys(themeClasses).length).toBeGreaterThan(0);
  });
});

describe('logger', () => {
  let spies: Record<string, ReturnType<typeof vi.spyOn>>;

  beforeEach(() => {
    spies = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {})
    };
  });

  afterEach(() => vi.restoreAllMocks());

  it('always reports errors, whatever the environment', () => {
    // An error swallowed in production is an incident nobody can diagnose.
    logger.error('something broke', { id: 1 });

    expect(spies.error).toHaveBeenCalledWith('something broke', { id: 1 });
  });

  it('forwards every argument it is given', () => {
    logger.error('a', 'b', 'c');

    expect(spies.error).toHaveBeenCalledWith('a', 'b', 'c');
  });

  it('exposes the same functions destructured', () => {
    expect(typeof log).toBe('function');
    expect(typeof debug).toBe('function');
    expect(typeof warn).toBe('function');
    expect(typeof error).toBe('function');
  });

  it('routes the destructured error to console.error', () => {
    error('boom');

    expect(spies.error).toHaveBeenCalledWith('boom');
  });

  it('never throws for any level', () => {
    expect(() => { log('x'); debug('x'); warn('x'); error('x'); }).not.toThrow();
  });
});

describe('form schemas', () => {
  const client = {
    first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com'
  };

  it('accepts a minimal client and defaults the country', () => {
    expect(clientSchema.parse(client)).toMatchObject({ country: 'USA' });
  });

  it('requires both names and a real email', () => {
    expect(() => clientSchema.parse({ ...client, first_name: '' })).toThrow(/first name/i);
    expect(() => clientSchema.parse({ ...client, last_name: '' })).toThrow(/last name/i);
    expect(() => clientSchema.parse({ ...client, email: 'ada' })).toThrow(/email/i);
  });

  it('keeps an explicit country', () => {
    expect(clientSchema.parse({ ...client, country: 'GB' })).toMatchObject({ country: 'GB' });
  });

  const expense = {
    date: '2026-07-01', vendor: 'Acme', category: 'Office', amount: 12.5
  };

  it('accepts a minimal expense and defaults the status to pending', () => {
    expect(expenseSchema.parse(expense)).toMatchObject({ status: 'pending' });
  });

  it('requires a positive expense amount', () => {
    expect(() => expenseSchema.parse({ ...expense, amount: 0 })).toThrow(/positive/i);
    expect(() => expenseSchema.parse({ ...expense, amount: -5 })).toThrow(/positive/i);
  });

  it('names the payee field vendor, and requires it', () => {
    expect(() => expenseSchema.parse({ ...expense, vendor: '' })).toThrow(/vendor/i);
  });

  it('accepts only the expense statuses the app uses', () => {
    for (const status of ['pending', 'approved', 'reimbursed']) {
      expect(expenseSchema.parse({ ...expense, status })).toMatchObject({ status });
    }
    expect(() => expenseSchema.parse({ ...expense, status: 'paid' })).toThrow();
  });

  const payment = {
    invoice_id: 1, amount: 100, payment_date: '2026-07-01', payment_method: 'cash'
  };

  it('accepts a complete payment', () => {
    expect(paymentSchema.parse(payment)).toMatchObject({ invoice_id: 1, amount: 100 });
  });

  it('requires a real invoice and a positive amount', () => {
    expect(() => paymentSchema.parse({ ...payment, invoice_id: 0 })).toThrow(/invoice/i);
    expect(() => paymentSchema.parse({ ...payment, amount: 0 })).toThrow(/positive/i);
  });

  it('requires a date and a method', () => {
    expect(() => paymentSchema.parse({ ...payment, payment_date: '' })).toThrow(/date/i);
    expect(() => paymentSchema.parse({ ...payment, payment_method: '' })).toThrow(/method/i);
  });
});
