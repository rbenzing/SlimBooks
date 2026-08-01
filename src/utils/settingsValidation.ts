// Comprehensive Settings Validation utilities
// Centralized validation for all application settings using Zod schemas

import { z } from 'zod';
import type {
  ProjectSettings,
  CurrencySettings,
  DateTimeSettings,
  InvoiceNumberSettings,
  PaginationSettings
} from '@/types';

// ========================================
// PROJECT SETTINGS SCHEMAS (OAuth, Stripe, Email, Security)
// ========================================

export const GoogleOAuthSchema = z.object({
  enabled: z.boolean(),
  client_id: z.string(),
  client_secret: z.string().optional(),
  configured: z.boolean(),
  env_configured: z.boolean().optional()
});

/**
 * Stripe project settings.
 *
 * `secret_key` and `webhook_secret` are write-only: the server never sends them
 * back, so they are absent when reading and present only when an admin has just
 * typed a new one. `configured` and `webhook_configured` are what the UI reads
 * instead — the server derives them, and a blank credential on save leaves the
 * stored one alone.
 */
export const StripeSchema = z.object({
  enabled: z.boolean(),
  publishable_key: z.string(),
  secret_key: z.string().optional(),
  webhook_secret: z.string().optional(),
  test_mode: z.boolean().optional(),
  configured: z.boolean(),
  webhook_configured: z.boolean().optional(),
  env_configured: z.boolean().optional()
});

export const EmailServiceSchema = z.object({
  enabled: z.boolean(),
  smtp_host: z.string(),
  smtp_port: z.number().int().min(1).max(65535),
  smtp_user: z.string(),
  smtp_pass: z.string().optional(),
  email_from: z.string().email().optional().or(z.literal('')),
  configured: z.boolean()
});

export const SecurityConfigSchema = z.object({
  require_email_verification: z.boolean(),
  max_failed_login_attempts: z.number().int().min(1).max(50),
  account_lockout_duration: z.number().int().min(0)
});

export const ProjectSettingsSchema = z.object({
  google_oauth: GoogleOAuthSchema.optional(),
  stripe: StripeSchema.optional(),
  email: EmailServiceSchema.optional(),
  security: SecurityConfigSchema.optional()
});

// ========================================
// GENERAL SETTINGS SCHEMAS
// ========================================

export const CurrencySettingsSchema = z.object({
  currency: z.string().min(3).max(3), // ISO currency codes
  symbolPosition: z.enum(['before', 'after']),
  decimalPlaces: z.number().int().min(0).max(4),
  thousandsSeparator: z.enum([',', '.', ' ', 'none']),
  decimalSeparator: z.enum(['.', ','])
});

export const DateTimeSettingsSchema = z.object({
  dateFormat: z.string(),
  timeFormat: z.string()
});

export const InvoiceNumberSettingsSchema = z.object({
  prefix: z.string().max(10)
});

export const PaginationSettingsSchema = z.object({
  defaultItemsPerPage: z.number().int().min(5).max(500),
  availablePageSizes: z.array(z.number().int().min(5).max(500)).min(1),
  maxItemsPerPage: z.number().int().min(100).max(1000),
  showItemsPerPageSelector: z.boolean(),
  showPageNumbers: z.boolean(),
  maxPageNumbers: z.number().int().min(3).max(20)
});

// ========================================
// APPEARANCE SETTINGS SCHEMAS
// ========================================

export const ThemeSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  invoiceTemplate: z.enum(['modern-blue', 'classic-white', 'minimal-gray', 'professional-black']),
  pdfFormat: z.enum(['A4', 'Letter', 'Legal'])
});

// ========================================
// NOTIFICATION SETTINGS SCHEMAS
// ========================================

export const NotificationSettingsSchema = z.object({
  emailNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  invoiceReminders: z.boolean(),
  paymentAlerts: z.boolean(),
  systemUpdates: z.boolean()
});

// ========================================
// STRIPE SETTINGS SCHEMA (Enhanced)
// ========================================

export const StripeSettingsSchema = z.object({
  webhookSecret: z.string(),
  webhookEndpoint: z.string().url().optional().or(z.literal('')),
  testMode: z.boolean(),
  publishableKey: z.string().regex(/^pk_(test_|live_)/, 'Invalid publishable key format'),
  secretKey: z.string().regex(/^sk_(test_|live_)/, 'Invalid secret key format'),
  isEnabled: z.boolean(),
  accountId: z.string().optional(),
  accountName: z.string().optional(),
  connectedAt: z.string().optional()
});

