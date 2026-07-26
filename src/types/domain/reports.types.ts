// Reports-related types and interfaces

import { type Invoice } from './invoice.types';
import { type Expense } from './expense.types';
import { type Client } from './client.types';
import { type ReportType } from '../shared/common.types';

// Date range for reports (extends the common DateRange with preset functionality)
export interface ReportDateRange {
  start: string;
  end: string;
  preset: 'custom' | 'this-month' | 'last-month' | 'this-quarter' | 'last-quarter' | 'this-year' | 'last-year';
}

// Base report props interface
export interface BaseReportProps {
  onBack: () => void;
}

// Invoice Report Types
export interface InvoiceReportData {
  invoices: (Invoice & { client_name: string })[];
  invoicesByStatus: Record<string, number>;
  invoicesByClient: Record<string, number>;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  totalCount: number;
}

export interface InvoiceReportProps extends BaseReportProps {
  onSave: (reportData: InvoiceReportData, reportType: ReportType, dateRange: ReportDateRange) => void;
}

// Expense Report Types
export interface ExpenseReportData {
  expenses: Expense[];
  expensesByCategory: Record<string, number>;
  expensesByStatus: Record<string, number>;
  totalAmount: number;
  totalCount: number;
}

export interface ExpenseReportProps extends BaseReportProps {
  onSave: (reportData: ExpenseReportData, reportType: ReportType, dateRange: ReportDateRange) => void;
}

// Client Report Types
export interface ClientReportData {
  clients: (Client & {
    totalInvoices: number;
    totalRevenue: number;
    paidRevenue: number;
    pendingRevenue: number;
    overdueRevenue: number;
  })[];
  totalClients: number;
  totalRevenue: number;
  totalPaidRevenue: number;
  totalPendingRevenue: number;
  totalOverdueRevenue: number;
}

export interface ClientReportProps extends BaseReportProps {
  onSave: (reportData: ClientReportData, reportType: ReportType, dateRange: ReportDateRange) => void;
}

// Profit & Loss Report Types
export interface ProfitLossReportData {
  revenue: {
    total: number;
    paid: number;
    pending: number;
    invoices: number;
    otherIncome: number;
  };
  expenses: Record<string, number> & { total: number };
  profit: {
    net: number;
    gross: number;
    margin: number;
  };
  netIncome: number;
  accountingMethod: 'cash' | 'accrual';
  invoices: (Invoice & { client_name: string })[];
  periodColumns: Array<{
    label: string;
    revenue: number;
    expenses: number;
    expensesByCategory: Record<string, number>;
    netIncome: number;
  }>;
  hasBreakdown: boolean;
  breakdownPeriod: 'monthly' | 'quarterly';
}

export interface ProfitLossReportProps extends BaseReportProps {
  onSave: (reportData: ProfitLossReportData, reportType: ReportType, dateRange: ReportDateRange) => void;
}

// Report Generation Options
export interface ReportGenerationOptions {
  dateRange: ReportDateRange;
  filters?: {
    clientIds?: number[];
    categories?: string[];
    statuses?: string[];
    amounts?: {
      min?: number;
      max?: number;
    };
  };
  groupBy?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  includeCharts?: boolean;
  includeSummary?: boolean;
}

// Report Export Options
export interface ReportExportOptions {
  format: 'pdf' | 'csv' | 'xlsx';
  includeCharts: boolean;
  includeSummary: boolean;
  filename?: string;
}

// Saved Report Interface (extends the common Report interface)
export interface SavedReport {
  id: number;
  name: string;
  type: ReportType;
  data: InvoiceReportData | ExpenseReportData | ClientReportData | ProfitLossReportData;
  dateRange: ReportDateRange;
  generatedAt: string;
  size?: number;
  description?: string;
}

// Report Statistics for Dashboard
export interface ReportStats {
  totalReports: number;
  reportsByType: Record<ReportType, number>;
  mostRecentReport?: SavedReport;
  totalDataSize: number;
  averageGenerationTime: number;
}

// Chart Data Types for Reports
export interface ReportChartDataPoint {
  label: string;
  value: number;
  color?: string;
  percentage?: number;
}

export interface ReportChartData {
  title: string;
  data: ReportChartDataPoint[];
  type: 'bar' | 'pie' | 'line' | 'area';
  xAxisLabel?: string;
  yAxisLabel?: string;
}

// Report Filters
export interface ReportFilters {
  dateRange: ReportDateRange;
  clients?: number[];
  categories?: string[];
  statuses?: string[];
  amountRange?: {
    min?: number;
    max?: number;
  };
  includeRefunded?: boolean;
  includeCancelled?: boolean;
}

// Report Comparison Types
export interface ReportComparison {
  current: {
    period: ReportDateRange;
    data: number;
  };
  previous: {
    period: ReportDateRange;
    data: number;
  };
  change: {
    absolute: number;
    percentage: number;
    trend: 'up' | 'down' | 'neutral';
  };
}

// Accounting Methods for P&L Reports
export type AccountingMethod = 'cash' | 'accrual';
export type BreakdownPeriod = 'monthly' | 'quarterly';

// Report Error Types
export interface ReportError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// Report Generation Status
export type ReportGenerationStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface ReportGenerationJob {
  id: string;
  type: ReportType;
  status: ReportGenerationStatus;
  progress: number;
  startedAt: string;
  completedAt?: string;
  error?: ReportError;
  result?: SavedReport;
}

// Type guards for report data validation
export const isInvoiceReportData = (data: unknown): data is InvoiceReportData => {
  return typeof data === 'object' && 
         data !== null && 
         Array.isArray((data as InvoiceReportData).invoices) &&
         typeof (data as InvoiceReportData).totalAmount === 'number';
};

export const isExpenseReportData = (data: unknown): data is ExpenseReportData => {
  return typeof data === 'object' && 
         data !== null && 
         Array.isArray((data as ExpenseReportData).expenses) &&
         typeof (data as ExpenseReportData).totalAmount === 'number';
};

export const isClientReportData = (data: unknown): data is ClientReportData => {
  return typeof data === 'object' && 
         data !== null && 
         Array.isArray((data as ClientReportData).clients) &&
         typeof (data as ClientReportData).totalRevenue === 'number';
};

export const isProfitLossReportData = (data: unknown): data is ProfitLossReportData => {
  return typeof data === 'object' && 
         data !== null && 
         typeof (data as ProfitLossReportData).netIncome === 'number' &&
         typeof (data as ProfitLossReportData).revenue === 'object' &&
         Array.isArray((data as ProfitLossReportData).periodColumns) &&
         typeof (data as ProfitLossReportData).hasBreakdown === 'boolean';
};