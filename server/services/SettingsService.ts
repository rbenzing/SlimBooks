// Settings Service - Domain-specific service for settings operations
// Handles all settings-related business logic and database operations

import { databaseService } from '../core/DatabaseService.js';
import { type Setting, type ProjectSettings, type SettingValue } from '../types/index.js';

/**
 * Settings Service
 * Manages application settings and project configuration
 */
export class SettingsService {
  /**
   * Get all settings by category (using key prefix since table doesn't have category column)
   */
  async getAllSettings(category?: string): Promise<Record<string, unknown>> {
    let query = 'SELECT key, value FROM settings';
    const params: (string | number)[] = [];

    if (category) {
      // Use key prefix to simulate category filtering
      query += ' WHERE key LIKE ?';
      params.push(`${category}.%`);
    }

    query += ' ORDER BY key';

    const results = databaseService.getMany<{key: string, value: string}>(query, params);
    
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

    const result = databaseService.getOne<{value: string}>('SELECT value FROM settings WHERE key = ?', [key]);
    
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
    
    databaseService.executeQuery(
      'INSERT OR REPLACE INTO settings (key, value, category) VALUES (?, ?, ?)',
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
    const operations = () => {
      for (const [key, value] of Object.entries(settings)) {
        if (value === undefined) continue;
        
        const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
        
        databaseService.executeQuery(
          'INSERT OR REPLACE INTO settings (key, value, category) VALUES (?, ?, ?)', 
          [key, jsonValue, formatCategory]
        );
      }
    };

    databaseService.executeTransaction(operations);
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

    const operations = () => {
      for (const [key, data] of Object.entries(settings)) {
        if (!data || typeof data !== 'object') {
          throw new Error(`Invalid setting data for key: ${key}`);
        }

        const { value, category = 'general' } = data;
        const settingKey = key.includes('.') ? key : `${category}.${key}`;
        const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
        
        databaseService.executeQuery(
          'INSERT OR REPLACE INTO settings (key, value, category) VALUES (?, ?, ?)', 
          [settingKey, jsonValue, category]
        );
      }
    };

    databaseService.executeTransaction(operations);
    return true;
  }

  /**
   * Get project settings with environment defaults
   */
  async getProjectSettings(): Promise<ProjectSettings> {
    try {
      // Get all project settings from database using settings table
      const dbSettings = databaseService.getMany<{key: string, value: string}>(
        'SELECT key, value FROM settings WHERE key LIKE ? OR key LIKE ? OR key LIKE ? OR key LIKE ?',
        ['google_oauth.%', 'stripe.%', 'email.%', 'security.%']
      );

      // Convert database settings to a map for easy lookup
      const settingsMap: Record<string, string> = {};
      dbSettings.forEach(setting => {
        settingsMap[setting.key] = setting.value;
      });

      // Create settings object with .env defaults and database overrides
      const projectSettings: ProjectSettings = {
        google_oauth: {
          enabled: settingsMap['google_oauth.enabled'] === 'true' || false,
          client_id: settingsMap['google_oauth.client_id'] || process.env.GOOGLE_CLIENT_ID || '',
          ...(settingsMap['google_oauth.client_secret'] && { client_secret: settingsMap['google_oauth.client_secret'] }),
          ...(process.env.GOOGLE_CLIENT_SECRET && { client_secret: process.env.GOOGLE_CLIENT_SECRET }),
          configured: !!(
            (settingsMap['google_oauth.client_id'] || process.env.GOOGLE_CLIENT_ID) && 
            (settingsMap['google_oauth.client_secret'] || process.env.GOOGLE_CLIENT_SECRET)
          )
        },
        stripe: {
          enabled: settingsMap['stripe.enabled'] === 'true' || false,
          publishable_key: settingsMap['stripe.publishable_key'] || process.env.STRIPE_PUBLISHABLE_KEY || '',
          ...(settingsMap['stripe.secret_key'] && { secret_key: settingsMap['stripe.secret_key'] }),
          ...(process.env.STRIPE_SECRET_KEY && { secret_key: process.env.STRIPE_SECRET_KEY }),
          configured: !!(
            (settingsMap['stripe.publishable_key'] || process.env.STRIPE_PUBLISHABLE_KEY) && 
            (settingsMap['stripe.secret_key'] || process.env.STRIPE_SECRET_KEY)
          )
        },
        email: {
          enabled: settingsMap['email.enabled'] === 'true' || false,
          smtp_host: settingsMap['email.smtp_host'] || process.env.SMTP_HOST || '',
          smtp_port: parseInt(settingsMap['email.smtp_port'] || process.env.SMTP_PORT || '587') || 587,
          smtp_user: settingsMap['email.smtp_user'] || process.env.SMTP_USER || '',
          ...(settingsMap['email.smtp_pass'] && { smtp_pass: settingsMap['email.smtp_pass'] }),
          ...(process.env.SMTP_PASS && { smtp_pass: process.env.SMTP_PASS }),
          email_from: settingsMap['email.email_from'] || process.env.EMAIL_FROM || '',
          configured: !!(
            (settingsMap['email.smtp_host'] || process.env.SMTP_HOST) && 
            (settingsMap['email.smtp_user'] || process.env.SMTP_USER) && 
            (settingsMap['email.email_from'] || process.env.EMAIL_FROM)
          )
        },
        security: {
          jwt_secret: process.env.JWT_SECRET || '',
          session_secret: process.env.SESSION_SECRET || '',
          require_email_verification: settingsMap['security.require_email_verification'] === 'true' || process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
          max_failed_login_attempts: parseInt(settingsMap['security.max_failed_login_attempts'] || process.env.MAX_FAILED_LOGIN_ATTEMPTS || '5') || 5,
          account_lockout_duration: parseInt(settingsMap['security.account_lockout_duration'] || process.env.ACCOUNT_LOCKOUT_DURATION || '1800000') || 1800000,
          password_policy: {
            min_length: parseInt(settingsMap['security.password_policy.min_length'] || '8') || 8,
            require_uppercase: settingsMap['security.password_policy.require_uppercase'] === 'true' || false,
            require_lowercase: settingsMap['security.password_policy.require_lowercase'] === 'true' || false,
            require_numbers: settingsMap['security.password_policy.require_numbers'] === 'true' || false,
            require_special: settingsMap['security.password_policy.require_special'] === 'true' || false
          }
        }
      };

      return projectSettings;
    } catch (error) {
      console.error('SettingsService.getProjectSettings error:', error);
      throw new Error(`Failed to get project settings: ${(error as Error).message}`);
    }
  }

  /**
   * Update project settings
   */
  async updateProjectSettings(settings: Partial<ProjectSettings>): Promise<boolean> {
    if (!settings || typeof settings !== 'object') {
      throw new Error('Settings object is required');
    }

    // Flatten the settings object for database storage
    const flattenSettings = (obj: Record<string, unknown>, prefix: string = '', parentEnabled: number | null = null): Setting[] => {
      const flattened: Setting[] = [];
      const currentEnabled = obj.enabled !== undefined ? (obj.enabled ? 1 : 0) : parentEnabled;
      
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (key === 'enabled') {
          // Skip enabled flag as it's handled as metadata
          continue;
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Recursively flatten nested objects
          flattened.push(...flattenSettings(value as Record<string, unknown>, fullKey, currentEnabled));
        } else {
          // Store primitive values with their enabled status
          flattened.push({
            key: fullKey,
            value: JSON.stringify(value),
            enabled: currentEnabled,
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
    const operations = () => {
      for (const setting of flatSettings) {
        databaseService.executeQuery(
          'INSERT OR REPLACE INTO settings (key, value, category) VALUES (?, ?, ?)', 
          [setting.key, setting.value, 'project']
        );
      }
    };

    databaseService.executeTransaction(operations);
    return true;
  }

  /**
   * Get security setting value
   */
  async getSecuritySetting(settingName: string): Promise<SettingValue> {
    if (!settingName || typeof settingName !== 'string') {
      throw new Error('Setting name is required');
    }

    const setting = databaseService.getOne<{value: string}>(
      'SELECT value FROM settings WHERE key = ?', 
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

    const result = databaseService.executeQuery('DELETE FROM settings WHERE key = ?', [key]);
    return result.changes > 0;
  }

  /**
   * Delete settings by category (using key prefix)
   */
  async deleteSettingsByCategory(category: string): Promise<number> {
    if (!category || typeof category !== 'string') {
      throw new Error('Valid category is required');
    }

    const result = databaseService.executeQuery('DELETE FROM settings WHERE key LIKE ?', [`${category}.%`]);
    return result.changes;
  }

  /**
   * Get all categories (extracted from key prefixes)
   */
  async getCategories(): Promise<string[]> {
    const results = databaseService.getMany<{key: string}>(
      'SELECT DISTINCT key FROM settings WHERE key LIKE "%.%" ORDER BY key'
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

    return databaseService.exists('settings', 'key', key);
  }

  /**
   * Get settings count by category (using key prefix)
   */
  async getSettingsCount(category?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM settings';
    const params: (string | number | null | boolean)[] = [];

    if (category) {
      query += ' WHERE key LIKE ?';
      params.push(`${category}.%`);
    }

    const result = databaseService.getOne<{count: number}>(query, params);
    return result?.count || 0;
  }

  /**
   * Reset settings to defaults (using key prefix for category)
   */
  async resetSettings(category?: string): Promise<boolean> {
    let query = 'DELETE FROM settings';
    const params: (string | number | null | boolean)[] = [];

    if (category) {
      query += ' WHERE key LIKE ?';
      params.push(`${category}.%`);
    }

    databaseService.executeQuery(query, params);
    return true;
  }
}

// Export singleton instance
export const settingsService = new SettingsService();