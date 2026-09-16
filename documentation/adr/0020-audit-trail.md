# ADR-0020: The audit trail is a database table with no foreign key

**Status:** Accepted
**Date:** 2026-09-16

## Context

Security-relevant events had no persistent record at all. `securityLogger()` and
`userActivityLogger()` existed in `server/middleware/logging.ts`, were exported
from the middleware barrel, and were called from nowhere; each body was a
`console.log` and a `// TODO: Store in audit log table`. The table they referred
to was never created — though `audit_log` *was* whitelisted in
`TableValidator`, which made the gap look closed to anyone reading that file.

So login success and failure, logout, password changes and resets, user
creation, deletion and role changes, settings changes, and database export and
import produced nothing beyond an access-log line carrying no subject and no
outcome. The only persisted security state was `users.failed_login_attempts` and
`users.last_login`, which are overwritten counters rather than history — and
until 3.0.0 both were writable by anyone, through four unauthenticated routes.

SOC 2 CC7.2 and CC7.3 expect a detective control and evidence for incident
evaluation. More concretely: after an incident, someone has to answer *who
changed this, when, and from where*, and nothing in the application could.

## Decision

A single `audit_log` table, written by `AuditService`, read through an
admin-only `GET /api/audit`.

**No foreign key to `users`.** An audit record has to outlive the account it
describes — "who deleted this administrator" is precisely the question asked
after the administrator is gone. A `CASCADE` would erase the evidence along with
the user; a `RESTRICT` would block the deletion the record exists to document.
The actor is therefore stored twice: `actor_user_id` for joining while the
account exists, and `actor_email` as it read at the time, which survives.

**`actor_user_id` is nullable.** A failed login against an address with no
account is one of the most useful records in the table, and it has no user id to
carry. A non-null constraint here would have made the single most common attack
signature unrecordable.

**`outcome` is a column, not a field inside `details`.** "Show me the failures"
is the first query anyone runs, and it should not require parsing JSON.

**`details` is JSON text.** The interesting payload differs per action — which
role changed, which setting key — and widening the table per action is how audit
schemas rot.

**Writes never fail the request.** `AuditService.record()` catches its own
errors and reports them to stderr. An audit table that can 500 a login is an
availability bug wearing a compliance costume. The trade is deliberate and
asserted by a test: a lost record is visible in the process log, whereas a
locked-out user is an outage.

**Settings changes record the key, never the value.** Settings hold the Stripe
secret key and the SMTP password; an audit log that quietly accumulates
credentials becomes a second copy of exactly what it exists to protect.

**Retention is a scheduled prune,** governed by `AUDIT_RETENTION_DAYS` (default
365). Retention is a requirement in both directions: an assessor wants records
kept long enough to investigate, and GDPR wants the source IP addresses in them
not kept forever.

## Consequences

The trail is queryable, survives restarts, travels with the database backup, and
works identically on both engines.

It is **not tamper-evident**. An administrator with database access can delete
rows, and the API deliberately offers no way to — but the table is not
append-only, and there is no hash chain or off-host shipping. Genuine
tamper-evidence needs infrastructure a self-hosted application cannot assume
exists. An operator who needs it should ship the table off-host; that is a
deployment decision, not one this codebase can make.

`google_id` and the unused `two_factor_secret` columns remain untouched by this
change; the trail records actions, not schema.

## Alternatives considered

**An append-only file (JSONL) beside the database.** Harder for a
database-level attacker to rewrite, which is a real advantage. Rejected because
it is not queryable from the application, needs rotation the project does not
have, and is lost on an ephemeral filesystem — exactly the hosts
`documentation/operations/` steers toward `STORAGE_DRIVER=database` for this
same reason. A table that survives a redeploy beats a file that does not.

**Both, mirrored.** The most defensible to an assessor, and roughly double the
code with two things to keep in step. Deferred rather than refused: if an
operator needs the file, the service has one write path to extend.
