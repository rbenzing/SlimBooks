/**
 * UTC timestamps in the shape both backends store.
 *
 * `datetime('now')` and MySQL's `DATE_FORMAT(UTC_TIMESTAMP(),…)` both yield
 * `YYYY-MM-DD HH:MM:SS`, and the columns holding them are TEXT, so comparisons
 * are lexicographic. A cutoff computed here must therefore be rendered in
 * exactly that shape or it compares against a different format and silently
 * matches the wrong rows.
 *
 * This exists so a caller-supplied time window can be a bound parameter.
 * SQLite would accept `datetime('now', ?)`, but MySQL cannot bind an INTERVAL
 * quantity at all — `INTERVAL ? DAY` is a syntax error — so the alternative
 * would be splicing the number into the statement, which costs a
 * prepared-statement cache entry per distinct window and puts caller input in
 * the query text.
 *
 * No project imports, so it loads standalone under Vitest.
 */

/** Render a Date as `YYYY-MM-DD HH:MM:SS` in UTC. */
export const sqlTimestamp = (moment: Date): string =>
  moment.toISOString().replace('T', ' ').slice(0, 19);

/**
 * A timestamp `days` before `from`, in the same shape.
 *
 * @param days Whole, non-negative. A caller passing anything else gets the
 *             fallback rather than a window reaching into the future.
 * @param fallbackDays Used when `days` is not a usable number.
 */
export const sqlTimestampDaysAgo = (
  days: number,
  from: Date = new Date(),
  fallbackDays = 30
): string => {
  const whole = Number.isFinite(days) ? Math.abs(Math.trunc(days)) : fallbackDays;

  return sqlTimestamp(new Date(from.getTime() - whole * 24 * 60 * 60 * 1000));
};
