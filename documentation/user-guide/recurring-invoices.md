# Recurring invoices

A recurring template describes an invoice that should be raised repeatedly —
a monthly retainer, an annual licence — and the application raises them for
you.

## Creating a template

From the Invoices screen, create a recurring template. It carries the same
content as an invoice — client, line items, tax, shipping, payment terms — plus
a schedule.

| Frequency | Raises an invoice |
|---|---|
| `weekly` | Every week |
| `monthly` | Every month |
| `quarterly` | Every three months |
| `yearly` | Every year |
| `custom` | On an interval you define |

The template tracks its **next invoice date**, which moves forward each time it
generates.

## Active and inactive

A template is either **active** or not. Deactivating one stops it generating
without deleting it or its history — the right way to pause a client's
retainer.

## How generation happens

**Automatically, inside the application.** There is no cron job to set up, no
scheduled task, no external trigger. It works the same way on every kind of
host.

Two properties worth knowing:

- **A template will not generate the same period twice**, even if the server
  restarts mid-run or is killed at an awkward moment. The guarantee is enforced
  by the database, not by the application remembering.
- **Two copies of the application cannot both generate the same invoice.** Only
  one holds the lease at a time.

Some installs disable the built-in scheduler because something external owns
the job. If yours does, your administrator knows; the behaviour you see is the
same.

## Doing it by hand

You can generate on demand rather than waiting:

- **Process all due templates** — raises everything currently due
- **Process one template** — raises just that one

Both produce ordinary invoices, which then behave exactly like any other.

## Watching it work

The template list shows which templates are **due**, which are **active**, and
processing statistics per template. If a client says an invoice never arrived,
check here first: an inactive template is the usual answer.

## What generation produces

An ordinary invoice, in `draft` or `sent` depending on your configuration, with
its own number from the normal sequence. Edit it, send it, and record payment
as usual.

Changing a template does not alter invoices it has already produced.

## Next

- [Invoices](invoices.md)
- [Payments](payments.md)
