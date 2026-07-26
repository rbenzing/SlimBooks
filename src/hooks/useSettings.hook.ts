import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { getToken as getAuthToken } from '@/utils/api';
import { debug, warn } from '@/utils/logger.util';

// Global cache to prevent multiple API calls for the same settings across all component instances
const globalSettingsCache = new Map<string, {
  data: unknown;
  isLoading: boolean;
  hasLoaded: boolean;
  promise?: Promise<unknown>;
}>();

// Global function to get or create cache entry
const getOrCreateCacheEntry = (key: string) => {
  if (!globalSettingsCache.has(key)) {
    globalSettingsCache.set(key, {
      data: null,
      isLoading: false,
      hasLoaded: false
    });
  }
  return globalSettingsCache.get(key)!;
};

// Global function to clear all settings cache (useful for development)
export const clearAllSettingsCache = () => {
  debug('[useSettings] Clearing all settings cache');
  globalSettingsCache.clear();
};

// Global function to invalidate specific cache entry
export const invalidateSettingsCache = (settingsKey: string, category: string = 'general', apiEndpoint?: string) => {
  const cacheKey = `${settingsKey}-${category}-${apiEndpoint || 'service'}`;
  debug(`[useSettings] Invalidating cache for key: ${cacheKey}`);
  globalSettingsCache.delete(cacheKey);
};

export interface UseSettingsOptions<T> {
  settingsKey: string;
  defaultSettings: T;
  apiEndpoint?: string;
  saveEndpoint?: string; // Optional separate endpoint for saving
  category?: string;
  transformLoad?: (data: unknown) => T;
  transformSave?: (data: T) => Record<string, unknown>;
  onSaveSuccess?: () => void;
  onSaveError?: (error: Error) => void;
}

export interface UseSettingsReturn<T> {
  settings: T;
  setSettings: (settings: T | ((prev: T) => T)) => void;
  saveSettings: () => Promise<void>;
  isLoading: boolean;
  isSaving: boolean;
  isLoaded: boolean;
  error: string | null;
  reset: () => void;
}

