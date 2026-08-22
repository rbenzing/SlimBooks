# Expenses

What you spend, categorised, so the profit & loss report has a cost side.

## Recording one

**Expenses → New Expense.**

| Field | Notes |
|---|---|
| Date | A calendar day |
| Amount | In your configured currency |
| Vendor | Who you paid — "Office Depot", "Starbucks" |
| Category | From the list below |
| Description | Brief note of what it was |
| Status | See below |

The payee field is **vendor** everywhere — in the interface, in exports and in
the API. Never "merchant".

## Categories

| |
|---|
| Office Supplies |
| Travel |
| Meals & Entertainment |
| Marketing |
| Software & Subscriptions |
| Equipment |
| Professional Services |
| Utilities |
| Rent |
| Insurance |
| Other |

Categories drive the expense report's grouping, so a consistent choice is worth
more than a precise one. "Other" is a fine answer; it is only unhelpful when
half of everything ends up there.

## Statuses

| Status | Means |
|---|---|
| `pending` | Recorded, not yet approved |
| `approved` | Approved |
| `rejected` | Declined |
| `reimbursed` | Paid back to whoever spent it |

If you are a sole trader, `approved` for everything is a reasonable habit. The
statuses exist for anyone who needs an approval step.

## Finding expenses

Filter by date range, category or status. The date-range filter is the same
notion of a day used everywhere else: both ends inclusive.

## Importing from a spreadsheet

**Bulk import** accepts a CSV — useful for a bank or card export.

- Some legacy column spellings are accepted, so exports from older software
  often work unchanged.
- Check the currency and date columns before importing a large file.
- **Import into a test install first if you can.**

## Statistics

The expenses screen shows totals for the current filter, and the
[expense report](reports.md) breaks spending down by category over a period.

## Next

- [Reports](reports.md) — where expenses meet income
- [Payments](payments.md)
