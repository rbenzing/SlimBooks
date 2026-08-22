# ADR-0009: An instant is epoch milliseconds, stored as an integer

**Status:** Accepted
**Date:** 2026-08-12 (shipped in 2.2.0)

## Context

Timestamp columns were `TEXT`, and text has a format. Two formats lived in
them at once:

- `2026-08-12T13:54:13.241Z` — written by `toISOString()` in application code
- `2026-08-12 13:54:13` — written by the column defaults

Text comparison is lexicographic, and a space sorts below `T`. A window query
spanning rows of both shapes therefore returned the wrong rows. Version 2.1.1
fixed that by convention plus two tests that enforced the convention — which
works exactly as long as nobody writes the other shape again.

## Decision

An instant is **epoch milliseconds, an integer**: `INTEGER` in SQLite, `BIGINT`
in MySQL.

- Write via `utcNow()` in application code, or `dialect.now()` in SQL.
- Coerce anything from outside — a request body, a webhook, a CSV import, a
  restored dump — with `toEpochMillis()`.
- **Never `toISOString()` into a column.** `portableSql.test.ts` enforces it.

Storage is UTC. Formatting is the browser's job, in
`src/utils/formatting/date.util.ts`. The server never formats a date for
display.

## Consequences

- The column type enforces what convention could not: there is no second way
  to write a number.
- Precision no longer has to match. Second-granularity and
  millisecond-granularity values sort against each other correctly, which is
  not true of text — where a change in precision changes the width and breaks
  the ordering.
- **The API sends these fields as JSON numbers.** The bundled UI was updated;
  any other consumer of the API needed the same change at 2.2.0.
- Epoch milliseconds are around 1.7 × 10¹², far below 2⁵³, so the mysql2
  driver returning `BIGINT` as a JS number is safe here.
- Upgrading converts existing rows on first boot. The conversion is idempotent
  and resumes correctly if interrupted.
- **Legacy text must be spelled MySQL's way before conversion.**
  `2026-08-12T13:54:13Z` is not a datetime literal to MySQL; under 8.4's strict
  `sql_mode` it errors and aborts the migration. Strip the `T` and `Z` first.
- This applies to instants only. Calendar days are a different type — see
  [ADR-0010](0010-calendar-days-are-not-instants.md).
