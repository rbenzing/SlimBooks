# API reference

Every HTTP endpoint the server mounts.

## Conventions

**Base path.** Everything is under `/api`, except the SPA and `/uploads`.

**Authentication.** A bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Obtain it from `POST /api/auth/login`. Access tokens expire after
`ACCESS_TOKEN_EXPIRY` (default 2 hours) and are refreshed with
`POST /api/auth/refresh-token`.

**Response envelope.** JSON, with a `success` flag:

```json
{ "success": true,  "data": { }, "message": "..." }
{ "success": false, "error": "Authentication required" }
```

**Status codes.**

| Code | Means |
|---|---|
| 200 | OK |
| 401 | No token, an invalid token, or the user no longer exists |
| 403 | Authenticated but not permitted — usually an admin-only route |
| 404 | Not found, **or a route behind a disabled feature toggle** |
| 423 | Account temporarily locked after repeated failed logins |
| 429 | Rate limited |
| 500 | Server error |

**Timestamps are JSON numbers** — epoch milliseconds — since 2.2.0. Calendar
days (`due_date`, `issue_date`, `date`, …) remain `YYYY-MM-DD` strings. The two
are different types; see [spec 005](../specs/005-timestamp-storage.md).

**Rate limiting** applies to everything: `RATE_LIMIT_MAX_REQUESTS` per
`RATE_LIMIT_WINDOW_MS` (default 100 per 15 minutes), with a tighter limit on
login.

**Feature toggles change the surface.** A route behind a disabled feature is
not mounted, so it 404s rather than 403s
([ADR-0003](../adr/0003-tri-state-feature-toggles.md)).

Auth column key: **—** public · **Auth** any signed-in user · **Admin** admin
only.

---

## Health — `/api/health`

Public. Used by container and load-balancer probes.

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/health` | — | Status, database connectivity, version, environment, resolved `features`, and `providers` (`pdf`, `scheduler`, `tls`) |
| GET | `/api/health/detailed` | — | The above plus uptime, heap usage, Node version, platform |
| GET | `/api/health/ready` | — | Readiness |
| GET | `/api/health/live` | — | Liveness |

## Config — `/api/config`

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/config` | — | What this instance resolved, for the SPA |

Public and secret-free by design: the bundle is built once and deployed
anywhere, so it cannot know its host's capabilities until it asks.

## Authentication — `/api/auth`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | — | Sign in. Returns the user and a token. |
| POST | `/api/auth/register` | — | Create an account |
| POST | `/api/auth/reset-password` | — | Complete a password reset |
| POST | `/api/auth/verify-email` | — | Complete email verification |
| POST | `/api/auth/refresh-token` | — | Exchange a refresh token |
| GET | `/api/auth/profile` | Auth | The signed-in user |
| PUT | `/api/auth/profile` | Auth | Update own profile |
| POST | `/api/auth/change-password` | Auth | Change own password |

## Users — `/api/users`

Administrative. Most routes require admin.

| Method | Path | Auth |
|---|---|---|
| GET | `/api/users/admin-exists` | — |
| GET | `/api/users` | Admin |
| GET | `/api/users/:id` | Admin |
| GET | `/api/users/email/:email` | Admin |
| GET | `/api/users/google/:googleId` | Admin |
| POST | `/api/users` | Admin |
| PUT | `/api/users/:id` | Admin |
| DELETE | `/api/users/:id` | Admin |
| POST | `/api/users/update-login-attempts` | Admin |
| POST | `/api/users/update-last-login` | Admin |
| PUT | `/api/users/:id/login-attempts` | Admin |
| PUT | `/api/users/:id/last-login` | Admin |
| PUT | `/api/users/:id/verify-email` | Admin |

`GET /api/users/admin-exists` is public so the SPA can decide whether to offer
first-run setup.

## Clients — `/api/clients`

All require authentication.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/clients` | List |
| GET | `/api/clients/search` | Search |
| GET | `/api/clients/:id` | One client |
| GET | `/api/clients/:id/stats` | Invoice and payment totals for a client |
| POST | `/api/clients` | Create |
| PUT | `/api/clients/:id` | Update |
| DELETE | `/api/clients/:id` | Delete (soft, if enabled for the table) |
| POST | `/api/clients/bulk-import` | CSV import |

The postal-code field is `zipCode`. Legacy spellings are accepted only as CSV
import headers.

## Invoices — `/api/invoices`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/invoices/public/:id` | — | **Public invoice view, token-validated** |
| GET | `/api/invoices` | Auth | List |
| GET | `/api/invoices/stats` | Auth | Totals by status |
| GET | `/api/invoices/overdue` | Auth | Overdue only |
| GET | `/api/invoices/preview-number` | Auth | Next number **without** consuming it |
| GET | `/api/invoices/:id` | Auth | One invoice |
| POST | `/api/invoices/generate-number` | Auth | Consume the next number |
| POST | `/api/invoices` | Auth | Create |
| PUT | `/api/invoices/:id` | Auth | Update |
| PATCH | `/api/invoices/:id/status` | Auth | Change status |
| PATCH | `/api/invoices/:id/sent` | Auth | Mark sent |
| DELETE | `/api/invoices/:id` | Auth | Delete |
| POST | `/api/invoices/:id/public-token` | Auth | Issue a public link token |

