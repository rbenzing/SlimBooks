# Architecture

## Shape

One React SPA, one Express server, one database. In production they are **one
process**: `node dist/server/index.js` serves the API and the built SPA on a
single port ([ADR-0004](../adr/0004-one-build-tree-one-process.md)).

```
Browser
  │
  │  SPA (React 18 + Vite), React Query owns API state
  ▼
Express  ── middleware ── routes ── controllers ── services ── DatabaseService
  │                                                                  │
  │  runtime: paths, listener, features, storage, pdf, scheduler      │
  ▼                                                                  ▼
SQLite (better-sqlite3)  or  MySQL / MariaDB (mysql2)  ── SqlDialect
```

## Boot

`server/index.ts` → `resolveRuntime()` → `initializeDatabase()` → `createApp()`
→ listen.

`resolveRuntime()` is the composition root. It reads the environment **once**,
resolves every host-dependent fact, and returns a frozen `Runtime`. Nothing
below `server/runtime/` reads `process.env` or performs `__dirname` arithmetic
([ADR-0001](../adr/0001-single-environment-boundary.md)).

Schema setup runs before migrations: `createTables()` then `runMigrations()`.
Concurrent boots are serialised by a lock row in `boot_locks` that expires, so
an instance killed mid-boot does not block the next one.

Full contract: [spec 001](../specs/001-portable-runtime.md).

## Server layers

| Layer | Directory | Responsibility |
|---|---|---|
| Runtime | `server/runtime/` | Resolve host facts. Imports nothing from the rest of the project. |
| App | `server/app.ts` | Middleware order, static serving, the Stripe webhook mount |
| Middleware | `server/middleware/` | Auth, validation, security headers, rate limiting, logging, error handling |
| Routes | `server/routes/` | Path → controller. Auth gates are applied here. |
| Controllers | `server/controllers/` | HTTP in, HTTP out. Thin. |
| Services | `server/services/` | Business logic. Where the work happens. |
| Core | `server/core/` | `DatabaseService` — the shared query surface — and `TableValidator` |
| Database | `server/database/` | Drivers, dialects, schema, migrations, transfer |

**Controllers stay thin; logic lives in services.** A controller that computes
something is a controller doing a service's job.

The Stripe webhook is mounted in `app.ts` **ahead of the body parsers**,
because signature verification needs the raw request body. Everything else
mounts through `server/routes/index.ts`.

## Frontend layers

| Layer | Directory |
|---|---|
| Pages (unauthenticated) | `src/pages/` |
| Feature components | `src/components/<feature>/` |
| Design system | `src/components/ui/` (shadcn/ui) |
| API clients | `src/services/` |
| Hooks | `src/hooks/` |
| Contexts | `src/contexts/` |
| Types | `src/types/` |
| Utilities | `src/utils/` |

**React Query owns API state.** Don't duplicate server data into component
state or a context.

> **This is the stated rule, not the observed one.** `useRuntimeConfig.hook.ts`
> is the only hook that calls `useQuery`. Every management screen —
> `ClientManagement`, `DashboardOverview`, `ExpenseManagement`,
> `PaymentManagement`, `ReportsManagement`, and `UserManagement` — loads data
> with `useState` + `authenticatedFetch`, paginating the result through
> `usePagination`. The users screen followed the existing screens rather than
> this rule. Left for a maintainer decision — bring the guidance in line with
> the code, or migrate the screens to match it — and not resolved here.

**Check `src/components/ui/` before building a component** — it is already
themed. Colour and surface come from `themeClasses`
([ADR-0015](../adr/0015-theme-as-design-system.md)), and all date display goes
through `src/utils/formatting/date.util.ts`.

Anything user-facing honours the settings objects: currency, number and date
formatting, language.

## Data access

Every call site holds an `IDatabase`, whose `dialect` property spells the
things SQLite and MySQL disagree about
([ADR-0008](../adr/0008-dialect-differences-in-one-place.md)). Call sites never
branch on the driver name.

- All queries are parameterised. `SQLParameter = string | number | null | boolean | Buffer`.
- `getPaginated()` filters soft-deleted rows automatically. **`getMany()` does
  not** — add `WHERE deleted_at IS NULL` by hand.
- Soft delete is enabled per table via `data.{table}_soft_delete_enabled`.

Full contract: [spec 003](../specs/003-database-adapter.md).

## Time

Two distinct types, and mixing them is a silent wrong-answer bug:

- **An instant** is epoch milliseconds, an integer. `utcNow()`, `dialect.now()`,
  `toEpochMillis()` for foreign input.
- **A calendar day** is `YYYY-MM-DD` text. Never bind one against a timestamp
  column — use `utcDayStart()` / `utcDayEnd()`.

The server never formats a date for display. See
[spec 005](../specs/005-timestamp-storage.md),
[ADR-0009](../adr/0009-instants-as-epoch-milliseconds.md) and
[ADR-0010](../adr/0010-calendar-days-are-not-instants.md).

## Types

Three declarations, maintained by hand, and **nothing generates one from
another** ([ADR-0014](../adr/0014-dual-type-declarations.md)):

| File | Serves |
|---|---|
| `src/types/domain/[entity].types.ts` | The React application |
| `server/types/index.ts` | Server domain and row shapes |
| `server/types/api.types.ts` | Request and response contracts |

Import as `import type { Invoice } from '@/types';`, never relatively. Enums
use the const-object pattern.

Canonical names: an expense payee is `vendor` (never `merchant`); a postal code
is `zipCode` (never `zip` or `zip_code`). Legacy spellings survive only as CSV
import headers.

`template_id` does not exist — it is `design_template_id` or
`recurring_template_id`, in different tables that share an id space.

## Schema change checklist

A half-updated schema **compiles and fails at runtime**. In order:

1. `server/database/schemas/tables.schema.ts`
2. A migration, registered in `server/database/migrations/index.ts` —
   unregistered files never run
3. The `.sql` reference file, if the change is worth reflecting there
4. `src/types/domain/[entity].types.ts`
5. `server/types/index.ts`
6. `server/types/api.types.ts`
7. Service methods — **including INSERT column lists and UPDATE whitelists**
8. Seed data
9. Verify against the real database
10. The full gate: `npm run lint && npm test && npm run build`

Notes that catch people:

- `CREATE TABLE IF NOT EXISTS` never revisits an existing table, so a schema
  edit needs a migration too.
- Migrations must be idempotent and dialect-neutral — no `PRAGMA`; use
  `dialect.columnsOf()`.
- A new table must be in `tables.schema.ts` or the drift test fails.
- A shipped migration is history, but **it still runs on fresh installs.**
- SQLite cannot `DROP COLUMN` a column named in a constraint — rebuild the
  table instead (migration 008 is the pattern).

## Testing seams

The architecture is shaped so that things can be tested without the thing they
depend on:

- Runtime resolution is a pure function of a `RawEnv` record, so the whole host
  matrix is testable without a host.
- `DatabaseSettings` is configuration, not a connection, so the driver matrix
  is testable without a database.
- `dialect` hangs off `IDatabase`, so a test can swap the implementation.
- Logic that can live in a database-free module does —
  `server/utils/reportPeriods.util.ts` is the pattern.

That said: see [testing](testing.md). A passing suite has repeatedly proved
less than a boot against the real thing.

## Related

- [Decisions](../adr/) — why any of this is the way it is
- [API reference](api-reference.md)
- [Getting started](getting-started.md)
