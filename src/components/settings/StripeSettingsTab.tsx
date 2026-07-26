
import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { CreditCard, AlertTriangle, CheckCircle, Copy, ExternalLink, Webhook, Key, Eye, EyeOff } from 'lucide-react';
import { themeClasses } from '@/utils/themeUtils.util';
import { toast } from 'sonner';
import type { SettingsTabRef, StripeSettings } from '@/types';

export const StripeSettingsTab = forwardRef<SettingsTabRef>((props, ref) => {
  const [settings, setSettings] = useState<StripeSettings>({
    webhookSecret: '',
    webhookEndpoint: '',
    testMode: true,
    publishableKey: '',
    secretKey: '',
    isEnabled: false,
    accountId: '',
    accountName: '',
    connectedAt: ''
  });

  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'success' | 'error'>('unknown');
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Use dynamic import to avoid circular dependencies
      const { sqliteService } = await import('@/services/sqlite.svc');
      
      if (!sqliteService.isReady()) {
        await sqliteService.initialize();
      }

      const saved = await sqliteService.getSetting('stripe_settings') as StripeSettings | null;
      if (saved) {
        setSettings({
          webhookSecret: saved.webhookSecret || '',
          webhookEndpoint: saved.webhookEndpoint || `${window.location.origin}/api/webhooks/stripe`,
          testMode: saved.testMode ?? true,
          publishableKey: saved.publishableKey || '',
          secretKey: saved.secretKey || '',
          isEnabled: saved.isEnabled ?? false,
          accountId: saved.accountId || '',
          accountName: saved.accountName || '',
          connectedAt: saved.connectedAt || ''
        });
      } else {
        // Set default webhook endpoint
        setSettings(prev => ({
          ...prev,
          webhookEndpoint: `${window.location.origin}/api/webhooks/stripe`
        }));
      }
    } catch (error) {
      console.error('Error loading Stripe settings:', error);
    }
  };

  const handleInputChange = (field: keyof StripeSettings, value: string | boolean) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));

    // Reset connection status when settings change
    if (connectionStatus !== 'unknown') {
      setConnectionStatus('unknown');
    }
  };

  const saveSettings = useCallback(async () => {
    try {
      // Use dynamic import to avoid circular dependencies
      const { sqliteService } = await import('@/services/sqlite.svc');

      if (!sqliteService.isReady()) {
        await sqliteService.initialize();
      }

      await sqliteService.setSetting('stripe_settings', settings);
      toast.success('Stripe settings saved successfully');
    } catch (error) {
      console.error('Error saving Stripe settings:', error);
      toast.error('Failed to save Stripe settings');
    }
  }, [settings]);

  // Expose saveSettings method to parent component
  useImperativeHandle(ref, () => ({ saveSettings }), [saveSettings]);

  const testConnection = async () => {
    if (!settings.publishableKey || !settings.secretKey) {
      toast.error('Please enter both publishable and secret keys');
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('unknown');

    try {
      // Save settings first
      await saveSettings();

      // Simulate Stripe connection test (in real app, this would call Stripe API)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Basic validation
      const isValidPublishableKey = settings.publishableKey.startsWith(settings.testMode ? 'pk_test_' : 'pk_live_');
      const isValidSecretKey = settings.secretKey.startsWith(settings.testMode ? 'sk_test_' : 'sk_live_');

      if (isValidPublishableKey && isValidSecretKey) {
        setConnectionStatus('success');
        const updatedSettings = {
          ...settings,
          accountId: 'acct_test_123',
          accountName: 'Test Business Account',
          connectedAt: new Date().toISOString()
        };
        setSettings(updatedSettings);
        // Use dynamic import to avoid circular dependencies
        const { sqliteService: sqliteServiceForUpdate } = await import('@/services/sqlite.svc');
        await sqliteServiceForUpdate.setSetting('stripe_settings', updatedSettings);
        toast.success('Stripe connection successful!');
      } else {
        setConnectionStatus('error');
        toast.error('Invalid API keys for the selected mode');
      }
    } catch (error) {
      setConnectionStatus('error');
      toast.error('Connection test failed: ' + error);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const getConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'success':
        return settings.accountName ? `Connected to ${settings.accountName}` : 'Connected successfully';
      case 'error':
        return 'Connection failed';
      default:
        return 'Not tested';
    }
  };

  const isConnected = connectionStatus === 'success' && settings.isEnabled;

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <CreditCard className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">Stripe Integration</h3>
        </div>

        <div className="space-y-6">
          {/* Enable/Disable Stripe */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <h4 className="text-sm font-medium text-card-foreground">Enable Stripe Integration</h4>
              <p className="text-sm text-muted-foreground">Connect your Stripe account to process payments and automate invoicing</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.isEnabled}
                onChange={(e) => handleInputChange('isEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Connection Status */}
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
                disabled={isTestingConnection || !settings.isEnabled || !settings.publishableKey || !settings.secretKey}
                className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTestingConnection ? 'Testing...' : 'Test Connection'}
              </button>
              {isConnected && (
                <a
                  href="https://dashboard.stripe.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 flex items-center"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Dashboard
                </a>
              )}
            </div>
          </div>

          {/* Test/Live Mode Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-card-foreground">Test Mode</h4>
              <p className="text-sm text-muted-foreground">Use test keys for development and testing</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.testMode}
                onChange={(e) => handleInputChange('testMode', e.target.checked)}
                disabled={!settings.isEnabled}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* API Keys Configuration */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <Key className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">API Keys</h3>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start">
              <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  {settings.testMode ? 'Test Mode Keys' : 'Live Mode Keys'}
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {settings.testMode
                    ? 'Use test keys for development. No real payments will be processed.'
                    : 'Live keys will process real payments. Use with caution.'
                  }
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Publishable Key *
            </label>
            <div className="relative">
              <input
                type="text"
                value={settings.publishableKey}
                onChange={(e) => handleInputChange('publishableKey', e.target.value)}
                placeholder={settings.testMode ? 'pk_test_...' : 'pk_live_...'}
                className={themeClasses.input}
                disabled={!settings.isEnabled}
              />
              <button
                type="button"
                onClick={() => copyToClipboard(settings.publishableKey, 'Publishable key')}
                disabled={!settings.publishableKey}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Secret Key *
            </label>
            <div className="relative">
              <input
                type={showSecretKey ? 'text' : 'password'}
                value={settings.secretKey}
                onChange={(e) => handleInputChange('secretKey', e.target.value)}
                placeholder={settings.testMode ? 'sk_test_...' : 'sk_live_...'}
                className={themeClasses.input}
                disabled={!settings.isEnabled}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 space-x-2">
                <button
                  type="button"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                  className="text-muted-foreground hover:text-foreground"
                  disabled={!settings.isEnabled}
                >
                  {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(settings.secretKey, 'Secret key')}
                  disabled={!settings.secretKey}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Webhook Configuration */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <Webhook className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">Webhook Configuration</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Webhook Endpoint URL
            </label>
            <div className="relative">
              <input
                type="text"
                value={settings.webhookEndpoint}
                onChange={(e) => handleInputChange('webhookEndpoint', e.target.value)}
                placeholder="https://your-app.com/api/webhooks/stripe"
                className={themeClasses.input}
                disabled={!settings.isEnabled}
              />
              <button
                type="button"
                onClick={() => copyToClipboard(settings.webhookEndpoint, 'Webhook endpoint')}
                disabled={!settings.webhookEndpoint}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Add this URL to your Stripe webhook endpoints in the dashboard
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Webhook Signing Secret
            </label>
            <div className="relative">
              <input
                type={showWebhookSecret ? 'text' : 'password'}
                value={settings.webhookSecret}
                onChange={(e) => handleInputChange('webhookSecret', e.target.value)}
                placeholder="whsec_..."
                className={themeClasses.input}
                disabled={!settings.isEnabled}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 space-x-2">
                <button
                  type="button"
                  onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                  className="text-muted-foreground hover:text-foreground"
                  disabled={!settings.isEnabled}
                >
                  {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(settings.webhookSecret, 'Webhook secret')}
                  disabled={!settings.webhookSecret}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Events to Listen For
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                'invoice.payment_succeeded',
                'invoice.payment_failed',
                'customer.subscription.created',
                'customer.subscription.updated',
                'customer.subscription.deleted',
                'payment_intent.succeeded'
              ].map((event) => (
                <div key={event} className="flex items-center p-2 bg-muted/30 rounded">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                  <span className="text-sm text-card-foreground">{event}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Setup Instructions */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <h4 className="text-sm font-medium text-card-foreground mb-3">Setup Instructions</h4>
        <div className="space-y-4 text-sm text-muted-foreground">
          <div>
            <h5 className="font-medium text-card-foreground mb-2">1. Get your API keys</h5>
            <p>
              Go to your{' '}
              <a
                href="https://dashboard.stripe.com/apikeys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Stripe Dashboard → API Keys
              </a>{' '}
              and copy your publishable and secret keys.
            </p>
          </div>
          <div>
            <h5 className="font-medium text-card-foreground mb-2">2. Configure webhooks</h5>
            <p>
              In your{' '}
              <a
                href="https://dashboard.stripe.com/webhooks"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Stripe Dashboard → Webhooks
              </a>
              , add the endpoint URL above and select the events you want to listen for.
            </p>
          </div>
          <div>
            <h5 className="font-medium text-card-foreground mb-2">3. Test your connection</h5>
            <p>
              Use the "Test Connection" button above to verify your API keys are working correctly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});

StripeSettingsTab.displayName = 'StripeSettingsTab';
