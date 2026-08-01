// Common types and interfaces used across the application

import type { SavedReport } from '../domain/reports.types';

// Note: ApiResponse is now defined in shared/api.types.ts to avoid duplication

// Pagination interface
export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginationResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Validation error structure
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

// Database timestamps
export interface Timestamps {
  created_at: string;
  updated_at: string;
}

// Generic entity with ID and timestamps
export interface BaseEntity extends Timestamps {
  id: number;
  deleted_at?: Date;
}

// File upload types
export interface FileUpload {
  file: File;
  progress: number;
  url?: string;
  error?: string;
}

export interface UploadResponse {
  success: boolean;
  url?: string;
  filename?: string;
  size?: number;
  error?: string;
}

// Note: FormState is now defined in shared/form.types.ts to avoid duplication
export type FormMode = 'create' | 'edit' | 'view';

// Table/List view types
export interface TableColumn<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (value: unknown, item: T) => React.ReactNode;
}

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface TableState<T> {
  data: T[];
  loading: boolean;
  error?: string;
  sort: SortConfig;
  filters: Record<string, unknown>;
  pagination: PaginationParams;
  selectedItems: T[];
}

// Time period types for reports
export type TimePeriod = 
  | 'today' 
  | 'yesterday' 
  | 'last-7-days' 
  | 'last-30-days' 
  | 'this-week' 
  | 'last-week' 
  | 'this-month' 
  | 'last-month' 
  | 'this-quarter' 
  | 'last-quarter' 
  | 'this-year' 
  | 'last-year' 
  | 'year-to-date' 
  | 'month-to-date' 
  | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
}

// Settings types
export interface AppSettings {
  key: string;
  value: string;
  category: string;
}

// Individual project setting record
export interface ProjectSettingRecord {
  key: string;
  value: string;
  enabled?: boolean;
  created_at: string;
  updated_at: string;
}

// Complete project configuration structure
export interface ProjectSettings {
  google_oauth: {
    enabled: boolean;
    client_id: string;
    // Write-only: the server never returns it.
    client_secret?: string;
    configured: boolean;
    /** True when the credentials came from .env rather than the settings screen. */
    env_configured?: boolean;
  };
  stripe: {
    enabled: boolean;
    publishable_key: string;
    // Write-only: the server never returns these. Present only when an admin
    // has just typed a new value; `configured` is what the UI reads.
    secret_key?: string;
    webhook_secret?: string;
    test_mode?: boolean;
    configured: boolean;
    webhook_configured?: boolean;
    /** True when the credentials came from .env rather than the settings screen. */
    env_configured?: boolean;
  };
  email: {
    enabled: boolean;
    smtp_host: string;
    smtp_port: number;
    smtp_user: string;
    smtp_pass?: string; // Optional for client-side use
    email_from: string;
    configured: boolean;
  };
  security: {
    require_email_verification: boolean;
    max_failed_login_attempts: number;
    account_lockout_duration: number;
  };
}

// Report types
export type ReportType = 'profit-loss' | 'expense' | 'invoice' | 'client';

export interface Report {
  id: number;
  name: string;
  type: ReportType;
  date_range_start: string;
  date_range_end: string;
  data: SavedReport['data']; // Generated report payload for this report type
  created_at: string;
}

// Dashboard data structure
export interface DashboardStats {
  total_revenue: number;
  total_expenses: number;
  profit: number;
  outstanding_invoices: number;
  overdue_invoices: number;
  total_clients: number;
  recent_activities: Activity[];
}

export interface Activity {
  id: number;
  type: 'invoice_created' | 'payment_received' | 'client_added' | 'expense_added';
  title: string;
  description?: string;
  amount?: number;
  date: string;
  related_id?: number;
}

// Search and filter utilities
export interface SearchParams {
  query?: string;
  filters: Record<string, unknown>;
  sort?: SortConfig;
  pagination?: PaginationParams;
}

// Export/Import types
export interface ExportOptions {
  format: 'csv' | 'pdf' | 'xlsx';
  dateRange?: DateRange;
  filters?: Record<string, unknown>;
  columns?: string[];
}

export interface ImportResult<T> {
  success: boolean;
  imported_count: number;
  skipped_count: number;
  error_count: number;
  errors: Array<{
    row: number;
    data: T;
    errors: string[];
  }>;
}

// PDF generation options
export interface PDFGenerationOptions {
  format?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
}

// Company settings interface
export interface CompanySettings {
  companyName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  brandingImage: string;
}