// ========================================
// EMAIL SETTINGS SCHEMA (Enhanced)
// ========================================

export const EmailSettingsSchema = z.object({
  isEnabled: z.boolean(),
  smtpHost: z.string().min(1, 'SMTP host is required'),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUsername: z.string().min(1, 'SMTP username is required'),
  smtpPassword: z.string().min(1, 'SMTP password is required'),
  fromEmail: z.string().email('Valid email address required'),
  fromName: z.string().optional(),
  useSSL: z.boolean(),
  useTLS: z.boolean()
});

// ========================================
// COMBINED SETTINGS SCHEMAS
// ========================================

export const AllSettingsSchema = z.object({
  project: ProjectSettingsSchema.optional(),
  general: z.object({
    currency: CurrencySettingsSchema.optional(),
    dateTime: DateTimeSettingsSchema.optional(),
    invoiceNumber: InvoiceNumberSettingsSchema.optional(),
    pagination: PaginationSettingsSchema.optional()
  }).optional(),
  appearance: ThemeSettingsSchema.optional(),
  notifications: NotificationSettingsSchema.optional(),
  stripe: StripeSettingsSchema.optional(),
  email: EmailSettingsSchema.optional()
});

// ========================================
// VALIDATION FUNCTIONS
// ========================================

export function validateProjectSettings(data: unknown): ProjectSettings {
  try {
    return ProjectSettingsSchema.parse(data) as ProjectSettings;
  } catch (error) {
    console.error('ProjectSettings validation failed:', error);
    throw new Error(`Invalid project settings: ${error instanceof z.ZodError ? error.message : 'Unknown error'}`);
  }
}

export function validateCurrencySettings(data: unknown): CurrencySettings {
  try {
    return CurrencySettingsSchema.parse(data) as CurrencySettings;
  } catch (error) {
    console.error('CurrencySettings validation failed:', error);
    throw new Error(`Invalid currency settings: ${error instanceof z.ZodError ? error.message : 'Unknown error'}`);
  }
}

export function validateDateTimeSettings(data: unknown): DateTimeSettings {
  try {
    return DateTimeSettingsSchema.parse(data) as DateTimeSettings;
  } catch (error) {
    console.error('DateTimeSettings validation failed:', error);
    throw new Error(`Invalid date/time settings: ${error instanceof z.ZodError ? error.message : 'Unknown error'}`);
  }
}

export function validateInvoiceNumberSettings(data: unknown): InvoiceNumberSettings {
  try {
    return InvoiceNumberSettingsSchema.parse(data) as InvoiceNumberSettings;
  } catch (error) {
    console.error('InvoiceNumberSettings validation failed:', error);
    throw new Error(`Invalid invoice number settings: ${error instanceof z.ZodError ? error.message : 'Unknown error'}`);
  }
}

export function validatePaginationSettings(data: unknown): PaginationSettings {
  try {
    return PaginationSettingsSchema.parse(data) as PaginationSettings;
  } catch (error) {
    console.error('PaginationSettings validation failed:', error);
    throw new Error(`Invalid pagination settings: ${error instanceof z.ZodError ? error.message : 'Unknown error'}`);
  }
}

export function validateStripeSettings(data: unknown): z.infer<typeof StripeSettingsSchema> {
  try {
    return StripeSettingsSchema.parse(data);
  } catch (error) {
    console.error('StripeSettings validation failed:', error);
    throw new Error(`Invalid Stripe settings: ${error instanceof z.ZodError ? error.message : 'Unknown error'}`);
  }
}

export function validateEmailSettings(data: unknown): z.infer<typeof EmailSettingsSchema> {
  try {
    return EmailSettingsSchema.parse(data);
  } catch (error) {
    console.error('EmailSettings validation failed:', error);
    throw new Error(`Invalid email settings: ${error instanceof z.ZodError ? error.message : 'Unknown error'}`);
  }
}

export function validateThemeSettings(data: unknown): z.infer<typeof ThemeSettingsSchema> {
  try {
    return ThemeSettingsSchema.parse(data);
  } catch (error) {
    console.error('ThemeSettings validation failed:', error);
    throw new Error(`Invalid theme settings: ${error instanceof z.ZodError ? error.message : 'Unknown error'}`);
  }
}

