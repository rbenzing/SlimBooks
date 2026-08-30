// Report Service - Domain-specific service for report management operations
// Handles all report-related business logic and database operations

import { databaseService } from '../core/DatabaseService.js';
import { buildPeriodBuckets, periodKeyFor } from '../utils/reportPeriods.util.js';
import { utcDayEnd, utcDayStart, utcNow } from '../utils/utcTime.util.js';
import {
  type Client,
  type Expense,
  type InvoiceWithClient,
  type ClientReportData,
  type ClientReportEntry,
  type ExpenseReportData,
  type InvoiceReportData,
  type ProfitLossReportData
} from '../types/index.js';

export interface ReportData {
  name: string;
  type: string;
  date_range_start?: string;
  date_range_end?: string;
  data?: unknown;
}

export interface DatabaseReport {
  id: number;
  name: string;
  type: string;
  date_range_start: string;
  date_range_end: string;
  data: string | null;
  /** Epoch milliseconds; `date_range_*` above are calendar days. */
  created_at: number;
}

/**
 * A report row whose `data` column has been JSON-parsed
 */
export interface ParsedReport extends Omit<DatabaseReport, 'data'> {
  data: unknown;
}

/**
 * The instant bounds of a report's day range.
 *
 * A report is asked for in calendar days — `2026-01-01` to `2026-01-31` — and
 * every column it filters holds epoch milliseconds. Binding the days directly
 * is not an error in either engine, it is a wrong-answer bug: SQLite orders all
 * numbers below all text, so `created_at >= '2026-01-01'` matches nothing;
 * MySQL coerces the string to 2026, so it matches everything. See `utcDayStart`.
 *
 * An unparseable edge widens to that end of time rather than throwing, so a
 * malformed range shows too much and is noticed, instead of showing nothing and
 * reading as a month with no invoices.
 */
const instantRange = (startDate: string, endDate: string): [number, number] => [
  utcDayStart(startDate) ?? 0,
  utcDayEnd(endDate) ?? Number.MAX_SAFE_INTEGER
];

/**
 * Report Management Service
 * Handles report lifecycle management, data processing, and CRUD operations
 */
export class ReportService {
  /**
   * Get all reports ordered by creation date
   */
  async getAllReports(): Promise<DatabaseReport[]> {
    return databaseService.getMany<DatabaseReport>(`
      SELECT id, name, type, date_range_start, date_range_end, data, created_at
      FROM reports
      ORDER BY created_at DESC
    `);
  }

