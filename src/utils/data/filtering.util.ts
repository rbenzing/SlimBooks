import { parseDisplayDate } from '@/utils/formatting/date.util';

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Stored dates are compared against locally-built range bounds, so they must be
 * read as local days — the same rule the display formatters use. Sharing one
 * parser keeps a filtered list and the dates it renders in agreement.
 */
const parseComparableDate = parseDisplayDate;

export const filterByDateRange = <T extends { date?: string; created_at?: number; issue_date?: string }>(
  items: T[],
  dateRange: DateRange,
  dateField: keyof T = 'date' as keyof T
): T[] => {
  if (!dateRange.start || !dateRange.end) {
    return items;
  }

  return items.filter(item => {
    // Either kind of value: `date` and `issue_date` are calendar days, and
    // `created_at` is epoch milliseconds. parseDisplayDate reads both.
    const itemDate = item[dateField] as string | number;
    if (!itemDate) return false;

    const date = parseComparableDate(itemDate);
    if (isNaN(date.getTime())) return false;

    return date >= dateRange.start && date <= dateRange.end;
  });
};
