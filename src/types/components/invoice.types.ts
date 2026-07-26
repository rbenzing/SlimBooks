// Invoice component prop types

import type {
  Invoice,
  InvoiceItem,
  InvoiceFormData,
  InvoiceTemplate,
  InvoiceTemplateFormData,
  Client,
  CompanySettings,
  CurrencySettings
} from '@/types';

/**
 * Invoice joined with the denormalised client columns the API selects
 * (`SELECT i.*, c.name as client_name, ...`).
 */
export interface InvoiceWithClient extends Invoice {
  client_company?: string;
  client_city?: string;
  client_state?: string;
  client_zip?: string;
  client_country?: string;
}

/**
 * Payload returned by `GET /api/invoices/public/:id` — an invoice with its
 * client columns plus the settings needed to render it without an account.
 */
export interface PublicInvoiceData extends InvoiceWithClient {
  companySettings?: CompanySettings | null;
  currencySettings?: CurrencySettings | null;
  invoiceTemplate?: string;
}

/**
 * Recurring template joined with the denormalised client columns the
 * `/api/recurring-templates` endpoints select (`SELECT rt.*, c.name as
 * client_name, c.email as client_email`).
 */
export interface RecurringTemplateWithClient extends InvoiceTemplate {
  client_name: string;
  client_email?: string;
}

export interface InvoiceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (invoiceData: InvoiceFormData) => void;
  invoice?: Invoice | null;
}

/**
 * Line-item shape rendered by the read-only invoice views: rows parsed out of
 * `invoice.line_items` plus the fallback row synthesised from the invoice
 * description. Every field is optional because stored rows predate the schema.
 */
export interface InvoiceViewLineItem {
  id?: string | number;
  description?: string;
  quantity?: number;
  rate?: number;
  amount?: number;
}

export interface InvoiceViewModalProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkAsPaid?: (invoice: Invoice) => void;
}

/**
 * Snapshot of the invoice editor fields, captured when the form loads and
 * compared against the live values to derive the dirty state.
 */
export interface InvoiceFormSnapshot {
  selectedClient: number | null;
  invoiceData: {
    invoice_number: string;
    due_date: string;
    status: string;
    payment_terms: string;
  };
  lineItems: InvoiceItem[];
  selectedTaxRate: string | null;
  selectedShippingRate: string | null;
  thankYouMessage: string;
}

export interface CreateInvoicePageProps {
  onBack: () => void;
  editingInvoice?: Invoice | null;
  viewOnly?: boolean;
}

export interface CreateRecurringInvoicePageProps {
  onBack: () => void;
  editingTemplate?: InvoiceTemplate | null;
}

export interface TemplateFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (templateData: InvoiceTemplateFormData) => void;
  template?: InvoiceTemplate | null;
}

export interface TemplatesTabProps {
  // Add props as needed
}

export interface CompanyHeaderProps {
  companyName?: string;
  companyAddress?: string;
  companyCity?: string;
  companyState?: string;
  companyZip?: string;
  companyPhone?: string;
  companyEmail?: string;
  logoUrl?: string;
}

export interface ClientSelectorProps {
  clients: Client[];
  selectedClientId?: number | null;
  onClientSelect: (clientId: number | null) => void;
  showAddButton?: boolean;
  onAddClient?: () => void;
}
