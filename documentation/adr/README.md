# Architecture decision records

One decision per file. Each records the context that forced it, what was
decided, and the consequences the project lives with — including the ones that
turned out to be expensive.

An ADR is not a design document and not a tutorial. It answers one question:
*why is it like this?* When the answer is "because of a specific failure", the
failure is named. Several of these exist because something shipped broken.

## Format

```
Status      Accepted | Superseded by ADR-NNNN | Deferred
Date        When the decision was taken
Context     The forces at play, including what broke
Decision    What was chosen, in the present tense
Consequences  What follows — good, bad, and the rules everyone now has to follow
```

## Index

### Runtime and hosting

| # | Decision | Status |
|---|---|---|
| [0001](0001-single-environment-boundary.md) | Only the runtime composition root reads `process.env` | Accepted |
| [0002](0002-environment-driven-not-host-detected.md) | Configuration is environment-driven, never host-detected | Accepted |
| [0003](0003-tri-state-feature-toggles.md) | Feature toggles are tri-state, not boolean | Accepted |
| [0004](0004-one-build-tree-one-process.md) | One build tree, one process | Accepted |
| [0005](0005-declared-tls-termination.md) | TLS termination is declared, not detected | Accepted |
| [0006](0006-in-process-scheduler.md) | Recurring invoices run in-process behind a database lease | Accepted |
| [0016](0016-process-managers.md) | systemd on bare Linux, HttpPlatformHandler on IIS | Accepted |

### Data

| # | Decision | Status |
|---|---|---|
| [0007](0007-two-backends-one-schema.md) | Two database backends, one schema | Accepted |
| [0008](0008-dialect-differences-in-one-place.md) | Dialect differences live in `SqlDialect`, never at the call site | Accepted |
| [0009](0009-instants-as-epoch-milliseconds.md) | An instant is epoch milliseconds, stored as an integer | Accepted |
| [0010](0010-calendar-days-are-not-instants.md) | A calendar day is not an instant | Accepted |
| [0011](0011-strict-sqlite-tables.md) | SQLite tables are STRICT | Accepted |
| [0012](0012-money-precision-deferred.md) | Money stays `REAL`/`DOUBLE` until both backends change together | Deferred |
| [0013](0013-storage-keys-are-logical.md) | Uploaded files are addressed by logical key, never by path | Accepted |

### Application

| # | Decision | Status |
|---|---|---|
| [0014](0014-dual-type-declarations.md) | Domain types are declared twice and kept in sync by hand | Accepted |
| [0015](0015-theme-as-design-system.md) | The theme is a design system, not ad-hoc utility classes | Accepted |
| [0017](0017-last-admin-invariant.md) | The last-administrator invariant lives in the statement, not around it | Accepted |

## Adding one

Copy the format above, take the next number, and add a row to the index. Write
it when the decision is taken, not afterwards — the context is the part that
evaporates, and it is the only part that matters in two years.
