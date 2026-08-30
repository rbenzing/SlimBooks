import { type DateRange } from './filtering.util';

export type DateRangePeriod =
  | 'today' | 'yesterday'
  | 'this_week' | 'last_week'
  | 'this_month' | 'last_month'
  | 'this_quarter' | 'last_quarter'
  | 'this_year' | 'last_year'
  | 'custom';

/**
 * A calendar day built from local parts.
 *
 * Never `toISOString()`: that converts to UTC first, so for any positive offset
 * a local midnight becomes the previous day. Two report components shipped that
 * bug — a Berlin user asking for "this year" got a range starting 31 December.
 */
export const toCalendarDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const startOfDay = (year: number, month: number, day: number): Date =>
  new Date(year, month, day, 0, 0, 0, 0);

const endOfDay = (year: number, month: number, day: number): Date =>
  new Date(year, month, day, 23, 59, 59, 999);

/** The last instant of `today`, so a current period never reaches into the future. */
const throughToday = (today: Date): Date =>
  endOfDay(today.getFullYear(), today.getMonth(), today.getDate());

/**
 * Which fiscal year a date falls in, and how far into it.
 *
 * `fiscalYearStartMonth` is 1-12. The returned `year` is the calendar year the
 * fiscal year *starts* in; `monthIndex` is 0-11 counting from that start, so
 * month 0 is always the first month of the fiscal year whatever the start.
 */
const fiscalPosition = (
  date: Date,
  fiscalYearStartMonth: number
): { year: number; monthIndex: number } => {
  const startMonth = fiscalYearStartMonth - 1;
  const monthsSinceStart = date.getMonth() - startMonth;
  const year = monthsSinceStart < 0 ? date.getFullYear() - 1 : date.getFullYear();
  const monthIndex = (monthsSinceStart + 12) % 12;
  return { year, monthIndex };
};

/** The first day of the fiscal year that began in `fiscalStartYear`. */
const fiscalYearStart = (fiscalStartYear: number, fiscalYearStartMonth: number): Date =>
  startOfDay(fiscalStartYear, fiscalYearStartMonth - 1, 1);

/** The last day of that fiscal year: the day before the next one begins. */
const fiscalYearEnd = (fiscalStartYear: number, fiscalYearStartMonth: number): Date => {
  const nextStart = new Date(fiscalStartYear + 1, fiscalYearStartMonth - 1, 1);
  return endOfDay(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() - 1);
};

/** The first day of the fiscal quarter `quarterIndex` (0-3) of a fiscal year. */
const fiscalQuarterStart = (
  fiscalStartYear: number,
  fiscalYearStartMonth: number,
  quarterIndex: number
): Date => {
  const absoluteMonth = (fiscalYearStartMonth - 1) + quarterIndex * 3;
  return startOfDay(fiscalStartYear + Math.floor(absoluteMonth / 12), absoluteMonth % 12, 1);
};

const fiscalQuarterEnd = (
  fiscalStartYear: number,
  fiscalYearStartMonth: number,
  quarterIndex: number
): Date => {
  const next = fiscalQuarterStart(fiscalStartYear, fiscalYearStartMonth, quarterIndex + 1);
  return endOfDay(next.getFullYear(), next.getMonth(), next.getDate() - 1);
};

export const getDateRangeForPeriod = (
  period: DateRangePeriod,
  fiscalYearStartMonth: number,
  today: Date
): DateRange => {
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();

  switch (period) {
    case 'today':
      return { start: startOfDay(year, month, day), end: throughToday(today) };

    case 'yesterday': {
      const y = new Date(year, month, day - 1);
      return {
        start: startOfDay(y.getFullYear(), y.getMonth(), y.getDate()),
        end: endOfDay(y.getFullYear(), y.getMonth(), y.getDate())
      };
    }

    case 'this_week': {
      const weekStart = new Date(year, month, day - today.getDay());
      return {
        start: startOfDay(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()),
        end: throughToday(today)
      };
    }

    case 'last_week': {
      const weekStart = new Date(year, month, day - today.getDay() - 7);
      const weekEnd = new Date(year, month, day - today.getDay() - 1);
      return {
        start: startOfDay(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()),
        end: endOfDay(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate())
      };
    }

    case 'this_month':
      return { start: startOfDay(year, month, 1), end: throughToday(today) };

    case 'last_month': {
      const start = new Date(year, month - 1, 1);
      return {
        start: startOfDay(start.getFullYear(), start.getMonth(), 1),
        end: endOfDay(year, month, 0)
      };
    }

    case 'this_quarter': {
      const { year: fy, monthIndex } = fiscalPosition(today, fiscalYearStartMonth);
      const quarter = Math.floor(monthIndex / 3);
      return {
        start: fiscalQuarterStart(fy, fiscalYearStartMonth, quarter),
        end: throughToday(today)
      };
    }

    case 'last_quarter': {
      const { year: fy, monthIndex } = fiscalPosition(today, fiscalYearStartMonth);
      const quarter = Math.floor(monthIndex / 3) - 1;
      const targetYear = quarter < 0 ? fy - 1 : fy;
      const targetQuarter = quarter < 0 ? 3 : quarter;
      return {
        start: fiscalQuarterStart(targetYear, fiscalYearStartMonth, targetQuarter),
        end: fiscalQuarterEnd(targetYear, fiscalYearStartMonth, targetQuarter)
      };
    }

    case 'this_year': {
      const { year: fy } = fiscalPosition(today, fiscalYearStartMonth);
      return { start: fiscalYearStart(fy, fiscalYearStartMonth), end: throughToday(today) };
    }

    case 'last_year': {
      const { year: fy } = fiscalPosition(today, fiscalYearStartMonth);
      return {
        start: fiscalYearStart(fy - 1, fiscalYearStartMonth),
        end: fiscalYearEnd(fy - 1, fiscalYearStartMonth)
      };
    }

    case 'custom':
    default:
      return { start: startOfDay(year, month, 1), end: throughToday(today) };
  }
};

/**
 * How a fiscal year is named. A January year is just its calendar year; any
 * other start is named for the calendar year it ends in, which is the
 * convention a filer expects.
 */
export const fiscalYearLabel = (
  period: DateRangePeriod,
  fiscalYearStartMonth: number,
  today: Date
): string => {
  const { year: fy } = fiscalPosition(today, fiscalYearStartMonth);
  const startYear = period === 'last_year' ? fy - 1 : fy;
  return fiscalYearStartMonth === 1 ? String(startYear) : `FY${startYear + 1}`;
};

export const formatDateRangeLabel = (
  period: DateRangePeriod,
  fiscalYearStartMonth: number,
  today: Date
): string => {
  switch (period) {
    case 'today': return 'Today';
    case 'yesterday': return 'Yesterday';
    case 'this_week': return 'This Week';
    case 'last_week': return 'Last Week';
    case 'this_month': return 'This Month';
    case 'last_month': return 'Last Month';
    case 'this_quarter': return 'This Quarter';
    case 'last_quarter': return 'Last Quarter';
    case 'this_year': return fiscalYearStartMonth === 1
      ? 'This Year' : `This Year (${fiscalYearLabel('this_year', fiscalYearStartMonth, today)})`;
    case 'last_year': return fiscalYearStartMonth === 1
      ? 'Last Year' : `Last Year (${fiscalYearLabel('last_year', fiscalYearStartMonth, today)})`;
    case 'custom': return 'Custom Range';
    default: return 'Unknown Period';
  }
};

export const dateRangeFilterOptions: ReadonlyArray<{ value: DateRangePeriod; label: string }> = [
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'custom', label: 'Custom Range' }
];
