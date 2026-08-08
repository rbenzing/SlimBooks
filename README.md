# SlimBooks

<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: AGPL v3+](https://img.shields.io/badge/License-AGPL%20v3%2B-blue.svg?style=for-the-badge)](./LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/russellbenzing)

**A secure, self-hosted billing and invoice management application**

🔒 **Security-First** • 🐳 **Docker Ready** • 🖥️ **Runs Anywhere Node Does**

[Features](#-key-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [License](#-license)

</div>

---

## ✨ Key Features

### 💼 Business Management
- **📊 Dashboard**: Real-time financial overview with interactive charts
- **👥 Client Management**: Complete client profiles with contact details and history
- **🧾 Professional Invoices**: Customizable templates with line items, taxes, and shipping
- **🔄 Recurring Invoices**: Automated recurring billing with customizable schedules (weekly, monthly, quarterly, yearly)
- **💰 Expense Tracking**: Categorized expenses with vendor, approval status and CSV import
- **📈 Financial Reports**: Profit & loss, invoice, expense and client reports. P&L supports cash or accrual
  accounting and breaks multi-period ranges into monthly or quarterly columns that reconcile with the totals

### 💳 Getting Paid
- **🔗 Stripe Payment Links**: Generate a card payment link for any invoice. Optional — Slimbooks works
  fully without it
- **🔁 Automatic Reconciliation**: Stripe webhooks record the payment and mark the invoice paid, verified by
  signature and safe against duplicate delivery
- **🔑 Keys Stay Server-Side**: The Stripe secret key is read only by the server and never reaches the browser

### 📧 Email
- **✉️ Real SMTP Delivery**: Send invoices and reminders from your own mail server
- **📋 Provider Presets**: Pick from Gmail, Outlook, Yahoo, iCloud, Zoho, Fastmail, SendGrid, Mailgun,
  Postmark, Brevo or Amazon SES and the host, port and encryption are filled in together — or enter your own
- **🔍 Connection Testing**: Test the connection before you rely on it; a wrong password fails there rather
  than silently when an invoice goes out

### 🔒 Security & Privacy
- **🛡️ Hardened by Default**: Rate limiting, input validation, and security headers
- **🔐 JWT Authentication**: Access tokens with silent refresh and refresh-token rotation
- **🔑 Password Hashing**: bcrypt, with configurable strength requirements
- **🏠 Self-Hosted**: Complete data ownership - no third-party data sharing
- **🚫 No Telemetry**: Nothing phones home; no analytics, no tracking

### 🚀 Deployment
- **🐳 Docker Ready**: One-command deployment with Docker Compose
- **🖥️ Host-Agnostic**: One artifact runs on Docker, bare Linux, Windows IIS or a Node PaaS — they differ only in environment variables
- **🥧 Raspberry Pi**: Runs well on ARM devices and low-power systems
- **⚡ Fast Setup**: Automated scripts for quick deployment
- **📦 Portable**: SQLite database - easy backup and migration

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | React 18 + TypeScript + Vite |
| **UI** | shadcn/ui + Tailwind CSS + Lucide Icons |
| **Backend** | Node.js + Express + SQLite |
| **Security** | Helmet + Rate Limiting + JWT + bcrypt |
| **Deployment** | Docker + Docker Compose |
| **Charts** | Recharts for analytics visualization |

## 🚀 Quick Start

### 🐳 Docker Deployment (Recommended)

```bash
# Clone the repository
git clone https://github.com/rbenzing/SlimBooks.git
cd slimbooks

# Generate secure secrets
./scripts/generate-secrets.sh

# Deploy with Docker
./scripts/deploy.sh
```

Access your app at `http://localhost:8080`. In production one process serves both the API and the UI on a single port.

### 🥧 Raspberry Pi Setup

```bash
# Prepare your Raspberry Pi
curl -fsSL https://raw.githubusercontent.com/rbenzing/slimbooks/main/scripts/setup-raspberry-pi.sh | bash

# Deploy the application
./scripts/deploy.sh
```

### 💻 Development Setup

```bash
# Install dependencies
npm install

# Start development servers
npm run dev
```

Frontend: `http://localhost:8080` • Backend: `http://localhost:3002`

> Backend changes need a manual restart; the frontend hot-reloads via Vite HMR.
> Database migrations run automatically on server start.

### ✅ Quality Gates

```bash
npm run typecheck   # TypeScript across frontend, vite config, and server
npm run lint        # ESLint (0 errors, 0 warnings) + typecheck
npm test            # Vitest suite
npm run build       # Production build
```

## ⚙️ Configuration

### Environment Variables

`.env.example` is the single environment template and lists every variable the
application reads, with comments. Copy it and edit the copy:

```bash
cp .env.example .env
```

```env
# Security (REQUIRED — blank means a published default is used)
JWT_SECRET=
JWT_REFRESH_SECRET=
SESSION_SECRET=

# Network
CORS_ORIGIN=http://localhost:8080
PORT=3002

# Email — note SMTP_*, not EMAIL_*
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@slimbooks.app

# Stripe (optional). Setting both keys switches the integration on.
STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Deployment — how TLS reaches this process: off | self | proxy
TLS_MODE=off
TRUST_PROXY_HOPS=1

# Features — each is auto | on | off. `on` refuses to boot if unavailable.
FEATURE_PDF=
FEATURE_SCHEDULER=
FEATURE_DEBUG=off
```

Use `./scripts/generate-secrets.sh` to build `.env` from the template with the
three secrets filled in automatically.

Anything configured in the Settings screens takes precedence over the values
here, so `.env` sets the defaults an install starts from. Email and Stripe can
be configured entirely from Settings instead if you prefer.

### Database

- **SQLite**: Lightweight, serverless database perfect for self-hosting
- **Versioned Schema**: Migrations run automatically on server start
- **Data Portability**: Single file database — copy `data/slimbooks.db` to back it up
- **No External Dependencies**: Everything runs locally

## 🔄 Recurring Invoice System

Slimbooks includes a powerful recurring invoice system for automated billing:

### Features
- **📅 Flexible Scheduling**: Weekly, monthly, quarterly, yearly, or custom frequencies
- **🤖 Automated Processing**: Cron job integration for hands-off billing
- **👥 Client-Specific Templates**: Create recurring templates for each client
- **💰 Dynamic Pricing**: Support for line items, taxes, and shipping
- **📊 Processing Statistics**: Monitor template performance and processing status
- **⚡ Manual Triggers**: Process individual templates or all due templates on-demand

### API Endpoints

```
/api/recurring-templates/*    - Template CRUD operations
/api/cron/recurring-invoices  - Only when FEATURE_SCHEDULER=off, admin auth required
```

## 💳 Taking Payments with Stripe

Stripe is optional; every other feature works without it.

1. Put your keys in `.env` (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`) or
   enter them under **Settings → Stripe**. Keys in `.env` switch the
   integration on automatically.
2. Add a webhook endpoint in the Stripe dashboard pointing at
   `https://your-host/api/webhooks/stripe`, subscribed to
   `checkout.session.completed` and `payment_intent.succeeded`.
3. Paste the signing secret it gives you into `STRIPE_WEBHOOK_SECRET` or the
   Stripe settings tab.
4. Use **Test Connection** to check the keys against Stripe before relying on
   them.

Without the webhook secret, clients can still pay, but invoices will not be
marked paid automatically — there is no verified way to know the payment
happened.

```
/api/stripe/status                       - Integration state (no credentials)
/api/stripe/test-connection              - Verify keys against Stripe
/api/stripe/invoices/:id/payment-link    - Create or return an invoice's link
/api/webhooks/stripe                     - Payment notifications from Stripe
```

The webhook endpoint is public because Stripe cannot authenticate; every
delivery is verified against the signing secret before anything is written.

### Template Management
- Create recurring templates with client association
- Set payment terms and due date calculations
- Activate/deactivate templates as needed
- Track next invoice dates automatically
- Monitor processing history and errors

## 🔒 Security Features

- **🛡️ Rate Limiting**: Protection against brute force attacks (100 req/15min)
- **🔐 JWT Authentication**: Secure token-based auth with configurable expiration
- **🚫 Input Validation**: Server-side validation prevents injection attacks
- **🔒 Security Headers**: Comprehensive protection with Helmet.js
- **👤 Account Lockout**: Automatic lockout after failed login attempts
- **🔄 Token Rotation**: Expired access tokens refresh silently; refresh tokens rotate in place
- **📝 Request Logging**: Every request logged with timing, on your own box

## 📚 Documentation

- **[Deployment Guide](./documentation/DEPLOYMENT.md)**: Complete deployment instructions
- **[Theme System](./documentation/THEME_SYSTEM.md)**: Customization and theming guide
- **[Generating Secrets](./documentation/GENERATE_SECRETS.md)**: Producing secure secrets
- **[Contributing](./CONTRIBUTING.md)**: Development and contribution guidelines

## 🔧 Management Commands

```bash
# Update deployment
./scripts/deploy.sh

# Generate new secrets
./scripts/generate-secrets.sh

# Recurring invoices run in-process — no cron setup needed.
# Set FEATURE_SCHEDULER=off only if an external scheduler owns them.
```

## 📄 License

Slimbooks is free software: you can redistribute it and/or modify it under the terms of the
**GNU Affero General Public License** as published by the Free Software Foundation, either
version 3 of the License, or (at your option) any later version.

It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even
the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
[LICENSE](./LICENSE) for details.

> **What AGPL means for a self-hosted app:** if you modify Slimbooks and let others use it
> over a network, you must offer those users the source of your modified version. Running it
> privately for your own business places no obligation on you.

SPDX identifier: `AGPL-3.0-or-later`

---

## 👤 About the Author

Slimbooks is built by **[Russell Benzing](https://github.com/rbenzing)**.

It's developed with heavy use of AI coding assistants — architecture, implementation, tests and
this documentation. That's a deliberate choice, and worth stating plainly: it means the project
moves quickly, and it means every change still gets reviewed, type-checked, linted and covered by
the test suite before it lands. The full history is public; judge the code, not the tooling.

It's released free and open source under the AGPL so that freelancers and small businesses can
run their own billing on their own hardware, and own their data outright rather than rent access
to it. There's no hosted tier, no telemetry, and nothing held back for a paid version.

Bug reports, feature requests and pull requests are all welcome — see
[CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 💬 Support & Community

Found a bug? Have a feature request? Please open an [issue](https://github.com/rbenzing/SlimBooks/issues).

If Slimbooks is useful to you, you can support its development:

<a href="https://buymeacoffee.com/russellbenzing" target="_blank"><img src="https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me A Coffee" /></a>

---

<div align="center">

**🏠 Self-hosted • 🔒 Secure • 🚀 Production-ready**

*Perfect for small businesses, freelancers, and anyone who values data privacy and control.*

</div>
