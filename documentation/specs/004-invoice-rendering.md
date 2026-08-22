# Spec 004: Server-side invoice rendering

**Status:** Proposed — the problem is agreed, the contract is not

## Problem

Rendering an invoice to PDF currently requires Chromium. `PdfProvider` is
backed by Puppeteer, which launches a headless browser to print a page.

That has three costs:

1. **Image size.** Chromium and its font and library dependencies add roughly
   300 MB to the Docker image, on an application whose own build output is a
   few megabytes.
2. **Host exclusion.** A Node PaaS has no Chromium and cannot get one, so
   `FEATURE_PDF=off` is mandatory there
   ([spec 002](002-deployment-artifacts.md)). PDF is the one advertised feature
   that genuinely does not work on one of the four supported hosts.
3. **A whole browser as a dependency.** Puppeteer is an optional dependency
   loaded by dynamic import precisely so its absence is survivable, which is an
   accurate reflection of how heavy it is.

## Current behaviour

`FEATURE_PDF` resolves against `isChromiumAvailable()`, which asks Puppeteer
for an executable path. The provider reports `name: 'chromium'`, and
`runtime.pdf` is `null` when the feature is off or the dependency is missing —
so every call site already handles the no-PDF case.

That is what makes this replaceable: the seam exists.

## Direction

Render invoice HTML on the server, from the same templates the UI uses, and
produce the document without driving a browser.

## Open questions

These are why this is Proposed rather than Designed:

- **What produces the PDF bytes.** A layout library, a print-oriented HTML-to-PDF
  library, or handing the browser the HTML and letting the client print.
- **Whether output must be byte-identical to today's.** Existing invoices were
  rendered by Chromium; a change in renderer is a change in appearance unless
  deliberately constrained.
- **Where invoice design templates are evaluated.** They are currently applied
  in the SPA; server-side rendering needs them in a place both can reach.
- **Whether Chromium is removed or demoted.** Keeping it as an opt-in
  high-fidelity path is possible, but a second renderer is a second thing that
  can disagree.

## Constraints any design must meet

- `PdfProvider` stays the seam. `runtime.pdf` may still be `null`, and
  `FEATURE_PDF` keeps its three states
  ([ADR-0003](../adr/0003-tri-state-feature-toggles.md)).
- **No date is formatted on the server**
  ([ADR-0009](../adr/0009-instants-as-epoch-milliseconds.md)) — which is a real
  tension with server-side rendering and must be resolved explicitly, not by
  accident.
- Currency, number and date formatting honour the settings objects, exactly as
  the UI does. A server renderer that formats its own currency is a defect.
- Nothing below `server/runtime/` reads `process.env`
  ([ADR-0001](../adr/0001-single-environment-boundary.md)).

## Consequence if built

The Docker image drops Chromium, `FEATURE_PDF=auto` succeeds on all four hosts,
and the PaaS target stops being a second-class deployment.