export function useSettings<T extends Record<string, unknown>>({
  settingsKey,
  defaultSettings,
  apiEndpoint,
  saveEndpoint,
  category = 'general',
  transformLoad,
  transformSave,
  onSaveSuccess,
  onSaveError
}: UseSettingsOptions<T>): UseSettingsReturn<T> {
  const [settings, setSettingsState] = useState<T>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settingsRef = useRef(settings);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep settings ref up to date
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Load settings on mount
  const loadSettings = useCallback(async () => {
    const cacheKey = `${settingsKey}-${category}-${apiEndpoint || 'service'}`;
    const cacheEntry = getOrCreateCacheEntry(cacheKey);

    // If already loaded globally, use cached data
    if (cacheEntry.hasLoaded) {
      debug(`[useSettings] Using cached data for ${settingsKey}`);
      if (cacheEntry.data) {
        const loadedSettings = transformLoad ? transformLoad(cacheEntry.data) : cacheEntry.data as T;
        setSettingsState(loadedSettings);
      } else {
        setSettingsState(defaultSettings);
      }
      setIsLoaded(true);
      setIsLoading(false);
      return;
    }

    // If currently loading by another instance, wait for that promise
    if (cacheEntry.isLoading && cacheEntry.promise) {
      debug(`[useSettings] Waiting for existing load for ${settingsKey}`);
      setIsLoading(true);
      try {
        const result = await cacheEntry.promise;
        if (result) {
          const loadedSettings = transformLoad ? transformLoad(result) : result as T;
          setSettingsState(loadedSettings);
        } else {
          setSettingsState(defaultSettings);
        }
        setIsLoaded(true);
      } catch (error) {
        console.error(`Error waiting for settings load:`, error);
        setError(`Failed to load settings: ${error.message}`);
        setSettingsState(defaultSettings);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Start loading
    debug(`[useSettings] Starting fresh load for ${settingsKey} from ${apiEndpoint || 'service'}`);
    cacheEntry.isLoading = true;
    setIsLoading(true);
    setError(null);

    // Create the loading promise
    const loadPromise = (async () => {
      try {
        const { sqliteService } = await import('@/services/sqlite.svc');

        if (!sqliteService.isReady()) {
          await sqliteService.initialize();
        }

        let savedSettings: unknown;
        let apiCallSucceeded = false;

        // Try the specific API endpoint first if provided
        if (apiEndpoint) {
          try {
            const response = await fetch(apiEndpoint, {
              headers: {
                'Authorization': `Bearer ${getAuthToken()}`
              }
            });

            if (response.ok) {
              const result = await response.json();
              if (result.success) {
                savedSettings = result.value || result.settings;
                apiCallSucceeded = true;
                debug(`[useSettings] API call succeeded for ${settingsKey}`, savedSettings ? 'with data' : 'with no data');
              }
            }
          } catch (apiError) {
            warn(`API endpoint ${apiEndpoint} failed, falling back to service:`, apiError);
          }
        }

        // Only fallback to service if no API endpoint was provided OR the API call failed
        if (!apiEndpoint || (!apiCallSucceeded && !savedSettings)) {
          debug(`[useSettings] Falling back to sqliteService.getSetting for ${settingsKey}`);
          savedSettings = await sqliteService.getSetting(settingsKey);
        }

        return savedSettings;
      } catch (loadError) {
        console.error(`Error loading settings for ${settingsKey}:`, loadError);
        throw loadError;
      }
    })();

    cacheEntry.promise = loadPromise;

    try {
      const result = await loadPromise;

      // Update cache
      cacheEntry.data = result;
      cacheEntry.hasLoaded = true;
      cacheEntry.isLoading = false;
      delete cacheEntry.promise; // Clean up promise reference

      // Update component state
      if (result) {
        const loadedSettings = transformLoad ? transformLoad(result) : result as T;
        setSettingsState(loadedSettings);
      } else {
        setSettingsState(defaultSettings);
      }

      setIsLoaded(true);
    } catch (loadError) {
      console.error(`Error loading settings for ${settingsKey}:`, loadError);
      setError(`Failed to load settings: ${loadError.message}`);
      setSettingsState(defaultSettings);

      // Update cache to prevent retry loops
      cacheEntry.hasLoaded = true;
      cacheEntry.isLoading = false;
      delete cacheEntry.promise; // Clean up promise reference
    } finally {
      setIsLoading(false);
    }
  }, [settingsKey, category, apiEndpoint, defaultSettings, transformLoad]);

  // Save settings
  const saveSettings = useCallback(async () => {
    if (!isLoaded) return;

    setIsSaving(true);
    setError(null);

    try {
      const dataToSave = transformSave ? transformSave(settingsRef.current) : settingsRef.current;

      // Debug logging for company settings
      if (settingsKey === 'company_settings') {
        const { brandingImage } = dataToSave as { brandingImage?: string };
        debug('[useCompanySettings] Saving settings:', {
          hasBrandingImage: !!brandingImage,
          brandingImageLength: (brandingImage?.length || 0),
          allKeys: Object.keys(dataToSave)
        });
      }

      if (saveEndpoint || apiEndpoint) {
        // Use save endpoint if provided, otherwise fall back to API endpoint
        const endpoint = saveEndpoint || apiEndpoint;
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(dataToSave)
          });

          if (!response.ok) {
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
              const errorResult = await response.json();
              if (errorResult.error) {
                errorMessage = errorResult.error;
              }
            } catch {
              // If we can't parse the error response, use the default message
            }
            throw new Error(errorMessage);
          }

          const result = await response.json();
          if (!result.success) {
            throw new Error(result.error || 'Failed to save settings');
          }
        } catch (networkError) {
          if (networkError instanceof TypeError && networkError.message.includes('fetch')) {
            throw new Error('Network error: Unable to connect to server. Please check your connection.');
          }
          throw networkError;
        }
      } else {
        // Fallback to service
        const { sqliteService } = await import('@/services/sqlite.svc');
        await sqliteService.setSetting(settingsKey, dataToSave, category);
      }

      // Clear cache after successful save to ensure fresh data on next load
      invalidateSettingsCache(settingsKey, category, apiEndpoint);

      onSaveSuccess?.();
    } catch (saveError) {
      console.error(`Error saving settings for ${settingsKey}:`, saveError);
      const errorMessage = `Failed to save settings: ${saveError.message}`;
      setError(errorMessage);
      onSaveError?.(saveError);
      throw saveError;
    } finally {
      setIsSaving(false);
    }
  }, [settingsKey, category, apiEndpoint, saveEndpoint, transformSave, isLoaded, onSaveSuccess, onSaveError]);

  // Custom setSettings that updates both state and ref
  const setSettings = useCallback((newSettings: T | ((prev: T) => T)) => {
    setSettingsState(prev => {
      const updated = typeof newSettings === 'function' ? newSettings(prev) : newSettings;
      return updated;
    });
  }, []);

  // Reset to defaults
  const reset = useCallback(() => {
    setSettingsState(defaultSettings);
    setError(null);
  }, [defaultSettings]);

  // Cleanup timeout on unmount. The ref object is captured (not `.current`), so
  // the cleanup clears whichever timeout is pending at unmount.
  useEffect(() => {
    const pendingSave = saveTimeoutRef;
    return () => {
      if (pendingSave.current) {
        clearTimeout(pendingSave.current);
      }
    };
  }, []);

  // Load settings once on mount. `loadSettings` is not a dependency: callers
  // pass inline `transformLoad`/`transformSave` closures, so its identity
  // changes every render and depending on it would reload in a loop.
  const loadSettingsRef = useRef(loadSettings);
  useEffect(() => {
    loadSettingsRef.current();
  }, []);

  return {
    settings,
    setSettings,
    saveSettings,
    isLoading,
    isSaving,
    isLoaded,
    error,
    reset
  };
}

