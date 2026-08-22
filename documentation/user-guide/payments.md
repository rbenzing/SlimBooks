# Payments

What you have actually been paid, as distinct from what you have invoiced.

## Recording a payment

**Payments → New Payment.**

| Field | Notes |
|---|---|
| Invoice | Which invoice this settles |
| Date | A calendar day |
| Amount | May be partial |
| Method | See below |
| Status | See below |
| Reference | Cheque number, transfer reference, whatever helps you reconcile |

### Methods

`cash` · `check` · `bank_transfer` · `credit_card` · `paypal` · `other`

### Statuses

| Status | Means |
|---|---|
| `received` | Money is in |
| `pending` | Expected, not cleared |
| `failed` | Did not go through |
| `refunded` | Returned to the client |

`pending` is the honest state for a cheque you are holding but have not banked.
The profit & loss report treats cash and accrual differently, so this
distinction shows up in your numbers — see [reports](reports.md).

## Bulk actions

- **Bulk import** — CSV, for a bank export
- **Bulk delete** — for cleaning up after an import that went wrong

As with any import, try it on a test install first if you can.

## Stripe

If your install has Stripe configured, clients can pay invoices by card.

### Sending a payment link

Generate a payment link for an invoice and send it to the client. The link
takes them to Stripe's own checkout — card details never touch your install.

### Automatic reconciliation

When the client pays, Stripe notifies your install, the payment is recorded,
and the invoice is marked paid. You do nothing.

This works only when the **webhook signing secret** is configured. Without it,
clients can still pay, but invoices are not marked paid automatically — there
is no verified way to know the payment happened, and inventing one would let
anyone mark any invoice paid.

If card payments arrive but invoices stay unpaid, that is the setting to check.
Your administrator will find it in
[Settings → Stripe](settings.md#stripe) and in the
[deployment guide](../operations/deployment.md).

### Deactivating a link

Payment links can be deactivated when an invoice is cancelled or superseded.

## Reconciling

The payments list is the record of money in. Compare it against your bank
statement rather than against the invoice list — an invoice tells you what you
asked for, a payment tells you what arrived.

The **invoice report** shows what was billed; the **profit & loss** report on a
cash basis shows what was actually collected. Two different questions.

## Next

- [Reports](reports.md)
- [Invoices](invoices.md)
