/**
 * The one timestamp shape this application stores, sends and compares.
 *
 * ## The format
 *
 * `YYYY-MM-DDTHH:MM:SSZ` — ISO 8601, UTC, whole seconds, always exactly 20
 * characters. Calendar days (due dates, issue dates, the `date` on a payment or
 * expense) are `YYYY-MM-DD` and stay that way: a due date is a day, not an
 * instant, and giving it a time would invent information.
 *
 * ## Why one shape at all
 *
 * These columns are TEXT on both backends, so every comparison is
 * lexicographic. Two shapes in one column therefore compare wrongly:
 * `2026-08-12T01:00:00.000Z` and `2026-08-12 23:00:00` were both written by
 * this application, and the second sorts *before* the first because a space is
 * below `T` in ASCII — so a "created in the last hour" window silently returned
 * the wrong rows. Fixed width matters for the same reason: with seconds always
 * present, string order is time order, which is what the indexes on these
 * columns are for.
 *
 * ## Why this shape and not `YYYY-MM-DD HH:MM:SS`
 *
 * The SQL spelling is what both backends' column defaults produced, so it was
 * the smaller change. It is also not a format JavaScript can parse: the
 * standard covers `2026-08-12T13:54:13Z` and says nothing about the space form,
 * so `new Date('2026-08-12 13:54:13')` is implementation-defined and V8 reads
 * it as *local* time. Every timestamp would then display shifted by the
 * viewer's offset, and no test written in UTC would ever catch it. The database
 * moves to the format its only consumer can read, rather than the other way
 * round.
 *
 * ## Rendering
 *
 * Nothing here formats for display. The stored value is an instant; turning it
 * into a wall clock is the browser's job, done against the user's date/time
 * settings in `src/utils/formatting/date.util.ts`.
 *
 * No project imports, so it loads standalone under Vitest.
 */

/** Length of a canonical timestamp: `2026-08-12T13:54:13Z`. */
const TIMESTAMP_LENGTH = 20;

/** `YYYY-MM-DDTHH:MM:SSZ`, in UTC. */
export const utcTimestamp = (moment: Date): string =>
  `${moment.toISOString().slice(0, 19)}Z`;

/** The current instant, in the shape every timestamp column holds. */
export const utcNow = (): string => utcTimestamp(new Date());

/** `YYYY-MM-DD`, in UTC — the shape every calendar-day column holds. */
export const utcCalendarDay = (moment: Date): string => moment.toISOString().slice(0, 10);

/**
 * A timestamp `days` before `from`, in the same shape.
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
): string => {
  const whole = Number.isFinite(days) ? Math.abs(Math.trunc(days)) : fallbackDays;

  return utcTimestamp(new Date(from.getTime() - whole * 24 * 60 * 60 * 1000));
};

const CALENDAR_DAY = /^(\d{4}-\d{2}-\d{2})$/;

/** `2026-08-12T13:54:13`, with or without fractional seconds and a `Z`. */
const ISO_LIKE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?Z?$/;

/**
 * Rewrite a stored timestamp into the canonical shape, or null if it is already
 * canonical or is not a timestamp at all.
 *
 * Null means "leave this row alone", which keeps migration 014 from writing
 * every row on every boot and keeps it from mangling a value it does not
 * understand. Four shapes are recognised, all of which this application has
 * written at some point:
 *
 *   2026-08-12T13:54:13.241Z   `new Date().toISOString()`
 *   2026-08-12 13:54:13        `datetime('now')` and the MySQL equivalent
 *   2026-08-12T13:54:13        an offset-less ISO string, read as UTC
 *   2026-08-12                 a bare day in a timestamp column, read as its
 *                              first instant so it still sorts before that day
 *
 * Anything else falls through to `Date` parsing, which covers a value carrying
 * a real offset (`+05:00`). Note the order: the space form has to be caught by
 * the pattern above, because `Date` would read it as local time.
 */
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

  return utcTimestamp(parsed);
};

/**
 * Rewrite a stored calendar day into `YYYY-MM-DD`, or null if it already is.
 *
 * A full timestamp is narrowed to its UTC day. That is a real decision: seeded
 * due dates were written as `new Date(…).toISOString()`, so their day depended
 * on the reader's timezone and could show as the 11th or the 12th for the same
 * invoice. Fixing it on the UTC day makes it the same day for everyone, which
 * is what a due date is.
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

/** Whether a value is already a canonical timestamp. */
export const isUtcTimestamp = (value: unknown): boolean =>
  typeof value === 'string' &&
  value.length === TIMESTAMP_LENGTH &&
  ISO_LIKE.test(value) &&
  value.endsWith('Z') &&
  value[10] === 'T';

/**
 * The canonical form of a caller-supplied timestamp, or null if it is not one.
 *
 * Use this on anything arriving from outside — a request body, a webhook, a CSV
 * import. `normalizeUtcTimestamp` answers "does this row need rewriting", which
 * is a different question: it returns null for a value that is already
 * canonical, and that null must not be read as "unusable".
 */
export const asUtcTimestamp = (value: unknown): string | null =>
  isUtcTimestamp(value) ? (value as string) : normalizeUtcTimestamp(value);
