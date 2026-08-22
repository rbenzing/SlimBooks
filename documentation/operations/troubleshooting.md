# Troubleshooting

Slimbooks fails at boot rather than at the first request whenever it can. A
configuration fault stops the process **before it opens a socket**, and the
error names the variable. That makes most problems here diagnosable from the
first line of output.

Start with:

```bash
curl -k http://localhost:3002/api/health
```

It reports the version, database connectivity, and the features and providers
this instance actually resolved.

## The process will not start

### `CLIENT_URL is required but not set.`

`CLIENT_URL` is the one variable with no default. Set it to the address users
actually reach — it is used in emailed links.

### `Environment contains N removed variable(s)`

The message names each one and its replacement. `ENABLE_HTTPS` → `TLS_MODE`,
`SSL_KEY_PATH` → `TLS_KEY_PATH`, `SSL_CERT_PATH` → `TLS_CERT_PATH`,
`ENABLE_DEBUG_ENDPOINTS` → `FEATURE_DEBUG`.

They are rejected rather than ignored on purpose: `ENABLE_HTTPS` was read by
nothing, so an install that asked for HTTPS quietly served plain HTTP for
months. Remove the stale lines from `.env`.

### `TLS_MODE must be one of: off, self, proxy`

Including if you set it to `true`. TLS is a three-state fact, not a boolean
([ADR-0005](../adr/0005-declared-tls-termination.md)).

### `TLS_MODE is "self" but TLS_KEY_PATH is not set.`

`self` means this process terminates TLS, which needs both `TLS_KEY_PATH` and
`TLS_CERT_PATH`. Generate a pair:

```bash
cd scripts && ./generate-certificates.sh && cd ..
```

### `FEATURE_X is set to "on" but its dependency is unavailable on this host.`

Working as designed. `on` means *require*, and the process refuses to start
rather than degrade silently. Either provision the dependency, or set the
toggle to `auto` to run without the feature
([ADR-0003](../adr/0003-tri-state-feature-toggles.md)).

The most common case is `FEATURE_PDF=on` on a host without Chromium.

### `PORT must be between 1 and 65535`

Only raised for numeric values. A non-numeric `PORT` is treated as a named pipe
path and passed through untouched, which is what IIS needs.

### `X must be a whole number` / `X must be true or false`

Readers validate rather than coerce. A `parseInt` returning `NaN` is how a
named pipe once became an unusable port.

### `A database exists at a legacy location but not at the configured one.`

The message names both paths. Earlier versions could write production data to
`server/data/slimbooks.db` while development used `data/slimbooks.db`.

Move the file to the configured path, or point `DB_PATH` at it. The process
refuses to choose, because choosing wrongly means either invoicing customers
from stale books or seeding an empty database over existing ones.

The same rule applies to stranded upload directories, with the same shape of
message.

### `DB_DRIVER=mysql requires DB_HOST, DB_NAME, DB_USER, DB_PASSWORD.`

Every missing variable is named at once rather than one boot at a time.
`DB_PASSWORD` must be **present**; it may be empty. An empty password is a
configuration, an absent one is a mistake.

### MySQL server too old

MySQL 8.0.13 or MariaDB 10.2 introduced expression defaults, which every
`created_at` column uses. Below that the schema cannot be built at all, so the
boot fails with the reported server version.

### `InnoDB is not available on this server.`

Every table is created with `ENGINE=InnoDB`. MyISAM ignores transactions
**silently**, which would make a failed multi-table write leave half of it
committed.

## Everything is locked out at once

Symptom: every user gets rate-limited, from every address, at the same time.

Cause: `TLS_MODE=proxy` with a proxy that does not send `X-Forwarded-For`.
Express falls back to the socket address, so every request looks like
`127.0.0.1` and they all share one rate-limit bucket.

**`TRUST_PROXY_HOPS=0` does not fix it** — the address is still the socket's.
The proxy has to send the header.

IIS behind HttpPlatformHandler is exactly this case and needs a URL Rewrite
rule supplying `X-Forwarded-For` from `{REMOTE_ADDR}`
([ADR-0016](../adr/0016-process-managers.md)).

## Data disappears on every deploy

The host has an ephemeral filesystem. `DATA_DIR` and `UPLOAD_DIR` are not
surviving the redeploy.

If the host cannot offer persistent storage — Hostinger's Node cloud cannot —
this is not fixable with volume settings. Set `DB_DRIVER=mysql` and
`STORAGE_DRIVER=database`.

## A logo does not appear

Check `FEATURE_UPLOADS` at `/api/health`, then check which storage driver is
active. Under `STORAGE_DRIVER=disk`, logos are files under `UPLOAD_DIR`; under
`database`, they are rows and travel with the database backup.

If the install was upgraded from before 2.0.0, the boot guard for stranded
uploads may be relevant — see above.

## No PDF button

`FEATURE_PDF` resolved to false, meaning Chromium was not found. `/api/health`
reports `providers.pdf` as `null`.

Under Docker, Chromium is in the image and this should not happen. On a PaaS it
is expected and `FEATURE_PDF=off` is the correct setting.

## Reports come back empty

Fixed in 2.2.0. Calendar-day range edges were bound against epoch-millisecond
columns, which matches nothing on SQLite and everything on MySQL
([ADR-0010](../adr/0010-calendar-days-are-not-instants.md)). Upgrade.

If it persists after 2.2.0, check that the date range actually covers rows —
and note that a report's range is inclusive of both named days.

## Docker

### The image will not build

`COPY certs ./certs` fails on a fresh clone because `certs/` holds no tracked
files. Create it first:

```bash
cd scripts && ./generate-certificates.sh && cd ..
```

Specified for repair in [spec 002](../specs/002-deployment-artifacts.md).

### The container is permanently unhealthy

The compose health check calls `curl`, which is not installed in
`node:24-alpine`. The container may be perfectly fine — check it directly:

```bash
docker compose exec slimbooks node -e "require('http').get({host:'localhost',port:3002,path:'/api/health'},r=>console.log(r.statusCode))"
```

Also specified for repair in spec 002.

### Permission denied on data or uploads

The container runs as UID 1001 with a read-only root filesystem. `./data` and
`./uploads` must be writable by that UID.

## Authentication

| Status | Means |
|---|---|
| 401 | No token, an invalid one, or the user no longer exists |
| 423 | The account is temporarily locked after `MAX_FAILED_LOGIN_ATTEMPTS` failures, for `ACCOUNT_LOCKOUT_DURATION` ms |

If every user is suddenly signed out, the signing secrets changed. That is the
expected effect of rotating them.

## Development

**Backend changes are not taking effect.** The API server does not hot-reload
reliably for backend changes — stop the process and run `npm run dev` again.
The frontend does hot-reload through Vite.

**`npx tsc --noEmit` passes suspiciously fast.** It only checks the frontend,
and once checked nothing at all — the root config had `"files": []` with
unbuilt references, hiding 49 real errors. Use `npm run typecheck`, which
covers frontend, Vite config and server. To confirm it is looking at anything:

```bash
npx tsc --noEmit --listFilesOnly | wc -l
```

**The MySQL suite reports green with no server configured.** It skips itself.
A run with skips is not a green run — see [testing](../development/testing.md).

## Getting more detail

```bash
LOG_LEVEL=debug npm start
curl -k http://localhost:3002/api/health/detailed
docker compose logs -f          # under Docker
journalctl -u slimbooks -f      # under systemd
```
