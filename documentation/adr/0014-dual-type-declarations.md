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

Four declarations are maintained by hand, and a schema change updates all
four that apply (the fourth only when the change touches a settings shape):

| File | Serves |
|---|---|
| `src/types/domain/[entity].types.ts` | The React application |
| `server/types/index.ts` | Server-side domain and row shapes |
| `server/types/api.types.ts` | Request and response contracts |
| `src/utils/settingsValidation.ts` | Zod schemas (`SecurityConfigSchema`, `GoogleOAuthSchema`, `StripeSchema`, etc.) that validate a settings shape before it's saved |

Frontend code imports as `import type { Invoice } from '@/types';` — never
relatively. Enums use the const-object pattern.

## Consequences

- A schema change has a checklist, and skipping a step produces a runtime
  failure rather than a compile error. The checklist is in
  [development/architecture.md](../development/architecture.md).
- **The fourth declaration fails silently, not loudly:** Zod strips any
  object key a schema in `settingsValidation.ts` doesn't declare instead of
  erroring, so a new settings field can pass validation and vanish before it
  reaches the database. This has already happened twice at Critical
  severity — once for `password_policy`, once for `redirect_uri`/`currency`.
- **A fifth thing exists that is not duplicated: `server/shared/passwordPolicy.util.ts`.**
  Password validation used to be one of the four hand-copied declarations too —
  the client kept its own version with a different field name for one
  requirement (`require_special_chars` vs. the server's `require_special`) and
  a narrower special-character rule, and the two could reach different
  verdicts on the same password. `server/shared/` is a directory whose one
  rule is "dependency-free, therefore safe to bundle into the browser,"
  enforced by a test — the client reaches it through the `@shared/*` alias
  registered in `vite.config.ts`, `vitest.config.ts` and `tsconfig.json`.
  This is not a general escape hatch from the four-declarations rule above:
  it works here only because password validation has no view-shape or
  row-shape concerns to diverge on in the first place.
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
