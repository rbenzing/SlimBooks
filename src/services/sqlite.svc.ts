// Database service that communicates with backend API
import {
  type User,
  type Client,
  type Invoice,
  type InvoiceTemplate,
  type Expense,
  type Payment,
  type ProjectSettings
} from '@/types';
import type { ApiResponse } from '@/types';
import { parseProjectSettingsWithDefaults, validateProjectSettings } from '@/utils/settingsValidation';
import { getToken, API_BASE } from '@/utils/api';
class SQLiteService {
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private baseUrl = API_BASE;

  // Performance optimization: Settings cache
  private settingsCache = new Map<string, { value: unknown; timestamp: number; ttl: number }>();
  private readonly SETTINGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) return;
    
    // If initialization is in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this.performInitialization();
    return this.initializationPromise;
  }

  private async performInitialization(): Promise<void> {
    try {
      // Test connection to backend with retry logic
      let retries = 3;
      let lastError: unknown;
      let delay = 2000; // Start with 2 seconds to avoid rate limiting

      while (retries > 0) {
        try {
          const response = await fetch(`${this.baseUrl}/health`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            if (response.status === 429) {
              throw new Error('Rate limited - too many requests');
            }
            throw new Error(`Backend server responded with status: ${response.status}`);
          }

          this.isInitialized = true;
          this.initializationPromise = null; // Reset promise for future calls
          return;
        } catch (error) {
          lastError = error;
          retries--;

          if (retries > 0) {
            console.warn(`Failed to connect to backend (${error.message}), retrying in ${delay}ms... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff to avoid rate limiting
          }
        }
      }

      throw lastError;
    } catch (error) {
      this.initializationPromise = null; // Reset promise on failure
      console.error('Failed to initialize database service after retries:', error);
      throw new Error('Backend server not available');
    }
  }

  // API helper methods
  // `TData` types the standard `data` payload. `TEnvelope` describes the extra
  // top-level fields a few endpoints emit instead of `data` (the settings routes
  // return `{ success, value }` / `{ success, settings }`).
  private async apiCall<TData = unknown, TEnvelope extends object = object>(endpoint: string, method: string = 'GET', body?: unknown): Promise<ApiResponse<TData> & TEnvelope> {
    let url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authorization header if token is available
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (method === 'GET' && body) {
      // For GET requests, convert body to query parameters
      const params = new URLSearchParams();
      Object.entries(body).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
    } else if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      // Check if response is ok before trying to parse JSON
      if (!response.ok) {
        // Network or server error - this could indicate connection issues
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'API call failed');
      }

      return result;
    } catch (error) {
      // Re-throw with more context for connection monitoring
      if (error instanceof TypeError && error.message.includes('fetch')) {
        // Network error - likely connection issue
        throw new Error('Network connection failed');
      }

      // Re-throw other errors as-is
      throw error;
    }
  }

  // ===== USER API METHODS =====
  async getUsers(): Promise<User[]> {
    const result = await this.apiCall<User[]>('/users');
    return result.data || [];
  }

  // ===== CLIENT API METHODS =====
  async getClients(): Promise<Client[]> {
    const result = await this.apiCall<Client[]>('/clients');
    return result.data || [];
  }

  // Cache helper methods
  private getCachedSetting(key: string): unknown | null {
    const cached = this.settingsCache.get(key);
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      this.settingsCache.delete(key);
      return null;
    }
    
    return cached.value;
  }
  
  private setCachedSetting(key: string, value: unknown, ttl: number = this.SETTINGS_CACHE_TTL): void {
    this.settingsCache.set(key, {
      value,
      timestamp: Date.now(),
      ttl
    });
  }
  
  private clearSettingsCache(key?: string): void {
    if (key) {
      this.settingsCache.delete(key);
    } else {
      this.settingsCache.clear();
    }
  }

  /**
   * The stored name of a setting.
   *
   * The server namespaces a bare key with its category on write, storing
   * `tax.tax_rates`. A read of `tax_rates` therefore finds nothing — which is
   * why tax rates, shipping rates and the appearance preferences all saved
   * without complaint and came back as defaults on the next visit. Both sides
   * now build the name the same way.
   */
  private settingKey(key: string, category?: string): string {
    if (key.includes('.') || !category) return key;
    return `${category}.${key}`;
  }

  // Settings operations
  async getSetting(key: string, category?: string): Promise<unknown> {
    const storedKey = this.settingKey(key, category);

    // Check cache first for performance
    const cached = this.getCachedSetting(storedKey);
    if (cached !== null) {
      return cached;
    }

    // Map specific keys to new section-based routes
    const sectionMappings = {
      'company_settings': 'company',
      'notification_settings': 'notification',
      'currency_format_settings': 'currency'
    } as const;

    let value: unknown;
    const section = sectionMappings[key as keyof typeof sectionMappings];
    if (section) {
      // Section routes answer with `{ success, value }`, except /settings/notification
      // which nests its payload under a top-level `settings` object.
      const result = await this.apiCall<unknown, { settings?: { notification_settings?: unknown }; value?: unknown }>(`/settings/${section}`);
      if (key === 'notification_settings') {
        value = result.settings?.notification_settings;
      } else {
        value = result.value;
      }
    } else {
      // Fall back to original route for other keys
      const result = await this.apiCall<unknown, { value?: unknown }>(`/settings/${storedKey}`);
      value = result.value;
    }

    // Cache the result for future use
    this.setCachedSetting(storedKey, value);
    return value;
  }

  async setSetting(key: string, value: unknown, category: string = 'general'): Promise<void> {
    // Unified approach: all settings use the generic endpoint
    await this.apiCall('/settings', 'POST', { key, value, category });

    // Both spellings are evicted. A reader that passes the category caches
    // under `appearance.theme` and one that does not caches under `theme`;
    // clearing only the form this writer used would leave the other serving a
    // stale value for the rest of the cache window.
    this.clearSettingsCache(key);
    this.clearSettingsCache(this.settingKey(key, category));
  }

  // Bulk settings operations
  // Every settings read route answers with a top-level `settings` object.
  /**
   * Every setting in a category, keyed by its bare name.
   *
   * The server answers with stored names — `appearance.theme` — because that is
   * how they are stored. Callers ask for a category and then look for `theme`,
   * so the prefix comes off here rather than in every caller. Leaving it on is
   * what made the Appearance tab read every one of its own settings as absent.
   */
  async getAllSettings(category?: string): Promise<Record<string, unknown>> {
    try {
      let settings: Record<string, unknown>;

      // Map categories to new section-based routes
      if (category === 'appearance' || category === 'general') {
        const result = await this.apiCall<unknown, { settings?: Record<string, unknown> }>(`/settings/${category}`);
        settings = result.settings || {};
      } else {
        // Fall back to original query parameter route for other categories
        const params = category ? { category } : {};
        const result = await this.apiCall<unknown, { settings?: Record<string, unknown> }>('/settings', 'GET', params);
        settings = result.settings || {};
      }

      if (!category) return settings;

      const prefix = `${category}.`;
      return Object.fromEntries(
        Object.entries(settings).map(([key, value]) => [
          key.startsWith(prefix) ? key.slice(prefix.length) : key,
          value
        ])
      );
    } catch (error) {
      console.error('sqliteService: Failed to load settings:', error);
      throw error;
    }
  }

  async setMultipleSettings(settings: Record<string, { value: unknown; category?: string }>): Promise<void> {
    try {
      // Unified approach: always use the generic bulk settings endpoint
      await this.apiCall('/settings', 'PUT', { settings });
      // Clear cache for all updated settings to ensure fresh data
      Object.keys(settings).forEach(key => this.clearSettingsCache(key));
    } catch (error) {
      console.error('sqliteService: Failed to save settings:', error);
      throw error;
    }
  }

  // ===== INVOICE API METHODS =====
  async getInvoices(): Promise<(Invoice & { client_name: string })[]> {
    const result = await this.apiCall<{ invoices?: (Invoice & { client_name: string })[]; pagination?: unknown }>('/invoices');
    return result.data?.invoices || [];
  }

  // ===== EXPENSE API METHODS =====
  async getExpenses(startDate?: string, endDate?: string): Promise<Expense[]> {
    const params = startDate && endDate ? { date_from: startDate, date_to: endDate } : {};
    const result = await this.apiCall<{ data?: Expense[]; total?: number; page?: number; limit?: number }>('/expenses', 'GET', params);
    return result.data?.data || [];
  }

  // ===== PAYMENT API METHODS =====
  async getPayments(startDate?: string, endDate?: string): Promise<Payment[]> {
    const params = startDate && endDate ? { date_from: startDate, date_to: endDate } : {};
    const result = await this.apiCall<{ payments?: Payment[]; pagination?: unknown }>('/payments', 'GET', params);
    return result.data?.payments || [];
  }

  // ===== TEMPLATE API METHODS =====
  async getTemplates(): Promise<(InvoiceTemplate & { client_name: string })[]> {
    const result = await this.apiCall<(InvoiceTemplate & { client_name: string })[]>('/recurring-templates');
    return result.data || [];
  }

  // ===== PROJECT SETTINGS API METHODS =====
  async getProjectSettings(): Promise<ProjectSettings> {
    if (!this.isReady()) {
      await this.initialize();
    }
    // GET /project-settings answers with a top-level `settings` object.
    const result = await this.apiCall<unknown, { settings?: unknown }>('/project-settings');
    return parseProjectSettingsWithDefaults(result.settings || {});
  }

  async updateProjectSettings(settings: ProjectSettings): Promise<void> {
    // Validate settings before sending to server
    validateProjectSettings(settings);
    await this.apiCall('/project-settings', 'PUT', { settings });
  }

  // Utility method to check if database is ready
  isReady(): boolean {
    return this.isInitialized;
  }

  // Export database to file
  async exportToFile(): Promise<Blob> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/octet-stream'
      };

      // Add authorization header if token is available
      const { getToken } = await import('@/utils/api/auth.util');
      const token = getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${this.baseUrl}/db/export`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      return await response.blob();
    } catch (error) {
      console.error('Database export error:', error);
      throw error;
    }
  }

  // Import database from file
  async importFromFile(file: File): Promise<void> {
    try {
      const formData = new FormData();
      formData.append('database', file);

      const headers: Record<string, string> = {};

      // Add authorization header if token is available
      const { getToken } = await import('@/utils/api/auth.util');
      const token = getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${this.baseUrl}/db/import`, {
        method: 'POST',
        headers,
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Import failed: ${errorText}`);
      }

      // Reinitialize after import
      this.isInitialized = false;
      await this.initialize();
    } catch (error) {
      console.error('Database import error:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const sqliteService = new SQLiteService();

// Initialize on module load (in browser environment)
if (typeof window !== 'undefined') {
  sqliteService.initialize().catch(console.error);
}
