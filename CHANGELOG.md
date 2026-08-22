# Changelog

All notable changes to Slimbooks are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

Upgrade instructions live in
[documentation/operations/upgrading.md](documentation/operations/upgrading.md).

## [2.2.0] — 2026-08-12

Timestamps become a type the database enforces rather than a convention the
code follows.

### Changed

- **Instants are stored as epoch milliseconds**, an integer, rather than text.
  Columns were `TEXT` and held two formats at once — `2026-08-12T13:54:13.241Z`
  and `2026-08-12 13:54:13` — and because text compares lexicographically and a
  space sorts below `T`, a window query spanning both returned the wrong rows.
- **SQLite tables are now `STRICT`**, so an `INTEGER` column rejects a
  timestamp string at the engine instead of storing it silently.
- **The API sends timestamp fields as JSON numbers.** The bundled UI is
  updated; any other consumer of the API needs the same change.
- **The transfer dump format is version 2.** A dump taken with 2.1.x will not
  import.

### Fixed

- **Reports returned nothing.** Calendar-day range edges were bound against
  epoch-millisecond columns at four sites in the report service — which matches
  no rows on SQLite and every row on MySQL. Ranges are now converted with
  `utcDayStart()` / `utcDayEnd()`.
- **Legacy timestamps aborted the migration on MySQL 8.4.**
  `2026-08-12T13:54:13Z` is not a datetime literal to MySQL, and under strict
  `sql_mode` it errors. The `T` and `Z` are stripped before conversion.
- **Migration 003 aborted the boot of every fresh install** once `created_at`
  became an integer, because it still seeded the default template with
  `datetime('now')`.

### Migration

Existing rows are converted on the first boot after upgrading. The conversion
is idempotent and resumes correctly if interrupted. Back up first.

## [2.1.1] — 2026-08-12

### Fixed

- Timestamps normalised to one UTC format, rendered on the viewer's clock.
- Twelve SQLite-only statements the portability sweep had missed.

## [2.1.0] — 2026-08-12

MySQL and MariaDB become a supported backend, which is what makes hosts with
ephemeral filesystems viable.

### Added

- **MySQL / MariaDB support** via `DB_DRIVER=mysql`. Existing installs need
  change nothing. Requires MySQL 8.0.13+ or MariaDB 10.2+ and InnoDB, both
  checked at boot.
- **`SqlDialect`**, exposed through `IDatabase`, so dialect differences live in
  one place rather than at every call site.
- **Database-backed uploads** via `STORAGE_DRIVER=database`, so logos survive a
  redeploy on a host whose filesystem does not.
- **Dialect-neutral export and import** — `npm run db:export` and
  `npm run db:import`.
- **CI runs the suite against MySQL and MariaDB** on every push, with an
  explicit check that the suite ran rather than skipped.

### Changed

- The data layer is asynchronous throughout — interface, schema builders,
  migrations, seeding, services, controllers and the scheduler.
- Reserved-word columns are quoted so the same SQL parses on both backends.
- The drift between the schema file and the migrations was closed, and a test
  now keeps it closed.

## [2.0.0] — 2026-08-08

One artifact that runs unchanged on Docker, bare Linux, Windows IIS and a Node
PaaS.

### Added

- **A runtime composition root.** Every host-dependent fact is resolved once at
  boot and frozen; `server/runtime/env.ts` is the only module that reads
  `process.env`.
- **Tri-state feature toggles** (`auto | on | off`) for PDF, email, Stripe,
  OAuth, the scheduler, uploads, database admin, signup and debug. `on` refuses
  to boot when the dependency is missing, turning a silent degradation into a
  startup failure.
- **`TLS_MODE`** (`off | self | proxy`), read by the server itself.
- **`/api/config`**, so the SPA can ask what its host actually supports.
- **In-process recurring invoice generation**, once per period, guarded by a
  database lease.
- **A boot guard for stranded data** — the process refuses to start when a
  database or uploads directory exists at a legacy location and not at the
  configured one, naming both paths.

### Changed

- **One build tree** (`dist/client` + `dist/server`) and **one process**.
  `server/dist/` is gone and `vite preview` is no longer part of the design.
- **One environment file.** `.env.production` is gone.
- Uploads are addressed by logical key through a storage provider.
- Chromium is loaded lazily, so a host without it still boots.

### Removed

**These are rejected at boot, not ignored** — an environment still carrying one
fails to start with a message naming its replacement:

| Removed | Replacement |
|---|---|
| `ENABLE_HTTPS` | `TLS_MODE` |
| `SSL_KEY_PATH` | `TLS_KEY_PATH` |
| `SSL_CERT_PATH` | `TLS_CERT_PATH` |
| `ENABLE_DEBUG_ENDPOINTS` | `FEATURE_DEBUG` |

`CLIENT_URL` became required.

### Fixed

- **`__dirname` arithmetic**, in five places, which meant one thing under `tsx`
  and another compiled. It had produced a phantom database directory, a server
  serving its own JavaScript, and 404ing logos.
- The Docker image no longer bakes in an environment file. It previously copied
  a template of placeholder values, so **every container ran with the published
  default signing secret** unless something overrode it, and nothing did.
  Rotate your secrets when upgrading from a 1.x Docker deployment.
- Migration 006 and the sample seed no longer fail the boot.

## [1.1.0] — 2026-07-31

Earlier history is in the git log.

---

[2.2.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.2.0
[2.1.1]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.1.1
[2.1.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.1.0
[2.0.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.0.0
[1.1.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v1.1.0