// Default company settings - defined outside to avoid recreating object
const defaultCompanySettings = {
  companyName: '',
  ownerName: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  email: '',
  phone: '',
  brandingImage: ''
} as const;

// Specialized hook for company settings
export function useCompanySettings() {
  return useSettings({
    settingsKey: 'company_settings',
    apiEndpoint: '/api/settings/company',
    category: 'company',
    defaultSettings: defaultCompanySettings,
    transformLoad: (data: unknown) => {
      if (!data || typeof data !== 'object') {
        debug('[useCompanySettings] No data found, using defaults');
        return defaultCompanySettings;
      }
      const saved = data as Record<string, unknown>;

      const transformedSettings = {
        companyName: typeof saved.companyName === 'string' ? saved.companyName : defaultCompanySettings.companyName,
        ownerName: typeof saved.ownerName === 'string' ? saved.ownerName : defaultCompanySettings.ownerName,
        address: typeof saved.address === 'string' ? saved.address : defaultCompanySettings.address,
        city: typeof saved.city === 'string' ? saved.city : defaultCompanySettings.city,
        state: typeof saved.state === 'string' ? saved.state : defaultCompanySettings.state,
        zipCode: typeof saved.zipCode === 'string' ? saved.zipCode : defaultCompanySettings.zipCode,
        email: typeof saved.email === 'string' ? saved.email : defaultCompanySettings.email,
        phone: typeof saved.phone === 'string' ? saved.phone : defaultCompanySettings.phone,
        brandingImage: typeof saved.brandingImage === 'string' ? saved.brandingImage : defaultCompanySettings.brandingImage
      };

      debug('[useCompanySettings] Loaded settings:', {
        hasBrandingImage: !!transformedSettings.brandingImage,
        brandingImageLength: transformedSettings.brandingImage?.length || 0,
        originalBrandingImage: typeof saved.brandingImage,
        allKeys: Object.keys(saved)
      });

      return transformedSettings;
    },
    transformSave: (data) => {
      // Format data to match the POST /api/settings/company endpoint
      return {
        companyName: data.companyName,
        ownerName: data.ownerName,
        address: data.address,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        email: data.email,
        phone: data.phone,
        brandingImage: data.brandingImage
      };
    },
    onSaveSuccess: () => {
      toast.success('Company settings saved successfully');
    },
    onSaveError: (error) => {
      toast.error(`Failed to save company settings: ${error.message}`);
    }
  });
}

// Default general settings
const defaultGeneralSettings = {
  currency_format_settings: {
    currency: 'USD',
    symbolPosition: 'before',
    decimalPlaces: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.'
  },
  date_time_settings: {
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12-hour'
  },
  invoice_number_settings: {
    prefix: 'INV'
  },
  pagination_settings: {
    defaultItemsPerPage: 10,
    maxItemsPerPage: 100,
    availablePageSizes: [10, 25, 50, 100],
    maxPageNumbers: 10
  }
} as const;

