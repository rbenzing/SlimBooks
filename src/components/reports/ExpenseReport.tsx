
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Download, Save, Calendar } from 'lucide-react';
import { authenticatedFetch } from '@/utils/api';
import { themeClasses, getButtonClasses } from '@/utils/themeUtils.util';
import { StatCard, StatCardGrid } from '@/components/ui/StatCard';
import { formatDateSync, formatDateRangeSync } from '@/utils/formatting';
import { FormattedCurrency } from '@/components/ui/FormattedCurrency';
import { useFiscalSettings } from '@/hooks/useFiscalSettings.hook';
import { getDateRangeForPeriod, toCalendarDay, dateRangeFilterOptions,
  formatDateRangeLabel, type DateRangePeriod } from '@/utils/data';
import { type Expense } from '@/types';
import { type ExpenseReportData, type ExpenseReportProps, type ReportDateRange } from '@/types';

export const ExpenseReport: React.FC<ExpenseReportProps> = ({ onBack, onSave }) => {
  const { fiscalYearStartMonth } = useFiscalSettings();
  const [reportData, setReportData] = useState<ExpenseReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<ReportDateRange>(() => {
    const range = getDateRangeForPeriod('this_month', fiscalYearStartMonth, new Date());
    return { start: toCalendarDay(range.start), end: toCalendarDay(range.end), preset: 'this_month' };
  });


  /**
   * Grouped client-side from the expenses the API returns. Expenses have no
   * `status` column, so the report breaks down by vendor — the field that
   * actually exists — rather than by a status that is always undefined.
   */
  const expensesByVendor = useMemo<Record<string, number>>(() => {
    if (!reportData?.expenses) return {};

    return reportData.expenses.reduce<Record<string, number>>((acc, expense) => {
      const vendor = expense.vendor?.trim() || 'Unspecified';
      acc[vendor] = (acc[vendor] || 0) + (Number(expense.amount) || 0);
      return acc;
    }, {});
  }, [reportData]);

  const generateReportData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch('/api/reports/generate/expense', {
        method: 'POST',
        body: JSON.stringify({
          startDate: dateRange.start,
          endDate: dateRange.end
        })
      });
      const result = await response.json();
      if (result.success) {
        setReportData(result.data);
      } else {
        console.error('Error generating report:', result.error);
      }
    } catch (error) {
      console.error('Error generating expense report data:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange.start, dateRange.end]);

  useEffect(() => {
    generateReportData();
  }, [generateReportData]);

  const handleDatePresetChange = (preset: DateRangePeriod): void => {
    if (preset === 'custom') {
      setDateRange({ ...dateRange, preset });
      return;
    }
    const range = getDateRangeForPeriod(preset, fiscalYearStartMonth, new Date());
    setDateRange({ start: toCalendarDay(range.start), end: toCalendarDay(range.end), preset });
  };

  const getFormattedDateRange = () => {
    return formatDateRangeSync(dateRange.start, dateRange.end);
  };

  const handleSave = () => {
    if (reportData) {
      onSave(reportData, 'expense', dateRange);
    }
  };

  if (loading) {
    return (
      <div className={themeClasses.page}>
        <div className={themeClasses.pageContainer}>
          <div className="flex items-center">
            <button onClick={onBack} className={`flex items-center ${themeClasses.mutedText} hover:text-foreground mr-4`}>
              <ArrowLeft className={`${themeClasses.iconSmall} mr-1`} />
              Back to Reports
            </button>
            <h1 className={themeClasses.pageTitle}>Generating Expense Report...</h1>
          </div>
          <div className={`${themeClasses.card} p-12 text-center`}>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className={`mt-4 ${themeClasses.mutedText}`}>Please wait while we generate your report...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={themeClasses.page}>
      <div className={themeClasses.pageContainer}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={onBack}
              className={`flex items-center ${themeClasses.mutedText} hover:text-foreground mr-4`}
            >
              <ArrowLeft className={`${themeClasses.iconSmall} mr-1`} />
              Back to Reports
            </button>
            <div>
              <h1 className={themeClasses.pageTitle}>Expense Report</h1>
              <p className={themeClasses.pageSubtitle}>{getFormattedDateRange()}</p>
            </div>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleSave}
              className={getButtonClasses('primary')}
            >
              <Save className={themeClasses.iconButton} />
              Save Report
            </button>
            <button className={getButtonClasses('secondary')}>
              <Download className={themeClasses.iconButton} />
              Export PDF
            </button>
          </div>
        </div>

        {/* Date Range Selector */}
        <div className={themeClasses.card}>
          <h3 className={`${themeClasses.cardTitle} mb-4 flex items-center`}>
            <Calendar className={`${themeClasses.iconSmall} mr-2`} />
            Report Date Range
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={`block text-sm font-medium ${themeClasses.bodyText} mb-2`}>
                Quick Select
              </label>
              <select
                className={`w-full ${themeClasses.select}`}
                value={dateRange.preset}
                onChange={(e) => handleDatePresetChange(e.target.value as DateRangePeriod)}
              >
                {dateRangeFilterOptions.map(option => (
                  <option key={option.value} value={option.value}>{formatDateRangeLabel(option.value, fiscalYearStartMonth, new Date())}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`block text-sm font-medium ${themeClasses.bodyText} mb-2`}>
                Start Date
              </label>
              <input
                type="date"
                className={themeClasses.dateInput}
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value, preset: 'custom' })}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium ${themeClasses.bodyText} mb-2`}>
                End Date
              </label>
              <input
                type="date"
                className={themeClasses.dateInput}
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value, preset: 'custom' })}
              />
            </div>
          </div>
        </div>

        {reportData && (
          <>
            {/* Summary */}
            <StatCardGrid className={themeClasses.statsGridThree}>
              <StatCard
                label="Total Expenses"
                value={<FormattedCurrency amount={reportData.totalAmount} />}
                valueColor="red"
              />
              <StatCard
                label="Total Transactions"
                value={reportData.totalCount}
                valueColor="blue"
              />
              <StatCard
                label="Average Amount"
                value={<FormattedCurrency amount={reportData.totalCount > 0 ? reportData.totalAmount / reportData.totalCount : 0} />}
              />
            </StatCardGrid>

            {/* Category and Status Breakdown - Two Column Layout */}
            <div className={themeClasses.contentGrid}>
              {/* Category Breakdown */}
              <div className={themeClasses.card}>
                <div className={themeClasses.cardHeader}>
                  <h3 className={themeClasses.cardTitle}>Expenses by Category</h3>
                </div>
                <div className={themeClasses.cardContent}>
                  <div className="space-y-4">
                    {Object.entries(reportData.expensesByCategory).map(([category, amount]) => {
                      const percentage = reportData.totalAmount > 0 ? ((amount as number) / reportData.totalAmount * 100) : 0;
                      return (
                        <div key={category} className="flex justify-between items-center py-2">
                          <span className={`${themeClasses.bodyText} font-medium flex-1`}>{category}</span>
                          <div className="flex items-center space-x-4 min-w-0">
                            <span className={`font-semibold ${themeClasses.bodyText}`}>
                              <FormattedCurrency amount={amount as number} />
                            </span>
                            <span className={`${themeClasses.mutedText} text-sm min-w-[3rem] text-right`}>
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Status Breakdown */}
              <div className={themeClasses.card}>
                <div className={themeClasses.cardHeader}>
                  <h3 className={themeClasses.cardTitle}>Expenses by Status</h3>
                </div>
                <div className={themeClasses.cardContent}>
                  <div className="space-y-4">
                    {Object.entries(reportData.expensesByStatus ?? {}).map(([status, amount]) => {
                      const percentage = reportData.totalAmount > 0 ? ((amount as number) / reportData.totalAmount * 100) : 0;
                      return (
                        <div key={status} className="flex justify-between items-center py-2">
                          <span className={`${themeClasses.bodyText} font-medium capitalize flex-1`}>{status}</span>
                          <div className="flex items-center space-x-4 min-w-0">
                            <span className={`font-semibold ${themeClasses.bodyText}`}>
                              <FormattedCurrency amount={amount as number} />
                            </span>
                            <span className={`${themeClasses.mutedText} text-sm min-w-[3rem] text-right`}>
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Vendor Breakdown */}
              <div className={themeClasses.card}>
                <div className={themeClasses.cardHeader}>
                  <h3 className={themeClasses.cardTitle}>Expenses by Vendor</h3>
                </div>
                <div className={themeClasses.cardContent}>
                  <div className="space-y-4">
                    {Object.entries(expensesByVendor).map(([vendor, amount]) => {
                      const percentage = reportData.totalAmount > 0 ? ((amount as number) / reportData.totalAmount * 100) : 0;
                      return (
                        <div key={vendor} className="flex justify-between items-center py-2">
                          <span className={`${themeClasses.bodyText} font-medium flex-1`}>{vendor}</span>
                          <div className="flex items-center space-x-4 min-w-0">
                            <span className={`font-semibold ${themeClasses.bodyText}`}>
                              <FormattedCurrency amount={amount as number} />
                            </span>
                            <span className={`${themeClasses.mutedText} text-sm min-w-[3rem] text-right`}>
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Expense List */}
            <div className={themeClasses.card}>
              <div className={themeClasses.cardHeader}>
                <h3 className={themeClasses.cardTitle}>Detailed Expense List</h3>
              </div>
              <div className={themeClasses.cardContent}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className={themeClasses.tableHeader}>
                      <tr>
                        <th className={themeClasses.tableHeaderCell}>Date</th>
                        <th className={themeClasses.tableHeaderCell}>Vendor</th>
                        <th className={themeClasses.tableHeaderCell}>Category</th>
                        <th className={themeClasses.tableHeaderCell}>Amount</th>
                        <th className={themeClasses.tableHeaderCell}>Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reportData.expenses.map((expense: Expense) => (
                        <tr key={expense.id} className={themeClasses.tableRow}>
                          <td className={themeClasses.tableCell}>
                            {formatDateSync(expense.date)}
                          </td>
                          <td className={themeClasses.tableCell}>{expense.vendor || 'N/A'}</td>
                          <td className={themeClasses.tableCell}>{expense.category}</td>
                          <td className={`${themeClasses.tableCell} font-medium`}>
                            <FormattedCurrency amount={expense.amount} />
                          </td>
                          <td className={themeClasses.tableCell}>
                            <span className={`${themeClasses.badgeInfo} ${
                              expense.status === 'pending' ? themeClasses.badgeWarning :
                              expense.status === 'approved' ? themeClasses.badgeSuccess :
                              themeClasses.badgeInfo
                            }`}>
                              {expense.status ? expense.status.charAt(0).toUpperCase() + expense.status.slice(1) : 'Pending'}
                            </span>
                          </td>
                        </tr>
                    ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
        </>
      )}
      </div>
    </div>
  );
};
