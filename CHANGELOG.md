# Changelog

All notable changes to Slimbooks are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html)
as [documentation/development/releasing.md](documentation/development/releasing.md)
defines it for a self-hosted application.

Upgrade instructions live in
[documentation/operations/upgrading.md](documentation/operations/upgrading.md).

## [Unreleased]

Nothing here needs an operator to do anything: no environment variable changed,
no migration was added, and no manual upgrade step applies.

### Changed

- **React upgraded to 19.** Every React-coupled dependency already declared
  support for it, so nothing else had to move. `@types/express` also moved from
  4 to 5, matching the Express 5.2.1 runtime the server has actually been
  running since 3.0.0 — the v4 types were the thing that was wrong.
- **Every dialog in the application is now a real one.** All thirteen modals
  were rebuilt on the browser's native `<dialog>` element, which means each one
  now traps focus, closes on Escape, renders in the top layer above the rest of
  the page, makes the content behind it inert, and returns focus to whatever
  opened it. Eleven of the thirteen previously had none of that — they were
  plain overlays a keyboard user could tab straight out of, with no way to
  dismiss them from the keyboard at all. The connection-lost dialog is the one
  deliberate exception to Escape: it stays put, because a dropped connection is
  not a state a user can dismiss their way out of.
- **Route parameters are read through a single narrowing helper.** Express 5
  supports wildcard segments, so a parameter can legitimately be an array; the
  code now handles that in one place rather than assuming a string at fifty
  call sites.

### Fixed

- **A clean checkout could not install.** `react-dom` and `@types/react-dom`
  had been raised to 19 while `react` stayed at 18, which is an unsatisfiable
  peer dependency — `npm ci` failed outright, breaking CI, the release workflow
  and both Docker builds. Completing the upgrade repairs it.
- The recurring-template editor's tests clicked Save before the editor was
  ready to save, so a lost click looked like a passing suite under load.

### Removed

- **Five frontend dependencies**, about 1.1 MB: the four `@radix-ui` packages
  and `class-variance-authority`. Their only remaining job was two dialogs and
  a handful of wrappers, all of which the native `<dialog>` work replaced.
  `@radix-ui/react-slot` existed solely for an `asChild` prop nothing used.
- `forwardRef` throughout. React 19 passes `ref` as an ordinary prop, so the
  wrapper is redundant; removing it clears deprecated API ahead of React 20.

## [3.0.0] — 2026-09-16

### Breaking

