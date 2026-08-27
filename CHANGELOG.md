# Changelog

All notable changes to Slimbooks are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html)
as [documentation/development/releasing.md](documentation/development/releasing.md)
defines it for a self-hosted application.

Upgrade instructions live in
[documentation/operations/upgrading.md](documentation/operations/upgrading.md).

## [Unreleased]

### Removed

- **Forty shadcn/ui components that nothing imported**, along with three barrel
  files (`src/utils/index.ts` and the `business` and `validation` equivalents)
  that no module imported either — `src/utils/index.ts` opened by instructing
  readers to import through it, which nothing in the codebase did.
- **Thirty-six packages that existed only to serve them**: twenty-three
  `@radix-ui/*`, `react-hook-form` with `@hookform/resolvers`,
  `react-day-picker`, `react-resizable-panels`, and `@radix-ui/react-toast`
  (the app uses `sonner`). Also `crypto-js` and `@react-oauth/google`, neither
  of which any module imports, `jsdom` (the suite runs on `happy-dom`),
  `@tailwindcss/typography` (not in the Tailwind plugin list), `nodemon` and
  `ts-node` (dev runs on `tsx watch`), and three `@types/*` packages whose
  runtimes now ship their own declarations. The vestigial `ts-node` block in
  `server/tsconfig.json` went with them.

  The built bundle is byte-identical, so none of this ever reached a browser —
  it was install size, audit surface and search noise. `npx shadcn@latest add
  <name>` brings any component back.

### Fixed

- **`scripts/generate-certificates.sh` failed on a fresh clone**, which broke
  the documented Docker quick start at its second step. It wrote the key pair
  into `../certs/`, a directory `.gitignore` keeps empty and a clone therefore
  does not have, and it read `cert.conf` from the working directory, so it only
  worked when invoked from inside `scripts/`. It now locates itself, creates
  `certs/`, and stops on error. The docs drop the `cd scripts && … && cd ..`
  dance for a plain `./scripts/generate-certificates.sh`. This is the same
  fresh-clone assumption 2.3.0 removed from the `Dockerfile`; the script kept
  it.
- **The API reference described `GET /api/users/email/:email` as admin-only.**
  It is not: a request for `admin@slimbooks.app` is answered without a token,
  and the handler returns what `SELECT *` produced — `password_hash` included.
  Documented as it behaves.

## [2.3.0] — 2026-08-23

An install can no longer be left without an administrator, and the Docker
deployment builds and boots from a clean clone.

### Added

- **A Users screen**, administrator-only, for managing accounts: create, edit,
  reset another user's password, unlock a locked account, and delete. Roles
  offered are `admin` and `user`; `viewer` exists in the type union but no
  code treats it differently from `user`, so it is not offered.
- `POST /api/users/:id/password` — an administrator sets another user's
  password. Plaintext in, validated against the configured length bounds,
  hashed server-side.
- `POST /api/users/:id/unlock` — an administrator clears an account lockout.
- **The install can no longer be left without an administrator.** Deleting or
  demoting the last one is refused by the `DELETE`/`UPDATE` statement itself,
  so the check and the write are one statement and a concurrent pair cannot
  both pass it — see
  [ADR-0017](documentation/adr/0017-last-admin-invariant.md).

### Fixed

- **The Docker image could not be built from a fresh clone.**
  `COPY certs ./certs` referenced a directory holding no tracked files, so it
  did not exist after `git clone`; the build only ever succeeded on a machine
  where the directory happened to be on disk. Compose already bind-mounts
  `./certs`, and a TLS key does not belong in a shared, pushed, cached layer.
- **The compose health check could never execute.** It called `curl`, which is
  not in `node:24-alpine` and is not installed by the Dockerfile, so the
  container reported unhealthy indefinitely. It now runs the same `node` probe
  as the image's own `HEALTHCHECK`, honouring `TLS_MODE` and `PORT`.
- **The container crash-looped on a read-only filesystem.**
  `databaseController` created a multer instance at module load with a relative
  `dest: 'temp/'` — path arithmetic outside the runtime, executed before any
  request and even under MySQL, where both handlers there decline to run. The
  staging directory is now derived from `DATA_DIR` and created on first use.

### Changed

- **`password_hash` is no longer accepted by `PUT /api/users/:id`.** It was in
  that endpoint's allowed-field list, so a caller could write a hash straight
  into the column, bypassing both the password-strength check and the bcrypt
  cost that setting a password anywhere else applies. Sending it now fails
  with **400** rather than being ignored, so a caller still relying on it finds
  out instead of silently having no effect. Use
  `POST /api/users/:id/password` instead; every other user field still goes
  through `PUT /api/users/:id`.
- **The compose file no longer names a database.** Backend, credentials and
  storage driver come from `.env`; `DOCKER_DB_HOST` and `DOCKER_DB_PORT` give
  the container its own route to the server, so the same `.env` serves
  `npm run dev` and `docker compose up` and any database container works
  without editing a committed file.
- `HOST=0.0.0.0` is set for the container. Bound to `localhost` inside a
  container, the process is unreachable through the port mapping and the
  failure looks like it never started.
- `EXPOSE` is `3002`, the port the process actually binds, rather than `8080`.
- The dev-only `vite.config.ts` is no longer copied into a production image
  whose dependencies are installed with `npm ci --omit=dev`.
- `/app/logs` is gone from the image and from compose. Nothing under
  `server/runtime/` resolves a log directory; container logs go to the Docker
  logging driver.
- The obsolete Compose `version:` key is removed.

### Documentation

Reorganised into `documentation/`, split by audience — user guide, operations,
development, decision records and specifications — with seventeen ADRs, an API
reference, a configuration reference, an architecture overview, a release
procedure, this changelog and a security policy, none of which existed before.

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

[2.3.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.3.0
[2.2.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.2.0
[2.1.1]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.1.1
[2.1.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.1.0
[2.0.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.0.0
[1.1.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v1.1.0
