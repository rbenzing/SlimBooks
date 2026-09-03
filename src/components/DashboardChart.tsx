
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { themeClasses } from '@/utils/themeUtils.util';
import { parseDisplayDate } from '@/utils/formatting/date.util';
import { toCalendarDay, type DateRangePeriod } from '@/utils/data';
import { type DateRange, type Invoice } from '@/types';

interface DashboardChartProps {
  invoices: Invoice[];
  title?: string;
  selectedPeriod: DateRangePeriod;
  /** The same fiscal-aware range the dashboard's stat cards already total. */
  dateRange: DateRange;
}

/**
 * Monthly revenue buckets across `range`, inclusive of both end months.
 *
 * Used for the year-scale views (`this_year`, `last_year`, and anything else
 * that falls through to a yearly view). It walks `range` rather than the
 * calendar year, so a fiscal year that does not start in January produces
 * the same months the caller's own totals were computed from — the chart
 * used to always walk January onward regardless of the configured fiscal
 * year, so months the stat cards counted had no bar on the chart.
 */
export const buildMonthlyRevenueSeries = (
  invoices: Invoice[],
  range: DateRange
): { period: string; revenue: number }[] => {
  const monthlyData: { [key: string]: number } = {};

  invoices.forEach(invoice => {
    const date = parseDisplayDate(invoice.issue_date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyData[monthKey] = (monthlyData[monthKey] || 0) + invoice.total_amount;
  });

  const months: { period: string; revenue: number }[] = [];
  const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  const last = new Date(range.end.getFullYear(), range.end.getMonth(), 1);

  // A fiscal year, and any custom range, can cross a calendar year — a July
  // year runs Jul..Jun, and a two-year custom range repeats Jan..Dec. Bare
  // month names would then label two different months identically, so the year
  // is added exactly when the range needs it to be unambiguous.
  const spansCalendarYears = range.start.getFullYear() !== range.end.getFullYear();

  while (cursor.getTime() <= last.getTime()) {
    const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      period: cursor.toLocaleDateString('en-US', spansCalendarYears
        ? { month: 'short', year: '2-digit' }
        : { month: 'short' }),
      revenue: monthlyData[monthKey] || 0
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
};

const DashboardChart: React.FC<DashboardChartProps> = ({ invoices, title = "Revenue Trend", selectedPeriod, dateRange }) => {

  // Generate chart data based on selected time period
  const generateChartData = () => {
    switch (selectedPeriod) {
      case 'last_week':
        return generateWeeklyData();
      case 'last_month':
        return generateLastMonthData();
      case 'last_year':
      case 'this_year':
        return buildMonthlyRevenueSeries(invoices, dateRange);
      case 'this_month':
        return generateMonthToDateData();
      default:
        return buildMonthlyRevenueSeries(invoices, dateRange);
    }
  };

  // Generate data for last 7 days
  const generateWeeklyData = () => {
    const dailyData: { [key: string]: number } = {};

    // Use the already filtered invoices passed from parent
    invoices.forEach(invoice => {
      const date = parseDisplayDate(invoice.issue_date);
      const dayKey = toCalendarDay(date);
      dailyData[dayKey] = (dailyData[dayKey] || 0) + invoice.total_amount;
    });

    const last7Days = [];
    const currentDate = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setDate(currentDate.getDate() - i);
      const dayKey = toCalendarDay(date);
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
      const dayKey = toCalendarDay(date);
      dailyData[dayKey] = (dailyData[dayKey] || 0) + invoice.total_amount;
    });

    const currentDate = new Date();
    const lastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const lastMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);

    const lastMonthDays = [];

    for (let day = 1; day <= lastMonthEnd.getDate(); day++) {
      const date = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), day);
      const dayKey = toCalendarDay(date);
      const dayLabel = day.toString();

      lastMonthDays.push({
        period: dayLabel,
        revenue: dailyData[dayKey] || 0
      });
    }

    return lastMonthDays;
  };

  // Generate data for days in current month up to today
  const generateMonthToDateData = () => {
    const dailyData: { [key: string]: number } = {};

    // Use the already filtered invoices passed from parent
    invoices.forEach(invoice => {
      const date = parseDisplayDate(invoice.issue_date);
      const dayKey = toCalendarDay(date);
      dailyData[dayKey] = (dailyData[dayKey] || 0) + invoice.total_amount;
    });

    const currentDate = new Date();
    const currentDay = currentDate.getDate();
    const monthToDateDays = [];

    for (let day = 1; day <= currentDay; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const dayKey = toCalendarDay(date);
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
