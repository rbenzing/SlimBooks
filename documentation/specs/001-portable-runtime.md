# Spec 001: Portable runtime

**Status:** Shipped in 2.0.0

## Purpose

Make one build artifact run unchanged on Docker, bare Linux, Windows IIS and a
Node PaaS, by resolving every host-dependent fact once at boot and handing the
result to the rest of the application.

## Contract

`server/runtime/index.ts` produces a frozen `Runtime` object. Nothing below
`server/runtime/` reads `process.env` or performs `__dirname` arithmetic
([ADR-0001](../adr/0001-single-environment-boundary.md)).

```ts
interface Runtime {
  paths: RuntimePaths;
  database: DatabaseSettings;   // config, never a live connection
  urls: { publicUrl: string };
  listener: ListenerConfig;
  features: FeatureSet;
  storage: StorageProvider;
  pdf: PdfProvider | null;      // null when disabled or Chromium is absent
  scheduler: Scheduler | null;  // null when the feature is off
  describe(): string;
}
```

### Paths

`RuntimePaths` resolves five absolute paths: `root`, `dataDir`, `uploadsDir`,
`staticDir`, `dbFile`. `root` comes from `findProjectRoot()` — the directory
holding `package.json`.

Relative values in `DATA_DIR`, `UPLOAD_DIR` and `STATIC_DIR` resolve against
`root`. A relative `DB_PATH` resolves **inside `DATA_DIR`**, so moving the data
directory moves the database with it; an absolute one is used as given.

### Listener

`ListenerConfig` carries `target` (a port number, or a named pipe path passed
through verbatim), `host` (null when the target is a pipe), `tls`,
`trustProxyHops`, and the certificate pair when `tls === 'self'`.

`PORT` is never parsed with `parseInt` ([ADR-0002](../adr/0002-environment-driven-not-host-detected.md)).

### Features

Nine tri-state toggles resolve against probes of what the host actually
provides ([ADR-0003](../adr/0003-tri-state-feature-toggles.md)). `on` with an
unavailable dependency throws `ConfigError` and the process does not start.

### Storage

`StorageProvider` — `put`, `get`, `delete`, `exists`, `publicUrl` — addressed
by logical key ([ADR-0013](../adr/0013-storage-keys-are-logical.md)).

## Invariants

1. **Configuration faults stop the process before it opens a socket.** A
   `ConfigError` names the variable and, where one exists, its replacement.
2. **Removed variables are rejected, not ignored.** `ENABLE_HTTPS`,
   `SSL_KEY_PATH`, `SSL_CERT_PATH` and `ENABLE_DEBUG_ENDPOINTS` fail the boot
   with a message naming what replaces them.
3. **Exactly two directories must survive a redeploy** under the default
   drivers: `DATA_DIR` and `UPLOAD_DIR`. Everything else is rebuilt from the
   environment.
4. **The process may be killed at any instant.** Nothing depends on a clean
   shutdown for correctness.
5. **Stranded data stops the boot.** `assertNoLegacyData()` refuses to start
   when a database, or an uploads directory, exists at a legacy location and
   not at the configured one — naming both paths so the operator knows exactly
   what to move. It refuses rather than choosing, because choosing wrongly
   means either invoicing from stale books or appearing to have lost
   everything. Skipped for the database under `DB_DRIVER=mysql`.

## Observability

`describe()` prints what was resolved at boot. The same summary is available
over HTTP at `/api/health`, and the subset the SPA needs at `/api/config` —
public and secret-free by design, because the bundle is built once and deployed
anywhere and cannot know its host's capabilities until it asks.

## Known exceptions

`server/config/index.ts` and `server/database/config/sqlite.config.ts` predate
this runtime and still read `process.env` directly for `UPLOAD_PATH`,
`BACKUP_*`, `DB_BACKUP_PATH` and `LOG_LEVEL`. Collapsing them into the runtime
is deliberately out of scope for spec 002 and needs its own change.

## Verification

`server/runtime/` has a test per module; resolution is a pure function of a
`RawEnv` record, so the full host matrix is testable without a host.
`server/runtime/paths.test.ts` specifically guards against the return of
`__dirname` arithmetic.
