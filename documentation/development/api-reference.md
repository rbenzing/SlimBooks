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
| 409 | The change would leave the install with no administrator |
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

**`/api/health` and `/api/health/detailed` answer 503 when the database is
unreachable**, and 200 otherwise. Before 2.6.0 both answered 200 regardless,
reporting `"database": "disconnected"` in the body — so every probe that reads
the status code rather than parsing the body (the Dockerfile healthcheck,
`scripts/deploy.sh`, and any load balancer) treated an instance that could not
serve a single request as healthy.

`/api/health/live` stays 200 while the process is alive, since a process that
cannot reach its database should be taken out of rotation, not restarted.

> **`providers.pdf` is always `null`, including when PDF rendering works.** It
> reports `runtime.pdf`, and nothing calls `createPdfProvider()` — `PdfService`
> loads Puppeteer through its own dynamic import instead. Read `features.pdf`
> to know whether PDF is available.

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
| POST | `/api/auth/register` | — | Create an account. **Not mounted when `FEATURE_SIGNUP=off`.** |
| POST | `/api/auth/reset-password` | — | Complete a password reset |
| POST | `/api/auth/verify-email` | — | Complete email verification |
| POST | `/api/auth/refresh-token` | — | Exchange an expired-but-valid token for a fresh one |
| GET | `/api/auth/profile` | Auth | The signed-in user |
| PUT | `/api/auth/profile` | Auth | Update own profile |
| POST | `/api/auth/change-password` | Auth | Change own password |

Every unauthenticated route above is covered by the login rate limiter, not
just `/login`.

> **`POST /api/auth/refresh-token` verifies the signature.** Before 2.6.0 it
> called `jwt.decode()`, which parses a payload without checking anything, so a
> token assembled by hand claiming `userId: 1` was answered with a genuinely
> signed administrator session. It now verifies with `ignoreExpiration`, which
> keeps the property the endpoint exists for — an expired token is still proof
> the holder once authenticated — while rejecting a forged one.

## Users — `/api/users`

Administrative. Most routes require admin.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/users/admin-exists` | — | Whether an administrator has been configured yet |
| GET | `/api/users` | Admin | List |
| GET | `/api/users/:id` | Admin | One user |
| GET | `/api/users/email/:email` | Admin | Look up by email |
| POST | `/api/users` | Admin | Create |
| PUT | `/api/users/:id` | Admin | Update name, email, username or role |
| DELETE | `/api/users/:id` | Admin | Delete |
| POST | `/api/users/:id/password` | Admin | Set another user's password |
| POST | `/api/users/:id/unlock` | Admin | Clear an account lockout |
| PUT | `/api/users/:id/verify-email` | Admin | Mark email verified |

`GET /api/users/admin-exists` is public so the SPA can decide whether to offer
first-run setup. It answers with booleans only.

> **Removed in 2.6.0, and not replaced.** `GET /api/users/email/:email` used to
> answer without a token for `admin@slimbooks.app`, returning the `SELECT *` row
> — `password_hash`, `two_factor_secret` and `backup_codes` included — to any
> caller. It is admin-only now; the first-run question it served is answered by
> `GET /api/setup/status`, which discloses nothing.
>
> Four login-bookkeeping routes (`POST /api/users/update-login-attempts`,
> `POST /api/users/update-last-login`, `PUT /api/users/:id/login-attempts`,
> `PUT /api/users/:id/last-login`) are also gone. They carried no
> authentication, so anyone could clear any account's lockout and make the
> brute-force protection decorative, or forge login history. They had no caller
> in the server or the SPA — the login flow writes those columns through
> `UserService` directly.

> `DELETE /api/users/:id` and `PUT /api/users/:id` return **409** when the
> change would leave the install with no administrator. The response carries
> a message intended for display.
> ([ADR-0017](../adr/0017-last-admin-invariant.md))

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

`PUT /api/clients/:id` writes `tax_id`, `notes` and the rest of the client
record. **Before 2.6.0 it accepted `tax_id` and `notes`, validated them, replied
success and discarded them** — so a tax ID could be set when a client was
created and never changed afterwards. If you worked around that by recreating
clients, the field now updates in place.

**There is no archive endpoint.** The `clients.is_active` column exists and is
indexed, validation accepts it on create and update, and a `toggleClientStatus`
controller is written — but no route mounts it and no screen calls it, so
archiving is not reachable over HTTP. The service method behind it used to
return success without touching the database; it now writes the column, so
wiring a route to it is all that archiving would need.

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

### `amount` means two different things

**On a recurring template, `amount` is the gross total** — tax and shipping
already included. The table has no `total_amount` column to hold it separately,
and `tax_amount` and `shipping_amount` sit alongside as a breakdown of what is
inside that figure, not as additions to it.

**On an invoice, `amount` is the subtotal**, with `total_amount` carrying the
gross. The processor converts between the two when it generates an invoice:

```
invoice.amount       = template.amount - template.tax_amount - template.shipping_amount
invoice.total_amount = template.amount
```

> **Before 2.6.0 the processor added tax and shipping a second time**, so a
> template billing 1,100 generated an invoice for 1,200 — unattended, every
> cycle, since 2.2.0. Invoices already generated were left as they are; see the
> CHANGELOG for how to identify them.

If you write templates through this API, send the gross in `amount`.

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
| POST | `/api/pdf/page` | Render a page of this installation |
| GET | `/api/pdf/status` | Provider state |
| POST | `/api/pdf/initialize` | Start the provider |
| GET | `/api/pdf/format` | Page format settings |
| PUT | `/api/pdf/format` | Update page format settings |

**`POST /api/pdf/page` accepts only URLs on this installation's own origin** —
the scheme, host and port of `CLIENT_URL`. Anything else is a 400 before the
renderer is started.

This endpoint drives a real headless browser at the URL in the request body, and
that browser runs inside your network perimeter. Until 2.6.0 the only check was
that the value looked like a URL, which made it a server-side request forgery
primitive available to every signed-in account: `http://169.254.169.254/…`
returned the host's cloud instance metadata — IAM credentials included —
rendered as a PDF, and any internal address the host could reach was reachable
the same way. The application itself only ever sends its own report pages, so
the restriction costs the feature nothing.

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

