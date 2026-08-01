import {
  type ClientImportData,
  type ExpenseImportData,
  type PaymentImportData,
  type ImportRowResult,
  type CSVRecord
} from '@/types';
import { type PaymentMethod, type PaymentStatus } from '@/types';
import { validateClientData, validateExpenseData, validatePaymentData } from './validation.util';

export const exportToCSV = (data: CSVRecord[], filename: string) => {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value || '';
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const parseCSVLine = (line: string): string[] => {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
};

export const parseCSV = (csvText: string): CSVRecord[] => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: CSVRecord = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    data.push(row);
  }

  return data;
};

export const parseClientCSV = (csvText: string): ClientImportData[] => {
  const records = parseCSV(csvText);
  return records.map(record => ({
    name: record.name || record.Name || '',
    email: record.email || record.Email || '',
    phone: record.phone || record.Phone || '',
    company: record.company || record.Company || '',
    address: record.address || record.Address || '',
    city: record.city || record.City || '',
    state: record.state || record.State || '',
    zipCode: record.zipCode || record['Zip Code'] || record.zip || '',
    country: record.country || record.Country || ''
  }));
};

export const parseExpenseCSV = (csvText: string): ExpenseImportData[] => {
  const records = parseCSV(csvText);
  return records.map(record => ({
    description: record.description || record.Description || '',
    amount: parseFloat(record.amount || record.Amount || '0'),
    category: record.category || record.Category || '',
    date: record.date || record.Date || '',
    // `merchant`/`Merchant` are tolerated legacy CSV headers from user files;
    // they are normalised onto the single internal `vendor` field.
    vendor: record.vendor || record.Vendor || record.merchant || record.Merchant || '',
    receipt_number: record.receipt_number || record['Receipt Number'] || '',
    notes: record.notes || record.Notes || ''
  }));
};

export const parsePaymentCSV = (csvText: string): PaymentImportData[] => {
  const records = parseCSV(csvText);
  return records.map(record => ({
    client_name: record.client_name || record['Client Name'] || '',
    amount: parseFloat(record.amount || record.Amount || '0'),
    method: (record.method || record.Method || 'cash') as PaymentMethod,
    date: record.date || record.Date || '',
    // 'received' is the only sensible default: a payment being imported has
    // already been taken. 'completed' is not a PaymentStatus at all, so rows
    // without a status column were rejected by the API one at a time.
    status: (record.status || record.Status || 'received') as PaymentStatus,
    reference_number: record.reference_number || record['Reference Number'] || '',
    notes: record.notes || record.Notes || ''
  }));
};

export { validateClientData, validateExpenseData, validatePaymentData };

export const validateClientImportData = (data: ClientImportData[]): ImportRowResult<ClientImportData>[] => {
  return data.map((client, index) => {
    const validation = validateClientData(client);
    return {
      index,
      data: client,
      isValid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings
    };
  });
};

export const validateExpenseImportData = (data: ExpenseImportData[]): ImportRowResult<ExpenseImportData>[] => {
  return data.map((expense, index) => {
    const validation = validateExpenseData(expense);
    return {
      index,
      data: expense,
      isValid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings
    };
  });
};

export const validatePaymentImportData = (data: PaymentImportData[]): ImportRowResult<PaymentImportData>[] => {
  return data.map((payment, index) => {
    const validation = validatePaymentData(payment);
    return {
      index,
      data: payment,
      isValid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings
    };
  });
};