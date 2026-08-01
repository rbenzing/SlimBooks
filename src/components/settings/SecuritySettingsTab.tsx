import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Shield } from 'lucide-react';
import { themeClasses } from '@/utils/themeUtils.util';
import { toast } from 'sonner';
import { type ProjectSettings, type EmailConfigStatus } from '@/types';
import { useFormNavigation } from '@/hooks/useFormNavigation';
import { getEmailConfigurationStatus } from '@/utils/emailConfig.util';

export interface SecuritySettingsRef {
  saveSettings: () => Promise<void>;
}

const LOCKOUT_MINUTE = 60000;

/**
 * Account security.
 *
 * Integrations are not here. Each one owns its own tab, with its switch and its
 * credentials together — splitting the switch from the fields meant the Stripe
 * tab only appeared once you had found the Stripe switch on this tab, which is
 * a fine arrangement for anyone who already knew where it was.
 *
 * Email verification is gated on whether the server can actually send mail,
 * because turning it on without that locks every new user out of their account.
 */
export const SecuritySettingsTab = forwardRef<SecuritySettingsRef>((props, ref) => {
  const [settings, setSettings] = useState<ProjectSettings>({
    google_oauth: { enabled: false, client_id: '', client_secret: '', configured: false },
    stripe: { enabled: false, publishable_key: '', secret_key: '', configured: false },
    email: {
      enabled: false, smtp_host: '', smtp_port: 587,
      smtp_user: '', smtp_pass: '', email_from: '', configured: false
    },
    security: {
      require_email_verification: true,
      max_failed_login_attempts: 5,
      account_lockout_duration: 30 * LOCKOUT_MINUTE
    }
  });

  const [originalSettings, setOriginalSettings] = useState<ProjectSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [emailStatus, setEmailStatus] = useState<EmailConfigStatus | null>(null);

  const isDirty = originalSettings ? JSON.stringify(settings) !== JSON.stringify(originalSettings) : false;

  const { NavigationGuard } = useFormNavigation({
    isDirty,
    isEnabled: true,
    entityType: 'template' as const
  });

  useEffect(() => {
    loadSettings();
  }, []);

  useImperativeHandle(ref, () => ({ saveSettings }));

  const loadSettings = async () => {
    try {
      const { sqliteService } = await import('@/services/sqlite.svc');

      if (!sqliteService.isReady()) {
        await sqliteService.initialize();
      }

      const projectSettings = await sqliteService.getProjectSettings();
      if (projectSettings) {
        setSettings(projectSettings);
        setOriginalSettings(projectSettings);
      }
    } catch (error) {
      console.error('Error loading project settings:', error);
      toast.error('Failed to load project settings');
    } finally {
      setIsLoading(false);
    }
  };

  // Email verification is gated on the store the mail service actually reads,
  // not on a second copy of the credentials kept alongside these settings.
  useEffect(() => {
    let cancelled = false;

    getEmailConfigurationStatus()
      .then(status => { if (!cancelled) setEmailStatus(status); })
      .catch(() => { if (!cancelled) setEmailStatus(null); });

    return () => { cancelled = true; };
  }, []);

  const canRequireVerification = emailStatus?.canSendEmails ?? false;

  const handleSecurityChange = (field: keyof ProjectSettings['security'], value: number | boolean) => {
    setSettings(prev => ({
      ...prev,
      security: { ...prev.security, [field]: value }
    }));
  };

  const saveSettings = async () => {
    try {
      const { sqliteService } = await import('@/services/sqlite.svc');

      if (!sqliteService.isReady()) {
        await sqliteService.initialize();
      }

      await sqliteService.updateProjectSettings(settings);
      setOriginalSettings(settings);
      toast.success('Security settings saved successfully');
    } catch (error) {
      console.error('Error saving security settings:', error);
      toast.error('Failed to save security settings');
    }
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

  return (
    <>
      <NavigationGuard />
      <div className="space-y-6">
        <div className="mb-6">
          <h3 className="text-lg font-medium text-card-foreground">Security</h3>
          <p className="text-sm text-muted-foreground">
            How accounts are protected. Integrations have their own tabs.
          </p>
        </div>

        {/* Account security */}
        <div className="bg-card rounded-lg shadow-sm border border-border p-6">
          <div className="flex items-center mb-4">
            <Shield className="h-5 w-5 text-primary mr-2" />
            <h4 className="text-md font-medium text-card-foreground">Account Security</h4>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-card-foreground">Require Email Verification</label>
                <p className="text-sm text-muted-foreground">
                  Users must verify their email before accessing the application
                </p>
                {!canRequireVerification && (
                  <p className="text-sm text-amber-600 mt-1">
                    ⚠️ Configure and test email on the Email Settings tab first
                  </p>
                )}
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Require email verification"
                  checked={settings?.security?.require_email_verification || false}
                  onChange={(e) => {
                    if (e.target.checked && !canRequireVerification) {
                      toast.error('Configure and test email settings first');
                      return;
                    }
                    handleSecurityChange('require_email_verification', e.target.checked);
                  }}
                  disabled={!canRequireVerification}
                  className="sr-only peer disabled:opacity-50"
                />
                <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 ${!canRequireVerification ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
              </label>
            </div>

            <div>
              <label htmlFor="max-failed-logins" className="block text-sm font-medium text-muted-foreground mb-2">
                Max Failed Login Attempts
              </label>
              <input
                id="max-failed-logins"
                type="number"
                value={settings?.security?.max_failed_login_attempts || 5}
                onChange={(e) => handleSecurityChange('max_failed_login_attempts', parseInt(e.target.value))}
                min="1"
                max="10"
                className={themeClasses.input}
              />
            </div>

            <div>
              <label htmlFor="lockout-duration" className="block text-sm font-medium text-muted-foreground mb-2">
                Account Lockout Duration (minutes)
              </label>
              <input
                id="lockout-duration"
                type="number"
                value={Math.floor((settings?.security?.account_lockout_duration || 30 * LOCKOUT_MINUTE) / LOCKOUT_MINUTE)}
                onChange={(e) => handleSecurityChange('account_lockout_duration', parseInt(e.target.value) * LOCKOUT_MINUTE)}
                min="1"
                max="1440"
                className={themeClasses.input}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

SecuritySettingsTab.displayName = 'SecuritySettingsTab';
