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

🔒 **Security-First** • 🐳 **Docker Ready** • 🥧 **Raspberry Pi Optimized**

[Features](#-key-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [License](#-license)

</div>

---

## ✨ Key Features

### 💼 Business Management
- **📊 Dashboard**: Real-time financial overview with interactive charts
- **👥 Client Management**: Complete client profiles with contact details and history
- **🧾 Professional Invoices**: Customizable templates with line items, taxes, and shipping
- **🔄 Recurring Invoices**: Automated recurring billing with customizable schedules (weekly, monthly, quarterly, yearly)
- **💰 Expense Tracking**: Categorized expense management with receipt uploads
- **📈 Financial Reports**: Profit & loss, invoice, expense and client reports. P&L supports cash or accrual
  accounting and breaks multi-period ranges into monthly or quarterly columns that reconcile with the totals

### 🔒 Security & Privacy
- **🛡️ Enterprise Security**: Rate limiting, input validation, and security headers
- **🔐 JWT Authentication**: Secure token-based authentication with 2FA support
- **🏠 Self-Hosted**: Complete data ownership - no third-party data sharing
- **🔒 Encrypted Storage**: Secure SQLite database with encrypted sensitive data

### 🚀 Deployment
- **🐳 Docker Ready**: One-command deployment with Docker Compose
- **🥧 Raspberry Pi**: Optimized for ARM devices and low-power systems
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

Access your app at `http://localhost:8080`

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

The application uses environment variables for secure configuration:

```env
# Security (REQUIRED - change in production)
JWT_SECRET=your-secure-64-character-secret
JWT_REFRESH_SECRET=your-secure-refresh-secret
SESSION_SECRET=your-secure-session-secret

# Network
CORS_ORIGIN=http://localhost:8080
PORT=3002

# Features
ENABLE_DEBUG_ENDPOINTS=false
```

Use `./scripts/generate-secrets.sh` to create secure secrets automatically.

### Database

- **SQLite**: Lightweight, serverless database perfect for self-hosting
- **Automatic Backups**: Daily automated backups with rotation
- **Data Portability**: Single file database for easy migration
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
/api/cron/recurring-invoices  - Automated processing endpoint
```

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
- **🔑 2FA Support**: Two-factor authentication for enhanced security
- **📝 Audit Logging**: Request/response logging for security monitoring

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

# Set up the recurring-invoice cron job
./scripts/setup-cron.sh
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
