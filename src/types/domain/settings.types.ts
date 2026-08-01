// Settings-related types and interfaces for all settings components

// Toast/Notification position types
export type ToastPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
export type SmtpSecurityType = 'tls' | 'ssl' | 'none';

// Tax Settings
export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  isDefault: boolean;
}

export interface TaxSettings {
  rates: TaxRate[];
  defaultRateId?: string;
  taxInclusivePricing: boolean;
  showTaxBreakdown: boolean;
}

// Shipping Settings
export interface ShippingRate {
  id: string;
  name: string;
  amount: number;
  isDefault: boolean;
}

export interface ShippingSettings {
  rates: ShippingRate[];
  defaultRateId?: string;
  freeShippingThreshold?: number;
  enableShipping: boolean;
}

// Email Settings (consolidating from auth.ts)
export interface EmailSettings {
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  smtpSecure: SmtpSecurityType;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  isEnabled: boolean;
}

// Raw email settings record as persisted in the settings table.
// Stored keys are snake_case and older records use alternative key names,
// so every field is optional and read defensively before mapping to EmailSettings.
export interface StoredEmailSettings {
  smtp_host?: string;
  smtp_port?: number | string;
  smtp_username?: string;
  smtp_user?: string;
  smtp_password?: string;
  smtp_secure?: string;
  from_email?: string;
  from_name?: string;
  reply_to_email?: string;
  is_enabled?: boolean;
  isEnabled?: boolean;
}

// Notification Settings
export interface NotificationSettings {
  showToastNotifications: boolean;
  showSuccessToasts: boolean;
  showErrorToasts: boolean;
  showWarningToasts: boolean;
  showInfoToasts: boolean;
  toastDuration: number;
  toastPosition: ToastPosition;
}

// Appearance Settings
export interface AppearanceSettings {
  theme: string;
  primaryColor: string;
  accentColor: string;
  fontSize: 'small' | 'medium' | 'large';
  compactMode: boolean;
  animations: boolean;
}

// General Application Settings
export interface GeneralSettings {
  companyName: string;
  defaultCurrency: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  firstDayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, etc.
  timezone: string;
  language: string;
  autoSave: boolean;
  autoSaveInterval: number; // in minutes
}

// Database Backup Settings
export interface BackupSettings {
  autoBackup: boolean;
  backupInterval: 'daily' | 'weekly' | 'monthly';
  maxBackups: number;
  backupLocation: string;
  includeUploads: boolean;
  compressBackups: boolean;
}

// Company Details Settings (from CompanySettings in common.types.ts)
export interface CompanyDetails {
  companyName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  website?: string;
  taxId?: string;
}

// Branding Settings
export interface BrandingSettings {
  logo: string;
  favicon: string;
  primaryColor: string;
  secondaryColor: string;
  brandingImage: string;
  customCss?: string;
}

// Settings form data types (for form handling)
export interface TaxRateFormData {
  name: string;
  rate: number;
  isDefault?: boolean;
}

export interface ShippingRateFormData {
  name: string;
  amount: number;
  isDefault?: boolean;
}

export interface EmailSettingsFormData {
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  smtpSecure: SmtpSecurityType;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  isEnabled: boolean;
}

// Email configuration status for checking if email can be sent
export interface EmailConfigStatus {
  isConfigured: boolean;
  isEnabled: boolean;
  missingFields: string[];
  canSendEmails: boolean;
}

/** How an SMTP connection is secured. */
export type SmtpSecurity = 'ssl' | 'tls' | 'none';

/**
 * Email configuration as reported by GET /api/email/status.
 *
 * Says what is configured and what is missing, never the password. This is
 * resolved on the server from the saved settings with .env as the fallback, so
 * it is the single answer to "can this install send mail" — the browser cannot
 * work that out for itself, and the version that tried read `process.env` in
 * the browser, where it does not exist.
 */
export interface SmtpStatus {
  isEnabled: boolean;
  configured: boolean;
  missingFields: string[];
  canSendEmails: boolean;
  host: string;
  port: number;
  security: SmtpSecurity;
  user: string;
  fromEmail: string;
  fromName: string;
}

