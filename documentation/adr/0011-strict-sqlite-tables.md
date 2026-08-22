# ADR-0011: SQLite tables are STRICT

**Status:** Accepted
**Date:** 2026-08-12 (shipped in 2.2.0)

## Context

In an ordinary SQLite table, column types are advisory. An `INTEGER` column
accepts the string `'2026-08-12T13:54:13Z'` and stores it as text, silently.

That is exactly the failure [ADR-0009](0009-instants-as-epoch-milliseconds.md)
was meant to end. Converting the columns to `INTEGER` without `STRICT` would
have declared an intent the database did not enforce, leaving the same mixed
storage possible and the same class of bug available.

## Decision

Tables created by `tables.schema.ts` are `STRICT`.

Two tables are excluded, because they must be created identically on both
backends and use types `STRICT` rejects: `migrations` and `boot_locks`, which
declare `VARCHAR` and `BIGINT`.

## Consequences

- An `INTEGER` column now rejects a timestamp string outright, at the engine.
- **STRICT converts before it refuses.** A numeric string is coerced, not
  rejected: `'100.50'` into a `REAL` column stores as `100.5`, and
  `'1786496400000'` into an `INTEGER` column stores as the integer. Only a
  genuinely non-numeric value errors. This is why enabling STRICT did not
  require an API-wide sanitiser sweep — the existing validators reject bad
  input without converting good input.
- STRICT permits only `INT`, `INTEGER`, `REAL`, `TEXT`, `BLOB` and `ANY`.
  Anything else in a new table is a boot failure, which is the desired outcome.
- Enabling it caught a real defect immediately: migration 003 seeds the default
  template with `datetime('now')`, which under STRICT aborted the boot of every
  fresh install.
- SQLite cannot `DROP COLUMN` a column named in a constraint, so retyping
  rebuilds the table (the pattern is in migration 008).
