// Period bucketing for report breakdowns.
//
// Pure date arithmetic with no database or config dependencies, so the P&L
// column logic can be tested on its own. All maths is done in UTC: report dates
// and invoice issue dates are calendar dates ('2026-03-17'), and reparsing one
// through a local timezone can shift the day across a period boundary.
//
// Quarterly bucketing is fiscal-year-aware: `fiscalYearStartMonth` (1-12) has
// no default on either exported function, because a default is how one call
// site would silently keep calendar quarters while the rest of the report
// speaks fiscal ones. Monthly bucketing ignores it — a month is a month
// regardless of when the fiscal year starts.

export type BreakdownPeriod = 'monthly' | 'quarterly';

export interface PeriodBucket {
  /** Stable identifier, e.g. '2026-03' or '2026-Q1'. */
  key: string;
  /** Human label rendered as the column heading, e.g. 'Mar 2026' or 'Q1 2026'. */
  label: string;
  /** First calendar day of the period, inclusive (yyyy-MM-dd). */
  start: string;
  /** Last calendar day of the period, inclusive (yyyy-MM-dd). */
  end: string;
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
] as const;

/** Leading yyyy-MM-dd of a calendar date or ISO timestamp, as UTC parts. */
const toCalendarParts = (
  value: string | number | null | undefined
): { year: number; month: number } | null => {
  if (value === null || value === undefined || value === '') return null;

  // Two kinds of value reach here. A calendar-day column (`expenses.date`,
  // `invoices.issue_date`) is already `YYYY-MM-DD`. A timestamp column (the
  // `reports` table's `created_at`) is epoch milliseconds, and its bucket is
  // the UTC month — the same basis the day columns use, so the two reconcile
  // inside one report.
  const text =
    typeof value === 'number'
      ? (Number.isFinite(value) ? new Date(value).toISOString() : '')
      : value;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (!Number.isFinite(year) || month < 1 || month > 12) return null;

  return { year, month };
};

const pad = (value: number): string => String(value).padStart(2, '0');

/** Last calendar day of a month, leap years included. */
const lastDayOfMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Which fiscal year a calendar (year, month) position falls in, and how far
 * into it. Mirrors `fiscalPosition` in `src/utils/data/period.util.ts` — same
 * maths, worked in plain year/month integers (month 1-12) rather than a
 * `Date`, since these values come straight out of a parsed calendar string.
 *
 * `fiscalStartYear` is the calendar year the fiscal year *starts* in;
 * `monthIndex` is 0-11 counting from that start, so month 0 is always the
 * first month of the fiscal year whatever the start.
 */
const fiscalPosition = (
  year: number,
  month: number,
  fiscalYearStartMonth: number
): { fiscalStartYear: number; monthIndex: number } => {
  const startMonth0 = fiscalYearStartMonth - 1;
  const monthsSinceStart = (month - 1) - startMonth0;
  const fiscalStartYear = monthsSinceStart < 0 ? year - 1 : year;
  const monthIndex = (monthsSinceStart + 12) % 12;
  return { fiscalStartYear, monthIndex };
};

/** The calendar (year, month) the fiscal quarter containing this position starts in. */
const fiscalQuarterStartCalendar = (
  year: number,
  month: number,
  fiscalYearStartMonth: number
): { year: number; month: number } => {
  const { fiscalStartYear, monthIndex } = fiscalPosition(year, month, fiscalYearStartMonth);
  const quarterIndex = Math.floor(monthIndex / 3);
  const absoluteMonth = (fiscalYearStartMonth - 1) + quarterIndex * 3;
  return {
    year: fiscalStartYear + Math.floor(absoluteMonth / 12),
    month: (absoluteMonth % 12) + 1
  };
};

/**
 * The stable key for a quarter, in fiscal terms. A January fiscal year names
 * its quarters after the calendar year ('2026-Q3'); any other start names
 * them after the fiscal year, which is conventionally the calendar year the
 * fiscal year *ends* in ('FY2027-Q1').
 */
