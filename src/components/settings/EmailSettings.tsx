import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Mail, CheckCircle, XCircle, AlertTriangle, Server, User as UserIcon, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { emailService } from '@/services/email.svc';
import { themeClasses } from '@/utils/themeUtils.util';
import { useEmailSettings } from '@/hooks/useSettings.hook';
import { useAuth } from '@/contexts/AuthContext';
import {
  EMAIL_PROVIDERS,
  CUSTOM_PROVIDER_ID,
  findProvider,
  detectProvider
} from '@/utils/emailProviders.util';
import type { SettingsTabRef, SmtpSecurity } from '@/types';

const SECURITY_LABELS: Record<SmtpSecurity, string> = {
  tls: 'STARTTLS (usually port 587)',
  ssl: 'SSL/TLS (usually port 465)',
  none: 'None (not recommended)'
};

/**
 * Email configuration.
 *
 * Laid out in the order the information is actually known: who the mail comes
 * from, then which provider carries it, then the credentials for that provider.
 * Picking a provider sets the host, port and security together, because those
 * three have to agree and a mismatched pair fails in a way that reads like a
 * wrong password.
 */
export const EmailSettings = forwardRef<SettingsTabRef>((props, ref) => {
  const { settings, setSettings, saveSettings, isLoading, isLoaded, error } = useEmailSettings();
  const { user } = useAuth();

  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'success' | 'error'>('unknown');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useImperativeHandle(ref, () => ({
    saveSettings: async () => {
      await saveSettings();
    }
  }), [saveSettings]);

  /**
   * Suggest the signed-in user as the sender on a configuration that has never
   * been filled in. Only ever a prefill of empty fields — overwriting a stored
   * sender with whoever happens to be signed in would be worse than useless.
   */
  useEffect(() => {
    if (!isLoaded || !user) return;

    setSettings(prev => {
      if (prev.from_email || prev.from_name) return prev;
      return {
        ...prev,
        from_email: user.email || '',
        from_name: user.name || ''
      };
    });
  }, [isLoaded, user, setSettings]);

  // Derived rather than stored, so a hand-edited host cannot leave the dropdown
  // claiming a provider it no longer matches.
  const selectedProvider = useMemo(
    () => settings.provider || detectProvider(settings.smtp_host, settings.smtp_port, settings.smtp_security),
    [settings.provider, settings.smtp_host, settings.smtp_port, settings.smtp_security]
  );

  const providerDetails = findProvider(selectedProvider);
  const isCustom = selectedProvider === CUSTOM_PROVIDER_ID;

  const update = <K extends keyof typeof settings>(field: K, value: typeof settings[K]) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    if (connectionStatus !== 'unknown') setConnectionStatus('unknown');
  };

  const handleProviderChange = (providerId: string) => {
    const provider = findProvider(providerId);

    setSettings(prev => ({
      ...prev,
      provider: providerId,
      // Custom keeps whatever is already there for the admin to edit; a known
      // provider replaces all three together.
      ...(provider ? { smtp_host: provider.host, smtp_port: provider.port, smtp_security: provider.security } : {})
    }));
    setConnectionStatus('unknown');
  };

  const testConnection = async () => {
    setIsTestingConnection(true);

    try {
      // Tested against what is stored, so unsaved edits are saved first —
      // otherwise the result would describe the previous configuration.
      await saveSettings();

      const result = await emailService.testConnection();

      setConnectionStatus(result.success ? 'success' : 'error');
      setConnectionMessage(result.message);

      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (testError) {
      setConnectionStatus('error');
      setConnectionMessage((testError as Error).message);
      toast.error('Connection test failed: ' + (testError as Error).message);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const sendTestEmail = async () => {
    setIsSendingTest(true);

    try {
      const result = await emailService.sendTestEmail();

      if (result.success) {
        toast.success(`Test email sent to ${settings.from_email}`);
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsSendingTest(false);
    }
  };

  const getConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'success':
        return 'Connection successful';
      case 'error':
        return connectionMessage || 'Connection failed';
      default:
        return 'Not tested';
    }
  };

  // What is needed before a connection test can say anything useful. The
  // enabled toggle is deliberately not part of this: refusing to test until
  // sending is switched on forces you to switch on a configuration you have
  // not been allowed to check.
  const canTest = !!(settings.smtp_host && settings.smtp_user && settings.smtp_password && settings.from_email);

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <Mail className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">Email Configuration</h3>
        </div>
        <div className="flex justify-center py-8">
          <div className="text-muted-foreground">Loading email settings...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <Mail className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">Email Configuration</h3>
        </div>
        <div className="text-center py-8">
          <div className="text-destructive mb-2">Error loading settings</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enable + connection status */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <Mail className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">Email Configuration</h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <h4 className="text-sm font-medium text-card-foreground">Enable Email Sending</h4>
              <p className="text-sm text-muted-foreground">
                Send invoices, reminders and account emails from the address below
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                aria-label="Enable email sending"
                checked={settings.isEnabled}
                onChange={(e) => update('isEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center">
              {getConnectionStatusIcon()}
              <span className="ml-2 text-sm font-medium text-card-foreground">
                {getConnectionStatusText()}
              </span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={testConnection}
                disabled={isTestingConnection || !canTest}
                title={canTest ? undefined : 'Fill in the provider, credentials and From Email first'}
                className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTestingConnection ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                onClick={sendTestEmail}
                disabled={isSendingTest || connectionStatus !== 'success' || !settings.isEnabled}
                title={settings.isEnabled ? undefined : 'Switch on email sending to send a test'}
                className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSendingTest ? 'Sending...' : 'Send Test Email'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sender identity */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-2">
          <UserIcon className="h-5 w-5 text-primary mr-2" />
          <h4 className="text-md font-medium text-card-foreground">Sender</h4>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          What your clients see in the From line. Prefilled from your account.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="email-from-address" className="block text-sm font-medium text-muted-foreground mb-2">
              From Email *
            </label>
            <input
              id="email-from-address"
              type="email"
              value={settings.from_email}
              onChange={(e) => update('from_email', e.target.value)}
              placeholder="invoices@yourcompany.com"
              className={themeClasses.input}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Most providers require this to be an address the account is allowed
              to send as.
            </p>
          </div>
          <div>
            <label htmlFor="email-from-name" className="block text-sm font-medium text-muted-foreground mb-2">
              From Name
            </label>
            <input
              id="email-from-name"
              type="text"
              value={settings.from_name}
              onChange={(e) => update('from_name', e.target.value)}
              placeholder="Your Company Name"
              className={themeClasses.input}
            />
          </div>
        </div>
      </div>

      {/* Provider */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-2">
          <Server className="h-5 w-5 text-primary mr-2" />
          <h4 className="text-md font-medium text-card-foreground">Mail Provider</h4>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Choosing a provider sets the server, port and encryption together.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="email-provider" className="block text-sm font-medium text-muted-foreground mb-2">
              Provider
            </label>
            <select
              id="email-provider"
              value={selectedProvider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className={themeClasses.select}
            >
              <option value="">Select a provider…</option>
              {EMAIL_PROVIDERS.map(provider => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
              <option value={CUSTOM_PROVIDER_ID}>Custom (enter server details)</option>
            </select>
          </div>

          {providerDetails && (
            <div className="p-4 bg-muted/30 rounded-lg space-y-1">
              <p className="text-sm text-card-foreground">
                <span className="font-medium">{providerDetails.host}</span>
                {' · port '}{providerDetails.port}
                {' · '}{SECURITY_LABELS[providerDetails.security]}
              </p>
              {providerDetails.hint && (
                <p className="text-sm text-muted-foreground">{providerDetails.hint}</p>
              )}
            </div>
          )}

          {/* Server details, shown only when there is no provider to take them from. */}
          {isCustom && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="email-smtp-host" className="block text-sm font-medium text-muted-foreground mb-2">
                  SMTP Host *
                </label>
                <input
                  id="email-smtp-host"
                  type="text"
                  value={settings.smtp_host}
                  onChange={(e) => update('smtp_host', e.target.value)}
                  placeholder="mail.yourcompany.com"
                  className={themeClasses.input}
                />
              </div>
              <div>
                <label htmlFor="email-smtp-port" className="block text-sm font-medium text-muted-foreground mb-2">
                  SMTP Port *
                </label>
                <input
                  id="email-smtp-port"
                  type="number"
                  value={settings.smtp_port}
                  onChange={(e) => update('smtp_port', parseInt(e.target.value, 10) || 587)}
                  placeholder="587"
                  className={themeClasses.input}
                />
              </div>
              <div>
                <label htmlFor="email-smtp-security" className="block text-sm font-medium text-muted-foreground mb-2">
                  Encryption
                </label>
                <select
                  id="email-smtp-security"
                  value={settings.smtp_security}
                  onChange={(e) => update('smtp_security', e.target.value as SmtpSecurity)}
                  className={themeClasses.select}
                >
                  <option value="tls">STARTTLS (587)</option>
                  <option value="ssl">SSL/TLS (465)</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Credentials */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-4">
          <Mail className="h-5 w-5 text-primary mr-2" />
          <h4 className="text-md font-medium text-card-foreground">Credentials</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="email-smtp-user" className="block text-sm font-medium text-muted-foreground mb-2">
              Username *
            </label>
            <input
              id="email-smtp-user"
              type="text"
              value={settings.smtp_user}
              onChange={(e) => update('smtp_user', e.target.value)}
              placeholder="your-email@example.com"
              className={themeClasses.input}
            />
          </div>
          <div>
            <label htmlFor="email-smtp-password" className="block text-sm font-medium text-muted-foreground mb-2">
              Password *
            </label>
            <div className="relative">
              <input
                id="email-smtp-password"
                type={showPassword ? 'text' : 'password'}
                value={settings.smtp_password}
                onChange={(e) => update('smtp_password', e.target.value)}
                placeholder="App password or API key"
                className={`${themeClasses.input} pr-10`}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Held on the server and used only to send mail. You can also set
              SMTP_HOST, SMTP_USER and SMTP_PASS in .env — settings saved here
              take precedence.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});

EmailSettings.displayName = 'EmailSettings';