// Specialized hook for general settings
export function useGeneralSettings() {
  return useSettings({
    settingsKey: 'general_settings',
    apiEndpoint: '/api/settings/general', // GET only
    saveEndpoint: '/api/settings/', // Use generic save endpoint
    category: 'general',
    defaultSettings: defaultGeneralSettings,
    transformSave: (data) => ({
      key: 'general_settings',
      value: data,
      category: 'general'
    }),
    onSaveSuccess: () => {
      toast.success('General settings saved successfully');
    },
    onSaveError: (error) => {
      toast.error(`Failed to save general settings: ${error.message}`);
    }
  });
}

// Default email settings
const defaultEmailSettings = {
  smtp_host: '',
  smtp_port: 587,
  smtp_user: '',
  smtp_password: '',
  smtp_secure: true,
  from_email: '',
  from_name: '',
  isEnabled: false
} as const;

// Specialized hook for email settings
export function useEmailSettings() {
  return useSettings({
    settingsKey: 'email_settings',
    apiEndpoint: '/api/settings/', // Generic endpoint for both read and write
    category: 'email',
    defaultSettings: defaultEmailSettings,
    transformSave: (data) => ({
      key: 'email_settings',
      value: data,
      category: 'email'
    }),
    onSaveSuccess: () => {
      toast.success('Email settings saved successfully');
    },
    onSaveError: (error) => {
      toast.error(`Failed to save email settings: ${error.message}`);
    }
  });
}

// Default notification settings
const defaultNotificationSettings = {
  showToastNotifications: true,
  showSuccessToasts: true,
  showErrorToasts: true,
  showWarningToasts: true,
  showInfoToasts: true,
  toastDuration: 4000,
  toastPosition: 'bottom-right'
} as const;

// Specialized hook for notification settings
export function useNotificationSettings() {
  return useSettings({
    settingsKey: 'notification_settings',
    apiEndpoint: '/api/settings/notification', // GET endpoint
    saveEndpoint: '/api/settings/', // Use generic endpoint for saving
    category: 'general',
    defaultSettings: defaultNotificationSettings,
    transformLoad: (data: unknown) => {
      if (!data || typeof data !== 'object') {
        return defaultNotificationSettings;
      }
      // Handle both direct settings and nested structure from API
      type StoredNotificationSettings = Partial<typeof defaultNotificationSettings>;
      const payload = data as StoredNotificationSettings & {
        notification_settings?: StoredNotificationSettings;
      };
      const settings = payload.notification_settings || payload;
      return {
        showToastNotifications: settings.showToastNotifications ?? defaultNotificationSettings.showToastNotifications,
        showSuccessToasts: settings.showSuccessToasts ?? defaultNotificationSettings.showSuccessToasts,
        showErrorToasts: settings.showErrorToasts ?? defaultNotificationSettings.showErrorToasts,
        showWarningToasts: settings.showWarningToasts ?? defaultNotificationSettings.showWarningToasts,
        showInfoToasts: settings.showInfoToasts ?? defaultNotificationSettings.showInfoToasts,
        toastDuration: settings.toastDuration ?? defaultNotificationSettings.toastDuration,
        toastPosition: settings.toastPosition ?? defaultNotificationSettings.toastPosition
      };
    },
    transformSave: (data) => ({
      key: 'notification_settings',
      value: data,
      category: 'general'
    }),
    onSaveSuccess: () => {
      toast.success('Notification settings saved successfully');
    },
    onSaveError: (error) => {
      toast.error(`Failed to save notification settings: ${error.message}`);
    }
  });
}

// Default appearance settings
const defaultAppearanceSettings = {
  theme: 'system',
  invoice_template_preference: 'modern-blue',
  pdf_format_preference: 'A4'
} as const;

// Specialized hook for appearance settings
export function useAppearanceSettings() {
  return useSettings({
    settingsKey: 'appearance_settings',
    apiEndpoint: '/api/settings/appearance',
    category: 'appearance',
    defaultSettings: defaultAppearanceSettings,
    transformSave: (data) => ({
      settings: {
        theme: { value: data.theme, category: 'appearance' },
        invoice_template_preference: { value: data.invoice_template_preference, category: 'appearance' },
        pdf_format_preference: { value: data.pdf_format_preference, category: 'appearance' }
      }
    }),
    onSaveSuccess: () => {
      toast.success('Appearance settings saved successfully');
    },
    onSaveError: (error) => {
      toast.error(`Failed to save appearance settings: ${error.message}`);
    }
  });
}