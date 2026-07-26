import { type InvoiceStatus } from '@/types';

export interface InvoiceStatusPermissions {
  canEdit: boolean;
  canSave: boolean;
  canSend: boolean;
  canDelete: boolean;
  showDeleteOnly: boolean;
}

export const getInvoiceStatusPermissions = (
  status: InvoiceStatus | undefined,
  _dueDate?: string
): InvoiceStatusPermissions => {
  switch (status) {
    case 'paid':
      return {
        canEdit: false,
        canSave: false,
        canSend: false,
        canDelete: false,
        showDeleteOnly: false
      };

    case 'sent':
      return {
        canEdit: true,
        canSave: true,
        canSend: false,
        canDelete: true,
        showDeleteOnly: false
      };

    case 'overdue':
      return {
        canEdit: true,
        canSave: true,
        canSend: true,
        canDelete: true,
        showDeleteOnly: false
      };

    case 'draft':
    default:
      return {
        canEdit: true,
        canSave: true,
        canSend: true,
        canDelete: true,
        showDeleteOnly: false
      };
  }
};

export const getInvoiceStatusColor = (status: InvoiceStatus): string => {
  switch (status) {
    case 'draft':
      return 'gray';
    case 'sent':
      return 'blue';
    case 'paid':
      return 'green';
    case 'overdue':
      return 'red';
    default:
      return 'gray';
  }
};

export const generateInvoiceNumberPattern = (
  prefix: string = 'INV',
  year: number = new Date().getFullYear(),
  sequence: number = 1,
  paddingLength: number = 4
): string => {
  const paddedSequence = sequence.toString().padStart(paddingLength, '0');
  return `${prefix}-${year}-${paddedSequence}`;
};

export const parseInvoiceNumber = (invoiceNumber: string): {
  prefix?: string;
  year?: number;
  sequence?: number;
} => {
  const pattern = /^([A-Za-z]+)-(\d{4})-(\d+)$/;
  const match = invoiceNumber.match(pattern);

  if (match) {
    return {
      prefix: match[1],
      year: parseInt(match[2], 10),
      sequence: parseInt(match[3], 10)
    };
  }

  return {};
};

export const getNextInvoiceNumber = (
  lastInvoiceNumber: string,
  prefix: string = 'INV'
): string => {
  const parsed = parseInvoiceNumber(lastInvoiceNumber);
  const currentYear = new Date().getFullYear();

  if (parsed.year === currentYear && parsed.sequence) {
    return generateInvoiceNumberPattern(prefix, currentYear, parsed.sequence + 1);
  }

  return generateInvoiceNumberPattern(prefix, currentYear, 1);
};

export const calculateInvoiceTotal = (
  lineItems: Array<{ quantity: number; unit_price: number }>,
  taxRate: number = 0,
  shippingAmount: number = 0
): {
  subtotal: number;
  taxAmount: number;
  total: number;
} => {
  const subtotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount + shippingAmount;

  return {
    subtotal,
    taxAmount,
    total
  };
};