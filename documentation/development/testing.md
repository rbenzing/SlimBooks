# Testing

## The gate

```bash
npm run typecheck   # frontend + vite config + server
npm run lint        # ESLint (0 errors, 0 warnings) + typecheck
npm test            # Vitest
npm run build
```

All four must pass. **0 errors and 0 warnings** is the standing bar, not an
aspiration — correctness rules are errors and hygiene rules are warnings, and
both are kept at zero so a new one is visible.

`@ts-ignore` is banned. Prefix an unused parameter with `_` rather than
disabling a rule; an `eslint-disable` needs a reason. Never `any` — use
`unknown` or a real interface.

> **`npx tsc --noEmit` alone is not the typecheck.** It covers only the
> frontend — and once covered *nothing*, because the root config had
> `"files": []` with unbuilt references, hiding 49 real errors. If it passes
> suspiciously fast, confirm with
> `npx tsc --noEmit --listFilesOnly | wc -l`. Use `npm run typecheck`.

## Verify against the real thing

**Every serious defect in the last three releases was found by running against
a real engine or booting the application — never by a passing unit suite.
Twice, a test was asserting the broken behaviour and passing.**

This is the most expensive lesson the project has learned, so it goes first.

- **A test over generated SQL proves the string, not that a database accepts
  it.** 2.2.0 probed `TIMESTAMPDIFF` successfully and still shipped SQL that
  MySQL 8.4 rejects, because the probe was handed a value MySQL already liked.
  A live probe of an *expression* is not a live test of the *migration*.
- **Reports returned nothing** because calendar-day strings were bound against
  epoch columns at four sites. A unit test asserted the broken bound and
  passed.
- **The path bugs of 2.0.0** — the phantom database, the server serving its own
  JavaScript, the 404ing logos — all resolved correctly under the test runner.

Run it against the engine, boot the application, or **say plainly that you did
not.**

## The suite that lies

> **The MySQL suite skips itself with no server configured and reports green.**

A run with skips is not a green run. CI defends against this explicitly: a step
named "Confirm the MySQL suite is not skipped" parses the result count and
fails the job if the suite skipped rather than ran.

Do the same locally — check that the count moved, not just that the output was
green.

## Both engines

Anything database-shaped needs both.

```bash
docker run --rm -d --name slimbooks-mysql \
  -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=slimbooks_test \
  -p 3307:3306 mysql:8

TEST_MYSQL_URL=mysql://root:root@127.0.0.1:3307/slimbooks_test npm test
```

For MariaDB, swap the image and the variable names: `mariadb:10.11`,
`MARIADB_ROOT_PASSWORD`, `MARIADB_DATABASE`, and a different port.

CI runs MySQL 8.0 and MariaDB 10.11 on every push, via
`npx vitest run server/` against a service container.

## Standing guards

Some tests exist to stop a whole class of mistake returning. Treat a failure in
one as a design question, not a test to adjust.

| Test | Guards |
|---|---|
| `server/database/index.test.ts` | **Schema drift.** SQLite replays migrations and MySQL is baselined from `tables.schema.ts`; nothing else forces the two to agree. |
| `server/database/portableSql.test.ts` | No `toISOString()` into a column; no literal `T00:00:00` / `T23:59:59` outside `utcTime.util.ts` |
| `server/database/reservedWords.test.ts` | `key` is backticked — it is reserved in MySQL and is a column in three tables |
| `server/runtime/paths.test.ts` | No return of `__dirname` arithmetic |

## Writing tests

- Extract logic into database-free modules so tests can load it standalone.
  `server/utils/reportPeriods.util.ts` is the pattern.
- **Live database suites need explicit hook timeouts.** They do real DDL
  against a shared server, and Vitest's 10-second default fails them only in a
  full run — which looks like flakiness rather than a timeout.
- **A fixture must not borrow `createTables()` to build "old" tables.** Tables
  are now `STRICT`, so a migration test that needs pre-migration shapes has to
  declare its own legacy DDL. Migration 014's test is the pattern.
- **`localStorage` in `src/test/setup.ts` is a set of no-op `vi.fn()` stubs**,
  so writes vanish. Install a memory shim locally — `authToken.test.ts` is the
  pattern. Don't change the shared setup; other suites rely on the stubs.

## Commands

```bash
npm test                 # once
npm run test:watch       # watch
npm run test:ui          # Vitest UI
npm run test:coverage    # coverage
npx vitest run server/   # server suite only
```

## Before you say it works

- Did the suite **run**, or did it skip?
- Did you run it against **both** engines, if it touches the database?
- Did you **boot the application** if it touches the runtime, paths, or the
  schema?
- If you did none of those, say so.
