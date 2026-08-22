# Configuration reference

Every environment variable the application reads, where it is read, and what
happens when it is absent.

`.env.example` is the single environment template. Copy it and edit the copy:

```bash
cp .env.example .env
```

There is no `.env.production`. A second template only created two places to
keep the same list of keys in step, and they drifted.

## Precedence

1. **Settings screens** — anything saved in the UI wins.
2. **`.env`** — the defaults an install starts from.
3. **Built-in defaults** — listed in the tables below.

Email and Stripe can be configured entirely from Settings if you prefer.

## Two vocabularies

Most variables are read by `server/runtime/env.ts`, the only module permitted
to touch `process.env` ([ADR-0001](../adr/0001-single-environment-boundary.md)).

Seven predate that runtime and are still read directly by
`server/config/index.ts` and `server/database/config/sqlite.config.ts`:
`UPLOAD_PATH`, `BACKUP_ENABLED`, `BACKUP_SCHEDULE`, `BACKUP_RETENTION`,
`BACKUP_DIR`, `DB_BACKUP_PATH` and `LOG_LEVEL`.

**Where the two overlap, the runtime's name wins.** Set `UPLOAD_DIR`, not
`UPLOAD_PATH`; the runtime resolves the uploads directory and the legacy value
is not consulted for it.

The **Read by** column below says which is which.

## Required

| Variable | Read by | Notes |
|---|---|---|
| `CLIENT_URL` | runtime | **Required. The boot fails without it.** Where the browser reaches this server; used in emailed links. Trailing slashes are stripped. |

