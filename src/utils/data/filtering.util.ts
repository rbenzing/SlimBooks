import { parseDisplayDate } from '@/utils/formatting/date.util';

export interface DateRange {
  start: Date;
  end: Date;
}

export type DateRangePeriod = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year' | 'custom';

export const getDefaultDateRange = (): DateRange => {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  return {
    start: firstDayOfMonth,
    end: lastDayOfMonth
  };
};

export const getDateRangeForPeriod = (period: DateRangePeriod): DateRange => {
  const today = new Date();

  switch (period) {
    case 'today':
      return {
        start: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
      };

    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        start: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()),
        end: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59)
      };
    }

    case 'this_week': {
      const startOfWeek = new Date(today);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day;
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      return { start: startOfWeek, end: endOfWeek };
    }

    case 'last_week': {
      const startOfLastWeek = new Date(today);
      const day = startOfLastWeek.getDay();
      const diff = startOfLastWeek.getDate() - day - 7;
      startOfLastWeek.setDate(diff);
      startOfLastWeek.setHours(0, 0, 0, 0);

      const endOfLastWeek = new Date(startOfLastWeek);
      endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
      endOfLastWeek.setHours(23, 59, 59, 999);

      return { start: startOfLastWeek, end: endOfLastWeek };
    }

    case 'this_month':
      return {
        start: new Date(today.getFullYear(), today.getMonth(), 1),
        end: new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59)
      };

    case 'last_month': {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return {
        start: lastMonth,
        end: new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59)
      };
    }

    case 'this_quarter': {
      const quarter = Math.floor(today.getMonth() / 3);
      const startMonth = quarter * 3;
      return {
        start: new Date(today.getFullYear(), startMonth, 1),
        end: new Date(today.getFullYear(), startMonth + 3, 0, 23, 59, 59)
      };
    }

    case 'last_quarter': {
      const quarter = Math.floor(today.getMonth() / 3);
      const lastQuarterStart = quarter === 0 ? 9 : (quarter - 1) * 3;
      const year = quarter === 0 ? today.getFullYear() - 1 : today.getFullYear();
      return {
        start: new Date(year, lastQuarterStart, 1),
        end: new Date(year, lastQuarterStart + 3, 0, 23, 59, 59)
      };
    }

    case 'this_year':
      return {
        start: new Date(today.getFullYear(), 0, 1),
        end: new Date(today.getFullYear(), 11, 31, 23, 59, 59)
      };

    case 'last_year':
      return {
        start: new Date(today.getFullYear() - 1, 0, 1),
        end: new Date(today.getFullYear() - 1, 11, 31, 23, 59, 59)
      };

    default:
      return getDefaultDateRange();
  }
};

/**
 * Stored dates are compared against locally-built range bounds, so they must be
 * read as local days — the same rule the display formatters use. Sharing one
 * parser keeps a filtered list and the dates it renders in agreement.
 */
const parseComparableDate = parseDisplayDate;

export const filterByDateRange = <T extends { date?: string; created_at?: string | number; issue_date?: string }>(
  items: T[],
  dateRange: DateRange,
  dateField: keyof T = 'date' as keyof T
): T[] => {
  if (!dateRange.start || !dateRange.end) {
    return items;
  }

  return items.filter(item => {
    const itemDate = item[dateField] as string;
    if (!itemDate) return false;

    const date = parseComparableDate(itemDate);
    if (isNaN(date.getTime())) return false;

    return date >= dateRange.start && date <= dateRange.end;
  });
};

export const formatDateRangeLabel = (period: DateRangePeriod): string => {
  switch (period) {
    case 'today': return 'Today';
    case 'yesterday': return 'Yesterday';
    case 'this_week': return 'This Week';
    case 'last_week': return 'Last Week';
    case 'this_month': return 'This Month';
    case 'last_month': return 'Last Month';
    case 'this_quarter': return 'This Quarter';
    case 'last_quarter': return 'Last Quarter';
    case 'this_year': return 'This Year';
    case 'last_year': return 'Last Year';
    case 'custom': return 'Custom Range';
    default: return 'Unknown Period';
  }
};

export const dateRangeFilterOptions: ReadonlyArray<{ value: DateRangePeriod; label: string }> = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'custom', label: 'Custom Range' }
];