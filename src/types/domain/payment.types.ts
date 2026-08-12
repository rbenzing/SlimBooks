// Payment-related types and interfaces
import type { PaymentStatus, PaymentMethod } from '../constants/enums.types';

export interface Payment {
  id: number;
  date: string;
  client_name: string;
  invoice_id?: number;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  description?: string;
  status: PaymentStatus;
  created_at: number;
  updated_at?: number;
}

export interface PaymentFormData {
  date: string;
  client_name: string;
  invoice_id?: number;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  description?: string;
  status: PaymentStatus;
}

// For payment statistics and reports
export interface PaymentStats {
  total_payments: number;
  total_amount: number;
  by_method: Record<PaymentMethod, number>;
  by_status: Record<PaymentStatus, number>;
  by_month: Array<{
    month: string;
    count: number;
    amount: number;
  }>;
  average_payment_amount: number;
}

// For payment filtering and searching
export interface PaymentFilters {
  status?: PaymentStatus | PaymentStatus[];
  method?: PaymentMethod | PaymentMethod[];
  client_name?: string;
  invoice_id?: number;
  date_from?: string;
  date_to?: string;
  amount_min?: number;
  amount_max?: number;
  search?: string;
}

// For bulk operations
export interface BulkPaymentOperation {
  payment_ids: number[];
  operation: 'delete' | 'update_status' | 'export';
  new_status?: PaymentStatus;
}

// Component prop interfaces
export interface PaymentFormProps {
  payment?: Payment | null;
  onSave: (paymentData: PaymentFormData) => void;
  onCancel: () => void;
  preselectedInvoiceId?: number;
  preselectedClientName?: string;
  preselectedAmount?: number;
}

export interface PaymentViewModalProps {
  payment: Payment | null;
  isOpen: boolean;
  onClose: () => void;
}

export interface PaymentsListProps {
  payments: Payment[];
  onEditPayment: (payment: Payment) => void;
  onDeletePayment: (id: number) => void;
  onViewPayment: (payment: Payment) => void;
  onBulkDelete?: (ids: number[]) => void;
  onBulkChangeStatus?: (ids: number[], status: string) => void;
  onBulkChangeMethod?: (ids: number[], method: string) => void;
}
// Type guards
/**
 * Type guard to check if an object is a Payment
 */
export function isPayment(obj: unknown): obj is Payment {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'amount' in obj && 'method' in obj;
}
