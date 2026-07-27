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

- Node.js 18+ and npm
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

- Use Tailwind CSS classes
- Follow our theme system (see `THEME_SYSTEM.md`)
- Use semantic color variables
- Ensure responsive design

### File Organization

```
src/
├── components/
│   ├── ui/              # Reusable UI components
│   ├── feature/         # Feature-specific components
│   └── layout/          # Layout components
├── hooks/               # Custom React hooks
├── lib/                 # Utility libraries
├── types/               # TypeScript type definitions
└── utils/               # Helper functions
```

### Naming Conventions

- **Components**: PascalCase (`InvoiceForm.tsx`)
- **Files**: camelCase (`invoiceUtils.ts`)
- **Variables**: camelCase (`invoiceData`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_INVOICE_ITEMS`)
- **CSS Classes**: kebab-case (following Tailwind)

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

### README Updates

- Update README.md for new features
- Add examples for new functionality
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
