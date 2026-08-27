# SlimBooks

<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: AGPL v3+](https://img.shields.io/badge/License-AGPL%20v3%2B-blue.svg?style=for-the-badge)](./LICENSE)

**A secure, self-hosted billing and invoice management application**

🔒 Security-first • 🐳 Docker ready • 🖥️ Runs anywhere Node does

[Features](#features) • [Quick start](#quick-start) • [Documentation](#documentation) • [License](#license)

</div>

---

Slimbooks is billing software you run on your own hardware. Clients, invoices,
recurring billing, expenses, payments and reports — with no hosted tier, no
telemetry, and no third party holding your books.

## Features

**Business management.** Dashboard with interactive charts. Client profiles
with history. Customisable invoices with line items, tax and shipping.
Recurring billing on weekly, monthly, quarterly, yearly or custom schedules.
Categorised expense tracking with vendors and approval states. Profit & loss,
invoice, expense and client reports — P&L supports cash or accrual accounting
and breaks multi-period ranges into monthly or quarterly columns that reconcile
with the totals.

**Getting paid.** Optional Stripe payment links, with webhook reconciliation
that marks the invoice paid — verified by signature and safe against duplicate
delivery. The secret key never reaches the browser.

**Email.** Real SMTP delivery from your own mail server, with presets for
eleven providers and a connection test that actually connects.

**Security and privacy.** Bearer-token auth with silent refresh and
refresh-token rotation. bcrypt hashing, account lockout, rate limiting,
security headers, server-side validation. Self-hosted, and nothing phones home.

**Deployment.** One artifact runs on Docker, bare Linux, Windows IIS or a Node
PaaS — [they differ only in environment variables](documentation/adr/0002-environment-driven-not-host-detected.md).
SQLite by default; MySQL or MariaDB when the host needs it.

## Tech stack

| Component | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS + Lucide |
| Backend | Node.js 24 + Express |
| Database | SQLite (default) or MySQL / MariaDB |
| Charts | Recharts |
| Deployment | Docker + Docker Compose |

## Quick start

### Docker

```bash
git clone https://github.com/rbenzing/SlimBooks.git
cd slimbooks

./scripts/generate-secrets.sh        # fills .env from .env.example
./scripts/generate-certificates.sh   # compose sets TLS_MODE=self

docker compose up -d
```

Reachable at `https://localhost:8080`. Full instructions, including the other
three hosts, are in the [deployment guide](documentation/operations/deployment.md).

### Development

```bash
npm install
cp .env.example .env    # set CLIENT_URL — the server will not start without it
npm run dev
```

Frontend on `http://localhost:8080`, API on `http://localhost:3002`. Migrations
run automatically at boot. The frontend hot-reloads; **restart the server after
backend changes**.

See [getting started](documentation/development/getting-started.md).

### Quality gates

```bash
npm run typecheck   # frontend + vite config + server
npm run lint        # ESLint (0 errors, 0 warnings) + typecheck
npm test            # Vitest
npm run build
```

## Configuration

`.env.example` is the single environment template and lists every variable the
application reads, with comments. Copy it and edit the copy.

Three things are worth knowing before a first deployment:

- **`CLIENT_URL` is required.** The server refuses to start without it.
- **Set the three signing secrets.** Left blank, the application signs tokens
  with values published in this repository.
- **Anything saved in the Settings screens wins over `.env`.** The file sets
  the defaults an install starts from.

Every variable, its default and which module reads it:
[configuration reference](documentation/operations/configuration.md).

## Documentation

| | |
|---|---|
| [Documentation index](documentation/) | Everything, by audience |
| [User guide](documentation/user-guide/) | Using Slimbooks to bill clients |
| [Deployment guide](documentation/operations/deployment.md) | The four supported hosts |
| [Configuration reference](documentation/operations/configuration.md) | Every environment variable |
| [Database backends](documentation/operations/database-backends.md) | SQLite, MySQL and MariaDB |
| [Architecture](documentation/development/architecture.md) | How the pieces fit |
| [API reference](documentation/development/api-reference.md) | Every HTTP endpoint |
| [Decision records](documentation/adr/) | Why it is built this way |
| [Specifications](documentation/specs/) | What each subsystem guarantees |
| [CHANGELOG](CHANGELOG.md) | What changed, and what breaks |
| [Contributing](CONTRIBUTING.md) | Development and contribution guidelines |
| [Security policy](SECURITY.md) | Reporting a vulnerability |

## Upgrading

Migrations run automatically at boot. **Take a backup first**, every time.

2.3.0 needs no operator action — no migration, no environment change — but
`PUT /api/users/:id` no longer accepts `password_hash`. Coming from 2.1.x, note
that 2.2.0 converts stored timestamps and changes the API to send them as JSON
numbers, and a dump taken with 2.1.x will not import. Version-by-version notes
are in [upgrading](documentation/operations/upgrading.md).

## License

Slimbooks is free software: you can redistribute it and/or modify it under the
terms of the **GNU Affero General Public License** as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version.

It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the [LICENSE](./LICENSE) for details.

> **What AGPL means for a self-hosted app:** if you modify Slimbooks and let
> others use it over a network, you must offer those users the source of your
> modified version. Running it privately for your own business places no
> obligation on you.

SPDX identifier: `AGPL-3.0-or-later`

---

## About the author

Slimbooks is built by **[Russell Benzing](https://github.com/rbenzing)**.

It's developed with heavy use of AI coding assistants — architecture,
implementation, tests and this documentation. That's a deliberate choice, and
worth stating plainly: it means the project moves quickly, and it means every
change still gets reviewed, type-checked, linted and covered by the test suite
before it lands. The full history is public; judge the code, not the tooling.

It's released free and open source under the AGPL so that freelancers and small
businesses can run their own billing on their own hardware, and own their data
outright rather than rent access to it. There's no hosted tier, no telemetry,
and nothing held back for a paid version.

Bug reports, feature requests and pull requests are all welcome — see
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Support

Found a bug? Have a feature request? Please open an
[issue](https://github.com/rbenzing/SlimBooks/issues). For anything
security-related, use [the security policy](SECURITY.md) rather than a public
issue.

If Slimbooks is useful to you, you can support its development:

<a href="https://buymeacoffee.com/russellbenzing" target="_blank"><img src="https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me A Coffee" /></a>

---

<div align="center">

**🏠 Self-hosted • 🔒 Secure • 🚀 Production-ready**

*Perfect for small businesses, freelancers, and anyone who values data privacy and control.*

</div>
