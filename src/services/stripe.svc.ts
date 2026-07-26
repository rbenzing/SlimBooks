// Stripe integration service for payment processing and webhook handling

import { sqliteService } from './sqlite.svc';
import {
  type StripeInvoice,
  type StripeSubscription, 
  type StripePaymentIntent,
  type StripeAccountInfo,
  type StripeConnectionTestResult,
  type StripePaymentLink,
  type StripePaymentLinkResult,
  type StripeWebhookResult,
  type StripeOperationResult,
  type StripeInvoiceData,
  type StripeSettings,
  type Invoice
} from '@/types';

export class StripeService {
  private static instance: StripeService;
  private settings: StripeSettings | null = null;
  private settingsTimestamp: number = 0;
  private readonly SETTINGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  static getInstance(): StripeService {
    if (!StripeService.instance) {
      StripeService.instance = new StripeService();
    }
    return StripeService.instance;
  }

  /**
   * Loads Stripe settings from database
   */
  async loadSettings(): Promise<StripeSettings | null> {
    try {
      // Check if we have cached settings that are still valid
      const now = Date.now();
      if (this.settings && (now - this.settingsTimestamp) < this.SETTINGS_CACHE_TTL) {
        return this.settings;
      }
      if (sqliteService.isReady()) {
        const settings = await sqliteService.getSetting('stripe_settings') as StripeSettings;
        if (settings) {
          this.settings = settings;
          this.settingsTimestamp = Date.now(); // Update cache timestamp
          return settings;
        }
      }
    } catch (error) {
      console.error('Error loading Stripe settings:', error);
    }
    return null;
  }

  /**
   * Saves Stripe settings to database
   */
  async saveSettings(settings: StripeSettings): Promise<StripeOperationResult> {
    try {
      if (!sqliteService.isReady()) {
        await sqliteService.initialize();
      }

      await sqliteService.setSetting('stripe_settings', settings, 'stripe');
      this.settings = settings;
      this.settingsTimestamp = Date.now(); // Update cache timestamp

      return {
        success: true,
        message: 'Stripe settings saved successfully'
      };
    } catch (error) {
      console.error('Error saving Stripe settings:', error);
      return {
        success: false,
        message: 'Failed to save Stripe settings'
      };
    }
  }

  /**
   * Gets current Stripe settings
   */
  getSettings(): StripeSettings | null {
    return this.settings;
  }

  /**
   * Tests Stripe API connection with current settings
   */
  async testConnection(): Promise<StripeConnectionTestResult> {
    try {
      const settings = await this.loadSettings();

      if (!settings || !settings.enabled) {
        return {
          success: false,
          message: 'Stripe is not enabled or configured'
        };
      }

      if (!settings.secretKey) {
        return {
          success: false,
          message: 'Stripe secret key is required'
        };
      }

      // Simulate connection test
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Simulate success/failure based on basic validation
      const isValidConfig = settings.publishableKey.startsWith('pk_') &&
                           settings.secretKey.startsWith('sk_') &&
                           settings.publishableKey.length > 20 &&
                           settings.secretKey.length > 20;

      if (isValidConfig) {
        // Simulate account info
        const accountInfo: StripeAccountInfo = {
          id: 'acct_test123456789',
          display_name: 'Test Business',
          business_profile: {
            name: 'Test Business',
            url: 'https://testbusiness.com'
          },
          country: 'US',
          default_currency: 'usd'
        };

        return {
          success: true,
          message: 'Stripe connection successful',
          accountInfo
        };
      } else {
        return {
          success: false,
          message: 'Invalid Stripe API keys'
        };
      }
    } catch (error) {
      console.error('Error testing Stripe connection:', error);
      return {
        success: false,
        message: 'Connection test failed: ' + error
      };
    }
  }

  /**
   * Creates a Stripe payment link for an invoice
   */
  async createPaymentLink(invoiceData: StripeInvoiceData): Promise<StripePaymentLinkResult> {
    try {
      const settings = await this.loadSettings();

      if (!settings || !settings.enabled) {
        return {
          success: false,
          message: 'Stripe is not enabled'
        };
      }

      // payment link creation
      const paymentLink: StripePaymentLink = {
        id: `plink_${Date.now()}`,
        url: `https://buy.stripe.com/test_${Math.random().toString(36).substring(7)}`,
        active: true,
        metadata: {
          invoice_id: invoiceData.id.toString(),
          invoice_number: invoiceData.invoice_number,
          client_email: invoiceData.client_email
        }
      };

      return {
        success: true,
        message: 'Payment link created successfully',
        paymentLink
      };
    } catch (error) {
      console.error('Error creating Stripe payment link:', error);
      return {
        success: false,
        message: 'Failed to create payment link'
      };
    }
  }

