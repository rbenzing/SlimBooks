# ADR-0002: Configuration is environment-driven, never host-detected

**Status:** Accepted
**Date:** 2026-08-08 (shipped in 2.0.0)

## Context

Slimbooks targets four kinds of host: Docker, bare Linux under systemd, Windows
IIS behind HttpPlatformHandler, and a Node PaaS. The obvious way to support
four hosts is to detect which one you are on and branch.

Detection is a guess. It is wrong on the host nobody tested, it cannot be
exercised from a developer machine, and it makes the artifact behave
differently depending on facts the operator cannot see or override. A branch
taken on a hostname or an environment sniff is a code path that only exists in
production.

## Decision

There is no host detection anywhere. No `if (platform === 'iis')`, no
inspection of `process.platform` to choose behaviour, no probing for a PaaS
marker variable.

Hosts differ only in the environment they supply. A deployment artifact — a
compose file, a systemd unit, a `web.config` — carries environment values and
nothing else. It never selects a code path.

## Consequences

- One artifact runs everywhere. `npm run build` produces the same
  `dist/client` + `dist/server` regardless of destination.
- Development and production run the same code, so a bug reproduces locally by
  copying an environment rather than by acquiring a host.
- Host quirks become environment values. IIS supplies `PORT` as a named pipe
  path, so `PORT` is never parsed as a number — a non-numeric value is passed
  to `server.listen()` verbatim, which is what Node expects for a pipe. When
  the target is a pipe, `HOST` is not read at all: a pipe carries its own
  identity, and binding a host alongside it is an error rather than a
  refinement.
- Anything a host cannot provide is expressed as a toggle rather than a
  detection: see [ADR-0003](0003-tri-state-feature-toggles.md).
- Adding a host means writing a template, not writing code.
