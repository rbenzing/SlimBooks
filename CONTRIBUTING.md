# Contributing to Slimbooks

Thank you for your interest in contributing to Slimbooks! We welcome contributions from the community and are grateful for any help you can provide.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)
- [Testing](#testing)
- [Documentation](#documentation)

## 📜 Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## 🚀 Getting Started

### Prerequisites

- Node.js 24 — `package.json` declares `engines: { node: ">=24 <25" }` and `.nvmrc` pins 24 — and npm
- Git
- A code editor (VS Code recommended)

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/slimbooks.git
   cd slimbooks
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/original-owner/slimbooks.git
   ```
4. **Install dependencies**:
   ```bash
   npm install
   ```
5. **Start the development server**:
   ```bash
   npm run dev
   ```

## 🔄 Development Workflow

### Branching Strategy

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/feature-name` - New features
- `bugfix/bug-description` - Bug fixes
- `hotfix/critical-fix` - Critical production fixes

### Making Changes

1. **Create a new branch** from `develop`:
   ```bash
   git checkout develop
   git pull upstream develop
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our coding standards

3. **Test your changes** thoroughly

4. **Commit your changes** with descriptive messages:
   ```bash
   git add .
   git commit -m "feat: add invoice template customization"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request** on GitHub

### Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Examples:
```
feat: add recurring invoice templates
fix: resolve invoice calculation bug
docs: update API documentation
style: format components with prettier
refactor: extract invoice utilities
test: add client management tests
chore: update dependencies
```

## 🎯 Coding Standards

### TypeScript

- Use TypeScript for all new code
- Define proper interfaces and types
- Avoid `any` type when possible
- Use strict type checking

### React Components

- Use functional components with hooks
- Follow the single responsibility principle
- Use proper prop types and interfaces
- Implement proper error boundaries

### Styling

- Colour and surface come from `themeClasses` in `src/utils/themeUtils.util.ts`, never ad-hoc light/dark pairs — see the [theme system](./documentation/development/theme-system.md)
- Check `src/components/ui/` before building a component; it is already themed. It holds only what is in use — `npx shadcn@latest add <name>` brings back any other shadcn/ui component
- All date display goes through `src/utils/formatting/date.util.ts`
- Honour the settings objects — currency, number and date formatting, language
- Ensure responsive design

### File Organization

```
src/
├── components/
│   ├── ui/              # shadcn/ui design system
│   └── <feature>/       # clients, invoices, expenses, payments, reports, settings
├── pages/               # Unauthenticated pages (login, register, reset)
├── contexts/            # React contexts
├── hooks/               # Custom React hooks
├── services/            # API clients
├── types/               # TypeScript type definitions
└── utils/               # Helper functions
```

The server side is mapped in
[documentation/development/architecture.md](./documentation/development/architecture.md).

### Naming Conventions

- **Components**: PascalCase (`InvoiceForm.tsx`)
- **Files**: camelCase (`invoiceUtils.ts`)
- **Variables**: camelCase (`invoiceData`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_INVOICE_ITEMS`)
- **CSS Classes**: kebab-case (following Tailwind)

New files carry a suffix naming their kind: `.svc.ts` service, `.types.ts`
types, `.util.ts` utility, `.hook.ts` hook, `.cpt.ts` component.

## 🔍 Pull Request Process

### Before Submitting

- [ ] Code follows our style guidelines
- [ ] Self-review of the code
- [ ] Comments added for complex logic
- [ ] Tests added/updated for changes
- [ ] Documentation updated if needed
- [ ] No console.log statements left in code
- [ ] All TypeScript errors resolved

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Manual testing completed
- [ ] Cross-browser testing (if applicable)

## Screenshots (if applicable)
Add screenshots for UI changes

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Tests added/updated
- [ ] Documentation updated
```

### Review Process

1. **Automated checks** must pass (linting, type checking)
2. **Code review** by at least one maintainer
3. **Testing** in development environment
4. **Approval** and merge by maintainer

## 🐛 Issue Guidelines

### Bug Reports

When reporting bugs, please include:

- **Clear title** describing the issue
- **Steps to reproduce** the bug
- **Expected behavior**
- **Actual behavior**
- **Screenshots** if applicable
- **Environment details** (browser, OS, etc.)
- **Console errors** if any

### Feature Requests

For feature requests, please include:

- **Clear description** of the feature
- **Use case** and motivation
- **Proposed solution** (if any)
- **Alternative solutions** considered
- **Additional context**

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Quality Gates

All four must pass before a PR is merged:

```bash
npm run typecheck   # TypeScript across frontend, vite config, and server
npm run lint        # ESLint — 0 errors AND 0 warnings — plus typecheck
npm test            # Vitest suite
npm run build       # Production build
```

The codebase currently sits at zero lint warnings; please don't let new ones accumulate.

### Writing Tests

- Write unit tests for utilities and hooks
- Write integration tests for components
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies

Tests are picked up from two places:

- `src/test/**/*.test.{ts,tsx}` — frontend units, hooks and components
- `server/**/*.test.ts` — backend units, colocated with the code they cover

Backend logic worth testing should be extracted into a module free of database
and config imports (see `server/utils/reportPeriods.util.ts`), so the test can
load it without standing up a database.

### Test Structure

```typescript
describe('InvoiceCalculator', () => {
  describe('calculateTotal', () => {
    it('should calculate total with tax and shipping', () => {
      // Arrange
      const lineItems = [{ amount: 100 }];
      const tax = 10;
      const shipping = 5;

      // Act
      const total = calculateTotal(lineItems, tax, shipping);

      // Assert
      expect(total).toBe(115);
    });
  });
});
```

## 📚 Documentation

### Code Documentation

- Add JSDoc comments for functions and classes
- Document complex algorithms and business logic
- Keep comments up-to-date with code changes

### Which document to update

Documentation lives in [`documentation/`](./documentation/), organised by
audience. Match the change to the document:

| Change | Update |
|---|---|
| A user-visible feature | [`documentation/user-guide/`](./documentation/user-guide/) |
| A new or changed environment variable | [`configuration.md`](./documentation/operations/configuration.md) |
| Anything about deploying or running | [`documentation/operations/`](./documentation/operations/) |
| A new or changed endpoint | [`api-reference.md`](./documentation/development/api-reference.md) |
| A structural decision, with a reason | a new [ADR](./documentation/adr/) |
| A subsystem's contract | [`documentation/specs/`](./documentation/specs/) |
| Anything user-visible or breaking | [`CHANGELOG.md`](./CHANGELOG.md) |

README.md is the front door only — detail belongs in the tree.

**Documentation must match the code.** If a document names a variable, an
endpoint or a default, read that name from the source rather than recalling it.
A document that contradicts the runtime is the same defect as a script that
does.
- Update installation instructions if needed

## 🎉 Recognition

Contributors will be recognized in:

- GitHub contributors list
- Release notes for significant contributions
- Special mentions in documentation

## 📞 Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and community discussion
- **Code Review**: For feedback on your contributions

## 🙏 Thank You

Your contributions help make Slimbooks better for everyone. We appreciate your time and effort in improving this project!

---

**Happy Contributing! 🚀**
