/**
 * Instants, and the calendar days that are not instants.
 *
 * ## The two kinds of value
 *
 *   an instant     epoch milliseconds, an integer — `created_at`, expiries,
 *                  `last_login`, everything named `*_at`
 *   a calendar day `YYYY-MM-DD` text — due dates, issue dates, the `date` on a
 *                  payment or expense
 *
 * A due date is a day. It is the 12th in Auckland and the 12th in Los Angeles,
 * and encoding it as an instant would force a midnight in some timezone and
 * show half the world the 11th. So days stay text, and SQLite having no DATE
 * type is not the reason — it is merely why MySQL cannot have one either.
 *
 * ## Why integers for instants
 *
 * These columns were TEXT, and text has a format. Two formats lived in them at
 * once — `2026-08-12T13:54:13.241Z` from `toISOString()` and `2026-08-12
 * 13:54:13` from the column defaults — and because the comparison is
 * lexicographic and a space sorts below `T`, a window query spanning both
 * returned the wrong rows. 2.1.1 fixed that by convention and two tests that
 * enforce it. An integer column enforces it instead: there is no second way to
 * write a number.
 *
 * A pleasant consequence: precision no longer has to match. Second-granularity
 * and millisecond-granularity values sort against each other correctly, which
 * is not true of text, where a change in precision changes the width and breaks
 * the ordering. It happens that both backends produce milliseconds anyway.
 *
 * ## Rendering
 *
 * Nothing here formats for display. An instant becomes a wall clock in the
 * browser, against the viewer's timezone and their chosen format, in
 * `src/utils/formatting/date.util.ts`.
 *
 * No project imports, so it loads standalone under Vitest.
 */

/** The current instant, as every timestamp column stores it. */
export const utcNow = (): number => Date.now();

/** A `Date` as epoch milliseconds. */
export const utcTimestamp = (moment: Date): number => moment.getTime();

/** `YYYY-MM-DD` in UTC — the shape every calendar-day column holds. */
export const utcCalendarDay = (moment: Date): string => moment.toISOString().slice(0, 10);

/**
 * The UTC calendar day a stored instant falls on.
 *
 * For turning `created_at` (epoch milliseconds) into the honest fallback for a
 * day column that was never given a value of its own — migration 016 backfills
 * `invoices.issue_date` this way, and `InvoiceService.createInvoice` defaults a
 * new row to it rather than writing null. UTC, like every other day derived
 * here: a due date is the 12th everywhere, not just for whichever timezone
 * happened to compute it.
 */
export const epochToCalendarDay = (epochMillis: number): string => utcCalendarDay(new Date(epochMillis));

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * An instant `days` before `from`.
 *
 * This exists so a caller-supplied window can be a bound parameter. SQLite
 * would accept `datetime('now', ?)`, but MySQL cannot bind an INTERVAL quantity
 * at all — `INTERVAL ? DAY` is a syntax error — so the alternative would be
 * splicing the number into the statement, which costs a prepared-statement
 * cache entry per distinct window and puts caller input in the query text.
 *
 * @param days Whole, non-negative. A caller passing anything else gets the
 *             fallback rather than a window reaching into the future.
 * @param fallbackDays Used when `days` is not a usable number.
 */
export const utcTimestampDaysAgo = (
  days: number,
  from: Date = new Date(),
  fallbackDays = 30
): number => {
  const whole = Number.isFinite(days) ? Math.abs(Math.trunc(days)) : fallbackDays;

  return from.getTime() - whole * MILLIS_PER_DAY;
};

/** Whether a value is usable as a stored instant. */
export const isEpochMillis = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);

const CALENDAR_DAY = /^(\d{4}-\d{2}-\d{2})$/;

/**
 * The leading `YYYY-MM-DD` of a day or a timestamp, if it names a real day.
 *
 * `Date.parse('2026-02-30T00:00:00Z')` does not fail — V8 rolls the date
 * forward and hands back 2 March. A range edge that quietly moved to another
 * month would put invoices in the wrong report and nothing would say so, hence
 * the round-trip check.
 */
const leadingDay = (value: string): string | null => {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (!match) return null;

  const day = match[1]!;
  const parsed = Date.parse(`${day}T00:00:00.000Z`);

  if (Number.isNaN(parsed)) return null;

  return new Date(parsed).toISOString().slice(0, 10) === day ? day : null;
};

