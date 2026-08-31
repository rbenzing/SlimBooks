# Reports

Four reports, each over a date range you choose. Any of them can be saved and
reopened later.

| Report | Answers |
|---|---|
| **Profit & loss** | Did I make money, and when? |
| **Invoice** | What did I bill, and what is outstanding? |
| **Expense** | Where did the money go? |
| **Client** | Which clients are worth having? |

## Date ranges

Pick a preset — this month, last month, this quarter, last quarter, this year,
last year, today, yesterday, this week, last week — or a custom range. The
same eleven presets are offered everywhere a period is picked: every report,
the Expenses, Payments and Invoices lists, and the dashboard.

**"This quarter" and "this year" (and their "last" counterparts) follow your
fiscal year**, set in [Settings → Company & Tax](settings.md#company--tax).
For a January fiscal year that is the calendar quarter and year; for any
other start month it is not — a fiscal year starting in July runs "this
year" from 1 July to today, not from 1 January.

**Both ends are inclusive.** A range of 1 January to 31 January includes
everything on 31 January, not everything up to its midnight. A "this"-prefixed
range in progress always ends today, never in the future.

## Dashboard

The dashboard's period selector offers the same eleven presets, and its
totals honour whichever one you pick.

**Known limitation:** its revenue chart does not. The chart only knows how to
draw five of the eleven: `last_week`, `last_month`, `last_year`, `this_year`
and `this_month`. Choose `today`, `yesterday`, `this_week`, `this_quarter`,
`last_quarter` or `custom` and the totals above the chart are still correct,
but the chart itself falls back to a year-to-date trend rather than the
period you selected.

## Profit & loss

The main report. Income minus expenses over the period.

### Cash or accrual

| Basis | Counts income |
|---|---|
| **Accrual** (default) | When you invoiced it |
| **Cash** | When you were paid |

The two answer different questions and will disagree whenever an invoice
crosses a period boundary — which is the point. Accrual tells you what you
earned; cash tells you what you collected.

Your choice of basis interacts with payment status: a `pending` payment is not
cash received. See [payments](payments.md).

### Period breakdown

A range spanning several months can be broken into **monthly** or **quarterly**
columns, so you can see the shape of the period rather than one total.

**Quarterly columns follow your fiscal year, too.** A January fiscal year gets
columns headed "Q1 2026", "Q2 2026" and so on. Any other start gets columns
headed by the fiscal year they fall in and named the same way the year itself
is — "FY2027 Q1", "FY2027 Q2" — rather than the calendar quarter.

**The columns reconcile with the total.** If they did not, one of the two would
be wrong, and it would not be obvious which.

## Invoice report

What you billed over the period, broken down by status — draft, sent, paid,
overdue, cancelled, refunded. This is the report for chasing money: outstanding
and overdue are visible together.

## Expense report

Spending over the period, grouped by category. Pairs with the cost side of the
profit & loss, at more detail.

## Client report

Revenue by client. Which clients account for what share of your income, and
which have amounts outstanding.

## Saving a report

Generated reports can be saved with a name — by default the report type plus
its date range — and reopened from the reports list. A saved report keeps the
figures as generated, so it is a record rather than a live query.

## If a report looks wrong

**Empty results.** Check the date range actually covers records — and that your
install is on 2.2.0 or later. Earlier versions had a defect where reports could
come back empty; see [troubleshooting](../operations/troubleshooting.md).

**A figure disagrees with the dashboard.** Check the accounting basis — cash
and accrual will differ. Otherwise the dashboard and every report read the
same period definitions and the same fiscal year, so the same preset on both
should match exactly (see the [known limitation](#dashboard) above if you are
comparing a chart rather than a total).

**A total changed after upgrading.** This version corrected how invoice and
expense dates are used to build report ranges, so a report can legitimately
total differently than it did before — see the
[changelog](../../CHANGELOG.md)'s Migration note. A saved report is never
recomputed and keeps the figures it was generated with, so an old saved
report will not match a freshly run one of the same name over the same
period; both are correct.

**Numbers look off by a rounding.** Amounts are stored as floating-point
values. For invoice-scale figures this is tolerable but not exact; the
[decision record](../adr/0012-money-precision-deferred.md) explains why it has
not been changed piecemeal.

## Next

- [Payments](payments.md)
- [Expenses](expenses.md)
