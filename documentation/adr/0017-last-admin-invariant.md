# ADR-0017: The last-administrator invariant lives in the statement, not around it

**Status:** Accepted
**Date:** 2026-08-23

## Context

Four things could leave an install without an administrator:

- **Demotion was unguarded.** `PUT /api/users/:id` could change `role` away
  from `admin` with no check at all — only `DELETE` was ever guarded.
- **The delete guard was check-then-act.** `AuthService.deleteUser` counted
  administrators and then deleted, as two separate statements. Two concurrent
  deletes of the last two administrators both read a count of 2, both pass,
  and both proceed — leaving zero.
- **The count ignored `deleted_at`.** A soft-deleted administrator still
  counted as one, so the last *live* administrator could be removed while a
  dead row propped the count up.
- **`password_hash` was settable through `PUT /api/users/:id`.** The general
  update endpoint accepted a caller-supplied hash directly, bypassing the
  strength check and the bcrypt cost that setting a password anywhere else
  applies.

## Decision

`server/utils/adminInvariant.util.ts` expresses the rule as a SQL predicate,
`lastAdminGuard(table)`, appended to the `DELETE` and to the guarded `UPDATE`
rather than checked beforehand:

```sql
NOT (role = 'admin' AND
  (SELECT live FROM (SELECT COUNT(*) AS live FROM users
   WHERE role = 'admin' AND deleted_at IS NULL) AS live_admins) <= 1)
```

The check and the write are one statement, so there is no window for a second
request to land in. **Zero affected rows is the refusal** — `MutationOutcome`
(`'applied' | 'refused' | 'missing'`) keeps that distinct from "no such row",
so a controller cannot turn a refusal into a 404. `UserService.updateUser`
attaches the guard only when the update actually demotes an administrator
(`demotesAdmin(role) && existingUser.role === 'admin'`); promoting someone, or
editing the sole administrator's own name, never touches the invariant and is
never refused.

`password_hash` is no longer in `updateUser`'s field whitelist. Passwords now
change through `POST /api/users/:id/password`, which validates length against
`validationConfig.password` and hashes with `authConfig.bcryptRounds` — the
checks a caller-supplied hash would have bypassed.

## Consequences

- **MariaDB accepts the bare subquery and MySQL does not.** One `mysqlDialect`
  serves both, so a developer testing only against MariaDB can unwrap the
  derived table and ship SQL that MySQL rejects with error 1093. The live test
  runs against MySQL specifically.
- **No `SqlDialect` method was added.** The derived-table form is portable
  across all three engines — verified, not assumed, against SQLite, MySQL
  8.4.11 and MariaDB 10.11 — so there is no dialect difference to encode
  ([ADR-0008](0008-dialect-differences-in-one-place.md)). A method returning
  the same string for both dialects would be ceremony, not compliance.
- `DELETE /api/users/:id` and `PUT /api/users/:id` return **409**, not 400 or
  500: the request is well-formed and the caller is permitted, it conflicts
  with the state of the install. The response carries a message meant to be
  shown as written — `"This is the only administrator. Promote another
  account first."` for delete, `"This is the only administrator. Promote
  another account before changing this one’s role."` for demotion.
- **Zero affected rows means "refused" only when a guard was attached.**
  MySQL's `changes` is `affectedRows`, which counts rows whose values actually
  changed; SQLite counts every row the statement touched. An unguarded update
  that writes the values a row already holds is therefore `0` on MySQL and `1`
  on SQLite — reading an unguarded `0` as a refusal would turn a harmless
  no-op into a 409 on one backend only. A guarded update is attached only when
  the role is genuinely moving away from `admin`, so its `0` is unambiguous.
- Self-delete and self-demote are allowed as long as another administrator
  remains; the screen warns that this signs the caller out, then does.
- Proven against all three engines in `userInvariantLive.test.ts`: refusing to
  delete the last administrator, permitting deletion of a non-last one,
  refusing to demote the last administrator, excluding a soft-deleted
  administrator from the count, and a concurrency case — two simultaneous
  deletes of the last two administrators — that leaves exactly one standing.
- The live suite runs against `invariant_probe`, a table private to that test
  file, not `users` — `baselineLive.test.ts` drops every table in
  `tableSchemas`, `users` included, inside the same `slimbooks_test` database,
  and test files run in parallel, so exercising `users` here would race it.
