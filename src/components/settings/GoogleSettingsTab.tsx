import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Globe, AlertTriangle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { themeClasses } from '@/utils/themeUtils.util';
import { toast } from 'sonner';
import { type ProjectSettings } from '@/types';
import { useFormNavigation } from '@/hooks/useFormNavigation';
import type { SettingsTabRef } from '@/types';

/**
 * Google OAuth.
 *
 * The tab owns both the switch and the credentials, so there is one place to
 * go rather than a switch on one tab and the fields on another.
 *
 * An install that sets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env is
 * treated as switched on already — it has made the decision — and the toggle
 * can still turn it back off without editing .env.
 *
 * The client secret is write-only: the server does not return it, so the field
 * is blank on load and leaving it blank keeps whatever is stored.
 */
export const GoogleSettingsTab = forwardRef<SettingsTabRef>((props, ref) => {
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [clientSecret, setClientSecret] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);

  const { NavigationGuard } = useFormNavigation({
    isDirty,
    isEnabled: true,
    entityType: 'template' as const
  });

  const loadSettings = useCallback(async () => {
    try {
      const { sqliteService } = await import('@/services/sqlite.svc');

      if (!sqliteService.isReady()) {
        await sqliteService.initialize();
      }

      const projectSettings = await sqliteService.getProjectSettings();
      if (projectSettings) {
        setSettings(projectSettings);
        setClientSecret('');
        setIsDirty(false);
      }
    } catch (error) {
      console.error('Error loading Google settings:', error);
      toast.error('Failed to load Google settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveSettings = useCallback(async () => {
    if (!settings) return;

    try {
      const { sqliteService } = await import('@/services/sqlite.svc');

      if (!sqliteService.isReady()) {
        await sqliteService.initialize();
      }

      await sqliteService.updateProjectSettings({
        ...settings,
        google_oauth: {
          ...settings.google_oauth,
          // Omitted when blank, so an unrelated save cannot wipe the stored one.
          ...(clientSecret ? { client_secret: clientSecret } : {})
        }
      });

      await loadSettings();
      toast.success('Google settings saved successfully');
    } catch (error) {
      console.error('Error saving Google settings:', error);
      toast.error('Failed to save Google settings');
    }
  }, [settings, clientSecret, loadSettings]);

  useImperativeHandle(ref, () => ({ saveSettings }), [saveSettings]);

  const update = (field: 'enabled' | 'client_id', value: boolean | string) => {
    setSettings(prev => prev && ({
      ...prev,
      google_oauth: { ...prev.google_oauth, [field]: value }
    }));
    setIsDirty(true);
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-muted rounded"></div>
            <div className="h-4 bg-muted rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  const google = settings?.google_oauth;
  const isEnabled = google?.enabled ?? false;

  return (
    <>
      <NavigationGuard />
      <div className="space-y-6">
        {/* Enable */}
        <div className="bg-card rounded-lg shadow-sm border border-border p-6">
          <div className="flex items-center mb-4">
            <Globe className="h-5 w-5 text-primary mr-2" />
            <h3 className="text-lg font-medium text-card-foreground">Google OAuth</h3>
            {google?.configured && (
              <CheckCircle className="h-4 w-4 text-green-500 ml-2" aria-label="Configured" />
            )}
          </div>

          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <h4 className="text-sm font-medium text-card-foreground">Enable Google Sign-In</h4>
              <p className="text-sm text-muted-foreground">
                Offer a "Sign in with Google" button on the login screen
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                aria-label="Enable Google OAuth"
                checked={isEnabled}
                onChange={(e) => update('enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {google?.env_configured && (
            <p className="text-sm text-muted-foreground mt-3">
              Credentials were found in your .env file, so this was switched on
              automatically. Entering values below overrides them.
            </p>
          )}
        </div>

        {/* Credentials, once there is something to configure */}
        {isEnabled && (
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <div className="flex items-center mb-4">
              <Globe className="h-5 w-5 text-primary mr-2" />
              <h4 className="text-md font-medium text-card-foreground">Credentials</h4>
            </div>

            {!google?.configured && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mb-4">
                <div className="flex items-start">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mr-2 mt-0.5" />
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Not configured yet. Enter both values below, or set
                    GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="google-client-id" className="block text-sm font-medium text-muted-foreground mb-2">
                  Client ID
                </label>
                <input
                  id="google-client-id"
                  type="text"
                  value={google?.client_id || ''}
                  onChange={(e) => update('client_id', e.target.value)}
                  placeholder="Your Google OAuth Client ID"
                  className={themeClasses.input}
                />
              </div>

              <div>
                <label htmlFor="google-client-secret" className="block text-sm font-medium text-muted-foreground mb-2">
                  Client Secret
                </label>
                <div className="relative">
                  <input
                    id="google-client-secret"
                    type={showClientSecret ? 'text' : 'password'}
                    value={clientSecret}
                    onChange={(e) => { setClientSecret(e.target.value); setIsDirty(true); }}
                    placeholder={google?.configured ? 'Stored — type a new secret to replace it' : 'Your Google OAuth Client Secret'}
                    className={`${themeClasses.input} pr-10`}
                  />
                  <button
                    type="button"
                    aria-label={showClientSecret ? 'Hide client secret' : 'Show client secret'}
                    onClick={() => setShowClientSecret(prev => !prev)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showClientSecret ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Held on the server and never sent back to this page. Leave blank
                  to keep the stored secret.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
});

GoogleSettingsTab.displayName = 'GoogleSettingsTab';
