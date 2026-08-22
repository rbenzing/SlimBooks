# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 2.2.x | Yes |
| 2.1.x | Security fixes only |
| 2.0.x | No |
| < 2.0 | No |

Slimbooks is self-hosted, so "supported" means fixes are published — applying
them is the operator's job.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it privately through
[GitHub Security Advisories](https://github.com/rbenzing/SlimBooks/security/advisories/new),
which lets us discuss and fix the issue before it is public.

Please include:

- what the vulnerability is, and what an attacker gains
- steps to reproduce, or a proof of concept
- the version and configuration you found it on — especially `DB_DRIVER`,
  `STORAGE_DRIVER`, `TLS_MODE` and which feature toggles are on
- anything you think we would get wrong about the impact

You will get an acknowledgement, and an assessment once we have reproduced it.
If we disagree about severity we will say so and explain why, rather than
quietly downgrading it.

This is a small project maintained by one person. Response times are best
effort, not contractual.

## Scope

**In scope:** the application, its default configuration, the deployment
artifacts in this repository, and the documented deployment paths.

**Out of scope:**

- Vulnerabilities in a deployment's own infrastructure — your reverse proxy,
  your OS, your network.
- Findings that require configuration the documentation tells you not to use.
  `FEATURE_DEBUG=on` in production and blank signing secrets are documented
  hazards, not vulnerabilities.
- Missing hardening headers on an install running `TLS_MODE=off`, which is
  documented as being for development or a service mesh.
- Automated scanner output with no demonstrated impact.

## For operators

The following are your responsibility, and getting one wrong is the most likely
way a Slimbooks install gets compromised.

### Set the three signing secrets

`JWT_SECRET`, `JWT_REFRESH_SECRET` and `SESSION_SECRET`. **Left blank, the
application signs tokens with values published in this repository, which means
anyone can mint a valid session for your install.**

```bash
./scripts/generate-secrets.sh
```

See [secrets](documentation/operations/secrets.md).

### Set `TRUST_PROXY_HOPS` correctly

With `TLS_MODE=proxy`, forwarded headers are trusted. If the proxy does not
actually send `X-Forwarded-For`, every request appears to come from one address
and the rate limiter attributes them all to one bucket — **the whole install
locks out together.**

If forwarded headers are trusted when nothing is in front of the process, any
client can spoof its own address and defeat the rate limiter entirely. This is
why `TRUST_PROXY_HOPS` is forced to `0` outside `proxy` mode.

### Turn off what you are not using

`FEATURE_DEBUG=off` and `ENABLE_SAMPLE_DATA=false` in production.
`FEATURE_SIGNUP=off` if self-registration should not be open. A toggle set to
`off` does not mount the routes at all, rather than guarding them.

### Use TLS

The application handles financial data. Terminate TLS at the process
(`TLS_MODE=self`) or in front of it (`TLS_MODE=proxy`), and set `CORS_ORIGIN`
to your own domain.

### Keep backups, and restore one

A backup that has never been restored is a hypothesis. See
[backup and restore](documentation/operations/backup-and-restore.md).

## What the application does by default

- **Bearer-token authentication** with silent refresh and refresh-token
  rotation
- **bcrypt** password hashing, cost configurable (default 12)
- **Account lockout** after repeated failed logins (default 5 attempts,
  30 minutes)
- **Rate limiting** globally and, more tightly, on login
- **Security headers** via Helmet
- **Server-side input validation**, with all queries parameterised
- **Storage keys validated before any path arithmetic**, so a user-influenced
  value cannot escape the storage root
- **Stripe webhooks verified by signature** before anything is written
- **No telemetry.** Nothing phones home.

The Stripe secret key is read server-side only and never reaches the browser.
