import { type Client, type InvoiceItem } from '@/types';

interface ValidationResult {
  isValid: boolean;
  canSend?: boolean;
  canPrint?: boolean;
  errors: string[];
  warnings: string[];
}

interface InvoiceData {
  invoice_number: string;
  due_date: string;
  status: string;
}

// Fields the expense/payment validators read. Callers hand over raw import rows
// (CSV previews, mapped records) that are only shaped into entities once they
// pass validation, so the input is unknown and every field is optional here.
interface ExpenseValidationInput {
  description?: string;
  amount?: number;
  date?: string;
  category?: string;
}

interface PaymentValidationInput {
  amount?: number;
  date?: string;
  method?: string;
}

export const validateInvoiceForSave = (
  invoiceData: InvoiceData,
  selectedClient: Client | null,
  lineItems: InvoiceItem[],
  isNewInvoice: boolean = false
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!selectedClient) {
    errors.push('Please select a client');
  }

  if (!isNewInvoice && (!invoiceData.invoice_number || invoiceData.invoice_number.trim() === '')) {
    errors.push('Invoice number is required');
  }

  const validLineItems = lineItems.filter(item =>
    item.description.trim() !== '' && item.unit_price > 0
  );

  if (validLineItems.length === 0) {
    errors.push('At least one line item with description and amount is required');
  }

  const invalidLineItems = lineItems.filter(item =>
    item.description.trim() === '' || item.unit_price <= 0
  );

  if (invalidLineItems.length > 0) {
    warnings.push(`${invalidLineItems.length} line item(s) have missing descriptions or zero amounts`);
  }

  const total = lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
  if (total <= 0) {
    errors.push('Invoice total must be greater than zero');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

export const validateInvoiceForSend = (
  invoiceData: InvoiceData,
  selectedClient: Client | null,
  lineItems: InvoiceItem[],
  isNewInvoice: boolean = false
): ValidationResult => {
  const saveValidation = validateInvoiceForSave(invoiceData, selectedClient, lineItems, isNewInvoice);

  if (!saveValidation.isValid) {
    return { ...saveValidation, canSend: false };
  }

  const errors: string[] = [...saveValidation.errors];
  const warnings: string[] = [...saveValidation.warnings];

  if (!selectedClient?.email || selectedClient.email.trim() === '') {
    errors.push('Client email is required to send invoice');
  }

  if (!invoiceData.due_date || invoiceData.due_date.trim() === '') {
    warnings.push('Due date will be set to today if not specified');
  }

  return {
    isValid: saveValidation.isValid,
    canSend: errors.length === 0,
    errors,
    warnings
  };
};

export const validateClientData = (client: Partial<Client>): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!client.name || client.name.trim() === '') {
    errors.push('Client name is required');
  }

  if (client.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) {
    errors.push('Invalid email format');
  }

  if (!client.email || client.email.trim() === '') {
    warnings.push('Email is recommended for sending invoices');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

export const validateExpenseData = (expense: unknown): ValidationResult => {
  const { description, amount, date, category } = expense as ExpenseValidationInput;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!description || description.trim() === '') {
    errors.push('Expense description is required');
  }

  if (!amount || amount <= 0) {
    errors.push('Expense amount must be greater than zero');
  }

  if (!date) {
    errors.push('Expense date is required');
  }

  if (!category || category.trim() === '') {
    warnings.push('Category is recommended for better organization');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

export const validatePaymentData = (payment: unknown): ValidationResult => {
  const { amount, date, method } = payment as PaymentValidationInput;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!amount || amount <= 0) {
    errors.push('Payment amount must be greater than zero');
  }

  if (!date) {
    errors.push('Payment date is required');
  }

  if (!method || method.trim() === '') {
    errors.push('Payment method is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

export const getAvailableInvoiceActions = (
  invoiceData: InvoiceData,
  selectedClient: Client | null,
  lineItems: InvoiceItem[],
  isNewInvoice: boolean = false
) => {
  const saveValidation = validateInvoiceForSave(invoiceData, selectedClient, lineItems, isNewInvoice);
  const sendValidation = validateInvoiceForSend(invoiceData, selectedClient, lineItems, isNewInvoice);

  return {
    canSave: saveValidation.isValid,
    canSend: sendValidation.canSend,
    canPrint: !isNewInvoice && saveValidation.isValid,
    saveErrors: saveValidation.errors,
    sendErrors: sendValidation.errors,
    warnings: [...saveValidation.warnings, ...sendValidation.warnings]
  };
};

export const autoFillInvoiceDefaults = (
  invoiceData: InvoiceData
): InvoiceData => {
  const updatedData = { ...invoiceData };
  if (!updatedData.due_date || updatedData.due_date.trim() === '') {
    updatedData.due_date = new Date().toISOString().split('T')[0];
  }
  return updatedData;
};