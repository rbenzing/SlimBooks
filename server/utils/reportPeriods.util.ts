// Period bucketing for report breakdowns.
//
// Pure date arithmetic with no database or config dependencies, so the P&L
// column logic can be tested on its own. All maths is done in UTC: report dates
// are calendar dates ('2026-03-17') and invoice timestamps are ISO strings, and
// reparsing either through a local timezone can shift the day across a period
// boundary.

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

  // Two kinds of value reach here. A calendar-day column (`expenses.date`) is
  // already `YYYY-MM-DD`. A timestamp column (`invoices.created_at`) is epoch
  // milliseconds, and its bucket is the UTC month — the same basis the day
  // columns use, so the two reconcile inside one report.
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
 * The period key a date belongs to, or null when the value cannot be placed.
 * Used to group records into the buckets produced by `buildPeriodBuckets`.
 */
export const periodKeyFor = (
  value: string | number | null | undefined,
  breakdownPeriod: BreakdownPeriod
): string | null => {
  const parts = toCalendarParts(value);
  if (!parts) return null;

  if (breakdownPeriod === 'monthly') {
    return `${parts.year}-${pad(parts.month)}`;
  }

  return `${parts.year}-Q${Math.floor((parts.month - 1) / 3) + 1}`;
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
  breakdownPeriod: BreakdownPeriod
): PeriodBucket[] => {
  const from = toCalendarParts(startDate);
  const to = toCalendarParts(endDate);

  if (!from || !to) return [];

  const step = breakdownPeriod === 'monthly' ? 1 : 3;

  // Snap the start back to the beginning of its period.
  const firstMonth = breakdownPeriod === 'monthly'
    ? from.month
    : Math.floor((from.month - 1) / 3) * 3 + 1;

  const startIndex = from.year * 12 + (firstMonth - 1);
  const endIndex = to.year * 12 + (to.month - 1);

  if (endIndex < startIndex) return [];

  const buckets: PeriodBucket[] = [];

  for (let index = startIndex; index <= endIndex; index += step) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    const endMonth = breakdownPeriod === 'monthly' ? month : month + 2;

    buckets.push({
      key: periodKeyFor(`${year}-${pad(month)}-01`, breakdownPeriod)!,
      label: breakdownPeriod === 'monthly'
        ? `${MONTH_LABELS[month - 1]} ${year}`
        : `Q${Math.floor((month - 1) / 3) + 1} ${year}`,
      start: `${year}-${pad(month)}-01`,
      end: `${year}-${pad(endMonth)}-${pad(lastDayOfMonth(year, endMonth))}`
    });
  }

  return buckets;
};
