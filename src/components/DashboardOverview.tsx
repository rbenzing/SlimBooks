
import { useState, useEffect, useMemo } from 'react';
import { DollarSign, Users, FileText, TrendingUp, Calendar, AlertCircle } from 'lucide-react';
import DashboardChart from './DashboardChart';
import { authenticatedFetch } from '@/utils/api';
import { themeClasses, getIconColorClasses, getStatusColor } from '@/utils/themeUtils.util';
import { StatCard, StatCardGrid } from '@/components/ui/StatCard';
import { FormattedCurrency } from '@/components/ui/FormattedCurrency';
import { type TimePeriod, type Invoice, type Expense } from '@/types';

export const DashboardOverview = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('year-to-date');
  const [loadedData, setLoadedData] = useState({
    allInvoices: [] as Invoice[],
    allExpenses: [] as Expense[],
    totalClients: 0
  });
  
  const timePeriodOptions = [
    { value: 'last-week', label: 'Last Week' },
    { value: 'last-month', label: 'Last Month' },
    { value: 'last-year', label: 'Last Year' },
    { value: 'year-to-date', label: 'Year to Date' },
    { value: 'month-to-date', label: 'Month to Date' }
  ];

  const loadDashboardData = async () => {
    try {
      const [invoicesResponse, clientsResponse, expensesResponse] = await Promise.all([
        authenticatedFetch('/api/invoices'),
        authenticatedFetch('/api/clients'),
        authenticatedFetch('/api/expenses')
      ]);

      const invoicesData = invoicesResponse.ok ? await invoicesResponse.json() : { data: { invoices: [] } };
      const clientsData = clientsResponse.ok ? await clientsResponse.json() : { data: [] };
      const expensesData = expensesResponse.ok ? await expensesResponse.json() : { data: { data: [] } };

      const invoices = invoicesData.data?.invoices || [];
      const clients = clientsData.data || [];
      const expenses = expensesData.data?.data || [];

      setLoadedData({
        totalClients: clients.length,
        allInvoices: invoices,
        allExpenses: expenses
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const dateRange = useMemo(() => {
    const currentDate = new Date();
    let startDate: Date;
    let endDate: Date = currentDate;

    switch (selectedPeriod) {
      case 'last-week':
        startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - 7);
        break;
      case 'last-month':
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
        endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0, 23, 59, 59);
        break;
      case 'last-year':
        startDate = new Date(currentDate.getFullYear() - 1, 0, 1);
        endDate = new Date(currentDate.getFullYear() - 1, 11, 31, 23, 59, 59);
        break;
      case 'year-to-date':
        startDate = new Date(currentDate.getFullYear(), 0, 1);
        break;
      case 'month-to-date':
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        break;
      default:
        startDate = new Date(currentDate.getFullYear(), 0, 1);
    }

    return { startDate, endDate };
  }, [selectedPeriod]);

  const filteredInvoices = useMemo(() => {
    return loadedData.allInvoices.filter(invoice => {
      const invoiceDate = new Date(invoice.created_at);
      return invoiceDate >= dateRange.startDate && invoiceDate <= dateRange.endDate;
    });
  }, [loadedData.allInvoices, dateRange]);

  const filteredExpenses = useMemo(() => {
    return loadedData.allExpenses.filter(expense => {
      const expenseDate = new Date(expense.created_at);
      return expenseDate >= dateRange.startDate && expenseDate <= dateRange.endDate;
    });
  }, [loadedData.allExpenses, dateRange]);

  const stats = useMemo(() => {
    const totalRevenue = filteredInvoices.reduce((sum, invoice) => {
      const amount = invoice.amount || 0;
      return amount > 0 ? sum + amount : sum;
    }, 0);

    // 'pending' is not an InvoiceStatus, so this tile always read 0. It counts
    // invoices that are out with the client and still unpaid.
    const pendingInvoices = filteredInvoices.filter(
      invoice => invoice.status === 'sent' || invoice.status === 'overdue'
    ).length;
    const sentInvoices = filteredInvoices.filter(invoice => invoice.status === 'sent').length;
    const paidInvoices = filteredInvoices.filter(invoice => invoice.status === 'paid').length;
    const overdueInvoices = filteredInvoices.filter(invoice => invoice.status === 'overdue').length;
    const draftInvoices = filteredInvoices.filter(invoice => invoice.status === 'draft').length;

    const creditsRefunds = Math.abs(filteredInvoices.reduce((sum, invoice) => {
      const amount = invoice.amount || 0;
      return amount < 0 ? sum + amount : sum;
    }, 0));

    const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const recentInvoices = filteredInvoices.slice(0, 5);

    return {
      totalRevenue,
      totalClients: loadedData.totalClients,
      totalInvoices: filteredInvoices.length,
      pendingInvoices,
      sentInvoices,
      paidInvoices,
      overdueInvoices,
      draftInvoices,
      totalExpenses,
      creditsRefunds,
      recentInvoices
    };
  }, [filteredInvoices, filteredExpenses, loadedData.totalClients]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  return (
    <div className={themeClasses.page}>
      <div className={themeClasses.pageContainer}>
        {/* Header */}
        <div className={`${themeClasses.pageHeader} flex justify-between items-start`}>
          <div>
            <h1 className={themeClasses.pageTitle}>Dashboard</h1>
            <p className={themeClasses.pageSubtitle}>Welcome back! Here's an overview of your business.</p>
          </div>
          <div className="w-48">
            <select
              className={themeClasses.select}
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as TimePeriod)}
            >
              {timePeriodOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats Grid */}
        <StatCardGrid className={themeClasses.statsGrid}>
          <StatCard
            label="Total Revenue"
            value={<FormattedCurrency amount={stats.totalRevenue} />}
            icon={DollarSign}
            iconColor="green"
          />

          <StatCard
            label="Total Clients"
            value={stats.totalClients}
            icon={Users}
            iconColor="blue"
          />

          <StatCard
            label="Total Invoices"
            value={stats.totalInvoices}
            icon={FileText}
            iconColor="purple"
          />

          <StatCard
            label="Total Expenses"
            value={<FormattedCurrency amount={stats.totalExpenses} />}
            icon={TrendingUp}
            iconColor="red"
          />
        </StatCardGrid>

        {/* Invoice Status Cards - 5 Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Pending Invoices</p>
                <p className={themeClasses.statValueMedium} style={{color: 'hsl(var(--dashboard-stat-yellow-foreground))'}}>{stats.pendingInvoices}</p>
              </div>
              <Calendar className={`${themeClasses.iconMedium} ${getIconColorClasses('yellow')}`} />
            </div>
          </div>

          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Sent Invoices</p>
                <p className={themeClasses.statValueMedium} style={{color: 'hsl(var(--dashboard-stat-blue-foreground))'}}>{stats.sentInvoices}</p>
              </div>
              <Calendar className={`${themeClasses.iconMedium} ${getIconColorClasses('blue')}`} />
            </div>
          </div>

          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Paid Invoices</p>
                <p className={themeClasses.statValueMedium} style={{color: 'hsl(var(--dashboard-stat-green-foreground))'}}>{stats.paidInvoices}</p>
              </div>
              <FileText className={`${themeClasses.iconMedium} ${getIconColorClasses('green')}`} />
            </div>
          </div>

          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Overdue Invoices</p>
                <p className={themeClasses.statValueMedium} style={{color: 'hsl(var(--dashboard-stat-red-foreground))'}}>{stats.overdueInvoices}</p>
              </div>
              <AlertCircle className={`${themeClasses.iconMedium} ${getIconColorClasses('red')}`} />
            </div>
          </div>

          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Draft Invoices</p>
                <p className={themeClasses.statValueMedium} style={{color: 'hsl(var(--dashboard-stat-blue-foreground))'}}>{stats.draftInvoices}</p>
              </div>
              <FileText className={`${themeClasses.iconMedium} ${getIconColorClasses('blue')}`} />
            </div>
          </div>

          {stats.creditsRefunds > 0 && (
            <div className={themeClasses.statCard}>
              <div className={themeClasses.statCardContent}>
                <div>
                  <p className={themeClasses.statLabel}>Credits/Refunds</p>
                  <p className={themeClasses.statValueMedium} style={{color: 'hsl(var(--dashboard-stat-purple-foreground))'}}>
                    <FormattedCurrency amount={stats.creditsRefunds} />
                  </p>
                </div>
                <TrendingUp className={`${themeClasses.iconMedium} ${getIconColorClasses('purple')}`} />
              </div>
            </div>
          )}
        </div>

        {/* Chart and Recent Invoices */}
        <div className={themeClasses.contentGrid}>
          <div className={themeClasses.card}>
            <DashboardChart invoices={filteredInvoices} title="Revenue Trend" selectedPeriod={selectedPeriod} />
          </div>

          <div className={themeClasses.card}>
            <h3 className={themeClasses.cardTitle}>Recent Invoices</h3>
            <div className="space-y-3 mt-4">
              {stats.recentInvoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className={`font-medium ${themeClasses.bodyText}`}>{invoice.client_name}</p>
                    <p className={themeClasses.smallText}>#{invoice.invoice_number}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${themeClasses.bodyText}`}>
                      <FormattedCurrency amount={invoice.amount} />
                    </p>
                    <span className={getStatusColor(invoice.status)}>
                      {invoice.status}
                    </span>
                  </div>
                </div>
              ))}
              {stats.recentInvoices.length === 0 && (
                <p className={`${themeClasses.mutedText} text-center py-4`}>No invoices yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