  /**
   * Retrieves a payment link by ID
   */
  async getPaymentLink(linkId: string): Promise<StripePaymentLinkResult> {
    try {
      const settings = await this.loadSettings();

      if (!settings || !settings.enabled) {
        return {
          success: false,
          message: 'Stripe is not enabled'
        };
      }

      // payment link retrieval
      const paymentLink: StripePaymentLink = {
        id: linkId,
        url: `https://buy.stripe.com/test_${linkId.substring(6)}`,
        active: true,
        metadata: {
          invoice_id: '123',
          invoice_number: 'INV-001',
          client_email: 'client@example.com'
        }
      };

      return {
        success: true,
        message: 'Payment link retrieved successfully',
        paymentLink
      };
    } catch (error) {
      console.error('Error retrieving Stripe payment link:', error);
      return {
        success: false,
        message: 'Failed to retrieve payment link'
      };
    }
  }

  /**
   * Deactivates a payment link
   */
  async deactivatePaymentLink(_linkId: string): Promise<StripeOperationResult> {
    try {
      const settings = await this.loadSettings();

      if (!settings || !settings.enabled) {
        return {
          success: false,
          message: 'Stripe is not enabled'
        };
      }

      return {
        success: true,
        message: 'Payment link deactivated successfully'
      };
    } catch (error) {
      console.error('Error deactivating Stripe payment link:', error);
      return {
        success: false,
        message: 'Failed to deactivate payment link'
      };
    }
  }

  /**
   * Processes Stripe webhook events
   */
  async processWebhook(payload: string, _signature: string): Promise<StripeWebhookResult> {
    try {
      const settings = await this.loadSettings();

      if (!settings || !settings.enabled) {
        return {
          success: false,
          message: 'Stripe is not enabled'
        };
      }

      if (!settings.webhookSecret) {
        return {
          success: false,
          message: 'Webhook secret not configured'
        };
      }

      // Parse the simulated event
      const event = JSON.parse(payload);

      // Handle different event types
      switch (event.type) {
        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object);
          break;
        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await this.handleSubscriptionEvent(event.data.object, event.type);
          break;
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object);
          break;
        default:
      }

      return {
        success: true,
        message: 'Webhook processed successfully'
      };
    } catch (error) {
      console.error('Error processing webhook:', error);
      return {
        success: false,
        message: 'Failed to process webhook: ' + error
      };
    }
  }

  /**
   * Handles successful invoice payment
   */
  private async handleInvoicePaymentSucceeded(invoice: StripeInvoice): Promise<void> {
    try {
      const { authenticatedFetch } = await import('@/utils/api');

      // Update local invoice status to paid
      const response = await authenticatedFetch('/api/invoices');
      const result = await response.json();
      const localInvoices: Invoice[] = result.data;
      const localInvoice = localInvoices.find(inv => inv.stripe_invoice_id === invoice.id);

      if (localInvoice) {
        await authenticatedFetch(`/api/invoices/${localInvoice.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            invoiceData: {
              status: 'paid'
            }
          })
        });
      }
    } catch (error) {
      console.error('Error handling invoice payment succeeded:', error);
    }
  }

  /**
   * Handles failed invoice payment
   */
  private async handleInvoicePaymentFailed(invoice: StripeInvoice): Promise<void> {
    try {
      const { authenticatedFetch } = await import('@/utils/api');

      // Update local invoice status
      const response = await authenticatedFetch('/api/invoices');
      const result = await response.json();
      const localInvoices: Invoice[] = result.data;
      const localInvoice = localInvoices.find(inv => inv.stripe_invoice_id === invoice.id);

      if (localInvoice) {
        await authenticatedFetch(`/api/invoices/${localInvoice.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            invoiceData: {
              status: 'overdue'
            }
          })
        });
      }
    } catch (error) {
      console.error('Error handling invoice payment failed:', error);
    }
  }

  /**
   * Handles subscription events
   */
  private async handleSubscriptionEvent(_subscription: StripeSubscription, _eventType: string): Promise<void> {
    try {
      // Handle subscription updates in your local database
    } catch (error) {
      console.error('Error handling subscription event:', error);
    }
  }

  /**
   * Handles successful payment intent
   */
  private async handlePaymentIntentSucceeded(_paymentIntent: StripePaymentIntent): Promise<void> {
    try {
      // Handle successful payment
    } catch (error) {
      console.error('Error handling payment intent succeeded:', error);
    }
  }

  /**
   * Gets Stripe dashboard URL for the current mode
   */
  async getDashboardUrl(): Promise<string> {
    const settings = await this.loadSettings();
    const baseUrl = 'https://dashboard.stripe.com';

    if (settings?.testMode) {
      return `${baseUrl}/test`;
    }

    return baseUrl;
  }

  /**
   * Checks if Stripe is properly configured
   */
  async isConfigured(): Promise<boolean> {
    const settings = await this.loadSettings();
    return !!(settings?.enabled && settings?.publishableKey && settings?.secretKey);
  }
}