  /**
   * Get report by ID with parsed data field
   */
  async getReportById(id: number): Promise<ParsedReport | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid report ID is required');
    }

    const report = await databaseService.getOne<DatabaseReport>(`
      SELECT id, name, type, date_range_start, date_range_end, data, created_at
      FROM reports
      WHERE id = ?
    `, [id]);

    if (!report) {
      return null;
    }

    // Parse JSON data field if it exists
    const parsedReport: ParsedReport = { ...report };
    if (report.data) {
      try {
        parsedReport.data = JSON.parse(report.data);
      } catch (e) {
        console.warn('Failed to parse report data:', e);
        // Keep original data if parsing fails
      }
    }

    return parsedReport;
  }

  /**
   * Create new report
   */
  async createReport(reportData: ReportData): Promise<{ id: number; changes: number }> {
    if (!reportData || !reportData.name || !reportData.type) {
      throw new Error('Report name and type are required');
    }

    // Get next ID from counter service
    const nextId = await databaseService.getNextSequence('reports');
    const now = utcNow();

    const result = await databaseService.executeQuery(`
      INSERT INTO reports (id, name, type, date_range_start, date_range_end, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      nextId,
      reportData.name,
      reportData.type,
      reportData.date_range_start || '',
      reportData.date_range_end || '',
      reportData.data ? JSON.stringify(reportData.data) : null,
      now
    ]);

    return {
      id: nextId,
      changes: result.changes
    };
  }

  /**
   * Update existing report
   */
  async updateReport(id: number, reportData: ReportData): Promise<{ id: number; changes: number }> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid report ID is required');
    }

    if (!reportData) {
      throw new Error('Report data is required');
    }

    const result = await databaseService.executeQuery(`
      UPDATE reports
      SET name = ?, type = ?, date_range_start = ?, date_range_end = ?, data = ?
      WHERE id = ?
    `, [
      reportData.name,
      reportData.type,
      reportData.date_range_start || '',
      reportData.date_range_end || '',
      reportData.data ? JSON.stringify(reportData.data) : null,
      id
    ]);

    if (result.changes === 0) {
      throw new Error('Report not found');
    }

    return {
      id: id,
      changes: result.changes
    };
  }

  /**
   * Delete report by ID
   */
  async deleteReport(id: number): Promise<{ id: number; changes: number }> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid report ID is required');
    }

    const result = await databaseService.executeQuery('DELETE FROM reports WHERE id = ?', [id]);

    if (result.changes === 0) {
      throw new Error('Report not found');
    }

    return {
      id: id,
      changes: result.changes
    };
  }

  /**
   * Check if report exists
   */
  async reportExists(id: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      return false;
    }

    return databaseService.exists('reports', 'id', id);
  }

  /**
   * Get reports by type
   */
  async getReportsByType(type: string): Promise<DatabaseReport[]> {
    if (!type || typeof type !== 'string') {
      throw new Error('Valid report type is required');
    }

    return databaseService.getMany<DatabaseReport>(`
      SELECT id, name, type, date_range_start, date_range_end, data, created_at
      FROM reports
      WHERE type = ?
      ORDER BY created_at DESC
    `, [type]);
  }

  /**
   * Get reports within date range
   */
  async getReportsByDateRange(startDate: string, endDate: string): Promise<DatabaseReport[]> {
    if (!startDate || !endDate) {
      throw new Error('Valid date range is required');
    }

    return databaseService.getMany<DatabaseReport>(`
      SELECT id, name, type, date_range_start, date_range_end, data, created_at
      FROM reports
      WHERE created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
    `, instantRange(startDate, endDate));
  }

  /**
   * Get report count
   */
  async getReportCount(): Promise<number> {
    const result = await databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM reports'
    );
    return result?.count || 0;
  }

  /**
   * Get report count by type
   */
  async getReportCountByType(type: string): Promise<number> {
    if (!type || typeof type !== 'string') {
      throw new Error('Valid report type is required');
    }

    const result = await databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM reports WHERE type = ?',
      [type]
    );
    return result?.count || 0;
  }

  /**
   * Generate Profit & Loss Report Data
   */
  async generateProfitLossData(
    startDate: string,
    endDate: string,
    fiscalYearStartMonth: number,
    accountingMethod: 'cash' | 'accrual' = 'accrual',
    preset?: string,
    breakdownPeriod: 'monthly' | 'quarterly' = 'quarterly'
  ): Promise<ProfitLossReportData> {
    // Get invoices in date range, windowed on the day they were issued — not
    // `created_at`, the moment the row was entered. `issue_date` is
    // `YYYY-MM-DD` text, so it binds directly like the expenses query below;
    // running it through `instantRange()` would bind an epoch-millisecond
    // number against this text column instead, and comparing the two returns
    // no rows on either engine — verified live, though by different routes:
    // the column has TEXT affinity, so SQLite converts the bound number to its
    // string form and compares lexicographically, while MySQL goes the other
    // way and casts `issue_date`'s leading digits to a plain year (2026),
    // which never falls inside an epoch-millisecond range. Note this is the
    // MIRROR of the scar in CLAUDE.md, which is a day string bound against a
    // timestamp column — there MySQL matches everything rather than nothing.
    const invoices = await databaseService.getMany<InvoiceWithClient>(`
      SELECT i.*, c.name as client_name
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.issue_date >= ? AND i.issue_date <= ?
      AND i.deleted_at IS NULL
      ORDER BY i.issue_date DESC
    `, [startDate, endDate]);

    // Get expenses in date range
    const expenses = await databaseService.getMany<Expense>(`
      SELECT *
      FROM expenses
      WHERE date >= ? AND date <= ?
      AND deleted_at IS NULL
      ORDER BY date DESC
    `, [startDate, endDate]);

    const toNumber = (value: unknown): number => {
      if (value === null || value === undefined) return 0;
      const num = typeof value === 'string' ? parseFloat(value) : Number(value);
      return isNaN(num) ? 0 : num;
    };

    // Calculate revenue
    const totalInvoiceRevenue = invoices.reduce((sum: number, inv) => sum + toNumber(inv.amount), 0);
    const paidRevenue = invoices
      .filter((inv) => inv.status === 'paid')
      .reduce((sum: number, inv) => sum + toNumber(inv.amount), 0);
    const pendingRevenue = invoices
      .filter((inv) => inv.status !== 'paid')
      .reduce((sum: number, inv) => sum + toNumber(inv.amount), 0);

    const recognizedRevenue = accountingMethod === 'cash' ? paidRevenue : totalInvoiceRevenue;

    // Calculate expenses
    const totalExpenses = expenses.reduce((sum: number, exp) => sum + toNumber(exp.amount), 0);
    const expensesByCategory = expenses.reduce((acc: Record<string, number>, exp) => {
      const category = exp.category || 'Uncategorized';
      acc[category] = (acc[category] || 0) + toNumber(exp.amount);
      return acc;
    }, {});

    const netProfit = recognizedRevenue - totalExpenses;

    // Per-period columns. Bucketed on the same fields and with the same
    // accounting method as the totals above, so the columns reconcile with them.
    const buckets = buildPeriodBuckets(startDate, endDate, breakdownPeriod, fiscalYearStartMonth);

    const periodColumns = buckets.map(bucket => {
      const bucketInvoices = invoices.filter(
        inv => periodKeyFor(inv.issue_date, breakdownPeriod, fiscalYearStartMonth) === bucket.key
      );
      const bucketExpenses = expenses.filter(
        exp => periodKeyFor(exp.date, breakdownPeriod, fiscalYearStartMonth) === bucket.key
      );

      const bucketRevenue = (
        accountingMethod === 'cash'
          ? bucketInvoices.filter(inv => inv.status === 'paid')
          : bucketInvoices
      ).reduce((sum: number, inv) => sum + toNumber(inv.amount), 0);

      const bucketExpenseTotal = bucketExpenses.reduce(
        (sum: number, exp) => sum + toNumber(exp.amount),
        0
      );

      const bucketExpensesByCategory = bucketExpenses.reduce((acc: Record<string, number>, exp) => {
        const category = exp.category || 'Uncategorized';
        acc[category] = (acc[category] || 0) + toNumber(exp.amount);
        return acc;
      }, {});

      return {
        label: bucket.label,
        revenue: bucketRevenue,
        expenses: bucketExpenseTotal,
        expensesByCategory: bucketExpensesByCategory,
        netIncome: bucketRevenue - bucketExpenseTotal
      };
    });

    return {
      revenue: {
        total: recognizedRevenue,
        paid: paidRevenue,
        pending: pendingRevenue,
        invoices: recognizedRevenue,
        otherIncome: 0
      },
      expenses: {
        total: totalExpenses,
        ...expensesByCategory
      },
      profit: {
        net: netProfit,
        gross: netProfit,
        margin: recognizedRevenue > 0 ? (netProfit / recognizedRevenue) * 100 : 0
      },
      netIncome: netProfit,
      accountingMethod,
      invoices,
      periodColumns,
      // A single column would just restate the Total column beside it.
      hasBreakdown: periodColumns.length > 1,
      breakdownPeriod
    };
  }

  /**
   * Generate Expense Report Data
   */
  async generateExpenseData(startDate: string, endDate: string): Promise<ExpenseReportData> {
    const expenses = await databaseService.getMany<Expense>(`
      SELECT *
      FROM expenses
      WHERE date >= ? AND date <= ?
      AND deleted_at IS NULL
      ORDER BY date DESC
    `, [startDate, endDate]);

    const toNumber = (value: unknown): number => {
      if (value === null || value === undefined) return 0;
      const num = typeof value === 'string' ? parseFloat(value) : Number(value);
      return isNaN(num) ? 0 : num;
    };

    const expensesByCategory = expenses.reduce((acc: Record<string, number>, exp) => {
      const category = exp.category || 'Uncategorized';
      acc[category] = (acc[category] || 0) + toNumber(exp.amount);
      return acc;
    }, {});

    const expensesByStatus = expenses.reduce((acc: Record<string, number>, exp) => {
      const status = exp.status || 'pending';
      acc[status] = (acc[status] || 0) + toNumber(exp.amount);
      return acc;
    }, {});

    const totalAmount = expenses.reduce((sum: number, exp) => sum + toNumber(exp.amount), 0);

    return {
      expenses,
      expensesByCategory,
      expensesByStatus,
      totalAmount,
      totalCount: expenses.length
    };
  }

  /**
   * Generate Invoice Report Data
   */
  async generateInvoiceData(startDate: string, endDate: string): Promise<InvoiceReportData> {
    // Windowed on issue_date, not created_at — see generateProfitLossData
    // above for why the bind changes with the field.
    const invoices = await databaseService.getMany<InvoiceWithClient>(`
      SELECT i.*, c.name as client_name
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.issue_date >= ? AND i.issue_date <= ?
      AND i.deleted_at IS NULL
      ORDER BY i.issue_date DESC
    `, [startDate, endDate]);

    const toNumber = (value: unknown): number => {
      if (value === null || value === undefined) return 0;
      const num = typeof value === 'string' ? parseFloat(value) : Number(value);
      return isNaN(num) ? 0 : num;
    };

    const invoicesByStatus = invoices.reduce((acc: Record<string, number>, inv) => {
      const status = inv.status || 'draft';
      acc[status] = (acc[status] || 0) + toNumber(inv.amount);
      return acc;
    }, {});

    const invoicesByClient = invoices.reduce((acc: Record<string, number>, inv) => {
      const clientName = inv.client_name || 'Unknown Client';
      acc[clientName] = (acc[clientName] || 0) + toNumber(inv.amount);
      return acc;
    }, {});

    const totalAmount = invoices.reduce((sum: number, inv) => sum + toNumber(inv.amount), 0);
    const paidAmount = invoices
      .filter((inv) => inv.status === 'paid')
      .reduce((sum: number, inv) => sum + toNumber(inv.amount), 0);
    const pendingAmount = invoices
      .filter((inv) => inv.status !== 'paid')
      .reduce((sum: number, inv) => sum + toNumber(inv.amount), 0);
    const overdueAmount = invoices
      .filter((inv) => inv.status === 'overdue')
      .reduce((sum: number, inv) => sum + toNumber(inv.amount), 0);

    return {
      invoices,
      invoicesByStatus,
      invoicesByClient,
      totalAmount,
      paidAmount,
      pendingAmount,
      overdueAmount,
      totalCount: invoices.length
    };
  }

  /**
   * Generate Client Report Data
   */
  async generateClientData(startDate?: string, endDate?: string): Promise<ClientReportData> {
    const clients = await databaseService.getMany<Client>(`
      SELECT *
      FROM clients
      WHERE deleted_at IS NULL
      ORDER BY name ASC
    `);

    let invoiceFilter = '';
    const params: number[] = [];

    if (startDate && endDate) {
      invoiceFilter = 'WHERE i.created_at >= ? AND i.created_at <= ? AND i.deleted_at IS NULL';
      params.push(...instantRange(startDate, endDate));
    } else {
      invoiceFilter = 'WHERE i.deleted_at IS NULL';
    }

    const invoices = await databaseService.getMany<InvoiceWithClient>(`
      SELECT i.*, c.name as client_name
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      ${invoiceFilter}
      ORDER BY i.created_at DESC
    `, params);

    const toNumber = (value: unknown): number => {
      if (value === null || value === undefined) return 0;
      const num = typeof value === 'string' ? parseFloat(value) : Number(value);
      return isNaN(num) ? 0 : num;
    };

    const clientStats: ClientReportEntry[] = clients.map((client): ClientReportEntry => {
      const clientInvoices = invoices.filter((inv) => inv.client_id === client.id);
      const totalRevenue = clientInvoices.reduce((sum: number, inv) => sum + toNumber(inv.amount), 0);
      const paidRevenue = clientInvoices
        .filter((inv) => inv.status === 'paid')
        .reduce((sum: number, inv) => sum + toNumber(inv.amount), 0);
      const pendingRevenue = clientInvoices
        .filter((inv) => inv.status !== 'paid')
        .reduce((sum: number, inv) => sum + toNumber(inv.amount), 0);
      const overdueRevenue = clientInvoices
        .filter((inv) => inv.status === 'overdue')
        .reduce((sum: number, inv) => sum + toNumber(inv.amount), 0);

      return {
        ...client,
        totalInvoices: clientInvoices.length,
        totalRevenue,
        paidRevenue,
        pendingRevenue,
        overdueRevenue
      };
    }).filter((client) => client.totalInvoices > 0);

    const totalRevenue = clientStats.reduce((sum: number, client) => sum + client.totalRevenue, 0);
    const totalPaidRevenue = clientStats.reduce((sum: number, client) => sum + client.paidRevenue, 0);
    const totalPendingRevenue = clientStats.reduce((sum: number, client) => sum + client.pendingRevenue, 0);
    const totalOverdueRevenue = clientStats.reduce((sum: number, client) => sum + client.overdueRevenue, 0);

    return {
      clients: clientStats,
      totalClients: clientStats.length,
      totalRevenue,
      totalPaidRevenue,
      totalPendingRevenue,
      totalOverdueRevenue
    };
  }
}

// Export singleton instance
export const reportService = new ReportService();