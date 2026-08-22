# ADR-0016: systemd on bare Linux, HttpPlatformHandler on IIS

**Status:** Accepted
**Date:** 2026-08-12 (designed; artifacts not yet shipped)

## Context

Two of the four supported hosts need something to supervise the process, and
each has more than one candidate.

On Linux, the usual choice is between systemd and PM2. On Windows, between
HttpPlatformHandler and iisnode.

## Decision

**Bare Linux: systemd only.**

It is present on every modern distribution, so there is nothing to install. It
gives restart policy, journald logging and boot ordering natively. PM2 adds a
dependency the application does not need — and its main selling point, cluster
mode, is wrong here: the application is single-process by design, because the
scheduler takes a database lease
([ADR-0006](0006-in-process-scheduler.md)) rather than relying on there being
one instance.

**Windows IIS: HttpPlatformHandler.**

It is Microsoft's supported, maintained module. iisnode is effectively
unmaintained and awkward on current Windows Server.

## Consequences

- The systemd unit is `Type=simple`, `Restart=always`, with
  `EnvironmentFile=/etc/slimbooks/slimbooks.env`, running
  `node dist/server/index.js` as a dedicated user.
- Hardening is scoped to what is true of this application rather than copied
  wholesale: `NoNewPrivileges=yes`, `ProtectSystem=strict`, `PrivateTmp=yes`,
  and `ReadWritePaths=` naming `DATA_DIR` and `UPLOAD_DIR` only — those two
  directories are the entire persistent surface, guaranteed by the runtime.
- **HttpPlatformHandler forwards to localhost without adding
  `X-Forwarded-For`.** With `TLS_MODE=proxy`, `TRUST_PROXY_HOPS` defaults to 1,
  Express finds no such header and falls back to the socket address —
  `127.0.0.1` for every request. All users then share one rate-limit bucket and
  the install locks out as a whole.

  **A URL Rewrite rule supplying that header is therefore a prerequisite, not
  an extra.** Shipping the `web.config` alone would produce something that
  appears to work until roughly the tenth concurrent user.
- `web.config` maps `%HTTP_PLATFORM_PORT%` into `PORT` and sets
  `HOST=127.0.0.1`, so the process does not also bind publicly behind the
  proxy. IIS may supply a named pipe rather than a port, which is why `PORT` is
  never parsed as a number ([ADR-0002](0002-environment-driven-not-host-detected.md)).
- Neither artifact ships yet. They are specified in
  [specs/002-deployment-artifacts.md](../specs/002-deployment-artifacts.md).
- **Neither can be verified on the development machine.** They ship as reviewed
  templates, and the documentation says so in those words rather than implying
  they were booted.
