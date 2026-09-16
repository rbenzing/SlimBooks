# ADR-0021: Scheduled backups produce the portable dump, not a file copy

**Status:** Accepted
**Date:** 2026-09-16

## Context

`BACKUP_ENABLED`, `BACKUP_SCHEDULE`, `BACKUP_RETENTION` and `BACKUP_DIR` were
documented in `.env.example` and in the configuration reference, and configured
nothing. `getBackupConfig()` in `server/database/config/sqlite.config.ts` and
`backupDatabase()` in `server/database/index.ts` each had exactly zero callers,
and the scheduler registered one job — recurring invoices. An operator who set
`BACKUP_ENABLED=true` got silence and believed they had backups.

The manual path was worse than absent. `SQLiteDatabase.backup()` was declared
`void`, never awaited the promise better-sqlite3 returns, and logged
`✓ Database backed up to:` *before* the copy had happened. Its `try/catch` could
not observe an async rejection, so a backup that failed on a full disk printed
success and then took the process down through the unhandled-rejection handler.

Whatever replaced this had to work under `DB_DRIVER=mysql`, where there is no
SQLite file to copy and `MySQLDatabase.backup()` correctly refuses (ADR-0008 —
dialect differences are handled honestly rather than faked).

## Decision

The scheduled backup writes the **dialect-neutral JSON dump** that
`transfer.util.ts` already produces and `npm run db:export` already uses — not a
binary file copy.

This is what makes scheduled backups exist at all on MySQL. It also means the
restore procedure is the one already documented, `npm run db:import`, rather
than a second procedure that applies only to automatic backups. The dump is
version-gated, foreign-key ordered, and deliberately excludes `migrations`,
`boot_locks` and `scheduler_leases` while including `stripe_events` so webhook
idempotency survives a move.

The cost is honest: a JSON dump is larger and slower than a binary copy, and it
captures rows rather than the file. For an application whose data is invoices
and clients, that is the right trade.

**Files are written `0600`.** The dump contains every bcrypt hash, the Stripe
secret key and the SMTP password. The default `0644` would leave all of it
readable by any other account on the host.

**Pruning runs only after a successful write,** so a failing backup can never
delete the last good one.

**`BACKUP_SCHEDULE` is honoured only in its documented daily form** (`M H * * *`).
The in-process scheduler is interval-based (ADR-0006) and there is no cron
engine here. A more complex expression is not silently reinterpreted — 
`parseDailySchedule()` reports that it did not match, and the job falls back to
02:00. Silently treating "every 15 minutes" as "daily at 2am" would be a backup
running on a schedule nobody asked for.

Because the scheduler ticks on an interval (hourly by default), "due" cannot
mean "it is exactly 02:00". It means the scheduled moment has passed and the
newest backup on disk predates it.

`SQLiteDatabase.backup()` is now `async` and awaited, so a failure is catchable
rather than fatal. That changed `IDatabase.backup` to return `Promise<void>`.

## Consequences

Backups work on both engines, restore through an already-documented path, and
the four environment variables now do what the documentation always claimed.

A backup is only as good as its last restore test, and nothing here verifies
restorability automatically — `backup-and-restore.md` asks the operator to do
that. Automating it would mean standing up a throwaway database on every run,
which is more machinery than this earns today.

The backup job holds a scheduler lease like any other, so two instances against
one database will not both dump at once.
