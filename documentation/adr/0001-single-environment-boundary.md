# ADR-0001: Only the runtime composition root reads `process.env`

**Status:** Accepted
**Date:** 2026-08-08 (shipped in 2.0.0)

## Context

Host-dependent facts — where the database lives, which port to bind, whether
TLS is terminated here — were read wherever they were needed. `process.env`
appeared throughout the server, and modules derived paths with `__dirname`
arithmetic such as `join(__dirname, '..', 'dist')`.

That expression means one thing under `tsx` and another once compiled, because
the file's depth in the tree changes. Five copies of that arithmetic existed.
The results:

- the database resolved to two different places depending on how the process
  started, producing a phantom `server/data/` directory alongside the real one
- the built server served its own JavaScript instead of the SPA
- uploaded logos 404'd, because the upload directory resolved elsewhere again

Each was found on a real server, not by a test, because every one of those
paths resolved correctly under the test runner.

## Decision

`server/runtime/env.ts` is the only module permitted to read `process.env`.

Every other module receives resolved values through a `Runtime` object, built
once at boot and frozen. `env.ts` and `paths.ts` import nothing from the rest
of the project, so they load standalone and can be tested without booting
anything.

Paths resolve from `findProjectRoot()` — the directory holding `package.json` —
never from `__dirname`. `server/runtime/paths.test.ts` guards this.

Readers validate rather than coerce. `readInt` throws on a non-integer instead
of returning `NaN`; `readToggle` rejects anything that is not `auto`, `on` or
`off`. A configuration fault stops the process before it opens a socket.

## Consequences

- The full host matrix can be tested without a host: resolution is a pure
  function of a `RawEnv` record.
- A misconfiguration is a startup failure with a named variable in the message,
  not a runtime surprise hours later.
- Removed variables are rejected, not ignored. An environment still carrying
  `ENABLE_HTTPS` fails to boot with a message naming `TLS_MODE` as its
  replacement, because silently ignoring it would reintroduce the original bug.
  The same applies to `SSL_KEY_PATH`, `SSL_CERT_PATH` and
  `ENABLE_DEBUG_ENDPOINTS`.
- **Two modules predate this and still read `process.env`:**
  `server/config/index.ts` and `server/database/config/sqlite.config.ts`, for
  `UPLOAD_PATH`, `BACKUP_*`, `DB_BACKUP_PATH` and `LOG_LEVEL`. They are a known
  exception, not a precedent. `.env.example` consequently carries two
  vocabularies; the runtime's names win. See the
  [configuration reference](../operations/configuration.md).
- A boot guard refuses to start when a database exists at a legacy location
  (`server/data/slimbooks.db` among them) and **not** at the configured one,
  naming both paths. Picking one silently could mean invoicing customers from
  stale books; seeding a fresh database silently would look like total data
  loss. The same rule covers stranded upload directories. Under
  `DB_DRIVER=mysql` the database half of the check is skipped, since the
  resolved SQLite file is never expected to exist.
