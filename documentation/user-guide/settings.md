# Settings

Ten tabs. Anything saved here **takes precedence over the server's
environment file**, so Settings is the place to configure a running install.

| Tab | For |
|---|---|
| [Company & Tax](#company--tax) | Name, address, logo, tax rates, fiscal year and accounting basis |
| [General](#general) | Currency, date format, language |
| [Shipping](#shipping) | Shipping options and rates |
| [Email Settings](#email) | SMTP delivery |
| [Notifications](#notifications) | In-app notification behaviour |
| [Appearance](#appearance) | Theme and colour preset |
| [Google OAuth](#google-oauth) | Sign in with Google |
| [Stripe](#stripe) | Card payments |
| [Security](#security) | Authentication policy |
| [Backup & Restore](#backup--restore) | Download and restore the database |

## Company & tax

Your business name, address and contact details, plus a **logo** that appears
on every invoice. Set this up before issuing your first invoice — it is what
your clients see.

The logo is stored by the application rather than linked from elsewhere, so it
keeps working regardless of how the install is hosted.

### Tax rates

Define the rates you charge. They become selectable on invoice line items.

### Fiscal year

The month your fiscal year starts, January through December. It drives every
"This Quarter" and "This Year" — and their "Last" counterparts — across
Expenses, Payments, Invoices, all four reports and the dashboard, including
which calendar months a report's quarterly columns cover.

A January fiscal year is labelled by its calendar year, same as a plain
calendar year always was. Any other start is labelled **FY** plus the
calendar year it *ends* in — a fiscal year starting July 2026 runs to June
2027 and is labelled **FY2027**, and its quarterly report columns read
"FY2027 Q1" through "FY2027 Q4".

### Accounting basis

Cash or accrual. This is a fact about how the business recognises income, not
a per-report choice, and the profit & loss report reads it directly — see
[cash or accrual](reports.md#cash-or-accrual) for what each counts.

## General

Currency, number formatting, date format and language.

**These are honoured everywhere.** Every screen, every report and every invoice
formats amounts and dates the way you set them here — there is no screen with
its own idea of what a date looks like.

Change the date format here rather than looking for a per-screen setting.

## Shipping

Shipping methods and rates, for invoices that carry a delivery charge.

## Email

SMTP settings for sending invoices and reminders from your own mail server.

A **provider dropdown** fills the host, port and encryption together for
Gmail, Outlook, Yahoo, iCloud, Zoho, Fastmail, SendGrid, Mailgun, Postmark,
Brevo and Amazon SES — or enter your own.

Encryption is `tls` (STARTTLS, usually port 587), `ssl` (on connect, usually
465), or `none`.

> **Use Test Connection.** It opens a real connection and authenticates, so a
> wrong password fails there rather than silently when an invoice goes out.

## Notifications

How in-app notifications behave, including where they appear on screen — any of
the six corners and edge centres.

## Appearance

**Mode:** `system`, `light` or `dark`. `system` follows your operating system.

**Preset:** `modern-blue`, `classic-white` or `professional-gray`.

Both apply across the whole application. Nothing in the interface hard-codes a
colour, so a preset changes everything consistently.

## Google OAuth

Client id, secret and redirect URI for "Sign in with Google". Setting the id
and secret switches the integration on.

## Stripe

Publishable key, secret key and webhook signing secret for card payments.

- The **secret key** is used only by the server and never reaches your browser.
- **Test Connection** verifies the keys against Stripe before you rely on them.
- **The webhook signing secret is what marks invoices paid automatically.**
  Without it clients can still pay, but nothing reconciles.

Setup detail is in the [deployment guide](../operations/deployment.md); the
day-to-day use is in [payments](payments.md#stripe).

## Security

Authentication policy — token lifetimes, password hashing strength, failed
login limits and lockout duration, and whether email verification is required.

Defaults: five failed attempts locks an account for thirty minutes; access
tokens last two hours and refresh silently.

## Backup & restore

Download the database as a file, and restore one.

**Download a backup before any upgrade**, and before any bulk import.

A backup you have never restored is a hypothesis. If your data matters, restore
one into a spare install occasionally and check that it opens. Fuller guidance
is in [backup and restore](../operations/backup-and-restore.md).

## Missing tabs or greyed-out options

Features are switched on by whoever runs the server. If Stripe, email, Google
sign-in or PDF export is absent, it is disabled or unavailable on that host —
ask your administrator, who can check `/api/health` to see what the install
actually resolved.
