# Deployment guide

Slimbooks builds to a single artifact that runs unchanged on four kinds of
host. **They differ only in environment variables.** There is no host-specific
code path ([ADR-0002](../adr/0002-environment-driven-not-host-detected.md)),
which is what keeps development and production running the same thing.

| Host | Typical settings | Artifact |
|---|---|---|
| Docker (Linux/ARM) | `TLS_MODE=self` if exposed directly, `off` behind a mesh | `Dockerfile`, `docker-compose.yml` — see [known issues](#docker) |
| Bare Linux (systemd) | `TLS_MODE=proxy` behind nginx or Caddy | Specified, **not yet shipped** |
| Windows IIS | `TLS_MODE=proxy`; IIS may supply `PORT` as a named pipe | Specified, **not yet shipped** |
| Node PaaS (e.g. Hostinger) | `TLS_MODE=proxy`, `DB_DRIVER=mysql`, `STORAGE_DRIVER=database`, `FEATURE_PDF=off` | Documented variable set |

The three unshipped artifacts are designed in
[spec 002](../specs/002-deployment-artifacts.md).

## How it runs

One process. `npm run build` produces `dist/client` (the SPA) and `dist/server`
(the compiled backend); `npm start` runs `node dist/server/index.js`, which
serves both the API and the SPA on one port. There is no second server and no
`vite preview` ([ADR-0004](../adr/0004-one-build-tree-one-process.md)).

At boot the process resolves every host-dependent fact once, prints what it
decided, and refuses to start if the configuration is wrong — a missing
`CLIENT_URL`, a required feature whose dependency is absent, or a database
found only at a legacy location. The same summary is available at
`/api/health`.

## What must survive a redeploy

Under the default drivers, exactly two directories. Everything else is rebuilt
from the environment.

- **`DATA_DIR`** (default `./data`) — the SQLite database and its backups
- **`UPLOAD_DIR`** (default `./uploads`) — uploaded logos

On a host with an ephemeral filesystem these must be on persistent storage, or
the install loses its books on the next deploy. **If the host cannot promise
that, use `DB_DRIVER=mysql` and `STORAGE_DRIVER=database` instead** — then
neither directory matters.

The process may be killed at any instant; nothing depends on a clean shutdown
for correctness.

## TLS

`TLS_MODE` decides how TLS reaches the process
([ADR-0005](../adr/0005-declared-tls-termination.md)):

- `off` — plain HTTP. Development, or a container behind a service mesh.
- `self` — this process terminates TLS using `TLS_KEY_PATH` and `TLS_CERT_PATH`.
- `proxy` — something in front terminates it. **Set `TRUST_PROXY_HOPS`**
  (normally `1`).

> `proxy` without a proxy that actually sends `X-Forwarded-For` is an outage,
> not a detail. Every request appears to come from one address, the rate limit
> is shared by all users at once, and the whole install locks out together.

For `TLS_MODE=self`, generate a certificate pair. **The script uses relative
paths, so it must be run from inside `scripts/`:**

```bash
cd scripts && ./generate-certificates.sh && cd ..
```

It reads `cert.conf` from the working directory and writes `../certs/server.key`
and `../certs/server.crt` — a self-signed RSA-2048 pair valid for 365 days. Run
from the project root instead, it fails to find `cert.conf` and would write
outside the project.

## Feature toggles

Each is `auto | on | off`
([ADR-0003](../adr/0003-tri-state-feature-toggles.md)). `auto` enables the
feature when its dependency resolves; `on` requires it and **refuses to boot**
without it; `off` never mounts the routes.

Use `on` in production for anything you are certain the host provides — it
converts a silent degradation into a startup failure you cannot miss. Use
`auto` for the same image on a host that lacks the dependency.

The full list is in the [configuration reference](configuration.md#feature-toggles).

## Recurring invoices

They run inside the application on all four hosts — no crontab, no Task
Scheduler, no PaaS cron panel
([ADR-0006](../adr/0006-in-process-scheduler.md)). Set `FEATURE_SCHEDULER=off`
only if an external scheduler owns them; `/api/cron` is then mounted behind
admin authentication.

---

## Docker

```bash
git clone https://github.com/rbenzing/SlimBooks.git
cd slimbooks

./scripts/generate-secrets.sh              # fills .env from .env.example
cd scripts && ./generate-certificates.sh && cd ..   # compose sets TLS_MODE=self

docker compose up -d
```

Compose maps `8080:3002`, so the application is reachable on port 8080 of the
host. `.env` is passed in at run time through `env_file`, never baked into the
image, so secrets never end up in a layer.

The container runs as UID 1001 with a read-only root filesystem, all
capabilities dropped except `CHOWN`/`SETGID`/`SETUID`, `no-new-privileges`, and
memory and CPU limits. `./data` and `./uploads` are bind-mounted; `./certs` is
mounted read-only.

### Known issues

These are real and unfixed at the time of writing. They are specified for
repair in [spec 002](../specs/002-deployment-artifacts.md).

- **The build fails on a fresh clone.** The Dockerfile runs
  `COPY certs ./certs`, and `certs/` contains no tracked files, so it does not
  exist after `git clone`. Running `./scripts/generate-certificates.sh` first
  creates the directory and works around it.
- **The compose health check cannot run.** It calls `curl`, which is not
  installed in `node:24-alpine` nor added by the Dockerfile, so the container
  reports unhealthy indefinitely. The Dockerfile's own `HEALTHCHECK` (which
  uses `node` and honours `TLS_MODE`) is the one that works.
- **`EXPOSE 8080` disagrees with the port the process binds** (`PORT`, default
  3002). Harmless, but misleading.
- **`/app/logs` is created and mounted but nothing writes to it.** The runtime
  resolves no log directory; container logs go to the Docker json-file driver,
  capped at 3 × 10 MB.

## Bare Linux (systemd)

**Not yet shipped.** The unit is specified in
[spec 002](../specs/002-deployment-artifacts.md#systemd): `Type=simple`,
`Restart=always`, `EnvironmentFile=/etc/slimbooks/slimbooks.env`, running
`node dist/server/index.js` as a dedicated user, with `ReadWritePaths=` naming
`DATA_DIR` and `UPLOAD_DIR` only.

Until it ships, the same result is achieved by writing a unit by hand around
`npm start` with `TLS_MODE=proxy` and `TRUST_PROXY_HOPS=1`.

PM2 is deliberately not supported
([ADR-0016](../adr/0016-process-managers.md)).

## Windows IIS

**Not yet shipped.** Specified in
[spec 002](../specs/002-deployment-artifacts.md#windows-iis): a `web.config`
using HttpPlatformHandler, mapping `%HTTP_PLATFORM_PORT%` into `PORT` and
setting `HOST=127.0.0.1`.

> **URL Rewrite is a prerequisite, not an extra.** HttpPlatformHandler forwards
> to localhost without adding `X-Forwarded-For`, so an inbound rewrite rule
> must supply it from `{REMOTE_ADDR}`. Without it the install locks out at
> around the tenth concurrent user
> ([ADR-0016](../adr/0016-process-managers.md)).

## Node PaaS (Hostinger and similar)

There is no file the platform reads — it takes a start command and panel-set
variables.

| Setting | Value |
|---|---|
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |

Four variables are **not optional**:

| Variable | Value | Why |
|---|---|---|
| `DB_DRIVER` | `mysql` | The disk is wiped on every redeploy; SQLite loses every invoice, client and payment |
| `STORAGE_DRIVER` | `database` | Otherwise every logo disappears on the next deploy |
| `TLS_MODE` | `proxy` | The platform terminates TLS |
| `FEATURE_PDF` | `off` | No Chromium available |

The first two are architectural. No start command or volume setting fixes them.

---

## Health checks

| Endpoint | Returns |
|---|---|
| `GET /api/health` | Status, database connectivity, version, resolved features and providers |
| `GET /api/health/detailed` | The above plus uptime, memory, Node version, platform |
| `GET /api/health/ready` | Readiness |
| `GET /api/health/live` | Liveness |

`/api/health` is the fastest way to answer "why is there no PDF button here" —
it reports what this instance actually resolved, without needing container
logs.

## Going live

- [ ] `JWT_SECRET`, `JWT_REFRESH_SECRET` and `SESSION_SECRET` generated, not blank
- [ ] `CLIENT_URL` set to the address users actually reach
- [ ] `CORS_ORIGIN` set to your own domain
- [ ] `NODE_ENV=production`
- [ ] `FEATURE_DEBUG=off`, `ENABLE_SAMPLE_DATA=false`
- [ ] `TLS_MODE` correct for the topology, and `TRUST_PROXY_HOPS` set if `proxy`
- [ ] `DATA_DIR` and `UPLOAD_DIR` on storage that survives a redeploy — **or**
      `DB_DRIVER=mysql` with `STORAGE_DRIVER=database`
- [ ] Backups running and **restored once** to prove they work
- [ ] Firewall permits only what you intend to expose
- [ ] `/api/health` reachable and reporting the features you expect

## Updating

```bash
git pull
npm ci
npm run build
# restart the process (or ./scripts/deploy.sh under Docker)
```

Migrations run automatically at boot. Take a backup first — see
[backup and restore](backup-and-restore.md) and [upgrading](upgrading.md).

## Related

- [Configuration reference](configuration.md) — every variable
- [Database backends](database-backends.md) — SQLite vs MySQL/MariaDB
- [Troubleshooting](troubleshooting.md) — boot failures and their causes
- [Raspberry Pi](raspberry-pi.md) — one host walked through end to end
