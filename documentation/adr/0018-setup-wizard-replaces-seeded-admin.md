# ADR-0018: The first administrator comes from an interactive wizard, not `ADMIN_PASSWORD`

**Status:** Accepted
**Date:** 2026-09-05

## Context

`initializeAdminUser` created `admin@slimbooks.app` / `admin` on any empty
database, with a password taken from `ADMIN_PASSWORD` — defaulting to the
literal string `"password"` when that variable was unset. There was no
first-run flow of any kind: an operator who forgot to set `ADMIN_PASSWORD`
got a working, guessable administrator account and no warning.

Separately, most integration config (Email, Stripe, Google OAuth,
login-security settings) already has a DB-backed Settings screen that takes
precedence over its `.env` fallback, via `SettingsService.resolveProjectSettings()`.
Nothing walked an operator through actually using any of it.

## Decision

`GET /api/setup/status` reports whether the `users` table is empty — the
single source of truth for "does this install still need its first admin,"
with no separate `setup_complete` flag to fall out of sync with reality.
`POST /api/setup` creates that admin, guarded by `dialect.insertIgnore` on a
claim row in `settings` rather than a count-then-insert: two concurrent
submissions both reading a count of zero and both proceeding is exactly the
race a plain check cannot close. The frontend gates all rendering on this
status, alongside its existing auth-loading gate, and shows a multi-step
wizard instead of the login screen while it reports `needsSetup: true`. The
wizard's later steps (company info, Email, Stripe, Google) reuse the exact
Settings-tab components and save paths the authenticated app already has,
via the `SettingsTabRef` imperative-save pattern.

`ADMIN_PASSWORD` is removed outright, not aliased — this project does not
ship backwards-compatibility shims for a variable whose only effect was a
security hole.

## Consequences

- **A scripted or headless deploy (Docker Compose, CI) now needs one extra
  step** — visiting `/setup` once — where it previously got a working admin
  with zero interaction. This is a deliberate trade: the alternative was
  keeping `ADMIN_PASSWORD` as a non-interactive path, which was rejected in
  favour of a single path with no `"password"`-default failure mode.
- **`insertIgnore`'s constraint-conflict behaviour had never been proven
  against a real server** — `mysql.dialect.test.ts`/`sqlite.dialect.test.ts`
  only assert the generated SQL string. `insertIgnoreLive.test.ts` proves it
  against SQLite and MySQL/MariaDB directly, since `completeSetup` is the
  first call site to depend on it for a genuine concurrency guarantee rather
  than idempotent-seeding convenience.
- **If an operator abandons the wizard after the first step**, an admin now
  exists, `needsSetup` is permanently false, and reloading drops them into
  the normal authenticated app with blank company settings rather than
  resuming the wizard. Accepted rather than engineered around, given the
  one-time, users-table-is-the-only-signal design.
- A dedicated `POST /api/setup` was chosen over reusing `register`/`login`:
  `register` does not currently return a token or sign the caller in — a
  pre-existing, unrelated gap — and the wizard needs a genuine session the
  moment its first step succeeds, so its later, admin-only steps (Stripe,
  Google) can save.
