# Spec 003: Database adapter

**Status:** Shipped in 2.1.0

## Purpose

Let the same application run on SQLite or MySQL/MariaDB, chosen by environment,
without duplicating the schema or branching on the driver at call sites.

## Contract

`IDatabase` is the interface every call site holds:

```ts
interface IDatabase {
  readonly dialect: SqlDialect;

  connect(config: DatabaseConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  executeQuery(query: string, params?: unknown[]): Promise<QueryResult>;
  getOne<T>(query: string, params?: unknown[]): Promise<T | null>;
  getMany<T>(query: string, params?: unknown[]): Promise<T[]>;
  getWithPagination<T>(query: string, params?: unknown[], options?: QueryOptions): Promise<SelectResult<T>>;

  transaction<T>(callback: TransactionCallback<T>): Promise<T>;

  createTable(name: string, definition: string): Promise<void>;
  dropTable(name: string): Promise<void>;
  tableExists(name: string): Promise<boolean>;

  backup(path: string): void;
  vacuum(): void;
  pragma(setting: string, value?: string | number): unknown;
}
```

`dialect` is a property of the interface rather than a module import, so a
caller always has the spelling for the database it is actually talking to —
including inside a test that swaps the implementation
([ADR-0008](../adr/0008-dialect-differences-in-one-place.md)).

Query parameters are `SQLParameter = string | number | null | boolean | Buffer`.

### Selection

`DB_DRIVER` is `sqlite` (default) or `mysql`. MySQL requires `DB_HOST`,
`DB_NAME`, `DB_USER` and `DB_PASSWORD`; the boot fails naming **every** missing
one rather than erroring on the first query. `DB_PASSWORD` is checked for
presence, not content — an empty password is a configuration, an absent one is
a mistake.

`DatabaseSettings` is a union, not an optional-field bag, so a MySQL adapter
cannot be handed a file path and a SQLite adapter cannot be handed a host.

## Invariants

1. **One logical schema, two ways of arriving at it.** SQLite replays
   migrations; MySQL is built once from `tables.schema.ts` by `baseline.ts`,
   with history recorded as applied without running
   ([ADR-0007](../adr/0007-two-backends-one-schema.md)).
2. **`tables.schema.ts` is the only thing that builds tables.**
   `server/database/schemas/sqlite-optimized-schema.sql` is documentation no
   code reads — editing it alone is how the `invoices` table once lost 19
   columns.
3. **New migrations are dialect-neutral** — no `PRAGMA`; use
   `dialect.columnsOf()`. A new table must also be added to
   `tables.schema.ts` or the drift test fails.
4. **Every migration is registered** in `migrations/index.ts`. Unregistered
   files never run. `createTables()` runs *before* `runMigrations()`, and
   `CREATE TABLE IF NOT EXISTS` never revisits an existing table — so a schema
   edit needs a migration too.
5. **Migrations are idempotent**, and a shipped one still runs on fresh
   installs.
6. **`key` is backticked everywhere.** It is reserved in MySQL and is a column
   in `settings`, `project_settings` and `stored_objects`.
7. **All queries are parameterised.**
8. **Soft delete is opt-in per table** via `data.{table}_soft_delete_enabled`.
   `getPaginated()` filters deleted rows automatically; `getMany()` needs
   `WHERE deleted_at IS NULL` added by hand.

## Requirements

MySQL 8.0.13+ or MariaDB 10.2+ — older servers cannot give a column an
expression default, which every `created_at` uses — and InnoDB, because MyISAM
ignores transactions silently. Both are checked at boot.

## Transfer between backends

`npm run db:export` writes a dump; `npm run db:import` loads one.

- The dump format is versioned. **`TRANSFER_VERSION` is 2**; a dump of a
  different version is refused rather than partially applied.
- Import **replaces rather than merges**, and refuses a database that already
  holds books.
- Both commands need `tsx`, so they run from a checkout, not from a production
  install built with `--omit=dev`.

## Verification

Anything database-shaped is tested against both engines; CI runs MySQL and
MariaDB on every push. The schema-drift test in `server/database/index.test.ts`
is load-bearing, because nothing else forces the two construction paths to
agree. See [development/testing.md](../development/testing.md).
