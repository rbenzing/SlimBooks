import { useState, useEffect } from 'react';
import { sqliteService } from '@/services/sqlite.svc';
import { type ProjectSettings } from '@/types';

export const useProjectSettings = () => {
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Remove redundant initialization - getProjectSettings will handle it
        const projectSettings = await sqliteService.getProjectSettings();
        
        // Type-safe conversion from database result to ProjectSettings
        if (projectSettings && typeof projectSettings === 'object') {
          const typedSettings = projectSettings as Partial<ProjectSettings>;
          const convertedSettings: ProjectSettings = {
            google_oauth: {
              enabled: Boolean(typedSettings.google_oauth?.enabled),
              client_id: String(typedSettings.google_oauth?.client_id || ''),
              configured: Boolean(typedSettings.google_oauth?.configured)
            },
            stripe: {
              enabled: Boolean(typedSettings.stripe?.enabled),
              publishable_key: String(typedSettings.stripe?.publishable_key || ''),
              configured: Boolean(typedSettings.stripe?.configured)
            },
            email: {
              enabled: Boolean(typedSettings.email?.enabled),
              smtp_host: String(typedSettings.email?.smtp_host || ''),
              smtp_port: Number(typedSettings.email?.smtp_port) || 587,
              smtp_user: String(typedSettings.email?.smtp_user || ''),
              email_from: String(typedSettings.email?.email_from || ''),
              configured: Boolean(typedSettings.email?.configured)
            },
            security: {
              require_email_verification: Boolean(typedSettings.security?.require_email_verification ?? true),
              max_failed_login_attempts: Number(typedSettings.security?.max_failed_login_attempts) || 5,
              account_lockout_duration: Number(typedSettings.security?.account_lockout_duration) || 1800000
            }
          };
          setSettings(convertedSettings);
        } else {
          throw new Error('Invalid project settings format');
        }
      } catch (err) {
        console.error('Error loading project settings:', err);
        setError(err instanceof Error ? err.message : 'Failed to load project settings');
        
        // Set default settings if loading fails
        setSettings({
          google_oauth: {
            enabled: false,
            client_id: '',
            configured: false
          },
          stripe: {
            enabled: false,
            publishable_key: '',
            configured: false
          },
          email: {
            enabled: false,
            smtp_host: '',
            smtp_port: 587,
            smtp_user: '',
            email_from: '',
            configured: false
          },
          security: {
            require_email_verification: true,
            max_failed_login_attempts: 5,
            account_lockout_duration: 1800000
          }
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const refreshSettings = async () => {
    try {
      // Remove redundant initialization - getProjectSettings will handle it
      const projectSettings = await sqliteService.getProjectSettings();
      
      // Type-safe conversion from database result to ProjectSettings
      if (projectSettings && typeof projectSettings === 'object') {
        const typedSettings = projectSettings as Partial<ProjectSettings>;
        const convertedSettings: ProjectSettings = {
          google_oauth: {
            enabled: Boolean(typedSettings.google_oauth?.enabled),
            client_id: String(typedSettings.google_oauth?.client_id || ''),
            configured: Boolean(typedSettings.google_oauth?.configured)
          },
          stripe: {
            enabled: Boolean(typedSettings.stripe?.enabled),
            publishable_key: String(typedSettings.stripe?.publishable_key || ''),
            configured: Boolean(typedSettings.stripe?.configured)
          },
          email: {
            enabled: Boolean(typedSettings.email?.enabled),
            smtp_host: String(typedSettings.email?.smtp_host || ''),
            smtp_port: Number(typedSettings.email?.smtp_port) || 587,
            smtp_user: String(typedSettings.email?.smtp_user || ''),
            email_from: String(typedSettings.email?.email_from || ''),
            configured: Boolean(typedSettings.email?.configured)
          },
          security: {
            require_email_verification: Boolean(typedSettings.security?.require_email_verification ?? true),
            max_failed_login_attempts: Number(typedSettings.security?.max_failed_login_attempts) || 5,
            account_lockout_duration: Number(typedSettings.security?.account_lockout_duration) || 1800000
          }
        };
        setSettings(convertedSettings);
      } else {
        throw new Error('Invalid project settings format');
      }
      setError(null);
    } catch (err) {
      console.error('Error refreshing project settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh project settings');
    }
  };

  return {
    settings,
    isLoading,
    error,
    refreshSettings
  };
};