**`POST /api/email/send` delivers only to an address this installation already
holds** — a client row that is not soft-deleted, or a user of the install.
Anything else is a 400, checked before the SMTP configuration so the refusal
reads the same whether or not email is set up.

The sender was never the caller's to choose; the recipient was. That made the
endpoint an open mail relay for any account — arbitrary HTML, to any address in
the world, carrying this installation's domain, SMTP credentials and sending
reputation, and reachable by anyone who could register when `FEATURE_SIGNUP` is
on. Sending an invoice or a reminder always addresses a client, so the
restriction leaves the feature intact.

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
| GET | `/api/db/export` | Admin | Download a backup |
| POST | `/api/db/import` | Admin | Restore from a backup |

Both require admin as of 2.6.0. They were `requireAuth` only, which meant any
account could download every bcrypt hash and stored credential in the install,
or replace the database with one in which they were the administrator.

Both are recorded in the [audit trail](#audit-trail--apiaudit).

For moving between backends, prefer the CLI tools — `npm run db:export` and
`npm run db:import` — which produce a dialect-neutral dump. See
[backup and restore](../operations/backup-and-restore.md).

## Audit trail — `/api/audit`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/audit` | Admin | Read security events, newest first |

Query parameters: `action`, `actorUserId`, `limit` (default 50, capped at 200),
`offset`.

Read-only by design. There is no endpoint that writes or deletes a record —
entries are written by the server as a side effect of the action they describe,
and removal happens only through the retention prune governed by
`AUDIT_RETENTION_DAYS`. An API that could delete an audit record would undo the
point of keeping one.

Recorded actions: `auth.login`, `auth.register`, `auth.password_change`,
`auth.password_reset`, `user.create`, `user.update`, `user.role_change`,
`user.delete`, `user.unlock`, `settings.update`, `database.export`,
`database.import`, `setup.complete`.

Each record carries the actor (by id *and* by the email as it read at the time,
so it survives deletion of the account), the outcome, the target, the source IP,
and an action-specific JSON `details` payload. Settings changes record the key
that changed, never the value.

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
