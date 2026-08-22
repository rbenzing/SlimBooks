# ADR-0005: TLS termination is declared, not detected

**Status:** Accepted
**Date:** 2026-08-08 (shipped in 2.0.0)

## Context

The previous setting was `ENABLE_HTTPS`, and **nothing read it.** A deployment
that asked for HTTPS quietly served plain HTTP, for months, with no error
anywhere. The variable existed in the template, operators set it, and it
configured nothing at all.

There is also a second question a boolean cannot answer. "Is this served over
HTTPS?" and "does *this process* terminate TLS?" are different, and the answer
changes what the process must do:

- terminating TLS itself means loading a key and certificate
- sitting behind a proxy that terminates means trusting forwarded headers
- neither means doing nothing

## Decision

`TLS_MODE` is `off | self | proxy`, read by the server itself at boot.

| Mode | Meaning |
|---|---|
| `off` | Plain HTTP. Development, or a container behind a service mesh. |
| `self` | This process terminates TLS with `TLS_KEY_PATH` and `TLS_CERT_PATH`. Both are required; a missing one fails the boot. |
| `proxy` | Something in front terminates it — IIS, nginx, Caddy, a PaaS router. |

In `proxy` mode, `TRUST_PROXY_HOPS` sets Express's `trust proxy` and defaults
to `1`. In every other mode it is forced to `0`.

## Consequences

- Forwarded headers are trusted only when something is actually in front of the
  process. Trusting them otherwise lets any client spoof its own address and
  defeat the rate limiter entirely.
- **`proxy` mode with a proxy that does not send `X-Forwarded-For` is an
  outage.** Express falls back to the socket address, so every request appears
  to come from `127.0.0.1`, the rate limiter attributes them all to one bucket,
  and the whole install locks out together. `TRUST_PROXY_HOPS=0` does not help;
  the address is still the socket's.
- IIS behind HttpPlatformHandler is exactly that case. It forwards to localhost
  without adding the header, so the IIS deployment requires a URL Rewrite rule
  that supplies `X-Forwarded-For` from `{REMOTE_ADDR}`. See
  [ADR-0016](0016-process-managers.md).
- Certificate paths resolve relative to the project root when given relatively,
  absolute when given absolutely — no `__dirname` arithmetic.
- `ENABLE_HTTPS`, `SSL_KEY_PATH` and `SSL_CERT_PATH` are rejected at boot with
  a message naming their replacements, rather than being aliased. Aliasing them
  would reintroduce the class of bug this replaced.
