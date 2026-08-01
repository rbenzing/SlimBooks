import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { CreditCard, AlertTriangle, CheckCircle, Copy, ExternalLink, Webhook, Key, Eye, EyeOff } from 'lucide-react';
import { themeClasses } from '@/utils/themeUtils.util';
import { toast } from 'sonner';
import { stripeService } from '@/services/stripe.svc';
import type { SettingsTabRef, ProjectSettings, StripeStatus, StripeAccountSummary } from '@/types';

/**
 * Stripe credentials and connection.
 *
 * The tab owns both the switch and the credentials, so there is one place to go
 * rather than a switch on one tab and the fields on another.
 *
 * An install that sets STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in .env is
 * treated as switched on already — it has made the decision — and the toggle
 * can still turn it back off without editing .env.
 *
 * The secret key and webhook signing secret are write-only. The server does not
 * return them, because a settings screen that displays a secret key is a
 * settings screen that ships one to every browser that opens it. What comes
 * back instead is whether each is configured; leaving a field blank keeps the
 * stored value, and typing into it replaces it.
 */
export const StripeSettingsTab = forwardRef<SettingsTabRef>((props, ref) => {
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [envConfigured, setEnvConfigured] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [publishableKey, setPublishableKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'success' | 'error'>('unknown');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [account, setAccount] = useState<StripeAccountSummary | null>(null);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);

  // Stripe's dashboard shows the endpoint it will post to; this is the URL to
  // register there.
  const webhookEndpoint = `${window.location.origin}/api/webhooks/stripe`;

  const loadStatus = useCallback(async () => {
    try {
      const current = await stripeService.getStatus();
      setStatus(current);
      setIsEnabled(current.enabled);
      setPublishableKey(current.publishableKey);

      // Whether the credentials came from .env is a project setting rather than
      // part of the Stripe status, since it describes where they were read from.
      const { sqliteService } = await import('@/services/sqlite.svc');
      if (!sqliteService.isReady()) {
        await sqliteService.initialize();
      }
      const projectSettings = await sqliteService.getProjectSettings();
      setEnvConfigured(projectSettings?.stripe?.env_configured ?? false);
    } catch (error) {
      console.error('Error loading Stripe status:', error);
      toast.error('Failed to load Stripe status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const saveSettings = useCallback(async () => {
    try {
      const { sqliteService } = await import('@/services/sqlite.svc');

      if (!sqliteService.isReady()) {
        await sqliteService.initialize();
      }

      const current = await sqliteService.getProjectSettings();

      // Blank secrets are omitted rather than sent as empty strings — the
      // server treats a blank credential as "leave it alone", and this keeps
      // the intent visible on the way out too.
      const settings: ProjectSettings = {
        ...current,
        stripe: {
          ...current.stripe,
          enabled: isEnabled,
          publishable_key: publishableKey,
          ...(secretKey && { secret_key: secretKey }),
          ...(webhookSecret && { webhook_secret: webhookSecret })
        }
      };

      await sqliteService.updateProjectSettings(settings);

      // Clear the write-only fields: what is on screen is no longer what is
      // pending, and leaving them filled would suggest otherwise.
      setSecretKey('');
      setWebhookSecret('');
      setConnectionStatus('unknown');
      await loadStatus();

      toast.success('Stripe settings saved successfully');
    } catch (error) {
      console.error('Error saving Stripe settings:', error);
      toast.error('Failed to save Stripe settings');
    }
  }, [isEnabled, publishableKey, secretKey, webhookSecret, loadStatus]);

  useImperativeHandle(ref, () => ({ saveSettings }), [saveSettings]);

  /**
   * Ask the server to call Stripe with the stored keys.
   *
   * Unsaved edits are saved first, otherwise the test would report on the
   * previous keys and contradict what is on screen.
   */
  const testConnection = async () => {
    setIsTestingConnection(true);

    try {
      if (secretKey || webhookSecret || publishableKey !== status?.publishableKey) {
        await saveSettings();
      }

      const result = await stripeService.testConnection();

      setConnectionStatus(result.success ? 'success' : 'error');
      setConnectionMessage(result.message);
      setAccount(result.account ?? null);

      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      setConnectionStatus('error');
      setConnectionMessage((error as Error).message);
      toast.error('Connection test failed: ' + (error as Error).message);
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
        return account?.display_name ? `Connected to ${account.display_name}` : 'Connected successfully';
      case 'error':
        return connectionMessage || 'Connection failed';
      default:
        return status?.configured ? 'Not tested' : 'Not configured';
    }
  };

  const testMode = status?.testMode ?? true;
  const isConnected = connectionStatus === 'success';
  const canTest = !!status?.configured || !!secretKey;

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
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <CreditCard className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">Stripe Integration</h3>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <h4 className="text-sm font-medium text-card-foreground">Enable Stripe</h4>
              <p className="text-sm text-muted-foreground">
                Accept card payments against invoices with a payment link
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                aria-label="Enable Stripe"
                checked={isEnabled}
                onChange={(e) => { setIsEnabled(e.target.checked); setConnectionStatus('unknown'); }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {envConfigured && (
            <p className="text-sm text-muted-foreground">
              Keys were found in your .env file, so this was switched on
              automatically. Entering keys below overrides them.
            </p>
          )}

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
                className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTestingConnection ? 'Testing...' : 'Test Connection'}
              </button>
              {isConnected && (
                <a
                  href={testMode ? 'https://dashboard.stripe.com/test' : 'https://dashboard.stripe.com'}
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

          {isConnected && account && !account.charges_enabled && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-3 mt-0.5" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  The keys work, but this account cannot accept charges yet. Finish
                  onboarding in the Stripe dashboard before sending payment links.
                </p>
              </div>
            </div>
          )}

          {/* Mode is read from the key itself, so it cannot disagree with it. */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-card-foreground">Mode</h4>
              <p className="text-sm text-muted-foreground">
                Taken from the secret key in use — an sk_test_ key is test mode,
                an sk_live_ key is live.
              </p>
            </div>
            <span className={`px-3 py-1 text-sm rounded-full ${
              testMode
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
            }`}>
              {testMode ? 'Test mode' : 'Live mode'}
            </span>
          </div>
        </div>
      </div>

      {/* Credentials, once the integration is switched on. */}
      {isEnabled && (<>
      {/* API Keys Configuration */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <Key className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">API Keys</h3>
          {status?.configured && (
            <CheckCircle className="h-4 w-4 text-green-500 ml-2" aria-label="Configured" />
          )}
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start">
              <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  {testMode ? 'Test Mode Keys' : 'Live Mode Keys'}
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {testMode
                    ? 'Test keys process no real money. Anything you collect here is simulated.'
                    : 'Live keys take real payments from real cards.'
                  }
                </p>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="stripe-publishable-key" className="block text-sm font-medium text-muted-foreground mb-2">
              Publishable Key
            </label>
            <div className="relative">
              <input
                id="stripe-publishable-key"
                type="text"
                value={publishableKey}
                onChange={(e) => setPublishableKey(e.target.value)}
                placeholder={testMode ? 'pk_test_...' : 'pk_live_...'}
                className={themeClasses.input}
              />
              <button
                type="button"
                aria-label="Copy publishable key"
                onClick={() => copyToClipboard(publishableKey, 'Publishable key')}
                disabled={!publishableKey}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="stripe-secret-key" className="block text-sm font-medium text-muted-foreground mb-2">
              Secret Key
            </label>
            <div className="relative">
              <input
                id="stripe-secret-key"
                type={showSecretKey ? 'text' : 'password'}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder={status?.configured ? 'Stored — type a new key to replace it' : 'sk_test_...'}
                className={`${themeClasses.input} pr-10`}
              />
              <button
                type="button"
                aria-label={showSecretKey ? 'Hide secret key' : 'Show secret key'}
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
              >
                {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Held on the server and never sent back to this page. Leave blank to
              keep the stored key. You can also set STRIPE_SECRET_KEY in .env —
              a key saved here takes precedence.
            </p>
          </div>
        </div>
      </div>

      {/* Webhook Configuration */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <Webhook className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">Webhook Configuration</h3>
          {status?.webhookConfigured && (
            <CheckCircle className="h-4 w-4 text-green-500 ml-2" aria-label="Webhook configured" />
          )}
        </div>

        <div className="space-y-4">
          {!status?.webhookConfigured && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-3 mt-0.5" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Without a signing secret, payments cannot be reconciled: clients
                  can still pay, but invoices will not be marked paid automatically.
                </p>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="stripe-webhook-endpoint" className="block text-sm font-medium text-muted-foreground mb-2">
              Webhook Endpoint URL
            </label>
            <div className="relative">
              <input
                id="stripe-webhook-endpoint"
                type="text"
                value={webhookEndpoint}
                readOnly
                className={themeClasses.input}
              />
              <button
                type="button"
                aria-label="Copy webhook endpoint"
                onClick={() => copyToClipboard(webhookEndpoint, 'Webhook endpoint')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              This is the address this server listens on. Add it to your Stripe
              webhook endpoints — Stripe must be able to reach it, so a localhost
              address only works behind a tunnel such as the Stripe CLI.
            </p>
          </div>

          <div>
            <label htmlFor="stripe-webhook-secret" className="block text-sm font-medium text-muted-foreground mb-2">
              Webhook Signing Secret
            </label>
            <div className="relative">
              <input
                id="stripe-webhook-secret"
                type={showWebhookSecret ? 'text' : 'password'}
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder={status?.webhookConfigured ? 'Stored — type a new secret to replace it' : 'whsec_...'}
                className={`${themeClasses.input} pr-10`}
              />
              <button
                type="button"
                aria-label={showWebhookSecret ? 'Hide webhook secret' : 'Show webhook secret'}
                onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
              >
                {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Held on the server. Leave blank to keep the stored secret, or set
              STRIPE_WEBHOOK_SECRET in .env.
            </p>
          </div>

          <div>
            <span className="block text-sm font-medium text-muted-foreground mb-2">
              Events to Listen For
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                'checkout.session.completed',
                'payment_intent.succeeded'
              ].map((event) => (
                <div key={event} className="flex items-center p-2 bg-muted/30 rounded">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                  <span className="text-sm text-card-foreground">{event}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              These are the events this server acts on. Anything else is
              acknowledged and ignored, so selecting more does no harm.
            </p>
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
              and copy your publishable and secret keys. Start with the test keys.
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
              , add the endpoint URL above, select the events listed, then paste
              the signing secret it gives you into the field above.
            </p>
          </div>
          <div>
            <h5 className="font-medium text-card-foreground mb-2">3. Test your connection</h5>
            <p>
              Use "Test Connection" above. It calls Stripe with the stored keys,
              so a revoked or mistyped key fails here rather than at the moment a
              client tries to pay.
            </p>
          </div>
        </div>
      </div>
      </>)}
    </div>
  );
});

StripeSettingsTab.displayName = 'StripeSettingsTab';
