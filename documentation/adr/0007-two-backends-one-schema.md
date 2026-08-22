# ADR-0007: Two database backends, one schema

**Status:** Accepted
**Date:** 2026-08-12 (shipped in 2.1.0)

## Context

SQLite is the right default for a self-hosted invoicing app: no server to run,
no credentials to manage, and the whole database is one file you can copy.

It is the wrong choice on a host whose filesystem is wiped on every deploy.
Hostinger's Node cloud is one; there, a SQLite install loses every invoice,
client and payment on the next deploy. That is architectural — no start command
or volume setting fixes it — so those hosts need a networked database.

Supporting two backends invites two schemas that drift, and a drifted schema
fails at runtime on whichever backend was not the developer's.

## Decision

One logical schema, two ways of arriving at it.

- **SQLite replays migrations.** It is the historical path, and migrations
  001–013 are SQLite archaeology full of `PRAGMA`.
- **MySQL is built once** from `tables.schema.ts` by `baseline.ts`. The
  migration history is then recorded as applied *without running*, because
  replaying SQLite-specific archaeology against MySQL is meaningless.

`DB_DRIVER` selects the backend: `sqlite` (default) or `mysql`. MariaDB is
supported through the same driver.

Because nothing forces the two paths to agree, **the schema-drift test in
`server/database/index.test.ts` is load-bearing.** It compares what migrations
produce against what `tables.schema.ts` declares.

## Consequences

- `tables.schema.ts` is the only thing that builds tables. A new table must be
  added there or the drift test fails.
- New migrations must be dialect-neutral: no `PRAGMA`, use `dialect.columnsOf()`.
  See [ADR-0008](0008-dialect-differences-in-one-place.md).
- **A shipped migration is history, but it still runs on fresh installs.**
  Migration 003 seeds the default template, and it aborted the boot of every
  new install once `created_at` became an integer, because it was still writing
  `datetime('now')`. Editing a shipped migration is sometimes required; skipping
  the check is never safe.
- Anything database-shaped must be tested against both engines. CI runs MySQL
  and MariaDB on every push.
- MySQL requires 8.0.13+ or MariaDB 10.2+ (older servers cannot give a column
  an expression default, which every `created_at` uses) and InnoDB (MyISAM
  ignores transactions silently). Both are checked at boot.
- Moving between backends is an explicit export/import, not a live sync. See
  [database backends](../operations/database-backends.md).
