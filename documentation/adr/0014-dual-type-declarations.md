# ADR-0014: Domain types are declared twice and kept in sync by hand

**Status:** Accepted
**Date:** 2026-08-08

## Context

The frontend and the backend each need types for the same domain objects — an
`Invoice`, a `Client`, an `Expense`. The usual answers are a shared package, or
generating one side from the other, or generating both from the schema.

None was adopted. The frontend types serve a React application and carry
view-oriented shapes; the backend types serve SQL and carry row shapes. A
single declaration would have to be the union of both concerns, and the
generator would have to understand both.

The cost is real and is stated plainly here rather than discovered: **nothing
generates one from the other, so a half-updated schema compiles and fails at
runtime.**

## Decision

Three declarations are maintained by hand, and a schema change updates all
three:

| File | Serves |
|---|---|
| `src/types/domain/[entity].types.ts` | The React application |
| `server/types/index.ts` | Server-side domain and row shapes |
| `server/types/api.types.ts` | Request and response contracts |

Frontend code imports as `import type { Invoice } from '@/types';` — never
relatively. Enums use the const-object pattern.

## Consequences

- A schema change has a checklist, and skipping a step produces a runtime
  failure rather than a compile error. The checklist is in
  [development/architecture.md](../development/architecture.md).
- **Report payloads are the sharpest edge:** the server's return shape and the
  frontend type must match exactly, or the UI crashes on
  `Object.entries(undefined)`. Both sides get checked.
- Logic that can be extracted into database-free modules is, so tests can load
  it standalone — `reportPeriods.util.ts` is the pattern.
- Names are canonical across all three: an expense payee is `vendor`, never
  `merchant`; a postal code is `zipCode`, never `zip` or `zip_code`. Legacy
  spellings survive only as CSV import headers.
- `template_id` does not exist. It is `design_template_id` or
  `recurring_template_id`, and the two live in different tables
  (`invoice_design_templates` behind `/api/templates`,
  `recurring_invoice_templates` behind `/api/recurring-templates`). They share
  an id space, so the wrong endpoint silently hits an unrelated row.
