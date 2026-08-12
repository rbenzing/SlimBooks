# Database backends

Slimbooks runs against SQLite or MySQL/MariaDB. Which one is a deployment
decision, made entirely through environment variables — the application code is
identical either way.

## Choosing

**SQLite is the default and needs no configuration.** It is the right choice
whenever the host gives you a directory that survives a restart: Docker with a
volume, a bare Linux box, Windows/IIS.

**MySQL is required when the filesystem is ephemeral.** Hostinger's Node cloud
is the motivating case: its disk is wiped on every redeploy, so a SQLite install
there loses every invoice, client and payment each time you deploy. That is
architectural — no start command or path setting fixes it.

Uploaded logos have the same problem and the same shape of answer:

```dotenv
DB_DRIVER=mysql
STORAGE_DRIVER=database
```

With `STORAGE_DRIVER=database`, logos live in the `stored_objects` table and
travel with the database backup instead of being a separate thing to remember.

## Requirements

| | Minimum | Why |
|---|---|---|
| MySQL | 8.0.13 | Expression column defaults. `TEXT` columns can take a default *only* in expression form, and every `created_at` in the schema uses one. Below this the `CREATE TABLE` is a syntax error. |
| MariaDB | 10.2 | Same feature, same reason. |
| Engine | InnoDB | MyISAM ignores transactions without erroring, which would let an interrupted recurring-invoice run bill a customer twice. |

Both are checked at boot and refuse to start with an explanation, rather than
failing later in a way that needs diagnosing.

## Configuration

```dotenv
DB_DRIVER=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=slimbooks
DB_USER=slimbooks
DB_PASSWORD=secret      # may be empty, but must be present
DB_SSL=false
DB_POOL_SIZE=10
```

All four of `DB_HOST`, `DB_NAME`, `DB_USER` and `DB_PASSWORD` are required. A
missing one fails the boot with every missing name listed at once, before the
process opens a socket — not on the first request that happens to touch the
database.

`DB_PATH`, `DB_TIMEOUT` and `DB_BACKUP_PATH` apply only to SQLite and are
ignored under MySQL.

## What differs at runtime

| | SQLite | MySQL |
|---|---|---|
| Schema built by | `createTables()`, then migrations replay | `tables.schema.ts` once, migrations recorded as applied |
| Database admin download/upload | available | 501; use `mysqldump` or the scripts below |
| `FEATURE_DB_ADMIN=on` | starts | fails the boot |
| Integrity check | `PRAGMA integrity_check` | reported as not applicable; InnoDB verifies its own pages |
| Backup | file copy | `mysqldump`, or `npm run db:export` |

A MySQL database never replays SQLite's migration history. Migrations 001–013
are SQLite archaeology — `PRAGMA table_info` guards, a create-copy-drop-rename
table rebuild — so a fresh MySQL schema is built from `tables.schema.ts` and its
history recorded as already applied. Migrations written from now on run on both
and must be dialect-neutral.

## Moving an existing install to MySQL

Existing SQLite installs need do nothing; `DB_DRIVER` defaults to `sqlite` and
upgrading changes no behaviour. Moving is an explicit, separate act.

1. **Stop the application.**

2. **Back up**, and keep it until you have checked step 8:

   ```bash
   cp data/slimbooks.db data/slimbooks.db.backup
   ```

3. **Export.** Run against the current, SQLite configuration:

   ```bash
   npm run db:export -- dump.json
   ```

4. **Create an empty MySQL database** and grant the application user rights on
   it. Confirm the version and engine meet the table above.

5. **Point the environment at it** — `DB_DRIVER=mysql` plus the `DB_*` settings.

6. **Start once, then stop.** This builds the schema. The boot banner names the
   server it connected to, so check it is the one you meant.

7. **Import:**

   ```bash
   npm run db:import -- dump.json
   ```

   Import *replaces* rather than merges, and refuses a database that already
   holds books — if it refuses, you are pointing at the wrong database.

8. **Check the numbers.** Start the application and compare the invoice list,
   client list and dashboard totals against what you recorded before step 1.

9. **If you are also moving uploads**, set `STORAGE_DRIVER=database` and re-run
   steps 3 and 7, or re-upload the company logo through Settings.

Both scripts need `tsx`, a dev dependency, so they run from a checkout — not
from a production install made with `npm ci --omit=dev`.

### About the dump

JSON, not SQL. The two dialects disagree on precisely the syntax a SQL dump
emits — identifier quoting, `AUTOINCREMENT`, expression defaults, the engine
clause — so a dump from one would not load into the other, which is the only
direction anyone needs. It carries rows only; the schema is built by the
application.

Three tables are deliberately not carried:

- `migrations` — the target records its own history when its schema is built
- `boot_locks` — a carried lock would block the next boot
- `scheduler_leases` — a carried lease would stall the scheduler until it expired

`stripe_events` **is** carried. It is the webhook idempotency ledger, and losing
it means a delivery Stripe retries after the move gets processed a second time —
on a payment event, that records the payment twice.

## Testing against MySQL locally

The MySQL half of the suite skips itself when no server is configured, and a
suite that skips reports green. If you change anything database-shaped, run it:

```bash
docker run --rm -d --name slimbooks-mysql \
  -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=slimbooks_test \
  -p 3307:3306 mysql:8

TEST_MYSQL_URL=mysql://root:root@127.0.0.1:3307/slimbooks_test npm test
```

CI runs the server suite against MySQL 8.0 and MariaDB 10.11 on every push, and
fails if the MySQL half did not actually execute.
