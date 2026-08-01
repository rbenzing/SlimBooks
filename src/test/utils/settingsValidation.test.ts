/**
 * Settings validation tests.
 *
 * Every settings screen writes through these schemas, and the `*WithDefaults`
 * parsers are what stand between a corrupt settings row and a blank app. Two
 * properties matter: a bad value must be rejected rather than persisted, and a
 * failed parse must yield a usable default rather than undefined — a missing
 * currency or pagination object crashes the screen that reads it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateCurrencySettings,
  validateDateTimeSettings,
  validateInvoiceNumberSettings,
  validatePaginationSettings,
  validateThemeSettings,
  validateNotificationSettings,
  validateStripeSettings,
  validateEmailSettings,
  validateProjectSettings,
  parseCurrencySettingsWithDefaults,
  parseDateTimeSettingsWithDefaults,
  parseInvoiceNumberSettingsWithDefaults,
  parsePaginationSettingsWithDefaults,
  parseProjectSettingsWithDefaults,
  validateInvoiceNumber,
  validatePassword
} from '@/utils/settingsValidation';

const currency = (over: Record<string, unknown> = {}) => ({
  currency: 'USD',
  symbolPosition: 'before',
  decimalPlaces: 2,
  thousandsSeparator: ',',
  decimalSeparator: '.',
  ...over
});

const pagination = (over: Record<string, unknown> = {}) => ({
  defaultItemsPerPage: 25,
  availablePageSizes: [10, 25, 50, 100],
  maxItemsPerPage: 500,
  showItemsPerPageSelector: true,
  showPageNumbers: true,
  maxPageNumbers: 5,
  ...over
});

const theme = (over: Record<string, unknown> = {}) => ({
  theme: 'system',
  invoiceTemplate: 'modern-blue',
  pdfFormat: 'A4',
  ...over
});

const notifications = (over: Record<string, unknown> = {}) => ({
  emailNotifications: true,
  pushNotifications: false,
  invoiceReminders: true,
  paymentAlerts: true,
  systemUpdates: false,
  ...over
});

const stripe = (over: Record<string, unknown> = {}) => ({
  webhookSecret: 'whsec_x',
  webhookEndpoint: '',
  testMode: true,
  publishableKey: 'pk_test_abc',
  secretKey: 'sk_test_abc',
  isEnabled: true,
  ...over
});

const emailSettings = (over: Record<string, unknown> = {}) => ({
  isEnabled: true,
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  smtpUsername: 'billing@example.com',
  smtpPassword: 'secret',
  fromEmail: 'billing@example.com',
  useSSL: false,
  useTLS: true,
  ...over
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('currency settings', () => {
  it('accepts a complete configuration', () => {
    expect(validateCurrencySettings(currency())).toMatchObject({ currency: 'USD' });
  });

  it('requires a three-letter ISO code', () => {
    expect(() => validateCurrencySettings(currency({ currency: 'US' }))).toThrow(/currency/i);
    expect(() => validateCurrencySettings(currency({ currency: 'DOLLAR' }))).toThrow(/currency/i);
  });

  it('rejects a symbol position it cannot render', () => {
    expect(() => validateCurrencySettings(currency({ symbolPosition: 'above' }))).toThrow();
  });

  it('rejects a decimal count outside what money uses', () => {
    expect(() => validateCurrencySettings(currency({ decimalPlaces: -1 }))).toThrow();
    expect(() => validateCurrencySettings(currency({ decimalPlaces: 5 }))).toThrow();
    expect(() => validateCurrencySettings(currency({ decimalPlaces: 1.5 }))).toThrow();
  });

  it('accepts zero decimals for currencies that have none', () => {
    expect(validateCurrencySettings(currency({ currency: 'JPY', decimalPlaces: 0 })))
      .toMatchObject({ decimalPlaces: 0 });
  });

  it('rejects an unsupported separator', () => {
    expect(() => validateCurrencySettings(currency({ thousandsSeparator: '_' }))).toThrow();
    expect(() => validateCurrencySettings(currency({ decimalSeparator: '·' }))).toThrow();
  });

  it('falls back to a usable default rather than undefined', () => {
    // The formatter reads these fields on every amount rendered.
    const result = parseCurrencySettingsWithDefaults({ nonsense: true });

    expect(result).toMatchObject({
      currency: 'USD', symbolPosition: 'before', decimalPlaces: 2, decimalSeparator: '.'
    });
  });

  it('keeps a valid stored configuration', () => {
    expect(parseCurrencySettingsWithDefaults(currency({ currency: 'EUR' })))
      .toMatchObject({ currency: 'EUR' });
  });

  it('falls back when only one field is corrupt', () => {
    expect(parseCurrencySettingsWithDefaults(currency({ decimalPlaces: 99 })))
      .toMatchObject({ decimalPlaces: 2 });
  });
});

describe('pagination settings', () => {
  it('accepts a complete configuration', () => {
    expect(validatePaginationSettings(pagination())).toMatchObject({ defaultItemsPerPage: 25 });
  });

  it('rejects a page size that would load the whole table', () => {
    expect(() => validatePaginationSettings(pagination({ defaultItemsPerPage: 5000 }))).toThrow();
  });

  it('rejects a page size too small to be useful', () => {
    expect(() => validatePaginationSettings(pagination({ defaultItemsPerPage: 1 }))).toThrow();
  });

  it('requires at least one selectable page size', () => {
    // An empty list leaves the size selector with nothing to show.
    expect(() => validatePaginationSettings(pagination({ availablePageSizes: [] }))).toThrow();
  });

  it('rejects a page-number window outside what fits on screen', () => {
    expect(() => validatePaginationSettings(pagination({ maxPageNumbers: 2 }))).toThrow();
    expect(() => validatePaginationSettings(pagination({ maxPageNumbers: 50 }))).toThrow();
  });

  it('falls back to a complete default', () => {
    const result = parsePaginationSettingsWithDefaults(null);

    expect(result.availablePageSizes.length).toBeGreaterThan(0);
    expect(result.defaultItemsPerPage).toBeGreaterThan(0);
    expect(result.maxPageNumbers).toBeGreaterThan(0);
  });

  it('keeps a valid stored configuration', () => {
    expect(parsePaginationSettingsWithDefaults(pagination({ defaultItemsPerPage: 50 })))
      .toMatchObject({ defaultItemsPerPage: 50 });
  });
});

describe('date and time settings', () => {
  it('accepts a stored format pair', () => {
    expect(validateDateTimeSettings({ dateFormat: 'DD/MM/YYYY', timeFormat: '24-hour' }))
      .toMatchObject({ dateFormat: 'DD/MM/YYYY' });
  });

  it('rejects a payload missing a format', () => {
    expect(() => validateDateTimeSettings({ dateFormat: 'DD/MM/YYYY' })).toThrow();
  });

  it('falls back to a complete default', () => {
    expect(parseDateTimeSettingsWithDefaults(undefined))
      .toMatchObject({ dateFormat: 'MM/DD/YYYY', timeFormat: '12-hour' });
  });
});

describe('invoice number settings', () => {
  it('accepts a prefix', () => {
    expect(validateInvoiceNumberSettings({ prefix: 'SB' })).toMatchObject({ prefix: 'SB' });
  });

  it('rejects a prefix longer than the column allows', () => {
    expect(() => validateInvoiceNumberSettings({ prefix: 'X'.repeat(11) })).toThrow();
  });

  it('falls back to INV', () => {
    expect(parseInvoiceNumberSettingsWithDefaults({ prefix: 12345 }))
      .toMatchObject({ prefix: 'INV' });
  });
});

describe('theme settings', () => {
  it('accepts every supported theme', () => {
    for (const value of ['light', 'dark', 'system']) {
      expect(validateThemeSettings(theme({ theme: value }))).toMatchObject({ theme: value });
    }
  });

  it('rejects a template the renderer does not have', () => {
    expect(() => validateThemeSettings(theme({ invoiceTemplate: 'neon-pink' }))).toThrow();
  });

  it('rejects a paper size the PDF service does not support', () => {
    expect(() => validateThemeSettings(theme({ pdfFormat: 'Tabloid' }))).toThrow();
  });
});

describe('notification settings', () => {
  it('accepts a complete set of switches', () => {
    expect(validateNotificationSettings(notifications())).toMatchObject({ emailNotifications: true });
  });

  it('rejects a switch that is not a boolean', () => {
    expect(() => validateNotificationSettings(notifications({ emailNotifications: 'yes' }))).toThrow();
  });

  it('rejects a partial payload rather than assuming the rest', () => {
    // Assuming a default here could silently turn a notification back on.
    expect(() => validateNotificationSettings({ emailNotifications: true })).toThrow();
  });
});

describe('stripe settings', () => {
  it('accepts matching test keys', () => {
    expect(validateStripeSettings(stripe())).toMatchObject({ testMode: true });
  });

  it('accepts live keys', () => {
    expect(validateStripeSettings(stripe({
      publishableKey: 'pk_live_abc', secretKey: 'sk_live_abc', testMode: false
    }))).toMatchObject({ testMode: false });
  });

  it('rejects a publishable key that is really a secret key', () => {
    // Pasting the wrong key into the wrong box would ship a secret to the browser.
    expect(() => validateStripeSettings(stripe({ publishableKey: 'sk_test_abc' })))
      .toThrow(/publishable key/i);
  });

  it('rejects a secret key that is really a publishable key', () => {
    expect(() => validateStripeSettings(stripe({ secretKey: 'pk_test_abc' })))
      .toThrow(/secret key/i);
  });

  it('rejects a key with no recognisable prefix', () => {
    expect(() => validateStripeSettings(stripe({ publishableKey: 'abc123' }))).toThrow();
  });

  it('accepts a blank webhook endpoint but not a malformed one', () => {
    expect(validateStripeSettings(stripe({ webhookEndpoint: '' }))).toBeTruthy();
    expect(validateStripeSettings(stripe({ webhookEndpoint: 'https://x.test/hook' }))).toBeTruthy();
    expect(() => validateStripeSettings(stripe({ webhookEndpoint: 'not-a-url' }))).toThrow();
  });
});

describe('email settings', () => {
  it('accepts a complete configuration', () => {
    expect(validateEmailSettings(emailSettings())).toMatchObject({ smtpHost: 'smtp.example.com' });
  });

  it('requires every credential the transport needs', () => {
    expect(() => validateEmailSettings(emailSettings({ smtpHost: '' }))).toThrow(/host/i);
    expect(() => validateEmailSettings(emailSettings({ smtpUsername: '' }))).toThrow(/username/i);
    expect(() => validateEmailSettings(emailSettings({ smtpPassword: '' }))).toThrow(/password/i);
  });

  it('requires a real from address', () => {
    expect(() => validateEmailSettings(emailSettings({ fromEmail: 'billing' }))).toThrow(/email/i);
  });

  it('rejects a port outside the valid range', () => {
    expect(() => validateEmailSettings(emailSettings({ smtpPort: 0 }))).toThrow();
    expect(() => validateEmailSettings(emailSettings({ smtpPort: 70000 }))).toThrow();
  });

  it('treats the sender name as optional', () => {
    expect(validateEmailSettings(emailSettings({ fromName: undefined }))).toBeTruthy();
  });
});

describe('project settings', () => {
  it('returns a fully populated default for a corrupt payload', () => {
    // Every settings screen destructures these four sections on mount.
    const result = parseProjectSettingsWithDefaults('not an object');

    expect(Object.keys(result).sort()).toEqual(['email', 'google_oauth', 'security', 'stripe']);
    expect(result.email.smtp_port).toBe(587);
    expect(result.security.max_failed_login_attempts).toBe(5);
  });

  it('defaults every integration to disabled', () => {
    const result = parseProjectSettingsWithDefaults(null);

    expect(result.google_oauth.enabled).toBe(false);
    expect(result.stripe.enabled).toBe(false);
    expect(result.email.enabled).toBe(false);
  });

  it('merges a valid payload over the defaults, section by section', () => {
    // Every section here satisfies its schema, so the stored values win and
    // the sections that were omitted keep their defaults.
    const result = parseProjectSettingsWithDefaults({
      email: {
        enabled: true,
        smtp_host: 'smtp.example.com',
        smtp_port: 2525,
        smtp_user: 'billing@example.com',
        configured: true
      }
    });

    expect(result.email).toMatchObject({
      enabled: true, smtp_host: 'smtp.example.com', smtp_port: 2525
    });
    expect(result.security.max_failed_login_attempts).toBe(5);
    expect(result.stripe.enabled).toBe(false);
  });

  it('falls back wholesale when any section fails to parse', () => {
    // A section missing a required field invalidates the payload, so a
    // half-applied configuration never reaches the screens.
    const result = parseProjectSettingsWithDefaults({
      email: { enabled: true, smtp_host: 'smtp.example.com', smtp_port: 2525, configured: true }
    });

    expect(result.email.smtp_host).toBe('');
    expect(result.email.smtp_port).toBe(587);
  });

  it('raises rather than returning a partial object from the strict validator', () => {
    expect(() => validateProjectSettings({ email: {} })).toThrow(/invalid project settings/i);
  });
});

describe('validateInvoiceNumber', () => {
  it('accepts the numbers the app generates', () => {
    expect(validateInvoiceNumber('INV-202607-0001')).toBe(true);
    expect(validateInvoiceNumber('SB_2026_07')).toBe(true);
    expect(validateInvoiceNumber('INV1')).toBe(true);
  });

  it('rejects lowercase, spaces and punctuation', () => {
    expect(validateInvoiceNumber('inv-001')).toBe(false);
    expect(validateInvoiceNumber('INV 001')).toBe(false);
    expect(validateInvoiceNumber('INV/001')).toBe(false);
  });

  it('rejects an empty or over-long number', () => {
    expect(validateInvoiceNumber('')).toBe(false);
    expect(validateInvoiceNumber('I'.repeat(21))).toBe(false);
    expect(validateInvoiceNumber('I'.repeat(20))).toBe(true);
  });
});

describe('validatePassword', () => {
  it('accepts a password meeting the default policy', () => {
    expect(validatePassword('Str0ngPass')).toEqual({ isValid: true, errors: [] });
  });

  it('reports every rule broken, not just the first', () => {
    // Showing one error at a time makes the user guess repeatedly.
    const result = validatePassword('short');

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it('names the length requirement', () => {
    expect(validatePassword('Ab1').errors.join(' ')).toMatch(/at least 8 characters/);
  });

  it('requires each default character class', () => {
    expect(validatePassword('str0ngpass').errors.join(' ')).toMatch(/uppercase/);
    expect(validatePassword('STR0NGPASS').errors.join(' ')).toMatch(/lowercase/);
    expect(validatePassword('StrongPass').errors.join(' ')).toMatch(/number/);
  });

  it('does not require a special character by default', () => {
    expect(validatePassword('Str0ngPass').isValid).toBe(true);
  });

  it('honours a stricter policy', () => {
    const strict = {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true
    };

    expect(validatePassword('Str0ngPass', strict).isValid).toBe(false);
    expect(validatePassword('Str0ngPass!x1', strict).isValid).toBe(true);
  });

  it('honours a relaxed policy', () => {
    const relaxed = {
      minLength: 4,
      requireUppercase: false,
      requireLowercase: false,
      requireNumbers: false,
      requireSpecialChars: false
    };

    expect(validatePassword('abcd', relaxed)).toEqual({ isValid: true, errors: [] });
  });
});