Statuses: `draft`, `sent`, `paid`, `overdue`, `cancelled`, `refunded`.

`/public/:id` is the only unauthenticated invoice route and is mounted **before**
the auth middleware. It validates a token issued by
`POST /api/invoices/:id/public-token`.

`preview-number` and `generate-number` are separate because previewing must not
consume a number — a form the user abandons would otherwise leave a gap.

## Recurring templates — `/api/recurring-templates`

All require authentication. These are `recurring_invoice_templates`, and they
use `is_active` rather than a status field.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/recurring-templates` | List |
| GET | `/api/recurring-templates/active` | Active only |
| GET | `/api/recurring-templates/due` | Due for generation |
| GET | `/api/recurring-templates/stats` | Processing statistics |
| GET | `/api/recurring-templates/client/:clientId` | Templates for one client |
| GET | `/api/recurring-templates/:id` | One template |
| POST | `/api/recurring-templates` | Create |
| POST | `/api/recurring-templates/process` | Process all due templates now |
| POST | `/api/recurring-templates/:id/process` | Process one now |
| PUT | `/api/recurring-templates/:id` | Update |
| PATCH | `/api/recurring-templates/:id/toggle` | Activate / deactivate |
| DELETE | `/api/recurring-templates/:id` | Delete |

> **Not the same as `/api/templates`.** That serves
> `invoice_design_templates`. The two share an id space, so the wrong endpoint
> silently hits an unrelated row
> ([ADR-0014](../adr/0014-dual-type-declarations.md)).

## Design templates — `/api/templates`

All require authentication. These are `invoice_design_templates` — the visual
layout of an invoice.

| Method | Path |
|---|---|
| GET | `/api/templates` |
| GET | `/api/templates/:id` |
| POST | `/api/templates` |
| PUT | `/api/templates/:id` |
| DELETE | `/api/templates/:id` |

## Expenses — `/api/expenses`

All require authentication.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/expenses` | List |
| GET | `/api/expenses/stats` | Totals |
| GET | `/api/expenses/categories` | Categories in use |
| GET | `/api/expenses/date-range` | Filter by date range |
| GET | `/api/expenses/:id` | One expense |
| POST | `/api/expenses` | Create |
| PUT | `/api/expenses/:id` | Update |
| DELETE | `/api/expenses/:id` | Delete |
| POST | `/api/expenses/bulk-import` | CSV import |

Statuses: `pending`, `approved`, `rejected`, `reimbursed`. The payee field is
`vendor`, never `merchant`.

## Payments — `/api/payments`

All require authentication.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/payments` | List |
| GET | `/api/payments/stats` | Totals |
| GET | `/api/payments/:id` | One payment |
| POST | `/api/payments` | Record a payment |
| PUT | `/api/payments/:id` | Update |
| DELETE | `/api/payments/:id` | Delete |
| POST | `/api/payments/bulk-delete` | Delete several |
| POST | `/api/payments/bulk-import` | CSV import |

Methods: `cash`, `check`, `bank_transfer`, `credit_card`, `paypal`, `other`.
Statuses: `received`, `pending`, `failed`, `refunded`.

## Reports — `/api/reports`

All require authentication.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/reports` | Saved reports |
| GET | `/api/reports/:id` | One saved report |
| POST | `/api/reports` | Save a report |
| PUT | `/api/reports/:id` | Update a saved report |
| DELETE | `/api/reports/:id` | Delete a saved report |
| POST | `/api/reports/generate/profit-loss` | Generate profit & loss |
| POST | `/api/reports/generate/expense` | Generate expense report |
| POST | `/api/reports/generate/invoice` | Generate invoice report |
| POST | `/api/reports/generate/client` | Generate client report |

Date ranges are **calendar days** (`YYYY-MM-DD`) and both ends are inclusive.
The server converts them to instant bounds; it does not bind them directly
([ADR-0010](../adr/0010-calendar-days-are-not-instants.md)).