const fiscalQuarterKey = (
  fiscalStartYear: number,
  monthIndex: number,
  fiscalYearStartMonth: number
): string => {
  const quarter = Math.floor(monthIndex / 3) + 1;
  return fiscalYearStartMonth === 1
    ? `${fiscalStartYear}-Q${quarter}`
    : `FY${fiscalStartYear + 1}-Q${quarter}`;
};

/** The human-readable column heading for the same quarter (quarter first, to read as a heading). */
const fiscalQuarterLabel = (
  fiscalStartYear: number,
  monthIndex: number,
  fiscalYearStartMonth: number
): string => {
  const quarter = Math.floor(monthIndex / 3) + 1;
  return fiscalYearStartMonth === 1
    ? `Q${quarter} ${fiscalStartYear}`
    : `FY${fiscalStartYear + 1} Q${quarter}`;
};

/**
 * The period key a date belongs to, or null when the value cannot be placed.
 * Used to group records into the buckets produced by `buildPeriodBuckets`.
 */
export const periodKeyFor = (
  value: string | number | null | undefined,
  breakdownPeriod: BreakdownPeriod,
  fiscalYearStartMonth: number
): string | null => {
  const parts = toCalendarParts(value);
  if (!parts) return null;

  if (breakdownPeriod === 'monthly') {
    return `${parts.year}-${pad(parts.month)}`;
  }

  const { fiscalStartYear, monthIndex } = fiscalPosition(parts.year, parts.month, fiscalYearStartMonth);
  return fiscalQuarterKey(fiscalStartYear, monthIndex, fiscalYearStartMonth);
};

/**
 * Every calendar period the range touches, in order. A range that starts or
 * ends mid-period still yields that whole period, so columns line up with the
 * calendar rather than with arbitrary range edges.
 *
 * Returns an empty array for an inverted or unparseable range.
 */
export const buildPeriodBuckets = (
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  breakdownPeriod: BreakdownPeriod,
  fiscalYearStartMonth: number
): PeriodBucket[] => {
  const from = toCalendarParts(startDate);
  const to = toCalendarParts(endDate);

  if (!from || !to) return [];

  const step = breakdownPeriod === 'monthly' ? 1 : 3;

  // Snap the start back to the beginning of its period — the calendar month
  // for monthly bucketing, the *fiscal* quarter for quarterly.
  const { year: firstYear, month: firstMonth } = breakdownPeriod === 'monthly'
    ? { year: from.year, month: from.month }
    : fiscalQuarterStartCalendar(from.year, from.month, fiscalYearStartMonth);

  const startIndex = firstYear * 12 + (firstMonth - 1);
  const endIndex = to.year * 12 + (to.month - 1);

  if (endIndex < startIndex) return [];

  const buckets: PeriodBucket[] = [];

  for (let index = startIndex; index <= endIndex; index += step) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;

    // The bucket's last month, expressed as the same linear index so a
    // quarter starting in November or December rolls into the next calendar
    // year correctly instead of overflowing into a month 13 or 14.
    const endLinearIndex = breakdownPeriod === 'monthly' ? index : index + 2;
    const endYear = Math.floor(endLinearIndex / 12);
    const endMonth = (endLinearIndex % 12) + 1;

    const label = breakdownPeriod === 'monthly'
      ? `${MONTH_LABELS[month - 1]} ${year}`
      : (() => {
          const { fiscalStartYear, monthIndex } = fiscalPosition(year, month, fiscalYearStartMonth);
          return fiscalQuarterLabel(fiscalStartYear, monthIndex, fiscalYearStartMonth);
        })();

    buckets.push({
      key: periodKeyFor(`${year}-${pad(month)}-01`, breakdownPeriod, fiscalYearStartMonth)!,
      label,
      start: `${year}-${pad(month)}-01`,
      end: `${endYear}-${pad(endMonth)}-${pad(lastDayOfMonth(endYear, endMonth))}`
    });
  }

  return buckets;
};
