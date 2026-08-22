# ADR-0006: Recurring invoices run in-process behind a database lease

**Status:** Accepted
**Date:** 2026-08-08 (shipped in 2.0.0)

## Context

Recurring invoices have to be generated when they fall due. The conventional
answer is an external scheduler: crontab on Linux, Task Scheduler on Windows, a
cron panel on a PaaS, a sidecar in Docker.

That is four different mechanisms to document, four to configure, four to get
wrong — and one of them (a PaaS cron panel) may not exist at all. It also puts
the trigger outside the application, where it is invisible to the health check
and cannot be tested.

The endpoint that external schedulers would call, `/api/cron`, was mounted
unconditionally **with no authentication**, so anyone who could reach the
server could generate invoices.

## Decision

The scheduler runs inside the application process on every host. No crontab, no
Task Scheduler, no PaaS cron panel.

Concurrency is controlled by a lease held in the database (`scheduler_leases`),
not by a process-local flag. A worker claims a job by name with an owner id and
an expiry; takeover is permitted only when the lease has lapsed or the same
owner already holds it.

`/api/cron` is mounted **only** when `FEATURE_SCHEDULER=off`, and then behind
`requireAuth` and `requireAdmin`.

## Consequences

- One mechanism to document and one to test, on all four hosts.
- Two instances of the application cannot generate the same invoice twice, and
  a slow run cannot overlap itself.
- **The lease must expire, because a SIGKILLed process cannot release it.**
  Expiry is what makes this safe on an ephemeral host, where the process may be
  killed at any instant. Nothing depends on a clean shutdown for correctness.
- More generally: scheduled inserts need a database-level uniqueness guarantee,
  not an application guard. An application guard does not survive the kill.
- Tuning is environmental: `SCHEDULER_INTERVAL_MS`, `SCHEDULER_LEASE_TTL_MS`
  and `SCHEDULER_INITIAL_DELAY_MS`.
- Turning the scheduler off is a deliberate act that changes the API surface,
  which is the honest way to express "something else owns this now".
