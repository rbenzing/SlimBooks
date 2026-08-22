# Spec 002: Per-host deployment artifacts

**Status:** Docker implemented and verified. systemd, IIS and PaaS artifacts
still designed only.

## Purpose

Ship one artifact per supported host, so an operator deploying to Docker, bare
Linux, Windows IIS or a Node PaaS starts from a working template instead of
deriving environment variables from prose.

Spec 001 made the runtime host-agnostic, 003 made the database swappable, 005
fixed what those exposed. None of it is reachable by anyone who has not read
the source.

## What has been done

The Docker half is repaired and verified against both real engines: image built
from a clean `git clone`, then booted against **MariaDB 10.11.18** and
**MySQL 8.4.11** in turn — container reaching `healthy` on each, 19 tables
created, 14 migrations recorded as applied without running, admin account
seeded, and a functional pass over HTTPS from the host (sign in, write a
client, read it back, invoice statistics, a profit-and-loss report over a
calendar-day range, currency settings).

Switching engines was one line of `.env`, which is the property the whole
portability programme exists to produce.

The two servers built the same thing: **207 columns and 81 indexes, identical**
once each server's `information_schema` rendering is normalised. The only
residual differences are cosmetic — MariaDB reports display widths
(`bigint(20)`) that MySQL 8 dropped, and MySQL prefixes a charset introducer on
string defaults (`_utf8mb4'USD'` against `'USD'`). Column types confirm the
decisions hold on both: `created_at` `bigint`, `due_date` `varchar`,
`total_amount` `double`.

The suite ran against each engine live: 60 files, 1337 tests, **0 skipped**,
on both.

The findings below are kept as the record of what was wrong.

Two things the repair turned up that this design had not predicted:

- **`databaseController` built a multer instance at module load with
  `dest: 'temp/'`** — a relative path resolved against the working directory,
  which is path arithmetic outside the runtime. `read_only: true` turned it
  into a boot crash loop, even under MySQL where those handlers decline to run
  at all. It had survived because a `temp/` directory exists in the checkout.
- **A container's route to the database is not the host's**, so compose cannot
  carry database coordinates for both. `DOCKER_DB_HOST` / `DOCKER_DB_PORT`
  override `DB_HOST` / `DB_PORT` for the container, which lets one `.env` serve
  `npm run dev` and `docker compose up` while neither committed file names a
  specific database container.

## Current state

| Host | Present | State |
|---|---|---|
| Docker | `Dockerfile`, `docker-compose.yml`, `.dockerignore` | ~~Broken on a fresh clone~~ — repaired |
| Bare Linux | — | Documented as supported, no artifact |
| Windows IIS | — | Documented as supported, no artifact |
| Node PaaS | — | Documented as supported, no artifact |
| Certificates | `scripts/generate-certificates.sh`, `scripts/cert.conf` | Fine, but unreferenced by the Docker quick start |

### Known defects

**The Docker build fails on a fresh clone.** `Dockerfile` runs
`COPY certs ./certs`, and `certs/` holds no tracked files, so it does not exist
after `git clone`. It succeeds on a developer machine only because the empty
directory happens to be on disk. The fix is to delete the line:
`docker-compose.yml` already bind-mounts `./certs:/app/certs:ro` over the same
path, and baking a TLS private key into an image layer is wrong on its own
terms — layers are shared, pushed and cached.

**The image carries dev leftovers.** `COPY vite.config.ts` puts a dev-only file
into a production image whose dependencies are installed with
`npm ci --omit=dev`, so `vite` is not there to read it. `/app/logs` is created
in the image and mounted as a volume, but nothing under `server/runtime/`
resolves a log directory — the persistent surface is exactly `DATA_DIR` and
`UPLOAD_DIR`.

**The two health checks disagree, and the compose one cannot run.** The
Dockerfile uses `node`, honouring `TLS_MODE` and `PORT`. Compose uses
`curl -f -k https://localhost:3002/api/health` — and `curl` is not in
`node:24-alpine`, nor among the packages the Dockerfile installs. The container
reports unhealthy indefinitely.

**`EXPOSE 8080` disagrees with the port the process binds** (`PORT`, default
3002); compose maps `8080:3002`.

**`version: '3.8'`** is obsolete in current Compose.

