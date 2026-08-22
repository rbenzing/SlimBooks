# ADR-0003: Feature toggles are tri-state, not boolean

**Status:** Accepted
**Date:** 2026-08-08 (shipped in 2.0.0)

## Context

Some capabilities depend on the host. PDF rendering needs Chromium, which a
Node PaaS does not have. Email needs SMTP credentials. Stripe needs keys.

A boolean cannot express what an operator actually wants. `PDF=true` on a host
without Chromium either crashes at the first download or silently degrades —
and silent degradation is the failure that motivated this: "unavailable" and
"disabled" were the same state, so an install with no PDF rendering looked
exactly like one that had turned it off deliberately.

But "always fail loudly" is wrong too. The same image has to run on the PaaS
where Chromium genuinely is not available, and there the correct behaviour is
to run without it.

## Decision

Every toggle is `auto | on | off`:

| State | Meaning |
|---|---|
| `auto` | Enable the feature if its dependency resolves on this host. Degrade quietly if not. |
| `on` | Require it. **The process refuses to start** if the dependency is missing. |
| `off` | Never mount it. The routes do not exist. |

Unset means `auto`. A boolean value is rejected with an error naming the three
legal states.

The nine toggles are `FEATURE_PDF`, `FEATURE_EMAIL`, `FEATURE_STRIPE`,
`FEATURE_OAUTH`, `FEATURE_SCHEDULER`, `FEATURE_UPLOADS`, `FEATURE_DB_ADMIN`,
`FEATURE_SIGNUP` and `FEATURE_DEBUG`.

## Consequences

- `on` converts a silent production degradation into a startup failure an
  operator cannot miss. That is the entire point of the third state.
- `auto` lets one image serve hosts of differing capability.
- `off` is a security control as much as a capability one: `FEATURE_DEBUG=off`
  and `FEATURE_SIGNUP=off` remove routes rather than guarding them.
  `FEATURE_SCHEDULER=off` is what mounts `/api/cron` — see
  [ADR-0006](0006-in-process-scheduler.md).
- Resolved feature state is public at `/api/health` and `/api/config`. "Why is
  there no PDF button here" is answerable without reading container logs.
- The SPA is built once and deployed anywhere, so it cannot know its host's
  capabilities until it asks — hence `/api/config`.
- A feature qualifies as toggleable only if it depends on a host capability
  that is not universal, or exposes operational surface an operator may want
  closed. Everything else is core and always on.