- **The three signing secrets must be set, or the process refuses to start.**
  `JWT_SECRET`, `JWT_REFRESH_SECRET` and `SESSION_SECRET` may no longer be blank
  or left at the placeholder values published in this repository, and the check
  now runs in **every** environment rather than only under
  `NODE_ENV=production`. An install that has been running on a blank
  `JWT_SECRET` will not start after this upgrade until one is generated:
  `./scripts/generate-secrets.sh`.

  This is the only reason the release is a major; everything else in it is a fix
  or an addition. Rotating `JWT_SECRET` invalidates existing sessions, so
  everyone signs in once more — which is the point, since a session signed with
  a published secret could have been minted by anyone. See
  [upgrading](documentation/operations/upgrading.md#to-300).

### Security

These were found by an audit of the whole codebase and each was verified against
a running server before and after the fix. **An install exposed to an untrusted
network should upgrade.**

- **Anyone could mint an administrator session.** `POST /api/auth/refresh-token`
  is unauthenticated by design — an expired token is the credential — but it
  called `jwt.decode()`, which parses a payload without verifying the signature.
  A token assembled by hand claiming `userId: 1` was answered with a genuinely
  signed administrator token. It now verifies the signature.
- **Any signed-in account could download or replace the entire database.**
  `/api/db/export` and `/api/db/import` required only a session, not admin.
  Export returns every password hash and stored credential; import replaces the
  database, so a low-privilege user could upload one in which they were the
  administrator. Both now require admin.
- **Any signed-in account could read stored credentials in plaintext.**
  `GET /api/settings` and `GET /api/settings/:key` returned the raw value, so
  the Stripe secret key, webhook secret and SMTP password were readable by any
  user, bypassing the redaction the project-settings endpoint does deliberately.
  Credentials now read back as null. Writing them still requires admin, as before.
- **Anyone could clear any account's lockout.** Four user endpoints
  (`update-login-attempts`, `update-last-login` and their by-id forms) carried
  no authentication, which made the brute-force protection decorative and let
  login history be forged. They had no caller and are removed.
- **Anyone could read the administrator's password hash.**
  `GET /api/users/email/admin@slimbooks.app` was answered without a token and
  returned the full row — `password_hash`, `two_factor_secret` and
  `backup_codes` included. The route is now admin-only. **If your administrator
  account uses that address and the server was reachable by anyone else, rotate
  that password.**
- **The published default signing secret could not be caught.** `validateConfig`
  collected the offending variable and then filtered its own list by "is the
  variable absent", so a secret explicitly set to the placeholder published in
  this repository passed the check that existed to catch it. It also only ran
  under `NODE_ENV=production`, while `.env.example` ships `development`. It now
  compares the resolved value and refuses to start in every environment.
- **Any signed-in account could read the host's cloud credentials.**
  `POST /api/pdf/page` pointed a real headless browser at a URL from the request
  body and returned what it rendered. The browser runs inside the network
  perimeter, so `http://169.254.169.254/…` came back as a PDF of the instance's
  own metadata, IAM credentials included, and any internal address the host
  could reach was reachable the same way. The endpoint now accepts only URLs on
  this installation's own origin, which is all the application ever sends.
- **Any signed-in account could send mail to anyone, as you.**
  `POST /api/email/send` took the recipient, subject and HTML body from the
  request, making it an open relay carrying your domain, SMTP credentials and
  sending reputation — reachable by anyone who could register, with
  `FEATURE_SIGNUP` on. It now delivers only to an address the installation
  already holds: a client that is not soft-deleted, or a user.
- **An unauthenticated file upload.** `POST /api/upload` accepted a file from
  anyone at all and wrote it into the data directory. It had no callers — logo
  uploads go through `/api/settings` and database import stages its own upload —
  so it is removed rather than guarded.
- Account lockout is now actually enforced. `getUserById` did not select
  `account_locked_until`, so every lockout check in the codebase read
  `undefined` and did nothing.
- The login rate limiter now covers registration, password reset, email
  verification and token refresh, not only `/login`.

### Added

- **An audit trail.** Logins (including failures), password changes, user and
  role changes, settings writes, database export/import and setup completion are
  recorded to a new `audit_log` table and readable by an administrator at
  `GET /api/audit`. Records carry the actor, outcome, target, source IP and a
  per-action payload. Settings changes record the key that changed, never the
  value. Retention is governed by the new `AUDIT_RETENTION_DAYS` (default 365).
  See ADR-0020.
- **Scheduled backups that actually run.** `BACKUP_ENABLED`, `BACKUP_SCHEDULE`,
  `BACKUP_RETENTION` and `BACKUP_DIR` were documented and wired to nothing — the
  functions reading them had no callers. The scheduler now writes a
  dialect-neutral JSON dump, which is why this works under `DB_DRIVER=mysql`
  too, restorable with `npm run db:import`. Files are written `0600`; pruning
  runs only after a successful write. See ADR-0021.
- Registration can be switched off. `FEATURE_SIGNUP` already existed with full
  tri-state resolution and had no consumer, so an operator who set
  `FEATURE_SIGNUP=off` still had an open registration form.

### Fixed

- **A failed backup reported success and then killed the process.**
  `SQLiteDatabase.backup()` was declared `void` and never awaited the promise
  better-sqlite3 returns, so it logged `✓ Database backed up` before the copy
  happened and its `try/catch` could not see the rejection. `IDatabase.backup`
  now returns a promise.
- **A database blip inside the scheduler took the whole server down.** Lease
  acquisition and release sat outside the job's `try`, and nothing awaited the
  promise `setInterval` discarded, so a transient database error there became an
  unhandled rejection — which Node turns into process exit. The lease calls are
  now inside the guard and the tick has a catch of its own.
- **`/api/health` reported 200 with the database down**, saying
  `"database": "disconnected"` in a body that container healthchecks, deploy
  scripts and load balancers do not read. It and `/api/health/detailed` now
  answer 503, so an instance that cannot serve a request stops being sent any.
  `/api/health/live` still answers 200 while the process is alive.
- **Graceful shutdown was being pre-empted.** `PdfService` registered its own
  SIGINT/SIGTERM handlers that closed the browser and then called
  `process.exit(0)`. Closing a browser finishes long before draining HTTP
  connections, so that handler won the race and the real shutdown never reached
  its WAL checkpoint — in-flight requests were dropped and every restart left
  SQLite recovering. The browser is now closed by the one shutdown path.
- Shutdown steps are guarded individually. Under a single `try`, a scheduler
  that failed to stop skipped the WAL checkpoint that came after it.
- **Recurring invoices charged tax and shipping twice.** The template editor
  saves a template's `amount` as the gross total — tax and shipping already
  included, since that table has no separate total column — while the processor
  that generates invoices from it computed
  `amount + tax_amount + shipping_amount` again. A template built as 1,100
  generated an invoice for 1,200, unattended, every cycle, from 2.2.0 onward.
  The generated invoice now bills the template's total exactly, and its `amount`
  is the subtotal, matching what `invoices.amount` means everywhere else.

  **Invoices already generated are not altered.** If you bill by recurring
  template, check invoices raised since 2.2.0 against what their template says:
  `total_amount` should equal the template's `amount`, and anything larger was
  overstated by its tax plus shipping.
- **Editing a client silently discarded `tax_id` and `notes`.** Both are real
  columns, `createClient` writes them, and the update validation checks their
  length — but the UPDATE whitelist left them out, so the API accepted the
  change, answered success and altered nothing.
- `toggleClientStatus` returned success without touching the database,
  explaining itself with "since we removed is_active column" — a column that is
  in the schema, carries its own index, is seeded, is validated on create and
  update, and is in the frontend's type. It now writes `is_active`. No route
  mounts this controller and no screen calls it, so nothing was visibly broken;
  what is fixed is that the method no longer reports work it did not do.
- The server's `Client` type now matches the table: `tax_id`, `notes` and
  `is_active` were missing, and `email` was required where the column is
  nullable. Both type declarations must agree (ADR-0014); nothing generates one
  from the other, so a half-updated one compiles and fails at runtime.

### Changed

- The invoice total calculation lives in one place again. `calculateInvoiceTotal`
  existed and was tested but had no caller, while the create, recurring-create
  and edit pages carried four copies of the same arithmetic — two of which had
  already drifted apart in how they spelled the tax step. Behaviour is unchanged.
- ESLint no longer walks `.claude`, which holds git worktrees — a second
  checkout of this repository. It was linting that copy as part of this one and
  reporting over a thousand problems from files nobody was editing, which buried
  the real count. `npm run lint` is now accurate without a manual ignore flag.
- **The release workflow runs the two-engine database job.** It gated on
  `npm test` alone, and the MySQL suites skip themselves when no server is
  configured — so a release could be published on a green run that never touched
  MySQL or MariaDB. Publishing now waits on both engines, with the same
  skip-detection CI uses.
- The release artifact carries a **build provenance attestation**, verifiable
  with `gh attestation verify slimbooks-X.Y.Z.tar.gz --repo <owner>/SlimBooks`.
- **Dependabot** watches npm dependencies and the workflows' own actions,
  weekly and grouped. CI gained a job that fails on a high or critical advisory
  in production dependencies, and reports the rest, on every push and weekly on
  a schedule — because an advisory is published against code that has not
  changed, and 21 of them accumulated unnoticed before this release.

## [2.5.0] — 2026-09-09

### Added

- **Register and Reset Password now show a live checklist of the
  admin-configured password requirements as you type**, instead of leaving
  you to guess and find out only after submitting.
- **The password policy is now exposed to unauthenticated visitors via the
  public project-settings endpoint**, so pre-login forms can check a
  password against the real, admin-configured requirements instead of a
  hardcoded guess.

### Changed

- **Stripe now charges in the same currency Settings → General displays**,
  instead of always USD. An install whose display currency was already set
  to something other than USD will begin charging Stripe in that currency —
  see ADR-0019. The separate Settings → Stripe currency field is removed;
  there is one currency setting now, not two that could disagree.

### Fixed

- **A setup install stranded by a deleted administrator now repairs
  itself.** If the `users` table was ever emptied while the database's
  record of setup completion survived, `/setup` would refuse to run again
  with no way through the UI. The next setup attempt now recognises this and
  proceeds.

### Removed

- **The Google Sign-In settings tab, login button, and `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI`.** No Google sign-in feature
  has ever existed behind this configuration — filling it in produced a
  working-looking toggle and a button that errored when clicked. Removing
  the environment variables from `.env.example` does not reject them at
  boot; an existing `.env` that still sets them keeps working, since
  anything set but not listed is already ignored.

## [2.4.0] — 2026-09-07

### Added

- **Two company settings: fiscal year start month and accounting basis**
  (cash or accrual), in Settings → Company & Tax. The fiscal year drives
  every "This Quarter" and "This Year" (and their "Last" counterparts) across
  Expenses, Payments, Invoices, all four reports and the dashboard, including
  which months a report's quarterly columns cover. Accounting basis is a fact
  about the business, not a per-report choice, so the profit & loss report
  now reads it from settings instead of resetting to accrual on every visit;
  a single run can still be switched on the report itself. Note what "cash"
  currently means: *invoices issued within the period that are right now
  marked paid*. The period bounds the issue date, never the payment, so an
  invoice issued 20 January and paid 3 March is absent from a January cash
  report run in February and present in the same report run in April.
  Recognising revenue on the date the payment arrived — bucketing by
  `paid_date` — is a separate change.
- **An import result panel**, shown after a bulk import of expenses,
  payments or clients. It reports how many rows landed and how many failed,
  the per-row reason for each failure the API returned, the date span of the
  rows that landed, and a button that widens the list's date filter to show
  them.
- **A setup wizard on first boot.** An empty install no longer seeds an
  administrator from `ADMIN_PASSWORD` (which defaulted to the literal
  password `"password"` when that variable was left unset) — it shows a
  guided flow instead: create the administrator account, enter company
  information, then optionally connect Email, Stripe and Google Sign-In.
  Each optional step can be skipped and configured later from Settings.
- **A configurable password policy** (minimum length, and whether an
  uppercase letter, lowercase letter, number or special character is
  required), in Settings → Security. Applies to every new or changed
  password, including the one the setup wizard creates.
- **`GOOGLE_REDIRECT_URI` and `DEFAULT_CURRENCY`** can now also be stored in
  Settings → Google and Settings → Stripe respectively, and are resolved
  through the same settings-precedence system as every other field on those
  tabs. Neither value is read by anything at runtime yet — Stripe still
  takes its currency from the invoice being charged, and the Google Sign-In
  flow does not yet consume the stored redirect URI — so today this only
  changes where the value can be stored and read back, not behavior.

### Changed

- **Expenses, Payments and Invoices open on the fiscal year to date**
  instead of the current month, and each screen remembers the period you
  last chose.
- **The dashboard follows the configured fiscal year** instead of always
  starting "This Year" and "Last Year" on 1 January, and its period
  selector now offers the same eleven presets as the reports and lists.
- **Tax Rates moved from its own settings tab into Company & Tax.**

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
- **"This Year" ended on 31 December in the profit & loss report but today
  in the expense report**, so the two could never be reconciled for the year
  in progress. Every report, list and the dashboard now end a current period
  today, never in the future.
- **Report and list date ranges shifted a day for anyone east of UTC.**
  Ranges were built with `toISOString()`, which converts to UTC before
  taking the date, so a local midnight became the previous day — a Berlin
  user's "This Year" started 31 December. Ranges are now built from local
  date parts by `toCalendarDay` in `src/utils/data/period.util.ts`.
- **Invoices and expenses were dated by when their row was entered
  (`created_at`) rather than when they were issued or incurred.** A
  historical import landed entirely on the day it was imported, not the
  dates on its rows. This was wrong in three places that disagreed with each
  other on the same data: the invoice list, every report in
  `server/services/ReportService.ts` — profit & loss, invoice and client —
  and the dashboard, which also disagreed with the Expenses screen, since
  Expenses already filtered on `date`. Invoices now file by `issue_date` and
  expenses by `date` everywhere.
- **A fiscal year starting in any month but January, April, July or October
  produced a malformed report column.** A quarter's end month was computed
  by adding to its start month without wrapping past December, so a fiscal
  year starting in November produced a column dated `2026-13-01`.
- **An import where every row failed showed only "Failed to import
  expenses"**, with no counts and no indication of which rows were wrong or
  why. The bulk-import endpoints answered `422` in that case, and the
  client's fetch helper throws on any non-2xx response after consuming the
  body to build its error message — so the explanation the panel exists to
  show never arrived. They now answer `200` with `success: false`, and the
  import result panel shows the counts and every per-row error.

### Migration

**A report run after this upgrade can return different totals than the same
report run before it.** That is the point of the fixes above, but it will
look like a discrepancy to whoever meets it first. **Saved reports are not
affected** — a saved report keeps the range and figures it was generated
with and is never recomputed, so an old saved report will not agree with a
freshly run report of the same name over the same period. Both are correct.

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

[3.0.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v3.0.0
[2.5.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.5.0
[2.4.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.4.0
[2.3.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.3.0
[2.2.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.2.0
[2.1.1]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.1.1
[2.1.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.1.0
[2.0.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v2.0.0
[1.1.0]: https://github.com/rbenzing/SlimBooks/releases/tag/v1.1.0
