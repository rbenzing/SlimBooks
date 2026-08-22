# ADR-0010: A calendar day is not an instant

**Status:** Accepted
**Date:** 2026-08-12 (shipped in 2.2.0)

## Context

A due date is a day. It is the 12th in Auckland and the 12th in Los Angeles.
Encoding it as an instant forces a midnight in some timezone, and shows half
the world the 11th.

Seeded due dates were once written with `new Date(…).toISOString()`, so the day
an invoice was due depended on who was looking at it.

## Decision

Calendar days are `YYYY-MM-DD` text, in a separate class from instants:

`due_date`, `issue_date`, `paid_date`, `next_due_date`, `recurring_period_date`,
`next_invoice_date`, `date`, `date_range_start`, `date_range_end`.

**Never bind a day against a timestamp column.** Convert the edges with
`utcDayStart()` and `utcDayEnd()` from `server/utils/utcTime.util.ts`.

## Consequences

- **Mixing the two is a wrong-answer bug, not a type error, and it fails
  differently on each engine.** SQLite orders every number below every string,
  so `created_at >= '2026-01-01'` is false for every row. MySQL coerces the
  string to the number 2026, so the same predicate is true for every row.
  Neither reports a problem.

  This shipped. Reports bound calendar-day range edges against epoch columns at
  four sites in `ReportService` and returned empty results — and a unit test
  was asserting the broken bound and passing.

- `utcDayEnd()` returns the last millisecond of its day, so a range includes
  the day the user named rather than stopping at its midnight.
- Both helpers round-trip the parsed day and reject it if it moved, because
  **`Date.parse('2026-02-30T00:00:00Z')` does not fail** — V8 rolls it forward
  to 2 March. A range edge that quietly moved to another month would put
  invoices in the wrong report and nothing would say so.
- A malformed day yields `null`; the caller decides whether that is an empty
  result or an error.
- On the frontend, `parseDisplayDate` is the only correct stored-value → `Date`
  conversion: a bare `yyyy-MM-dd` is a local day, anything else a UTC instant.
- SQLite having no `DATE` type is not the reason for this decision. It is
  merely why MySQL cannot have one either — see
  [ADR-0007](0007-two-backends-one-schema.md).
