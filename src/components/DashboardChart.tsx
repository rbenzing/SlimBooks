
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { themeClasses } from '@/utils/themeUtils.util';
import { parseDisplayDate } from '@/utils/formatting/date.util';
import { type DateRangePeriod } from '@/utils/data';
import { type Invoice } from '@/types';

interface DashboardChartProps {
  invoices: Invoice[];
  title?: string;
  selectedPeriod: DateRangePeriod;
}

const DashboardChart: React.FC<DashboardChartProps> = ({ invoices, title = "Revenue Trend", selectedPeriod }) => {

  // Generate chart data based on selected time period
  const generateChartData = () => {
    switch (selectedPeriod) {
      case 'last_week':
        return generateWeeklyData();
      case 'last_month':
        return generateLastMonthData();
      case 'last_year':
        return generateLastYearData();
      case 'this_year':
        return generateYearToDateData();
      case 'this_month':
        return generateMonthToDateData();
      default:
        return generateYearToDateData();
    }
  };

  // Generate data for last 7 days
  const generateWeeklyData = () => {
    const dailyData: { [key: string]: number } = {};

    // Use the already filtered invoices passed from parent
    invoices.forEach(invoice => {
      const date = parseDisplayDate(invoice.issue_date);
      const dayKey = date.toISOString().split('T')[0];
      dailyData[dayKey] = (dailyData[dayKey] || 0) + invoice.total_amount;
    });

    const last7Days = [];
    const currentDate = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setDate(currentDate.getDate() - i);
      const dayKey = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      last7Days.push({
        period: dayName,
        revenue: dailyData[dayKey] || 0
      });
    }

    return last7Days;
  };

  // Generate data for all days in last month
  const generateLastMonthData = () => {
    const dailyData: { [key: string]: number } = {};

    // Use the already filtered invoices passed from parent
    invoices.forEach(invoice => {
      const date = parseDisplayDate(invoice.issue_date);
      const dayKey = date.toISOString().split('T')[0];
      dailyData[dayKey] = (dailyData[dayKey] || 0) + invoice.total_amount;
    });

    const currentDate = new Date();
    const lastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const lastMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);

    const lastMonthDays = [];

    for (let day = 1; day <= lastMonthEnd.getDate(); day++) {
      const date = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), day);
      const dayKey = date.toISOString().split('T')[0];
      const dayLabel = day.toString();

      lastMonthDays.push({
        period: dayLabel,
        revenue: dailyData[dayKey] || 0
      });
    }

    return lastMonthDays;
  };

  // Generate data for all 12 months of last year
  const generateLastYearData = () => {
    const monthlyData: { [key: string]: number } = {};

    // Use the already filtered invoices passed from parent
    invoices.forEach(invoice => {
      const date = parseDisplayDate(invoice.issue_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + invoice.total_amount;
    });

    const currentDate = new Date();
    const lastYear = currentDate.getFullYear() - 1;
    const lastYearMonths = [];

    for (let month = 0; month < 12; month++) {
      const date = new Date(lastYear, month, 1);
      const monthKey = `${lastYear}-${String(month + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });

      lastYearMonths.push({
        period: monthName,
        revenue: monthlyData[monthKey] || 0
      });
    }

    return lastYearMonths;
  };

  // Generate data for months from January to current month this year
  const generateYearToDateData = () => {
    const monthlyData: { [key: string]: number } = {};

    // Use the already filtered invoices passed from parent
    invoices.forEach(invoice => {
      const date = parseDisplayDate(invoice.issue_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + invoice.total_amount;
    });

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const yearToDateMonths = [];

    for (let month = 0; month <= currentMonth; month++) {
      const date = new Date(currentYear, month, 1);
      const monthKey = `${currentYear}-${String(month + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });

      yearToDateMonths.push({
        period: monthName,
        revenue: monthlyData[monthKey] || 0
      });
    }

    return yearToDateMonths;
  };

  // Generate data for days in current month up to today
  const generateMonthToDateData = () => {
    const dailyData: { [key: string]: number } = {};

    // Use the already filtered invoices passed from parent
    invoices.forEach(invoice => {
      const date = parseDisplayDate(invoice.issue_date);
      const dayKey = date.toISOString().split('T')[0];
      dailyData[dayKey] = (dailyData[dayKey] || 0) + invoice.total_amount;
    });

    const currentDate = new Date();
    const currentDay = currentDate.getDate();
    const monthToDateDays = [];

    for (let day = 1; day <= currentDay; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const dayKey = date.toISOString().split('T')[0];
      const dayLabel = day.toString();

      monthToDateDays.push({
        period: dayLabel,
        revenue: dailyData[dayKey] || 0
      });
    }

    return monthToDateDays;
  };

  const data = generateChartData();

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex justify-between items-center">
        <h3 className={themeClasses.cardTitle}>{title}</h3>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground))" opacity={0.3} />
          <XAxis
            dataKey="period"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
            fontSize={12}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
            fontSize={12}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
              color: 'hsl(var(--card-foreground))',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
            }}
            labelStyle={{ color: 'hsl(var(--card-foreground))' }}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="hsl(var(--dashboard-stat-blue-foreground))"
            strokeWidth={2}
            dot={{ fill: 'hsl(var(--dashboard-stat-blue-foreground))', strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: 'hsl(var(--dashboard-stat-blue-foreground))', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DashboardChart;