export function validateNotificationSettings(data: unknown): z.infer<typeof NotificationSettingsSchema> {
  try {
    return NotificationSettingsSchema.parse(data);
  } catch (error) {
    console.error('NotificationSettings validation failed:', error);
    throw new Error(`Invalid notification settings: ${error instanceof z.ZodError ? error.message : 'Unknown error'}`);
  }
}

// ========================================
// SAFE PARSING WITH DEFAULTS
// ========================================

export function parseProjectSettingsWithDefaults(data: unknown): ProjectSettings {
  const defaultSettings: ProjectSettings = {
    google_oauth: {
      enabled: false,
      client_id: '',
      client_secret: '',
      configured: false
    },
    stripe: {
      enabled: false,
      publishable_key: '',
      secret_key: '',
      configured: false
    },
    email: {
      enabled: false,
      smtp_host: '',
      smtp_port: 587,
      smtp_user: '',
      smtp_pass: '',
      email_from: '',
      configured: false
    },
    security: {
      require_email_verification: true,
      max_failed_login_attempts: 5,
      account_lockout_duration: 1800000
    }
  };

  try {
    const parsed = ProjectSettingsSchema.parse(data);
    return {
      google_oauth: { ...defaultSettings.google_oauth, ...parsed.google_oauth },
      stripe: { ...defaultSettings.stripe, ...parsed.stripe },
      email: { ...defaultSettings.email, ...parsed.email },
      security: { ...defaultSettings.security, ...parsed.security }
    };
  } catch (error) {
    console.warn('Using default project settings due to validation error:', error);
    return defaultSettings;
  }
}

export function parseCurrencySettingsWithDefaults(data: unknown): CurrencySettings {
  const defaultSettings: CurrencySettings = {
    currency: 'USD',
    symbolPosition: 'before',
    decimalPlaces: 2,
    thousandsSeparator: 'none',
    decimalSeparator: '.'
  };

  try {
    return CurrencySettingsSchema.parse(data) as CurrencySettings;
  } catch (error) {
    console.warn('Using default currency settings due to validation error:', error);
    return defaultSettings;
  }
}

export function parseDateTimeSettingsWithDefaults(data: unknown): DateTimeSettings {
  const defaultSettings: DateTimeSettings = {
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12-hour'
  };

  try {
    return DateTimeSettingsSchema.parse(data) as DateTimeSettings;
  } catch (error) {
    console.warn('Using default date/time settings due to validation error:', error);
    return defaultSettings;
  }
}

export function parseInvoiceNumberSettingsWithDefaults(data: unknown): InvoiceNumberSettings {
  const defaultSettings: InvoiceNumberSettings = {
    prefix: 'INV'
  };

  try {
    return InvoiceNumberSettingsSchema.parse(data) as InvoiceNumberSettings;
  } catch (error) {
    console.warn('Using default invoice number settings due to validation error:', error);
    return defaultSettings;
  }
}

export function parsePaginationSettingsWithDefaults(data: unknown): PaginationSettings {
  const defaultSettings: PaginationSettings = {
    defaultItemsPerPage: 25,
    availablePageSizes: [10, 25, 50, 100],
    maxItemsPerPage: 500,
    showItemsPerPageSelector: true,
    showPageNumbers: true,
    maxPageNumbers: 5
  };

  try {
    return PaginationSettingsSchema.parse(data) as PaginationSettings;
  } catch (error) {
    console.warn('Using default pagination settings due to validation error:', error);
    return defaultSettings;
  }
}

// ========================================
// VALIDATION HELPERS
// ========================================

export function validateInvoiceNumber(invoiceNumber: string): boolean {
  return /^[A-Z0-9-_]{1,20}$/.test(invoiceNumber);
}

export function validatePassword(password: string, requirements = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < requirements.minLength) {
    errors.push(`Password must be at least ${requirements.minLength} characters long`);
  }

  if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (requirements.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (requirements.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (requirements.requireSpecialChars && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// ========================================
// TYPE EXPORTS
// ========================================

export type StripeSettingsType = z.infer<typeof StripeSettingsSchema>;
export type EmailSettingsType = z.infer<typeof EmailSettingsSchema>;
export type ThemeSettingsType = z.infer<typeof ThemeSettingsSchema>;
export type NotificationSettingsType = z.infer<typeof NotificationSettingsSchema>;