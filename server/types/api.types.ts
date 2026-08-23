// API Request/Response Types
// Shared type definitions for API endpoints

// Import types from the server types index
import { 
  type User, 
  type UserPublic, 
  type Client, 
  type Invoice, 
  type Template, 
  type Expense, 
  type Payment, 
  type LineItem,
  type InvoiceWithClient,
  type InvoiceStatus,
  type ExpenseStatus,
  type PaymentMethod,
  type PaymentStatus
} from './index.js';

// Authentication API types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data: {
    user: UserPublic;
    token: string;
  };
  requires_email_verification: boolean;
  message: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface RegisterResponse {
  success: boolean;
  data: {
    id: number;
  };
  message: string;
}

export interface RefreshTokenRequest {
  token: string;
}

export interface RefreshTokenResponse {
  success: boolean;
  data: {
    user: UserPublic;
    token: string;
  };
  message: string;
}

// User management API types
export interface CreateUserRequest {
  userData: {
    name: string;
    email: string;
    username?: string;
    password?: string;
    role?: 'user' | 'admin';
    email_verified?: boolean;
    google_id?: string;
    last_login?: number;
    failed_login_attempts?: number;
    account_locked_until?: number;
  };
}

export interface UpdateUserRequest {
  // No `password_hash`: a caller-supplied hash bypasses the configured cost
  // factor and the password policy, so PUT refuses it outright and passwords
  // change through POST /api/users/:id/password.
  userData: Partial<Pick<User, 'name' | 'email' | 'username' | 'role' | 'email_verified' | 'google_id'>>;
}

export interface UpdateUserResponse {
  success: boolean;
  message: string;
}

export interface ResetUserPasswordRequest {
  newPassword: string;
}

export interface ResetUserPasswordResponse {
  success: boolean;
  message: string;
}

export interface UnlockUserResponse {
  success: boolean;
  message: string;
}

// Client API types
export interface CreateClientRequest {
  clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>;
}

export interface UpdateClientRequest {
  clientData: Partial<Omit<Client, 'id' | 'created_at' | 'updated_at'>>;
}

// Invoice API types
export interface CreateInvoiceRequest {
  invoiceData: {
    client_id: number;
    amount: number;
    due_date?: string;
    description?: string;
    notes?: string;
    line_items?: LineItem[];
    tax_amount?: number;
    tax_rate_id?: number;
    shipping_amount?: number;
    shipping_rate_id?: number;
    discount_amount?: number;
    payment_terms?: string;
    thank_you_message?: string;
  };
}

export interface UpdateInvoiceRequest {
  invoiceData: Partial<Omit<Invoice, 'id' | 'created_at' | 'updated_at' | 'invoice_number'>>;
}

export interface InvoiceStatusUpdateRequest {
  status: Invoice['status'];
  paid_date?: string;
}

// Template API types
export interface CreateTemplateRequest {
  templateData: {
    name: string;
    client_id?: number;
    amount: number;
    description?: string;
    frequency?: Template['frequency'];
    payment_terms?: string;
    next_invoice_date?: string;
    is_active?: boolean;
    line_items?: LineItem[];
    tax_amount?: number;
    tax_rate_id?: number;
    shipping_amount?: number;
    shipping_rate_id?: number;
    notes?: string;
  };
}

export interface UpdateTemplateRequest {
  templateData: Partial<Omit<Template, 'id' | 'created_at' | 'updated_at'>>;
}

// Expense API types
export interface CreateExpenseRequest {
  expenseData: Omit<Expense, 'id' | 'created_at' | 'updated_at'>;
}

export interface UpdateExpenseRequest {
  expenseData: Partial<Omit<Expense, 'id' | 'created_at' | 'updated_at'>>;
}

// Payment API types
export interface CreatePaymentRequest {
  paymentData: Omit<Payment, 'id' | 'created_at' | 'updated_at'>;
}

export interface UpdatePaymentRequest {
  paymentData: Partial<Omit<Payment, 'id' | 'created_at' | 'updated_at'>>;
}

// Settings API types
export interface UpdateSettingRequest {
  key: string;
  value: string | number | boolean | object | null; // Will be JSON stringified
  category: 'company' | 'appearance' | 'security' | 'notifications' | 'integrations';
  description?: string;
}

// PDF generation types
export interface GenerateInvoicePDFRequest {
  id: number;
  token?: string;
}

export interface GeneratePagePDFRequest {
  url: string;
  filename?: string;
}

export interface PDFGenerationResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// File upload types
export interface FileUploadRequest {
  file: Express.Multer.File;
  type: 'receipt' | 'logo' | 'attachment';
  related_id?: number;
}

export interface FileUploadResponse {
  success: boolean;
  data: {
    filename: string;
    originalName: string;
    size: number;
    mimetype: string;
    url: string;
  };
  message: string;
}

// Database health types
export interface DatabaseHealthResponse {
  success: boolean;
  status: 'healthy' | 'error';
  statistics: {
    clients: number;
    invoices: number;
    templates: number;
    expenses: number;
    payments: number;
    users: number;
  };
  timestamp: string;
}

export interface DatabaseInfoResponse {
  success: boolean;
  schema: {
    tables: string[];
    tableCount: number;
    tableInfo: Record<string, {
      columns: number;
      columnNames: string[];
    }>;
  };
  message: string;
}

// Search and filtering types
export interface SearchParams {
  q?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: string;
  client_id?: number;
  date_from?: string;
  date_to?: string;
}

export interface SearchResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  filters: SearchParams;
}

// Bulk operations types
export interface BulkOperationRequest<T = unknown> {
  operation: 'create' | 'update' | 'delete';
  items: T[];
}

export interface BulkOperationResponse {
  success: boolean;
  data: {
    processed: number;
    errors: number;
    results: Array<{
      success: boolean;
      id?: number;
      error?: string;
    }>;
  };
  message: string;
}