/**
 * The instant bounds of a calendar day, for querying a timestamp column.
 *
 * A report range is a pair of days — the user picked `2026-01-01` to
 * `2026-01-31` — and every column it filters on is now epoch milliseconds.
 * Comparing the two directly is not a type error in either engine, it is a
 * wrong-answer bug: SQLite orders every number below every string, so
 * `created_at >= '2026-01-01'` is false for every row; MySQL coerces the string
 * to the number 2026, so the same predicate is true for every row. Neither
 * reports a problem. Convert the edges instead.
 *
 * The end bound is the last millisecond of its day, so the range includes the
 * day the user named rather than stopping at its midnight.
 *
 * A malformed or impossible day (`2026-02-30`) yields null; callers decide
 * whether that is an empty result or an error.
 */
export const utcDayStart = (day: string): number | null => {
  const part = typeof day === 'string' ? leadingDay(day) : null;
  if (part === null) return null;

  const parsed = Date.parse(`${part}T00:00:00.000Z`);

  return Number.isNaN(parsed) ? null : parsed;
};

/** The last instant of a calendar day; see `utcDayStart`. */
export const utcDayEnd = (day: string): number | null => {
  const part = typeof day === 'string' ? leadingDay(day) : null;
  if (part === null) return null;

  const parsed = Date.parse(`${part}T23:59:59.999Z`);

  return Number.isNaN(parsed) ? null : parsed;
};

/** `2026-08-12T13:54:13`, with or without fractional seconds and a `Z`. */
const ISO_LIKE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?Z?$/;

/**
 * Coerce a value from outside into a stored instant, or null if it is not one.
 *
 * Use this on anything the application did not produce itself — a request body,
 * a Stripe webhook, a CSV import, a restored dump. The column is an integer, so
 * a stray value cannot corrupt the *format* any more; it can still be the wrong
 * instant, which is what the text shapes below are for.
 *
 * Note the order. The space-separated form has to be recognised before `Date`
 * sees it: that shape is outside the ECMAScript grammar, so `Date` falls back
 * to implementation-defined parsing and V8 reads it as *local* time — every
 * value would shift by the host's offset. A bare day is read as its first
 * instant, so it still orders before anything else on that day.
 */
export const toEpochMillis = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  // A stored integer that has been round-tripped through JSON or a TEXT column.
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);

  const day = CALENDAR_DAY.exec(trimmed);
  if (day) return Date.parse(`${day[1]}T00:00:00Z`);

  const isoLike = ISO_LIKE.exec(trimmed);
  if (isoLike) return Date.parse(`${isoLike[1]}T${isoLike[2]}Z`);

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Rewrite a stored calendar day into `YYYY-MM-DD`, or null if it already is.
 *
 * A full timestamp is narrowed to its UTC day. That is a real decision: seeded
 * due dates were once written as `new Date(…).toISOString()`, so their day
 * depended on the reader's timezone and could show as the 11th or the 12th for
 * the same invoice. Fixing it on the UTC day makes it the same day for
 * everyone, which is what a due date is.
 */
export const normalizeCalendarDay = (value: unknown): string | null => {
  const timestamp = typeof value === 'string' ? value.trim() : '';
  if (timestamp.length === 0) return null;

  if (CALENDAR_DAY.test(timestamp)) return null;

  const leading = /^(\d{4}-\d{2}-\d{2})[T ]/.exec(timestamp);
  if (leading) return leading[1]!;

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;

  return utcCalendarDay(parsed);
};

/**
 * The text timestamp helpers, kept for migration 014.
 *
 * 014 rewrote one text shape into another and shipped in 2.1.1, so it is
 * recorded as applied on upgraded databases and cannot be edited away —
 * a migration is history. Migration 015 converts those columns to integers,
 * after which nothing else here uses these.
 */

/** Render a `Date` as `YYYY-MM-DDTHH:MM:SSZ`, the shape 2.1.1 stored. */
export const utcTimestampText = (moment: Date): string =>
  `${moment.toISOString().slice(0, 19)}Z`;

/** Rewrite a stored text timestamp into 2.1.1's shape, or null if it already is. */
export const normalizeUtcTimestamp = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const day = CALENDAR_DAY.exec(trimmed);
  if (day) return `${day[1]}T00:00:00Z`;

  const isoLike = ISO_LIKE.exec(trimmed);
  if (isoLike) {
    const canonical = `${isoLike[1]}T${isoLike[2]}Z`;
    return canonical === trimmed ? null : canonical;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  return utcTimestampText(parsed);
};
