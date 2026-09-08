# ADR-0019: Slimbooks is single-currency per install

**Status:** Accepted
**Date:** 2026-09-07

## Context

Before this decision, currency existed as three disconnected mechanisms.
Settings → General's display-currency setting (`currency_format_settings`)
controlled how every amount was *formatted* everywhere in the UI — symbol,
decimal places, separators — regardless of what any individual invoice,
payment or expense was actually charged in. `invoice.currency` (and the same
column on `payments` and `expenses`) existed in the schema, defaulting to
`'USD'`, but nothing in the application ever set it to anything else; there
was no UI field for it. A `stripe.currency` setting was added to let an admin
configure what currency Stripe charged in, but `StripeService` never read it
— the only place a currency reached Stripe was
`(invoice.currency || 'USD').toLowerCase()`, which was always `'USD'` in
practice. An admin who set display currency to EUR would see €-formatted
amounts everywhere while Stripe silently kept charging in USD underneath.

A separate, dead fourth mechanism also existed:
`InvoiceService`'s public invoice view read a legacy `currency_settings`
key nothing had ever written.

## Decision

Slimbooks has one currency per install, not one per invoice. Settings →
General's display-currency setting is the single source of truth:
`SettingsService.getStripeCredentials()` now sources `currency` from it
(falling back to `DEFAULT_CURRENCY` in `.env`, then to `'usd'`), and
`StripeService.createPaymentLinkForInvoice` charges in that currency instead
of `invoice.currency`. The separate `stripe.currency` setting is removed.

The per-row `currency` columns on `invoices`/`payments`/`expenses` are left
exactly as they are — still defaulting to `'USD'`, still unused by anything
that reads or writes them — rather than newly written at insert time with
the configured currency. Stamping them now would suggest they mean something
for a change this decision explicitly rules out (per-invoice currency,
exchange rates, multi-currency report totals), work with no present-day
payoff and its own unanswered questions.

## Consequences

- Display and charge currency cannot disagree, because there is only one
  setting for both.
- **An install whose display currency was already something other than USD
  will begin charging Stripe in that currency**, where it previously charged
  in USD regardless. This is the fix, not a side effect, but it is a genuine
  behaviour change for any such install — see the `2.5.0` CHANGELOG entry.
- Genuine multi-currency support — a different currency per invoice, exchange
  rates, cross-currency report totals — is out of scope by design, not by
  oversight. It would need its own decision, and this ADR is what a future
  proposal to add it should read first.
- The dead `currency_settings`/`currency` read in `InvoiceService` is removed
  along with its now-unused `currencySettings` field on the public invoice
  response type.
