# Invoices

The Invoices screen has two tabs: **Invoices** (the list) and **Templates**
(the visual designs invoices are rendered with).

## Creating one

**Invoices → Create.**

| Field | Notes |
|---|---|
| Client | Pulls in the address on the client record |
| Invoice number | Assigned automatically; see below |
| Issue date | A calendar day |
| Due date | A calendar day |
| Line items | Description, quantity, rate |
| Tax | Rates come from Settings → Company & Tax, under Tax Rates |
| Shipping | Configured in Settings → Shipping |
| Notes | Free text on the invoice |

Amounts use the currency from Settings, formatted the way you configured it
there.

### Invoice numbers

The next number is **previewed without being consumed** while you are editing,
and only assigned when the invoice is actually created. An invoice you start
and abandon does not leave a gap in the sequence.

Numbering is configured in Settings.

## Statuses

| Status | Means |
|---|---|
| `draft` | Not issued yet. Editable. |
| `sent` | Issued to the client |
| `paid` | Settled |
| `overdue` | Past its due date and not paid |
| `cancelled` | Withdrawn |
| `refunded` | Paid, then refunded |

**Overdue** is derived from the due date rather than set by hand. There is a
dedicated overdue view for chasing.

Marking an invoice sent and marking it paid are separate actions — recording a
payment is covered in [payments](payments.md).

## Sending an invoice

Three ways, depending on what your install has switched on:

**Email.** If email is configured, send the invoice directly. Ask your
administrator to use **Settings → Email → Test Connection** first if delivery
is unreliable — a wrong password fails there rather than silently when an
invoice goes out.

**A public link.** Generate a link that shows the invoice in a browser without
the recipient needing an account. The link carries a token; anyone with it can
view that invoice, so treat it as you would the invoice itself.

**PDF.** Download or print. Only available when PDF rendering is enabled on
your install — on some hosts it is not, and the button will be absent.

## Design templates

The **Templates** tab holds invoice designs — layout, colours, what appears
where. Create several and pick one per invoice.

> These are not the same as recurring-invoice templates, which live in
> [recurring invoices](recurring-invoices.md). Two different things, similar
> names.

## Getting paid by card

If Stripe is configured, you can attach a card payment link to an invoice. When
the client pays, the payment is recorded and the invoice marked paid
automatically. See [payments](payments.md#stripe).

## Editing and deleting

A draft can be changed freely. Editing an invoice that has been sent changes
what the client sees at the public link, so prefer cancelling and reissuing
where the amount or the parties change.

## Next

- [Recurring invoices](recurring-invoices.md)
- [Payments](payments.md)
- [Reports](reports.md)
