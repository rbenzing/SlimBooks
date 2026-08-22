# Clients

A client is whoever you send invoices to. Everything else — invoices, recurring
templates, payments, the client report — hangs off this record.

## Adding one

**Clients → New Client.** Name and email are what you will actually use;
address fields are what appear on the invoice.

The postal-code field is **ZIP code** throughout the interface and the API.

## Finding one

The client list supports search. On a long list, search by name or email rather
than scrolling.

## Client history

Open a client to see its statistics — invoices raised, amounts paid, amounts
outstanding. This is the fastest way to answer "has this customer paid us?"
without building a report.

For a full picture across all clients, use the **client report** — see
[reports](reports.md).

## Importing from a spreadsheet

**Bulk import** accepts a CSV.

- Export from your existing system as CSV.
- The importer accepts some legacy column spellings for compatibility, so a
  file exported from older software often works unchanged.
- **Import into a test install first if you can.** An import is much easier to
  check than to undo.

## Editing and deleting

Editing a client does not rewrite invoices already issued to it — an invoice
records the details it was issued with, which is what you want for an
accounting record.

Deleting depends on your install: some are configured to retain deleted records
and hide them, others to remove them. Ask your administrator which yours does
before deleting anything you might need.

A client with invoices against it is usually better made inactive by leaving it
alone than deleted.

## Next

- [Invoices](invoices.md) — billing a client
- [Recurring invoices](recurring-invoices.md) — billing one repeatedly
