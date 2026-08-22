# ADR-0008: Dialect differences live in `SqlDialect`, never at the call site

**Status:** Accepted
**Date:** 2026-08-12 (shipped in 2.1.0)

## Context

SQLite and MySQL disagree about a small, fixed set of things: how you spell
"now", how you format a month, how you write an upsert, how you ask what
columns a table has, whether a partial index exists, whether a trigger may
update its own table.

The tempting fix at each site is a conditional — `if (driver === 'mysql')`.
Done in fifty places, that is fifty opportunities to handle one backend and
forget the other, and the forgotten one fails only on a host the developer does
not have.

## Decision

Every difference is a method or a flag on the `SqlDialect` interface, exposed
as `db.dialect`. Call sites ask the dialect; they never branch on the driver
name.

The surface includes `now()`, `today()`, `epochFromStored(column)`,
`nowMinus(count, unit)`, `todayMinus(count, unit)`, `formatMonth(column)`,
`formatYear(column)`, `insertIgnore(table, columns)`,
`insertOrReplace(table, columns)`, `columnsOf(db, table)`, the
`deferForeignKeys` / `restoreForeignKeys` statements, and the capability flags
`supportsPartialIndex` and `supportsSelfUpdatingTrigger`.

`dialect` is a property of `IDatabase` rather than a module-level import, so a
caller holding an `IDatabase` always has the spelling for the database it is
actually talking to — including inside a test that swaps the implementation.

## Consequences

- Adding a backend means implementing one interface, not auditing every query.
- A difference discovered late is fixed once. When MySQL 8.4's strict
  `sql_mode` rejected `2026-08-12T13:54:13Z` as a datetime literal, the fix was
  one method — `epochFromStored` now strips the `T` and `Z` before converting.
- Capability flags express real asymmetries honestly: **MySQL cannot have a
  trigger that updates its own table**, so `update_expenses_timestamp` is
  SQLite-only and every UPDATE writes `updated_at` explicitly.
- Some things are not the dialect's job and must be handled everywhere: `key`
  is a reserved word in MySQL and is a column in `settings`,
  `project_settings` and `stored_objects`, so it is always backticked.
  `reservedWords.test.ts` enforces it.
- `REAL` maps to `DOUBLE`, never `DECIMAL` — see
  [ADR-0012](0012-money-precision-deferred.md) for why that is deliberate.
- Query parameters are typed across both backends —
  `SQLParameter = string | number | null | boolean | Buffer` — so a call site
  cannot pass something only one driver accepts.
