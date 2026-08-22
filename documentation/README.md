# Slimbooks documentation

Everything here describes the code as it stands. Where a document names a
variable, an endpoint or a default, that name is read from the source; where
something is designed but not yet built, the document says so.

## By audience

| You are | Start here |
|---|---|
| Using Slimbooks to bill clients | [User guide](user-guide/) |
| Deploying or running an install | [Operations](operations/) |
| Changing the code | [Development](development/) |
| Asking why something is built this way | [Decisions](adr/) |
| Asking what a subsystem guarantees | [Specifications](specs/) |

## Contents

### [User guide](user-guide/)

For the person doing the invoicing.

- [Getting started](user-guide/README.md) — signing in, the dashboard, the shape of the app
- [Clients](user-guide/clients.md) — client records, CSV import, per-client history
- [Invoices](user-guide/invoices.md) — creating, sending, statuses, public links
- [Recurring invoices](user-guide/recurring-invoices.md) — templates and automatic generation
- [Expenses](user-guide/expenses.md) — categories, vendors, approval states, CSV import
- [Payments](user-guide/payments.md) — recording payments, Stripe payment links
- [Reports](user-guide/reports.md) — profit & loss, invoice, expense and client reports
- [Settings](user-guide/settings.md) — company details, tax, email, appearance, backups

### [Operations](operations/)

For whoever runs the install.

- [Deployment guide](operations/deployment.md) — the four supported hosts
- [Configuration reference](operations/configuration.md) — every environment variable
- [Database backends](operations/database-backends.md) — SQLite and MySQL/MariaDB
- [Backup and restore](operations/backup-and-restore.md) — what to copy, and how to put it back
- [Upgrading](operations/upgrading.md) — version-to-version notes
- [Secrets](operations/secrets.md) — generating the three signing secrets
- [Troubleshooting](operations/troubleshooting.md) — boot failures and their causes
- [Raspberry Pi](operations/raspberry-pi.md) — one host, walked through end to end

### [Development](development/)

For whoever changes the code.

- [Architecture](development/architecture.md) — how the pieces fit and where state lives
- [Getting started](development/getting-started.md) — local setup and the daily loop
- [Testing](development/testing.md) — the gate, and why a green suite is not enough
- [API reference](development/api-reference.md) — every HTTP endpoint
- [Theme system](development/theme-system.md) — the design tokens the UI is built from

### [Decisions](adr/)

Architecture decision records: one decision per file, with the context that
forced it and the consequences we live with. Start at the [index](adr/README.md).

### [Specifications](specs/)

What each subsystem guarantees, and to whom. Start at the [index](specs/README.md).

## Conventions

- **Present tense, current code.** These documents describe what the software
  does now, not what it did or will do. Anything aspirational is labelled.
- **Names are copied, not paraphrased.** `UPLOAD_DIR` means `UPLOAD_DIR`.
- **Defects are documented, not hidden.** Where a shipped artifact is known to
  be wrong, the document says so and links to the work that fixes it.
