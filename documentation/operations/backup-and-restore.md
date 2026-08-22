# Backup and restore

## What has to be backed up

Under the default drivers, two things:

| What | Where | Contains |
|---|---|---|
| The database | `DATA_DIR` (default `./data`), file named by `DB_PATH` (default `slimbooks.db`) | Every client, invoice, expense, payment, report and setting |
| Uploaded files | `UPLOAD_DIR` (default `./uploads`) | Company logos |

Nothing else. Everything but those two is rebuilt from `.env` and the build.

Two exceptions worth knowing:

- Under `DB_DRIVER=mysql`, the database is on the MySQL server and
  `mysqldump` is the tool.
- Under `STORAGE_DRIVER=database`, uploaded files live **inside** the database,
  so a database backup already contains them and there is no second thing to
  remember.

Keep `.env` somewhere safe too. It is not data, but losing the three signing
secrets invalidates every session, and losing SMTP or Stripe credentials means
reissuing them.

## Backing up SQLite

**Do not `cp` a running database.** SQLite in WAL mode keeps recent writes in a
side file; a plain copy can capture a torn state.

```bash
sqlite3 data/slimbooks.db ".backup 'backup.db'"
```

`.backup` is safe against a running server. If `sqlite3` is not installed,
stop the application first and then copy the file.

Uploads are an ordinary directory:

```bash
tar -czf uploads.tar.gz uploads/
```

### The bundled script

`scripts/setup-raspberry-pi.sh` installs `/usr/local/bin/slimbooks-backup` and
schedules it daily at 02:00. It does exactly the above — `sqlite3 .backup` with
a `cp` fallback, plus a tar of `uploads/` — writes to `/opt/slimbooks-backups`,
and deletes both kinds of artifact after 7 days.

It resolves the database as `${DATA_DIR:-$APP_DIR/data}/slimbooks.db`. If no
database is found there it **warns and backs up nothing**, rather than silently
archiving an empty directory.

### From the UI

**Settings → Backup & Restore** downloads the database as
`slimbooks-backup-<timestamp>.db` and can import one back.

## Backing up MySQL

```bash
mysqldump --single-transaction --routines slimbooks > slimbooks.sql
```

`--single-transaction` gives a consistent snapshot without locking, which works
because every table is InnoDB — required at boot.

## The portable dump

For moving between backends, or for a format that does not depend on the engine:

```bash
npm run db:export -- backup.json
npm run db:import -- backup.json
```

This writes a dialect-neutral JSON dump and loads it into whichever backend
`DB_DRIVER` currently names.

Four things to know:

- **`TRANSFER_VERSION` is 2.** A dump of any other version is refused rather
  than partially applied. A dump taken with 2.1.x will not import into 2.2.0.
- **Import replaces rather than merges, and refuses a database that already
  holds books.** Point it at a fresh one.
- **Both commands need `tsx`**, a dev dependency, so they run from a checkout —
  not from a production install built with `npm ci --omit=dev`.
- `db:export` opens and, if needed, builds the schema first, so exporting from
  a database that has never been started works.

## Restoring

### SQLite

1. Stop the application.
2. Put the file at the path `DATA_DIR` + `DB_PATH` resolves to.
3. Restore `uploads/` alongside it.
4. Start the application. Migrations run at boot and bring an older database
   forward.

> If a database exists at a **legacy** location and not at the configured one,
> the process refuses to start and names both paths rather than choosing. That
> is deliberate: choosing wrongly means either invoicing from stale books or
> appearing to have lost everything.

### MySQL

```bash
mysql slimbooks < slimbooks.sql
```

Then start the application so migrations run.

## Verify the backup

A backup that has never been restored is a hypothesis.

Restore into a scratch location — a copy of `DATA_DIR`, or a throwaway MySQL
database — point a spare `.env` at it, boot, and check that the invoice list
and a logo both appear. This project's own rule is that a passing test proves
less than a boot against the real thing; the same applies here.

## Automatic backups

`BACKUP_ENABLED`, `BACKUP_SCHEDULE`, `BACKUP_RETENTION` and `BACKUP_DIR`
configure the in-application backup job. These are read by the legacy config
module rather than the runtime — see the
[configuration reference](configuration.md#two-vocabularies).

**Quote `BACKUP_SCHEDULE`.** `scripts/deploy.sh` sources `.env`, and unquoted
the shell reads `0 2 * * *` as a command.

## Related

- [Database backends](database-backends.md) — moving an install to MySQL
- [Upgrading](upgrading.md) — when a backup is mandatory rather than prudent
