// Stripe-specific types and interfaces
import type { StripeSettings } from './settings.types';

// Stripe Invoice object (simplified version of what we use)
export interface StripeInvoice {
  id: string;
  object: 'invoice';
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  currency: string;
  customer: string;
  description?: string;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
  metadata: Record<string, string>;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  subscription?: string;
  created: number;
  due_date?: number;
  paid: boolean;
  payment_intent?: string;
}

// Stripe Subscription object
export interface StripeSubscription {
  id: string;
  object: 'subscription';
  cancel_at_period_end: boolean;
  canceled_at?: number;
  currency: string;
  current_period_end: number;
  current_period_start: number;
  customer: string;
  metadata: Record<string, string>;
  status: 'active' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'past_due' | 'trialing' | 'unpaid';
  created: number;
}

// Stripe Payment Intent object
export interface StripePaymentIntent {
  id: string;
  object: 'payment_intent';
  amount: number;
  amount_received: number;
  currency: string;
  customer?: string;
  description?: string;
  invoice?: string;
  metadata: Record<string, string>;
  payment_method?: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'requires_capture' | 'canceled' | 'succeeded';
  created: number;
}

// Stripe Account Info
export interface StripeAccountInfo {
  id: string;
  display_name?: string;
  business_profile?: {
    name?: string;
    url?: string;
  };
  country: string;
  default_currency: string;
}

// Stripe Connection Test Result
export interface StripeConnectionTestResult {
  success: boolean;
  message: string;
  accountInfo?: StripeAccountInfo;
}

// Note: StripeSettings is now defined in domain/settings.types.ts to avoid duplication

// Stripe Payment Link
export interface StripePaymentLink {
  id: string;
  url: string;
  active: boolean;
  metadata?: Record<string, string>;
}

// Stripe Payment Link Creation Response
export interface StripePaymentLinkResult {
  success: boolean;
  paymentLink?: StripePaymentLink;
  message?: string;
}

// Stripe Webhook Event
export interface StripeWebhookEvent {
  id: string;
  object: 'event';
  type: string;
  data: {
    object: StripeInvoice | StripeSubscription | StripePaymentIntent | Record<string, unknown>;
  };
  created: number;
  livemode: boolean;
  pending_webhooks: number;
}

// Stripe Webhook Handler Result
export interface StripeWebhookResult {
  success: boolean;
  message?: string;
  processed?: boolean;
}

// Generic Stripe operation result
export interface StripeOperationResult {
  success: boolean;
  message: string;
}

// Stripe settings save result - imports StripeSettings from settings.types.ts
export interface StripeSettingsSaveResult extends StripeOperationResult {
  settings?: StripeSettings;
}

// Stripe Invoice data for creating payment links
export interface StripeInvoiceData {
  id: number;
  invoice_number: string;
  client_name: string;
  client_email: string;
  amount: number;
  currency: string;
  description?: string;
  due_date?: string;
  metadata?: Record<string, string>;
}