> The server's return shape and the frontend type must match exactly, or the UI
> crashes on `Object.entries(undefined)`. Change both sides together.

## Settings — `/api/settings`

All require authentication; writing the general settings requires admin.

| Method | Path | Auth |
|---|---|---|
| GET | `/api/settings` | Auth |
| GET | `/api/settings/:key` | Auth |
| POST | `/api/settings` | Admin |
| PUT | `/api/settings` | Admin |
| GET | `/api/settings/currency` | Auth |
| GET | `/api/settings/company` | Auth |
| POST | `/api/settings/company` | Auth |
| POST | `/api/settings/company/logo` | Auth |
| DELETE | `/api/settings/company/logo` | Auth |
| GET | `/api/settings/appearance` | Auth |
| PUT | `/api/settings/appearance` | Auth |
| GET | `/api/settings/general` | Auth |
| GET | `/api/settings/notification` | Auth |

The logo upload is `multipart/form-data` with the field name `logo`. It is
stored through the storage provider by logical key, never by path
([ADR-0013](../adr/0013-storage-keys-are-logical.md)).

`key` is a reserved word in MySQL and is the column name here, so it is always
backticked in SQL.

## Project settings — `/api/project-settings`

| Method | Path | Auth |
|---|---|---|
| GET | `/api/project-settings` | Optional — identifies the caller if a token is present |
| PUT | `/api/project-settings` | Admin |

## Counters — `/api/counters`

All require authentication. Backs invoice numbering.

| Method | Path |
|---|---|
| GET | `/api/counters/:counterName` |
| GET | `/api/counters/:counterName/next` |
| PUT | `/api/counters/:counterName/reset` |

## PDF — `/api/pdf`

All require authentication. Present only when `FEATURE_PDF` resolves true.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/pdf/invoice/:id` | Render an invoice |
| GET | `/api/pdf/invoice/:id/download` | Render as a download |
| POST | `/api/pdf/page` | Render arbitrary page content |
| GET | `/api/pdf/status` | Provider state |
| POST | `/api/pdf/initialize` | Start the provider |
| GET | `/api/pdf/format` | Page format settings |
| PUT | `/api/pdf/format` | Update page format settings |

## Email — `/api/email`

All require authentication; the test and send routes require admin.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/email/status` | Auth | Whether email is configured |
| POST | `/api/email/test-connection` | Admin | **Open a real SMTP connection and authenticate** |
| POST | `/api/email/test` | Admin | Send a test message |
| POST | `/api/email/send` | Auth | Send a message |

`test-connection` really connects, so a wrong password fails there rather than
silently when an invoice goes out.

## Stripe — `/api/stripe`

All require authentication; the administrative routes require admin.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/stripe/status` | Auth | Integration state — **no credentials** |
| POST | `/api/stripe/test-connection` | Admin | Verify the keys against Stripe |
| POST | `/api/stripe/invoices/:id/payment-link` | Auth | Create or return an invoice's payment link |
| DELETE | `/api/stripe/payment-links/:linkId` | Admin | Deactivate a link |

The secret key is read server-side only and never reaches the browser.

## Stripe webhook — `/api/webhooks/stripe`

| Method | Path | Auth |
|---|---|---|
| POST | `/api/webhooks/stripe` | — (signature-verified) |

**Public by necessity: Stripe cannot authenticate.** Every delivery is verified
against `STRIPE_WEBHOOK_SECRET` before anything is written, and duplicate
deliveries are safe.

It is mounted in `app.ts` **ahead of the body parsers**, because signature
verification needs the raw request body.

Subscribe the endpoint to `checkout.session.completed` and
`payment_intent.succeeded`.

## Database — `/api/db`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/db/export` | Auth | Download a backup |
| POST | `/api/db/import` | Auth | Restore from a backup |

For moving between backends, prefer the CLI tools — `npm run db:export` and
`npm run db:import` — which produce a dialect-neutral dump. See
[backup and restore](../operations/backup-and-restore.md).

## Cron — `/api/cron`

**Mounted only when `FEATURE_SCHEDULER=off`**, and then behind `requireAuth`
and `requireAdmin`. When the in-process scheduler is running these routes do
not exist.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/cron/health` | Scheduler health |
| POST | `/api/cron/recurring-invoices` | Generate due recurring invoices |

It was once mounted unconditionally with no authentication at all, so anyone
who could reach the server could generate invoices
([ADR-0006](../adr/0006-in-process-scheduler.md)).

## Uploads — `/uploads`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/uploads/*` | — | Serve an uploaded file through the storage provider |

Not `express.static`: under `STORAGE_DRIVER=database` the bytes are rows, which
static serving could never reach.
