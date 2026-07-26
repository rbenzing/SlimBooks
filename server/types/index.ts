// Server-specific types and re-exports
// Note: Cannot directly import from src/ due to TypeScript rootDir constraints

// Server-specific API types
export * from './api.types.js';

// Re-export commonly needed types for server use
export type PaymentStatus = 'received' | 'pending' | 'failed' | 'refunded';
export type PaymentMethod = 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'paypal' | 'stripe' | 'other';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
export type UserRole = 'admin' | 'user' | 'viewer';

// Base entity interface for database entities
export interface BaseEntity {
  id: number;
  created_at: string;
  updated_at: string;
}

// Essential database entity types for server use
export interface User extends BaseEntity {
  name: string;
  email: string;
  username: string;
  password_hash?: string;
  role: UserRole;
  email_verified: number;
  google_id?: string;
  two_factor_enabled?: number;
  two_factor_secret?: string;
  backup_codes?: string;
  last_login?: string;
  failed_login_attempts: number;
  account_locked_until?: string;
  password_updated_at?: string;
  email_verified_at?: string;
}

export interface UserPublic extends Omit<User, 'password_hash' | 'two_factor_secret' | 'backup_codes'> {}

export interface Client extends BaseEntity {
  name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  stripe_customer_id?: string;
}

export interface Invoice extends BaseEntity {
  invoice_number: string;
  client_id: number;
  design_template_id?: number;
  recurring_template_id?: number;
  amount: number;
  tax_amount: number;
  total_amount: number;
  status: InvoiceStatus;
  due_date: string;
  issue_date: string;
  description?: string;
  items?: string;
  notes?: string;
  payment_terms?: string;
  stripe_invoice_id?: string;
  stripe_payment_intent_id?: string;
  type: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  line_items?: string;
  tax_rate_id?: string;
  shipping_amount: number;
  shipping_rate_id?: string;
  email_status: string;
  email_sent_at?: string;
  email_error?: string;
  last_email_attempt?: string;
}

export interface LineItem {
  id?: number;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Template extends BaseEntity {
  name: string;
  content: string;
  is_default?: number;
  frequency?: 'monthly' | 'yearly' | 'weekly' | 'daily' | 'once';
}

export interface Expense extends BaseEntity {
  description: string;
  amount: number;
  currency?: string;
  category?: string;
  date: string;
  vendor?: string;
  notes?: string;
  receipt_url?: string;
  is_billable?: boolean;
  client_id?: number;
  project?: string;
}

export interface Payment extends BaseEntity {
  date: string;
  client_name: string;
  invoice_id?: number;
  amount: number;
  method: string;
  reference?: string;
  description?: string;
  status: string;
}

// Additional server-specific database types
export interface ServiceOptions {
  timeout?: number;
  retries?: number;
  throwOnError?: boolean;
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  changes: number;
  lastInsertRowid: number;
}

// Value stored against a settings key (JSON-encoded in the database)
export type SettingValue = string | number | boolean | object | null;

export interface Setting extends BaseEntity {
  key: string;
  value: string;
  category?: string;
  description?: string;
  enabled?: boolean | number | null;
}

// Complete project configuration structure (copied from shared types)
export interface ProjectSettings {
  google_oauth: {
    enabled: boolean;
    client_id: string;
    client_secret?: string;
    configured: boolean;
  };
  stripe: {
    enabled: boolean;
    publishable_key: string;
    secret_key?: string;
    configured: boolean;
  };
  email: {
    enabled: boolean;
    host?: string;
    port?: number;
    user?: string;
    pass?: string;
    email_from?: string;
    smtp_host?: string;
    smtp_port?: number;
    smtp_user?: string;
    smtp_pass?: string;
    configured: boolean;
  };
  security: {
    jwt_secret?: string;
    session_secret?: string;
    require_email_verification?: boolean;
    max_failed_login_attempts?: number;
    account_lockout_duration?: number;
    password_policy?: {
      min_length: number;
      require_uppercase: boolean;
      require_lowercase: boolean;
      require_numbers: boolean;
      require_special: boolean;
    };
  };
}

export interface ProjectSetting {
  id: number;
  setting_key: string;
  setting_value: string;
  category?: string;
  created_at: string;
  updated_at: string;
  email?: Partial<ProjectSettings['email']>;
  google_oauth?: {
    enabled?: boolean;
    client_id?: string;
    configured?: boolean;
  };
  stripe?: {
    enabled?: boolean;
    publishable_key?: string;
    configured?: boolean;
  };
  security?: {
    require_email_verification?: boolean;
    max_failed_login_attempts?: number;
    account_lockout_duration?: number;
  };
}

export interface InvoiceWithClient extends Invoice {
  client_name?: string;
  client_email?: string;
  client_company?: string;
  client_address?: string;
  client_city?: string;
  client_state?: string;
  client_zip?: string;
  client_country?: string;
  client_phone?: string;
}

export interface ExpenseFilters {
  category?: string;
  date_from?: string;
  date_to?: string;
  client_id?: number;
  is_billable?: boolean;
  start_date?: string;
  end_date?: string;
  min_amount?: number;
  max_amount?: number;
}