Three more are not technically required but must be set before exposing the
install to a network — see [Security](#security).

## Server

| Variable | Default | Read by | Notes |
|---|---|---|---|
| `PORT` | `3002` | runtime | A port, **or a named pipe path**. Never parsed as a number; a non-numeric value is passed to `listen()` verbatim. A numeric value outside 1–65535 fails the boot. |
| `HOST` | `0.0.0.0` | runtime | Interface to bind. **Not read when `PORT` is a named pipe** — a pipe carries its own identity. |
| `NODE_ENV` | `development` | legacy | `production` in every deployment. |

## Filesystem paths

All resolve to absolute paths at boot, relative to the project root when given
relatively.

| Variable | Default | Read by | Notes |
|---|---|---|---|
| `DATA_DIR` | `./data` | runtime | The database and its backups. **Must survive a redeploy** under `DB_DRIVER=sqlite`. |
| `UPLOAD_DIR` | `./uploads` | runtime | Uploaded logos. **Must survive a redeploy** under `STORAGE_DRIVER=disk`. |
| `STATIC_DIR` | `dist/client` | runtime | Where the built SPA lives. Rarely set. |
| `UPLOAD_PATH` | `uploads` | legacy | Superseded by `UPLOAD_DIR`. Prefer `UPLOAD_DIR`. |

## Database

| Variable | Default | Read by | Notes |
|---|---|---|---|
| `DB_DRIVER` | `sqlite` | runtime | `sqlite` or `mysql`. MariaDB uses `mysql`. |
| `DB_PATH` | `slimbooks.db` | runtime | SQLite only. **A relative value resolves inside `DATA_DIR`**, so moving the data directory moves the database with it. Absolute is used as given. |
| `DB_TIMEOUT_MS` | `30000` | runtime | SQLite busy timeout, in milliseconds. |
| `DB_HOST` | — | runtime | MySQL. **Required** when `DB_DRIVER=mysql`. |
| `DB_PORT` | `3306` | runtime | MySQL. |
| `DB_NAME` | — | runtime | MySQL. **Required.** |
| `DB_USER` | — | runtime | MySQL. **Required.** |
| `DB_PASSWORD` | — | runtime | MySQL. **Required to be present**, may be empty. An empty password is a configuration; an absent one is a mistake. |
| `DB_SSL` | `false` | runtime | MySQL. |
| `DB_POOL_SIZE` | `10` | runtime | MySQL. |
| `DB_BACKUP_PATH` | `data/backups` | legacy | Where `backup()` writes. |

A MySQL boot fails naming **every** missing variable at once, rather than
erroring on the first query. See [database backends](database-backends.md).

### The container's route to the database

Read by `docker-compose.yml`, **not by the application**. A container's view of
the network is not the host's — `127.0.0.1` inside a container is the container
itself — so compose passes these in as `DB_HOST` and `DB_PORT`, overriding the
two above for the container only.

One `.env` then serves both `npm run dev` and `docker compose up`, and no
committed file names a specific database container.

| Variable | Default | Notes |
|---|---|---|
| `DOCKER_DB_HOST` | `host.docker.internal` | Use the container name instead if you attach the database to `slimbooks_default` |
| `DOCKER_DB_PORT` | `3306` | The port as seen from the container — a published host port, or 3306 over a shared network |
| `DOCKER_CLIENT_URL` | `https://localhost:8080` | Overrides `CLIENT_URL` for the container, which must match the scheme `TLS_MODE` produces |

Ignored entirely under `DB_DRIVER=sqlite`.

## Uploaded files

| Variable | Default | Read by | Notes |
|---|---|---|---|
| `STORAGE_DRIVER` | `disk` | runtime | `disk` or `database`. Use `database` on any host whose filesystem is wiped on redeploy — with `disk` there, every logo disappears on the next deploy. |
| `MAX_FILE_SIZE` | `10485760` | legacy | Bytes. 10 MB. |

## TLS and proxying

| Variable | Default | Read by | Notes |
|---|---|---|---|
| `TLS_MODE` | `off` | runtime | `off` \| `self` \| `proxy`. Anything else fails the boot. |
| `TLS_KEY_PATH` | — | runtime | **Required when `TLS_MODE=self`.** |
| `TLS_CERT_PATH` | — | runtime | **Required when `TLS_MODE=self`.** |
| `TRUST_PROXY_HOPS` | `1` in `proxy` mode, forced to `0` otherwise | runtime | Negative values fail the boot. |

> **`proxy` mode behind a proxy that does not send `X-Forwarded-For` locks out
> the whole install.** Express falls back to the socket address, every request
> looks like `127.0.0.1`, and all users share one rate-limit bucket.
> `TRUST_PROXY_HOPS=0` does not help. IIS behind HttpPlatformHandler is exactly
> this case and needs a URL Rewrite rule to supply the header.
> ([ADR-0005](../adr/0005-declared-tls-termination.md))

## Feature toggles

Each is `auto | on | off`; unset means `auto`. A boolean is rejected with an
error naming the three legal states.
([ADR-0003](../adr/0003-tri-state-feature-toggles.md))

| Variable | Dependency |
|---|---|
| `FEATURE_PDF` | Chromium, via Puppeteer |
| `FEATURE_EMAIL` | SMTP configuration |
| `FEATURE_STRIPE` | Stripe keys |
| `FEATURE_OAUTH` | Google OAuth credentials |
| `FEATURE_SCHEDULER` | None — `off` mounts `/api/cron` behind admin auth instead |
| `FEATURE_UPLOADS` | The storage provider |
| `FEATURE_DB_ADMIN` | None — operational surface |
| `FEATURE_SIGNUP` | None — whether self-registration is open |
| `FEATURE_DEBUG` | None — **never `on` in production** |

## Scheduler

Read only when the scheduler feature is enabled.

| Variable | Read by | Notes |
|---|---|---|
| `SCHEDULER_INTERVAL_MS` | runtime | How often due work is checked. |
| `SCHEDULER_LEASE_TTL_MS` | runtime | Lease lifetime. Must exceed a run's duration; expiry is what makes a SIGKILL survivable. |
| `SCHEDULER_INITIAL_DELAY_MS` | runtime | Delay before the first run after boot. |

## Security

| Variable | Default | Read by | Notes |
|---|---|---|---|
| `JWT_SECRET` | a published placeholder | legacy | **Set this.** Left blank, tokens are signed with a value published in this repository. |
| `JWT_REFRESH_SECRET` | a published placeholder | legacy | **Set this.** |
| `SESSION_SECRET` | a published placeholder | legacy | **Set this.** |
| `ACCESS_TOKEN_EXPIRY` | `7200000` | legacy | 2 hours, in ms. |
| `REFRESH_TOKEN_EXPIRY` | `604800000` | legacy | 7 days. |
| `EMAIL_TOKEN_EXPIRY` | `86400000` | legacy | 24 hours. |
| `PASSWORD_RESET_EXPIRY` | `3600000` | legacy | 1 hour. |
| `BCRYPT_ROUNDS` | `12` | legacy | Password hashing cost. |
| `MAX_FAILED_LOGIN_ATTEMPTS` | `5` | legacy | Before lockout. |
| `ACCOUNT_LOCKOUT_DURATION` | `1800000` | legacy | 30 minutes. A locked account gets HTTP 423. |
| `REQUIRE_EMAIL_VERIFICATION` | `false` | legacy | |
| `ADMIN_PASSWORD` | — | legacy | Used only when seeding an empty database. |

Generate the three secrets with `./scripts/generate-secrets.sh` — see
[secrets](secrets.md).

## CORS and rate limiting

| Variable | Default | Read by |
|---|---|---|
| `CORS_ORIGIN` | `http://localhost:8080` | legacy |
| `CORS_CREDENTIALS` | `false` unless the literal string `true` | legacy |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | legacy |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | legacy |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `900000` | legacy |
| `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` | `5` | legacy |

## Email

The names are `SMTP_*`, **not `EMAIL_*`**. An earlier template documented
`EMAIL_HOST` / `EMAIL_USER` / `EMAIL_PASSWORD`, which nothing reads — setting
those configured nothing at all.

| Variable | Default | Read by | Notes |
|---|---|---|---|
| `SMTP_HOST` | — | legacy | |
| `SMTP_PORT` | `587` | legacy | |
| `SMTP_SECURE` | `false` | legacy | `true` for SSL on connect (465); `false` for STARTTLS (587). |
| `SMTP_USER` | — | legacy | |
| `SMTP_PASS` | — | legacy | |
| `EMAIL_FROM` | `noreply@slimbooks.app` | legacy | |

Email counts as configured when `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are
all present.

## Stripe

| Variable | Default | Read by | Notes |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | — | legacy | Server-side only; never sent to the browser. |
| `STRIPE_PUBLISHABLE_KEY` | — | legacy | |
| `STRIPE_WEBHOOK_SECRET` | — | legacy | Without it, clients can pay but invoices are not marked paid — there is no verified way to know the payment happened. |
| `DEFAULT_CURRENCY` | `usd` | legacy | Used when an invoice does not name one. |

The integration counts as configured when the secret and publishable keys are
both present.

## Google OAuth

| Variable | Read by |
|---|---|
| `GOOGLE_CLIENT_ID` | legacy |
| `GOOGLE_CLIENT_SECRET` | legacy |
| `GOOGLE_REDIRECT_URI` | legacy |

Configured when the id and secret are both present.

## Backups and logging

| Variable | Default | Read by | Notes |
|---|---|---|---|
| `BACKUP_ENABLED` | `false` | legacy | |
| `BACKUP_SCHEDULE` | `0 2 * * *` | legacy | **Quote it.** `scripts/deploy.sh` sources `.env`, and unquoted the shell reads the spaces as a command. |
| `BACKUP_RETENTION` | `30` | legacy | Days. |
| `BACKUP_DIR` | `./data/backups` | legacy | |
| `LOG_LEVEL` | `debug` in development, `info` otherwise | legacy | |

## Development helpers

| Variable | Default | Read by | Notes |
|---|---|---|---|
| `ENABLE_SAMPLE_DATA` | `false` | legacy | Never enable in production. |
| `TEST_MYSQL_URL` | — | tests | Points the suite at a live MySQL/MariaDB. Unset, those suites skip. |

## Removed variables

These are **rejected at boot**, not ignored. An environment still carrying one
fails to start with a message naming its replacement, because silently ignoring
a stale `ENABLE_HTTPS` would reintroduce the bug that motivated the change.

| Removed | Use instead |
|---|---|
| `ENABLE_HTTPS` | `TLS_MODE` (`off` \| `self` \| `proxy`) |
| `SSL_KEY_PATH` | `TLS_KEY_PATH` |
| `SSL_CERT_PATH` | `TLS_CERT_PATH` |
| `ENABLE_DEBUG_ENDPOINTS` | `FEATURE_DEBUG` (`auto` \| `on` \| `off`) |

## Known discrepancies

Documented rather than hidden, because a template that lies is worse than one
that admits a gap.

- **`.env.example` sets `DB_TIMEOUT=5000`, which nothing reads.** The code
  reads `DB_TIMEOUT_MS`, defaulting to `30000`. Set `DB_TIMEOUT_MS`.
- **`UPLOAD_PATH` and `UPLOAD_DIR` both appear** in the template. `UPLOAD_DIR`
  is the one the runtime resolves.
- **`server/config/index.ts` still defines an `enableDebugEndpoints` flag from
  `ENABLE_DEBUG_ENDPOINTS`**, but that variable is rejected at boot, so the
  flag can only ever be false. `FEATURE_DEBUG` is the live control.

Collapsing the legacy config modules into the runtime is deliberately out of
scope for [spec 002](../specs/002-deployment-artifacts.md) and needs its own
change.
