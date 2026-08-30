
import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Download, Save, Calendar } from 'lucide-react';
import { getStatusColor, themeClasses, getButtonClasses } from '@/utils/themeUtils.util';
import { StatCard, StatCardGrid } from '@/components/ui/StatCard';
import { authenticatedFetch } from '@/utils/api';
import { formatDateSync, formatDateRangeSync } from '@/utils/formatting';
import { FormattedCurrency } from '@/components/ui/FormattedCurrency';
import { useFiscalSettings } from '@/hooks/useFiscalSettings.hook';
import { getDateRangeForPeriod, toCalendarDay, dateRangeFilterOptions, type DateRangePeriod } from '@/utils/data';
import { type InvoiceReportData, type InvoiceReportProps, type ReportDateRange } from '@/types';

export const InvoiceReport: React.FC<InvoiceReportProps> = ({ onBack, onSave }) => {
  const { fiscalYearStartMonth } = useFiscalSettings();
  const [reportData, setReportData] = useState<InvoiceReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<ReportDateRange>(() => {
    const range = getDateRangeForPeriod('this_month', fiscalYearStartMonth, new Date());
    return { start: toCalendarDay(range.start), end: toCalendarDay(range.end), preset: 'this_month' };
  });


  const generateReportData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch('/api/reports/generate/invoice', {
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
      console.error('Error generating invoice report data:', error);
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
      onSave(reportData, 'invoice', dateRange);
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
            <h1 className={themeClasses.pageTitle}>Generating Invoice Report...</h1>
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
              <h1 className={themeClasses.pageTitle}>Invoice Report</h1>
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
                  <option key={option.value} value={option.value}>{option.label}</option>
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
            <StatCardGrid className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <StatCard
                label="Total Invoices"
                value={reportData.totalCount}
                valueColor="blue"
              />
              <StatCard
                label="Total Amount"
                value={<FormattedCurrency amount={reportData.totalAmount} />}
              />
              <StatCard
                label="Paid Amount"
                value={<FormattedCurrency amount={reportData.paidAmount} />}
                valueColor="green"
              />
              <StatCard
                label="Pending Amount"
                value={<FormattedCurrency amount={reportData.pendingAmount} />}
                valueColor="yellow"
              />
              <StatCard
                label="Overdue Amount"
                value={<FormattedCurrency amount={reportData.overdueAmount || 0} />}
                valueColor="red"
              />
            </StatCardGrid>

            {/* Status Breakdown and Client Breakdown - Two Column Layout */}
            <div className={themeClasses.contentGrid}>
              {/* Status Breakdown */}
              <div className={themeClasses.card}>
                <div className={themeClasses.cardHeader}>
                  <h3 className={themeClasses.cardTitle}>Invoices by Status</h3>
                </div>
                <div className={themeClasses.cardContent}>
                  <div className="space-y-4">
                    {Object.entries(reportData.invoicesByStatus).map(([status, amount]) => {
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

              {/* Client Breakdown */}
              <div className={themeClasses.card}>
                <div className={themeClasses.cardHeader}>
                  <h3 className={themeClasses.cardTitle}>Top Clients by Revenue</h3>
                </div>
                <div className={themeClasses.cardContent}>
                  <div className="space-y-4">
                    {Object.entries(reportData.invoicesByClient || {}).slice(0, 5).map(([client, amount]) => {
                      const percentage = reportData.totalAmount > 0 ? ((amount as number) / reportData.totalAmount * 100) : 0;
                      return (
                        <div key={client} className="flex justify-between items-center py-2">
                          <span className={`${themeClasses.bodyText} font-medium flex-1`}>{client}</span>
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

            {/* Detailed Invoice List */}
            <div className={themeClasses.card}>
              <div className={themeClasses.cardHeader}>
                <h3 className={themeClasses.cardTitle}>Detailed Invoice List</h3>
              </div>
              <div className={themeClasses.cardContent}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className={themeClasses.tableHeader}>
                      <tr>
                        <th className={themeClasses.tableHeaderCell}>Invoice #</th>
                        <th className={themeClasses.tableHeaderCell}>Client</th>
                        <th className={themeClasses.tableHeaderCell}>Amount</th>
                        <th className={themeClasses.tableHeaderCell}>Status</th>
                        <th className={themeClasses.tableHeaderCell}>Due Date</th>
                        <th className={themeClasses.tableHeaderCell}>Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reportData.invoices.map((invoice) => (
                        <tr key={invoice.id} className={themeClasses.tableRow}>
                          <td className={`${themeClasses.tableCell} font-medium`}>
                            {invoice.invoice_number}
                          </td>
                          <td className={themeClasses.tableCell}>{invoice.client_name}</td>
                          <td className={`${themeClasses.tableCell} font-medium`}>
                            <FormattedCurrency amount={invoice.amount} />
                          </td>
                          <td className={themeClasses.tableCell}>
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(invoice.status)}`}>
                            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                          </span>
                        </td>
                        <td className={themeClasses.tableCell}>
                          {formatDateSync(invoice.due_date)}
                        </td>
                        <td className={themeClasses.tableCell}>
                          {formatDateSync(invoice.created_at)}
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
