# User guide

Slimbooks is billing software you run yourself. Clients, invoices, expenses,
payments and reports — no hosted tier, no telemetry, and your data stays on
your own machine.

This guide covers using it. If you are installing or running it, start with
[operations](../operations/).

## Signing in

Your administrator creates the first account when the install is set up. After
that:

- **Sign in** at `/login`
- **Forgot your password** sends a reset link, valid for one hour by default
- **Register** is available only when self-registration is enabled on your
  install

If sign-in fails repeatedly the account locks temporarily — five attempts by
default, for thirty minutes. Wait, or ask an administrator.

## The layout

A sidebar down the left, one screen per area:

| Screen | For |
|---|---|
| **Dashboard** | Financial overview and charts |
| **Clients** | Who you bill — [guide](clients.md) |
| **Invoices** | Invoices and their design templates — [guide](invoices.md) |
| **Expenses** | What you spend — [guide](expenses.md) |
| **Payments** | What you have been paid — [guide](payments.md) |
| **Reports** | Profit & loss and three others — [guide](reports.md) |
| **Users** | Accounts and roles, administrators only — [guide](users.md) |
| **Settings** | Company details, tax, email, appearance — [guide](settings.md) |

Recurring invoices are created from the Invoices screen and have their own
[guide](recurring-invoices.md).

## The dashboard

Your financial position at a glance, over a period you choose: This Year, Last
Year, This Quarter, Last Quarter, This Month, Last Month, This Week, Last Week,
Today, Yesterday, or a custom range. "This Year" means your fiscal year, set in
Settings → Company.

The totals are drawn from the same data as the reports and dated the same way —
an invoice counts in the period it was issued, an expense in the period it was
incurred — so a figure here and a figure in a report agree.

The revenue chart covers five of those periods: This Year, Last Year, This
Month, Last Month and Last Week. Choose any of the others and the totals are
still correct for what you picked, but the chart falls back to a year-to-date
trend.

## A first invoice, end to end

1. **Settings → Company & Tax** — your name, address and logo. These appear on
   every invoice, so do this first. Set your fiscal year and accounting basis
   here too: they decide what every "This Year" and "This Quarter" in the app
   means.
2. **Settings → Company & Tax, under Tax Rates** — if you charge tax.
3. **Clients → New Client** — who you are billing.
4. **Invoices → Create** — pick the client, add line items, set the issue and
   due dates.
5. **Send it** — by email if email is configured, or share a public link, or
   download a PDF.
6. **Record the payment** when it arrives — or let Stripe do it for you.

## Things worth knowing early

**Dates are days, not moments.** A due date of the 12th is the 12th, wherever
you or your client happen to be. Timestamps like "created" are shown in your
own timezone and in the format you choose in Settings.

**Currency and formatting come from Settings.** Change them in one place and
every screen follows.

**Some features depend on your install.** PDF export, email, Stripe and
sign-in-with-Google are each switched on by whoever runs the server. If a
button you expect is missing, that is usually why — ask your administrator.

**Deleting may be reversible.** Depending on how your install is configured,
deleted records may be retained and hidden rather than destroyed. Ask before
relying on either behaviour.

## Getting help

- Something looks wrong in the software:
  [open an issue](https://github.com/rbenzing/SlimBooks/issues)
- Something looks wrong with your install: ask whoever runs it, and point them
  at [troubleshooting](../operations/troubleshooting.md)
