// Settings Service - Domain-specific service for settings operations
// Handles all settings-related business logic and database operations

import { databaseService } from '../core/DatabaseService.js';
import { type Setting, type ProjectSettings, type SettingValue } from '../types/index.js';

/**
 * Project settings live in the `settings` table as one flat key per value
 * (`stripe.secret_key`), JSON-encoded in the `value` column — the same encoding
 * `getAllSettings` decodes.
 *
 * Reads tolerate a bare string too, because settings written by other paths are
 * not always encoded.
 */
const readSetting = (settingsMap: Record<string, string>, key: string): unknown => {
  const raw = settingsMap[key];
  if (raw === undefined || raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

/** A stored string, or undefined when absent or blank, so `??` falls through to .env. */
const readString = (settingsMap: Record<string, string>, key: string): string | undefined => {
  const value = readSetting(settingsMap, key);
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
};

const readBoolean = (settingsMap: Record<string, string>, key: string): boolean | undefined => {
  const value = readSetting(settingsMap, key);
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 'true' || value === 1 || value === '1';
};

const readNumber = (settingsMap: Record<string, string>, key: string): number | undefined => {
  const value = readSetting(settingsMap, key);
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const envString = (name: string): string | undefined => {
  const value = process.env[name];
  return value && value !== '' ? value : undefined;
};

const envBoolean = (name: string): boolean | undefined => {
  const value = process.env[name];
  if (value === undefined || value === '') return undefined;
  return value === 'true' || value === '1';
};

const envNumber = (name: string): number | undefined => {
  const value = process.env[name];
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Credentials resolved for server-side use. Never serialised to a response.
 */
export interface StripeCredentials {
  enabled: boolean;
  testMode: boolean;
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  configured: boolean;
}

/**
 * Settings Service
 * Manages application settings and project configuration
 */
export class SettingsService {
  /**
   * Get all settings by category (using key prefix since table doesn't have category column)
   */
  async getAllSettings(category?: string): Promise<Record<string, unknown>> {
    let query = 'SELECT `key`, value FROM settings';
    const params: (string | number)[] = [];

    if (category) {
      // Use key prefix to simulate category filtering
      query += ' WHERE `key` LIKE ?';
      params.push(`${category}.%`);
    }

    query += ' ORDER BY `key`';

    const results = await databaseService.getMany<{key: string, value: string}>(query, params);

    const settings: Record<string, unknown> = {};

    results.forEach(row => {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    });

    return settings;
  }

  /**
   * Get individual setting by key
   */
  async getSettingByKey(key: string): Promise<unknown> {
    if (!key || typeof key !== 'string') {
      throw new Error('Valid setting key is required');
    }

    const result = await databaseService.getOne<{value: string}>('SELECT value FROM settings WHERE `key` = ?', [key]);

    if (result?.value) {
      try {
        return JSON.parse(result.value);
      } catch {
        return result.value;
      }
    }
    
    return null;
  }

  /**
   * Save individual setting
   */
  async saveSetting(key: string, value: SettingValue, category: string = 'general'): Promise<boolean> {
    if (!key || typeof key !== 'string') {
      throw new Error('Setting key is required');
    }

    // Include category in the key if not already present
    const settingKey = key.includes('.') ? key : `${category}.${key}`;
    
    const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);

    await databaseService.executeQuery(
      databaseService.dialect.insertOrReplace('settings', ['key', 'value', 'category']),
      [settingKey, jsonValue, category]
    );

    return true;
  }

  /**
   * Update format-related settings (PDF format, date format, currency format, etc.)
   */
  async updateFormatSettings(settings: Record<string, SettingValue>): Promise<boolean> {
    if (!settings || typeof settings !== 'object') {
      throw new Error('Format settings object is required');
    }

    const formatCategory = 'format';
    const operations = async () => {
      for (const [key, value] of Object.entries(settings)) {
        if (value === undefined) continue;

        const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);

        await databaseService.executeQuery(
          databaseService.dialect.insertOrReplace('settings', ['key', 'value', 'category']),
          [key, jsonValue, formatCategory]
        );
      }
    };

    await databaseService.executeTransaction(operations);
    return true;
  }

  /**
   * Save multiple settings in a transaction
   */
  async saveMultipleSettings(settings: Record<string, {
    value: SettingValue;
    category?: string;
  }>): Promise<boolean> {
    if (!settings || typeof settings !== 'object') {
      throw new Error('Settings object is required');
    }

    const operations = async () => {
      for (const [key, data] of Object.entries(settings)) {
        if (!data || typeof data !== 'object') {
          throw new Error(`Invalid setting data for key: ${key}`);
        }

        const { value, category = 'general' } = data;
        const settingKey = key.includes('.') ? key : `${category}.${key}`;
        const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);

        await databaseService.executeQuery(
          databaseService.dialect.insertOrReplace('settings', ['key', 'value', 'category']),
          [settingKey, jsonValue, category]
        );
      }
    };

    await databaseService.executeTransaction(operations);
    return true;
  }

  /**
   * Resolve project settings, credentials included.
   *
   * Precedence is the same for every field: a value saved in the settings UI
   * wins, and `.env` is the fallback. That direction is what makes the UI
   * mean something — with `.env` winning, an admin could type a key, save it,
   * and watch the old one keep being used. Leaving a field blank in the UI
   * stores nothing, so the `.env` value comes back through.
   *
   * SERVER-SIDE ONLY: the result carries the Stripe secret key, the SMTP
   * password and the OAuth client secret. Anything that answers an HTTP
   * request must use `getProjectSettings` or `getPublicProjectSettings`.
   */
  private async resolveProjectSettings(): Promise<ProjectSettings> {
    const dbSettings = await databaseService.getMany<{key: string, value: string}>(
      'SELECT `key`, value FROM settings WHERE `key` LIKE ? OR `key` LIKE ? OR `key` LIKE ? OR `key` LIKE ?',
      ['google_oauth.%', 'stripe.%', 'email.%', 'security.%']
    );

    const settingsMap: Record<string, string> = {};
    dbSettings.forEach(setting => {
      settingsMap[setting.key] = setting.value;
    });

    const googleClientId = readString(settingsMap, 'google_oauth.client_id') ?? envString('GOOGLE_CLIENT_ID');
    const googleClientSecret = readString(settingsMap, 'google_oauth.client_secret') ?? envString('GOOGLE_CLIENT_SECRET');

    const stripeSecretKey = readString(settingsMap, 'stripe.secret_key') ?? envString('STRIPE_SECRET_KEY');
    const stripePublishableKey = readString(settingsMap, 'stripe.publishable_key') ?? envString('STRIPE_PUBLISHABLE_KEY');
    const stripeWebhookSecret = readString(settingsMap, 'stripe.webhook_secret') ?? envString('STRIPE_WEBHOOK_SECRET');

    const smtpHost = readString(settingsMap, 'email.smtp_host') ?? envString('SMTP_HOST');
    const smtpUser = readString(settingsMap, 'email.smtp_user') ?? envString('SMTP_USER');
    const smtpPass = readString(settingsMap, 'email.smtp_pass') ?? envString('SMTP_PASS');
    const emailFrom = readString(settingsMap, 'email.email_from') ?? envString('EMAIL_FROM');

    // An integration configured entirely through .env counts as switched on
    // until someone says otherwise. A deployment that puts the credentials in
    // .env has already decided to use it, and making it also hunt for a toggle
    // is a second answer to a question already answered. An explicit toggle
    // still wins, so it can be switched back off without editing .env.
    const googleConfiguredInEnv = !!(envString('GOOGLE_CLIENT_ID') && envString('GOOGLE_CLIENT_SECRET'));
    const stripeConfiguredInEnv = !!(envString('STRIPE_SECRET_KEY') && envString('STRIPE_PUBLISHABLE_KEY'));

    return {
      google_oauth: {
        enabled: readBoolean(settingsMap, 'google_oauth.enabled') ?? googleConfiguredInEnv,
        client_id: googleClientId ?? '',
        ...(googleClientSecret && { client_secret: googleClientSecret }),
        configured: !!(googleClientId && googleClientSecret),
        env_configured: googleConfiguredInEnv
      },
      stripe: {
        enabled: readBoolean(settingsMap, 'stripe.enabled') ?? stripeConfiguredInEnv,
        env_configured: stripeConfiguredInEnv,
        // Test mode is inferred from the key itself unless it was set
        // explicitly — an `sk_test_` key cannot be anything but test mode,
        // and a stale toggle claiming otherwise only misleads.
        test_mode: readBoolean(settingsMap, 'stripe.test_mode')
          ?? envBoolean('STRIPE_TEST_MODE')
          ?? !stripeSecretKey?.startsWith('sk_live_'),
        publishable_key: stripePublishableKey ?? '',
        ...(stripeSecretKey && { secret_key: stripeSecretKey }),
        ...(stripeWebhookSecret && { webhook_secret: stripeWebhookSecret }),
        configured: !!(stripePublishableKey && stripeSecretKey),
        webhook_configured: !!stripeWebhookSecret
      },
      email: {
        enabled: readBoolean(settingsMap, 'email.enabled') ?? false,
        smtp_host: smtpHost ?? '',
        smtp_port: readNumber(settingsMap, 'email.smtp_port') ?? envNumber('SMTP_PORT') ?? 587,
        smtp_user: smtpUser ?? '',
        ...(smtpPass && { smtp_pass: smtpPass }),
        email_from: emailFrom ?? '',
        configured: !!(smtpHost && smtpUser && emailFrom)
      },
      security: {
        require_email_verification: readBoolean(settingsMap, 'security.require_email_verification')
          ?? envBoolean('REQUIRE_EMAIL_VERIFICATION') ?? false,
        max_failed_login_attempts: readNumber(settingsMap, 'security.max_failed_login_attempts')
          ?? envNumber('MAX_FAILED_LOGIN_ATTEMPTS') ?? 5,
        account_lockout_duration: readNumber(settingsMap, 'security.account_lockout_duration')
          ?? envNumber('ACCOUNT_LOCKOUT_DURATION') ?? 1800000,
        password_policy: {
          min_length: readNumber(settingsMap, 'security.password_policy.min_length') ?? 8,
          require_uppercase: readBoolean(settingsMap, 'security.password_policy.require_uppercase') ?? false,
          require_lowercase: readBoolean(settingsMap, 'security.password_policy.require_lowercase') ?? false,
          require_numbers: readBoolean(settingsMap, 'security.password_policy.require_numbers') ?? false,
          require_special: readBoolean(settingsMap, 'security.password_policy.require_special') ?? false
        }
      }
    };
  }

  /**
   * Project settings for the admin settings screens.
   *
   * Every credential is stripped: the response says whether an integration is
   * `configured`, never what it was configured with. This endpoint used to
   * return `security.jwt_secret`, `security.session_secret`, the Stripe secret
   * key, the SMTP password and the OAuth client secret to any caller.
   */
  async getProjectSettings(): Promise<ProjectSettings> {
    try {
      const { google_oauth, stripe, email, security } = await this.resolveProjectSettings();

      return {
        google_oauth: {
          enabled: google_oauth.enabled,
          client_id: google_oauth.client_id,
          configured: google_oauth.configured,
          env_configured: google_oauth.env_configured ?? false
        },
        stripe: {
          enabled: stripe.enabled,
          test_mode: stripe.test_mode ?? true,
          // Publishable by name and by design — it ships in the browser.
          publishable_key: stripe.publishable_key,
          configured: stripe.configured,
          webhook_configured: stripe.webhook_configured ?? false,
          env_configured: stripe.env_configured ?? false
        },
        email: {
          enabled: email.enabled,
          smtp_host: email.smtp_host ?? '',
          smtp_port: email.smtp_port ?? 587,
          smtp_user: email.smtp_user ?? '',
          email_from: email.email_from ?? '',
          configured: email.configured
        },
        security
      };
    } catch (error) {
      console.error('SettingsService.getProjectSettings error:', error);
      throw new Error(`Failed to get project settings: ${(error as Error).message}`);
    }
  }

  /**
   * Project settings for callers that have not signed in.
   *
   * The login screen needs to know whether to offer the Google button and
   * whether verification is required; it has no business knowing the SMTP host
   * or that Stripe exists.
   */
  async getPublicProjectSettings(): Promise<ProjectSettings> {
    const { google_oauth, security } = await this.resolveProjectSettings();

    return {
      google_oauth: {
        enabled: google_oauth.enabled,
        client_id: google_oauth.enabled ? google_oauth.client_id : '',
        configured: google_oauth.configured
      },
      stripe: { enabled: false, publishable_key: '', configured: false },
      email: { enabled: false, configured: false },
      security: {
        require_email_verification: security.require_email_verification ?? false
      }
    };
  }

  /**
   * Stripe credentials for server-side use. Never serialise this.
   */
  async getStripeCredentials(): Promise<StripeCredentials> {
    const { stripe } = await this.resolveProjectSettings();

    return {
      enabled: stripe.enabled,
      testMode: stripe.test_mode ?? true,
      secretKey: stripe.secret_key ?? '',
      publishableKey: stripe.publishable_key,
      webhookSecret: stripe.webhook_secret ?? '',
      configured: stripe.configured
    };
  }

  /**
   * Update project settings
   *
   * Two rules govern what actually reaches the database:
   *
   * `enabled` is stored as an ordinary key (`stripe.enabled`). It used to be
   * lifted out into an `enabled` column that the settings table does not have
   * and the INSERT never wrote, so switching an integration on was silently
   * dropped and `getProjectSettings` read it back as false, every time.
   *
   * A blank credential is a no-op, not an erasure. The settings screens never
   * receive stored secrets back — they cannot, that is the point — so they post
   * an empty string for any secret the admin did not retype. Writing that
   * through would wipe the key on every unrelated save.
   */
  async updateProjectSettings(settings: Partial<ProjectSettings>): Promise<boolean> {
    if (!settings || typeof settings !== 'object') {
      throw new Error('Settings object is required');
    }

    const isSecret = (key: string): boolean =>
      key.endsWith('secret_key') || key.endsWith('client_secret')
      || key.endsWith('webhook_secret') || key.endsWith('smtp_pass');

    // `configured` is derived on read from whether the credentials resolve;
    // storing a client-supplied copy would let the UI assert it.
    const isDerived = (key: string): boolean => key.endsWith('configured');

    const flattenSettings = (obj: Record<string, unknown>, prefix: string = ''): Setting[] => {
      const flattened: Setting[] = [];

      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (isDerived(fullKey)) {
          continue;
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          flattened.push(...flattenSettings(value as Record<string, unknown>, fullKey));
        } else {
          if (isSecret(fullKey) && (value === undefined || value === null || value === '')) {
            continue;
          }
          flattened.push({
            key: fullKey,
            value: JSON.stringify(value),
            id: 0, // Temporary ID, will be set by database
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }
      return flattened;
    };

    const flatSettings = flattenSettings(settings as Record<string, unknown>);

    // Use transaction for bulk updates
    const operations = async () => {
      for (const setting of flatSettings) {
        await databaseService.executeQuery(
          databaseService.dialect.insertOrReplace('settings', ['key', 'value', 'category']),
          [setting.key, setting.value, 'project']
        );
      }
    };

    await databaseService.executeTransaction(operations);
    return true;
  }

  /**
   * Get security setting value
   */
  async getSecuritySetting(settingName: string): Promise<SettingValue> {
    if (!settingName || typeof settingName !== 'string') {
      throw new Error('Setting name is required');
    }

    const setting = await databaseService.getOne<{value: string}>(
      'SELECT value FROM settings WHERE `key` = ?',
      [`security.${settingName}`]
    );
    
    if (setting) {
      try {
        return JSON.parse(setting.value);
      } catch {
        return setting.value;
      }
    }
    
    // Fallback to environment variables
    switch (settingName) {
      case 'require_email_verification':
        return process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
      case 'max_failed_login_attempts':
        return parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS || '5') || 5;
      case 'account_lockout_duration':
        return parseInt(process.env.ACCOUNT_LOCKOUT_DURATION || '1800000') || 1800000;
      default:
        return null;
    }
  }

  /**
   * Delete setting by key
   */
  async deleteSetting(key: string): Promise<boolean> {
    if (!key || typeof key !== 'string') {
      throw new Error('Valid setting key is required');
    }

    const result = await databaseService.executeQuery('DELETE FROM settings WHERE `key` = ?', [key]);
    return result.changes > 0;
  }

  /**
   * Delete settings by category (using key prefix)
   */
  async deleteSettingsByCategory(category: string): Promise<number> {
    if (!category || typeof category !== 'string') {
      throw new Error('Valid category is required');
    }

    const result = await databaseService.executeQuery('DELETE FROM settings WHERE `key` LIKE ?', [`${category}.%`]);
    return result.changes;
  }

  /**
   * Get all categories (extracted from key prefixes)
   */
  async getCategories(): Promise<string[]> {
    // The pattern is a bound parameter, not a literal: MySQL reads "%.%" as an
    // identifier rather than a string under its default sql_mode, so the
    // double-quoted form would fail there while working on SQLite.
    const results = await databaseService.getMany<{key: string}>(
      'SELECT DISTINCT `key` FROM settings WHERE `key` LIKE ? ORDER BY `key`',
      ['%.%']
    );

    // Extract categories from keys (everything before the first dot)
    const categories = new Set<string>();
    results.forEach(row => {
      const category = row.key.split('.')[0];
      if (category) {
        categories.add(category);
      }
    });
    
    return Array.from(categories).sort();
  }

  /**
   * Check if setting exists
   */
  async settingExists(key: string): Promise<boolean> {
    if (!key || typeof key !== 'string') {
      return false;
    }

    return await databaseService.exists('settings', 'key', key);
  }

  /**
   * Get settings count by category (using key prefix)
   */
  async getSettingsCount(category?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM settings';
    const params: (string | number | null | boolean)[] = [];

    if (category) {
      query += ' WHERE `key` LIKE ?';
      params.push(`${category}.%`);
    }

    const result = await databaseService.getOne<{count: number}>(query, params);
    return result?.count || 0;
  }

  /**
   * Reset settings to defaults (using key prefix for category)
   */
  async resetSettings(category?: string): Promise<boolean> {
    let query = 'DELETE FROM settings';
    const params: (string | number | null | boolean)[] = [];

    if (category) {
      query += ' WHERE `key` LIKE ?';
      params.push(`${category}.%`);
    }

    await databaseService.executeQuery(query, params);
    return true;
  }
}

// Export singleton instance
export const settingsService = new SettingsService();