// Export/Import types
export interface ExportRequest {
  format: 'csv' | 'json' | 'xlsx';
  type: 'clients' | 'invoices' | 'expenses' | 'payments';
  date_from?: string;
  date_to?: string;
  filters?: Record<string, unknown>;
}

export interface ImportRequest {
  file: Express.Multer.File;
  type: 'clients' | 'invoices' | 'expenses';
  options?: {
    skipHeaders?: boolean;
    mapping?: Record<string, string>;
  };
}

// Webhook types
export interface WebhookEvent {
  type: 'invoice.created' | 'invoice.updated' | 'payment.created' | 'user.created';
  data: Record<string, unknown>;
  timestamp: string;
  signature: string;
}

export interface WebhookEndpoint {
  id: number;
  url: string;
  events: string[];
  secret: string;
  is_active: boolean;
  created_at: number;
}

// Error response types
export interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Settings save request interface
 */
export interface SettingsSaveRequest {
  settings: Record<string, {
    value: string | number | boolean | object | null;
    category?: string;
  }>;
}

/**
 * Individual setting save request interface
 */
export interface IndividualSettingSaveRequest {
  key: string;
  value: string | number | boolean | object | null;
  category?: string;
}

/**
 * Project settings update request interface
 */
export interface ProjectSettingsRequest {
  settings: {
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
    email?: {
      enabled?: boolean;
      smtp_host?: string;
      smtp_port?: number;
      smtp_user?: string;
      smtp_pass?: string;
      email_from?: string;
      configured?: boolean;
    };
    security?: {
      require_email_verification?: boolean;
      max_failed_login_attempts?: number;
      account_lockout_duration?: number;
    };
  };
}

/**
 * Invoice data request interface
 */
export interface InvoiceRequest {
  invoice_number: string;
  client_id: number;
  design_template_id?: number;
  recurring_template_id?: number;
  amount: number;
  tax_amount?: number;
  total_amount?: number;
  status?: InvoiceStatus;
  due_date?: string;
  issue_date?: string;
  description?: string;
  items?: string;
  notes?: string;
  payment_terms?: string;
  stripe_invoice_id?: string;
  stripe_payment_intent_id?: string;
  type?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  line_items?: string;
  tax_rate_id?: number;
  shipping_amount?: number;
  shipping_rate_id?: number;
  email_status?: string;
  email_sent_at?: number;
  email_error?: string;
  last_email_attempt?: number;
}

/**
 * Payment data request interface
 */
export interface PaymentRequest {
  date: string;
  client_name: string;
  invoice_id?: number;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  description?: string;
  status?: PaymentStatus;
}

/**
 * Expense data request interface
 */
export interface ExpenseRequest {
  amount: number;
  description: string;
  category?: string;
  date: string;
  vendor?: string;
  status?: ExpenseStatus;
  notes?: string;
  receipt_url?: string;
  is_billable: boolean | undefined;
  client_id: number | undefined;
  project?: string;
}

/**
 * Generated Profit & Loss report payload
 */
export interface ProfitLossReportData {
  revenue: {
    total: number;
    paid: number;
    pending: number;
    invoices: number;
    otherIncome: number;
  };
  /** `total` plus one entry per expense category */
  expenses: Record<string, number> & { total: number };
  profit: {
    net: number;
    gross: number;
    margin: number;
  };
  netIncome: number;
  accountingMethod: 'cash' | 'accrual';
  invoices: InvoiceWithClient[];
  /**
   * One entry per calendar period the range covers, rendered as the breakdown
   * columns. Must mirror `ProfitLossReportData['periodColumns']` in
   * `src/types/domain/reports.types.ts`.
   */
  periodColumns: Array<{
    label: string;
    revenue: number;
    expenses: number;
    expensesByCategory: Record<string, number>;
    netIncome: number;
  }>;
  /** False when the range covers a single period, where columns would restate the total. */
  hasBreakdown: boolean;
  breakdownPeriod: 'monthly' | 'quarterly';
}

/**
 * Generated expense report payload
 */
export interface ExpenseReportData {
  expenses: Expense[];
  expensesByCategory: Record<string, number>;
  /** Totals grouped by approval status. */
  expensesByStatus: Record<string, number>;
  totalAmount: number;
  totalCount: number;
}

/**
 * Generated invoice report payload
 */
export interface InvoiceReportData {
  invoices: InvoiceWithClient[];
  invoicesByStatus: Record<string, number>;
  invoicesByClient: Record<string, number>;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  totalCount: number;
}

/**
 * Per-client revenue rollup used by the client report
 */
export interface ClientReportEntry extends Client {
  totalInvoices: number;
  totalRevenue: number;
  paidRevenue: number;
  pendingRevenue: number;
  overdueRevenue: number;
}

/**
 * Generated client report payload
 */
export interface ClientReportData {
  clients: ClientReportEntry[];
  totalClients: number;
  totalRevenue: number;
  totalPaidRevenue: number;
  totalPendingRevenue: number;
  totalOverdueRevenue: number;
}

/**
 * Client data request interface
 */
export interface ClientRequest {
  name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  company?: string;
  tax_id?: string;
  notes?: string;
}

/**
 * Bulk import request bodies
 */
export interface BulkImportClientsRequest {
  clients?: ClientRequest[];
}

export interface BulkImportExpensesRequest {
  expenses?: ExpenseRequest[];
}

export interface BulkImportPaymentsRequest {
  payments?: PaymentRequest[];
}

// Express Request extensions
declare global {
  namespace Express {
    interface Request {
      user?: UserPublic;
      rateLimitInfo?: {
        limit: number;
        remaining: number;
        resetTime: Date;
      };
    }
  }
}