// Currency formatting settings
export interface CurrencySettings {
  currency: string;
  symbolPosition: 'before' | 'after';
  decimalPlaces: number;
  thousandsSeparator: ',' | '.' | ' ' | 'none';
  decimalSeparator: '.' | ',';
}

// Settings categories for navigation and organization
export type SettingsCategory = 
  | 'general'
  | 'appearance'
  | 'company'
  | 'branding'
  | 'email'
  | 'notifications'
  | 'tax'
  | 'shipping'
  | 'backup'
  | 'security'
  | 'integrations';

// Generic settings item structure for key-value storage
export interface SettingsItem {
  key: string;
  value: unknown;
  category: SettingsCategory;
  description?: string;
  created_at: string;
  updated_at: string;
}

// Settings update operations
export interface SettingsUpdateOperation {
  category: SettingsCategory;
  key: string;
  value: unknown;
  validate?: boolean;
}

// Settings export/import types
export interface SettingsExport {
  version: string;
  exportDate: string;
  categories: SettingsCategory[];
  data: Record<string, unknown>;
}

export interface SettingsImport {
  file: File;
  categories?: SettingsCategory[];
  overwriteExisting: boolean;
}

// Type guards for runtime type checking
export const isTaxRate = (obj: unknown): obj is TaxRate => {
  return typeof obj === 'object' && 
         obj !== null && 
         typeof (obj as TaxRate).id === 'string' &&
         typeof (obj as TaxRate).name === 'string' &&
         typeof (obj as TaxRate).rate === 'number' &&
         typeof (obj as TaxRate).isDefault === 'boolean';
};

export const isShippingRate = (obj: unknown): obj is ShippingRate => {
  return typeof obj === 'object' && 
         obj !== null && 
         typeof (obj as ShippingRate).id === 'string' &&
         typeof (obj as ShippingRate).name === 'string' &&
         typeof (obj as ShippingRate).amount === 'number' &&
         typeof (obj as ShippingRate).isDefault === 'boolean';
};

export const isEmailSettings = (obj: unknown): obj is EmailSettings => {
  return typeof obj === 'object' && 
         obj !== null && 
         typeof (obj as EmailSettings).smtpHost === 'string' &&
         typeof (obj as EmailSettings).smtpPort === 'number' &&
         typeof (obj as EmailSettings).smtpUsername === 'string' &&
         typeof (obj as EmailSettings).fromEmail === 'string';
};

export const isNotificationSettings = (obj: unknown): obj is NotificationSettings => {
  return typeof obj === 'object' && 
         obj !== null && 
         typeof (obj as NotificationSettings).showToastNotifications === 'boolean' &&
         typeof (obj as NotificationSettings).toastDuration === 'number';
};

// Helper functions for working with settings arrays
export const validateTaxRateArray = (data: unknown): TaxRate[] => {
  if (Array.isArray(data)) {
    return data.filter(isTaxRate);
  }
  return [];
};

export const validateShippingRateArray = (data: unknown): ShippingRate[] => {
  if (Array.isArray(data)) {
    return data.filter(isShippingRate);
  }
  return [];
};

// Project Settings TypeScript interfaces
export interface GoogleOAuthSettings {
  enabled: boolean;
  client_id: string;
  client_secret?: string;
  configured: boolean;
}

/**
 * Stripe integration settings combining all fields from component and API usage
 */
export interface StripeSettings {
  // Core configuration
  enabled?: boolean; // Also referred to as isEnabled in components
  isEnabled?: boolean; // Alias for enabled
  publishableKey: string;
  secretKey?: string;
  testMode?: boolean;
  configured?: boolean;

  // Webhook configuration
  webhookSecret?: string;
  webhookEndpoint?: string;

  // Account information
  accountId?: string;
  accountName?: string;
  connectedAt?: string;
}

export interface EmailServiceSettings {
  enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass?: string;
  email_from: string;
  configured: boolean;
}

export interface SecurityConfig {
  require_email_verification: boolean;
  max_failed_login_attempts: number;
  account_lockout_duration: number;
}

// ProjectSettings moved to shared/common.types.ts to avoid duplication
// Import if needed: import { ProjectSettings } from '../shared/common.types';