## Layout

A new `deploy/` directory, outside the build tree:

```
deploy/
  systemd/slimbooks.service
  systemd/slimbooks.env.example
  iis/web.config
  iis/README.md            URL Rewrite prerequisite, app-pool settings
  hostinger/env.md         panel variables, start command
```

**Every file carries environment only.** No artifact selects a code path
([ADR-0002](../adr/0002-environment-driven-not-host-detected.md)).

## Per-target contract

### Docker

Repair, not rewrite. Delete `COPY certs` and `COPY vite.config.ts`, drop the
`logs` directory and volume, set `EXPOSE 3002`, reduce the two health checks to
one that respects `TLS_MODE`, and remove the obsolete `version` key. Compose
keeps `TLS_MODE=self`; the quick start gains the
`scripts/generate-certificates.sh` step it currently omits, which is why a
first `docker compose up` cannot presently succeed.

Chromium stays in the image, so `FEATURE_PDF=auto` succeeds out of the box. It
costs roughly 300 MB; [spec 004](004-invoice-rendering.md) removes the need.

### systemd

`Type=simple`, `Restart=always`,
`EnvironmentFile=/etc/slimbooks/slimbooks.env`, running
`node dist/server/index.js` as a dedicated user.

Hardening scoped to what is true of this application:
`NoNewPrivileges=yes`, `ProtectSystem=strict`, `PrivateTmp=yes`, and
`ReadWritePaths=` naming `DATA_DIR` and `UPLOAD_DIR` only.

`TLS_MODE=proxy` with `TRUST_PROXY_HOPS=1`, since nginx or Caddy terminates.

### Windows IIS

`web.config` with `<httpPlatform>` invoking `node.exe dist\server\index.js`,
mapping `%HTTP_PLATFORM_PORT%` into `PORT` and setting `HOST=127.0.0.1` so the
process does not also bind publicly behind the proxy. `stdoutLogEnabled` on, to
a path outside the application directory.

**A URL Rewrite rule supplying `X-Forwarded-For` from `{REMOTE_ADDR}` is a
prerequisite, not an extra** — see
[ADR-0016](../adr/0016-process-managers.md) for the outage it prevents.

### Hostinger / Node PaaS

No file the platform reads: its Node cloud takes a start command and panel-set
variables. Four entries are not optional:

- `DB_DRIVER=mysql` and `STORAGE_DRIVER=database` — the disk is wiped on every
  redeploy, so SQLite loses every invoice, client and payment, and disk storage
  loses every logo. Architectural; no start command fixes it.
- `TLS_MODE=proxy` — the platform terminates TLS.
- `FEATURE_PDF=off` — no Chromium available.

Start command `npm start`; build `npm ci && npm run build`.

## Documentation changes

The Raspberry Pi material moves to its own page, along with `scripts/deploy.sh`
and `scripts/setup-raspberry-pi.sh` — both are Pi-and-Docker specific, and
`deploy.sh` hardcodes `PORT=8080` and a `logs` directory the runtime does not
use. Fixing their stale assumptions is part of this work: a script that
contradicts the runtime is the same defect as a document that does.

`certs/` gains a tracked `.gitkeep`. `.env.example` marks which variables the
runtime reads and which belong to the legacy config modules.

## Verification

Docker and systemd are testable on the development machine and will be:

1. Build the image from a **clean checkout** (`git clone` into a temp
   directory), to prove the `COPY certs` defect is fixed rather than masked by
   local state.
2. Boot the container, hit `/api/health`, confirm the resolved runtime banner,
   and confirm the container actually reaches healthy.
3. Parse the systemd unit with `systemd-analyze verify`, and confirm the
   `ReadWritePaths` set matches what the runtime resolves.

**IIS and Hostinger cannot be verified here.** They ship as reviewed templates,
and the documentation says so in those words rather than implying they were
booted. That distinction is load-bearing: this project has twice shipped a
database path that passed every test and failed on a real server.

## Out of scope

- Collapsing the legacy config modules into the runtime.
- PM2, iisnode, Kubernetes manifests, Helm charts.
- CI/CD pipelines. These are artifacts an operator applies, not automation.
- [Spec 004](004-invoice-rendering.md), which would let the image drop Chromium.
