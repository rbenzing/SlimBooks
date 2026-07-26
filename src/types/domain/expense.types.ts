// Expense-related types and interfaces
import { EXPENSE_STATUSES, type ExpenseStatus } from '../constants/enums.types';

export { EXPENSE_CATEGORIES, type ExpenseCategory } from '../constants/enums.types';

export interface Expense {
  id: number;
  date: string;
  vendor?: string;
  category?: string;
  amount: number;
  description?: string;
  receipt_url?: string;
  notes?: string;
  currency?: string;
  is_billable?: boolean;
  client_id?: number;
  project?: string;
  status?: ExpenseStatus; // Added for status tracking
  created_at: string;
  updated_at: string;
}

export interface ExpenseFormData {
  date: string;
  vendor?: string;
  category?: string;
  amount: number;
  description?: string;
  receipt_url?: string;
  notes?: string;
  currency?: string;
  is_billable?: boolean;
  client_id?: number;
  project?: string;
}

// For expense statistics and reports
export interface ExpenseStats {
  total_expenses: number;
  total_amount: number;
  by_category: Array<{
    category: string;
    count: number;
    amount: number;
  }>;
  by_month: Array<{
    month: string;
    count: number;
    amount: number;
  }>;
  by_status: Record<ExpenseStatus, number>;
}

// For expense import/export
export interface ExpenseImportData {
  date: string;
  /** Matches the `vendor` column on the expenses table. */
  vendor: string;
  category: string;
  amount: number | string;
  description?: string;
  receipt_number?: string;
  receipt_url?: string;
  notes?: string;
  status?: ExpenseStatus;
}

export interface ExpenseValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

// For expense filtering and searching
export interface ExpenseFilters {
  status?: ExpenseStatus | ExpenseStatus[];
  category?: string;
  vendor?: string;
  date_from?: string;
  date_to?: string;
  amount_min?: number;
  amount_max?: number;
  search?: string;
}
// Type guards
/**
 * Type guard to check if an object is an Expense
 */
export function isExpense(obj: unknown): obj is Expense {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'amount' in obj && 'vendor' in obj;
}

/**
 * Narrows a raw CSV/user-supplied string to a supported expense status.
 */
export function isExpenseStatus(value: unknown): value is ExpenseStatus {
  return typeof value === 'string' && (EXPENSE_STATUSES as string[]).includes(value);
}
