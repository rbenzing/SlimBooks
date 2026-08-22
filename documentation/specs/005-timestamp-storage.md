# Spec 005: Timestamp storage

**Status:** Shipped in 2.2.0

## Purpose

Give the application one unambiguous representation for a moment in time and a
separate one for a calendar day, enforced by the database rather than by
convention.

## The two kinds of value

| Kind | Storage | Examples |
|---|---|---|
| **Instant** | Epoch milliseconds, an integer (`INTEGER` / `BIGINT`) | `created_at`, `updated_at`, `last_login`, token expiries — everything named `*_at` |
| **Calendar day** | `YYYY-MM-DD` text | `due_date`, `issue_date`, `paid_date`, `next_due_date`, `recurring_period_date`, `next_invoice_date`, `date`, `date_range_start`, `date_range_end` |

A due date is a day: the 12th in Auckland and the 12th in Los Angeles
([ADR-0010](../adr/0010-calendar-days-are-not-instants.md)). An instant is a
point on the line, stored in UTC
([ADR-0009](../adr/0009-instants-as-epoch-milliseconds.md)).

## Contract

`server/utils/utcTime.util.ts` is the only place that converts between them. It
imports nothing from the project, so it loads standalone under Vitest.

| Function | Returns |
|---|---|
| `utcNow()` | The current instant |
| `utcTimestamp(date)` | A `Date` as epoch milliseconds |
| `utcCalendarDay(date)` | `YYYY-MM-DD` in UTC |
| `utcTimestampDaysAgo(days, from?, fallbackDays?)` | An instant *n* days back, as a bindable parameter |
| `isEpochMillis(value)` | Whether a value is usable as a stored instant |
| `utcDayStart(day)` / `utcDayEnd(day)` | The first and last instant of a day, or `null` |
| `toEpochMillis(value)` | Coerce foreign input to an instant, or `null` |
| `normalizeCalendarDay(value)` | Narrow a timestamp to its UTC day, or `null` if already a day |

In SQL, write instants with `dialect.now()`.

## Invariants

1. **Never `toISOString()` into a column.** `portableSql.test.ts` enforces it.
2. **Never bind a calendar day against a timestamp column.** Use `utcDayStart()`
   / `utcDayEnd()`. A third guard in `portableSql.test.ts` forbids literal
   `T00:00:00` / `T23:59:59` strings outside `utcTime.util.ts`.
3. **The server never formats a date for display.** Formatting belongs to the
   browser, in `src/utils/formatting/date.util.ts`.
4. **`utcDayEnd()` is the last millisecond of the day**, so a range includes the
   day the user named.
5. **An impossible day yields `null`.** Both bound helpers round-trip the parsed
   day and reject it if it moved, because `Date.parse('2026-02-30T00:00:00Z')`
   does not fail — V8 rolls it to 2 March.
6. **`toEpochMillis()` recognises the space-separated form before `Date` sees
   it.** That shape is outside the ECMAScript grammar, so V8 falls back to
   implementation-defined parsing and reads it as *local* time, shifting every
   value by the host's offset.

## Failure modes this prevents

- **Mixed text formats.** Columns held both `2026-08-12T13:54:13.241Z` and
  `2026-08-12 13:54:13`. Text compares lexicographically and a space sorts
  below `T`, so a window query spanning both returned the wrong rows.
- **Day-against-instant binding.** Silent and opposite per engine: SQLite
  matches nothing, MySQL matches everything. This shipped, and returned empty
  reports.
- **Text in an integer column.** Prevented at the engine by
  [ADR-0011](../adr/0011-strict-sqlite-tables.md).

## Migration

Migration 015 converts existing columns. It is idempotent and resumes correctly
if interrupted.

Legacy text is spelled MySQL's way before conversion: `2026-08-12T13:54:13Z` is
not a datetime literal to MySQL, and under 8.4's strict `sql_mode` it errors and
aborts the migration, so the `T` and `Z` are stripped first.

## Compatibility

Two consequences at the 2.2.0 boundary:

- **The API sends these fields as JSON numbers.** The bundled UI is updated;
  any other consumer needs the same change.
- **A dump taken with 2.1.x will not import.** `TRANSFER_VERSION` is 2; export
  again with 2.2.0.
