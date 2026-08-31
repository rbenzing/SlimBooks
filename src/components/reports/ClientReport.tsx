
import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Download, Save, Calendar } from 'lucide-react';
import { authenticatedFetch } from '@/utils/api';
import { themeClasses, getButtonClasses } from '@/utils/themeUtils.util';
import { StatCard, StatCardGrid } from '@/components/ui/StatCard';
import { formatDateRangeSync } from '@/utils/formatting';
import { FormattedCurrency } from '@/components/ui/FormattedCurrency';
import { useFiscalSettings } from '@/hooks/useFiscalSettings.hook';
import { getDateRangeForPeriod, toCalendarDay, dateRangeFilterOptions,
  formatDateRangeLabel, type DateRangePeriod } from '@/utils/data';
import { type ClientReportData, type ClientReportProps, type ReportDateRange } from '@/types';

export const ClientReport: React.FC<ClientReportProps> = ({ onBack, onSave }) => {
  const { fiscalYearStartMonth } = useFiscalSettings();
  const [reportData, setReportData] = useState<ClientReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<ReportDateRange>(() => {
    const range = getDateRangeForPeriod('this_month', fiscalYearStartMonth, new Date());
    return { start: toCalendarDay(range.start), end: toCalendarDay(range.end), preset: 'this_month' };
  });

  const generateReportData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch('/api/reports/generate/client', {
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
      console.error('Error generating client report data:', error);
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
      onSave(reportData, 'client', dateRange);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center">
          <button onClick={onBack} className="flex items-center text-muted-foreground hover:text-foreground mr-4">
            <ArrowLeft className="h-5 w-5 mr-1" />
            Back to Reports
          </button>
          <h1 className="text-2xl font-bold text-foreground">Generating Client Report...</h1>
        </div>
        <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Please wait while we generate your report...</p>
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
              <h1 className={themeClasses.pageTitle}>Client Report</h1>
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
      <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
        <h3 className="text-lg font-medium text-foreground mb-4 flex items-center">
          <Calendar className="h-5 w-5 mr-2" />
          Report Date Range
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
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
            <label className="block text-sm font-medium text-foreground mb-2">
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
            <label className="block text-sm font-medium text-foreground mb-2">
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
              label="Active Clients"
              value={reportData.totalClients}
              valueColor="blue"
            />
            <StatCard
              label="Total Revenue"
              value={<FormattedCurrency amount={reportData.totalRevenue} />}
            />
            <StatCard
              label="Paid Revenue"
              value={<FormattedCurrency amount={reportData.totalPaidRevenue} />}
              valueColor="green"
            />
            <StatCard
              label="Pending Revenue"
              value={<FormattedCurrency amount={reportData.totalPendingRevenue} />}
              valueColor="yellow"
            />
            <StatCard
              label="Overdue Revenue"
              value={<FormattedCurrency amount={reportData.totalOverdueRevenue || 0} />}
              valueColor="red"
            />
          </StatCardGrid>

          {/* Client Details */}
          <div className={themeClasses.card}>
            <div className={themeClasses.cardHeader}>
              <h3 className={themeClasses.cardTitle}>Client Performance</h3>
              <p className={`text-sm ${themeClasses.mutedText}`}>
                Sorted by total revenue (highest first) • Only showing clients with invoices in selected date range
              </p>
            </div>
            <div className={themeClasses.cardContent}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={themeClasses.tableHeader}>
                    <tr>
                      <th className={themeClasses.tableHeaderCell}>Client</th>
                      <th className={themeClasses.tableHeaderCell}>Company</th>
                      <th className={themeClasses.tableHeaderCell}>Invoices</th>
                      <th className={themeClasses.tableHeaderCell}>Total Revenue</th>
                      <th className={themeClasses.tableHeaderCell}>Paid</th>
                      <th className={themeClasses.tableHeaderCell}>Pending</th>
                      <th className={themeClasses.tableHeaderCell}>Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {reportData.clients.map((client) => (
                      <tr key={client.id} className={themeClasses.tableRow}>
                        <td className={`${themeClasses.tableCell} font-medium`}>
                          {client.name}
                        </td>
                        <td className={themeClasses.tableCell}>{client.company}</td>
                        <td className={themeClasses.tableCell}>{client.totalInvoices}</td>
                        <td className={`${themeClasses.tableCell} font-medium`}>
                          <FormattedCurrency amount={client.totalRevenue} />
                        </td>
                        <td className={`${themeClasses.tableCell} text-green-600 dark:text-green-400 font-medium`}>
                          <FormattedCurrency amount={client.paidRevenue} />
                        </td>
                        <td className={`${themeClasses.tableCell} text-yellow-600 dark:text-yellow-400 font-medium`}>
                          <FormattedCurrency amount={client.pendingRevenue} />
                        </td>
                        <td className={`${themeClasses.tableCell} text-red-600 dark:text-red-400 font-medium`}>
                          <FormattedCurrency amount={client.overdueRevenue || 0} />
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
