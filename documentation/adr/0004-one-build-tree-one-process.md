# ADR-0004: One build tree, one process

**Status:** Accepted
**Date:** 2026-08-08 (shipped in 2.0.0)

## Context

The project once produced two build outputs — one for the client and
`server/dist/` for the compiled backend — and ran two processes in production,
with `vite preview` serving the SPA alongside the API server.

`vite preview` is a development convenience; its own documentation says it is
not a production server. Running it in production meant the SPA was served by
software with no hardening, no rate limiting and no relationship to the API's
configuration, and it required a second port, a second supervisor entry, and a
reverse-proxy rule to stitch the two together on every host.

Two output directories also meant two roots for path arithmetic to be wrong
about — see [ADR-0001](0001-single-environment-boundary.md).

## Decision

`npm run build` produces exactly `dist/client` and `dist/server`.
`server/dist/` no longer exists.

`npm start` is `node dist/server/index.js`. That one process serves the API and
the SPA on one port. There is no second server.

Development is the exception and is explicit about it: `npm run dev` runs Vite
on 8080 and the API on 3002, with Vite proxying `/api` to the API.

## Consequences

- A host needs one process supervised, one port, one health check.
- The SPA and the API share configuration, security headers and rate limiting
  by construction, because they are the same process.
- `STATIC_DIR` exists for the rare case where the built SPA is elsewhere; it
  defaults to `dist/client` and is rarely set.
- Production installs with `npm ci --omit=dev`, so nothing dev-only may be
  required at runtime. `puppeteer` is an optional dependency for this reason.
- `.nvmrc` pins the Node version and the Dockerfile must match it. Both are
  currently Node 24; `package.json` declares `engines: { node: ">=24 <25" }`.
