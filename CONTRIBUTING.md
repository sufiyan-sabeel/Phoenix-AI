# Contributing to PHOENIX

Thank you for your interest in contributing to PHOENIX! This document provides guidelines and information for contributors.

## How to Contribute

### Reporting Bugs

- Open an issue on [GitHub Issues](https://github.com/umaiz-sufiyan/phoenix/issues)
- Include your OS, Node.js version, and steps to reproduce
- Include relevant logs or error messages

### Suggesting Features

- Open an issue with the `feature-request` label
- Describe the use case and expected behavior
- Note if you're willing to implement it yourself

### Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes following the code style guidelines
4. Run tests: `pnpm test`
5. Run type checking: `pnpm typecheck`
6. Commit with a clear message describing the change
7. Push to your fork and open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/phoenix.git
cd phoenix

# Install dependencies
pnpm install

# Start development
pnpm dev

# In another terminal, run the web app
pnpm --filter @phoenix/web dev
```

## Code Style

- TypeScript strict mode enabled
- Use ESM imports (no CommonJS require)
- Follow existing patterns in the codebase
- No comments unless requested
- Use descriptive variable and function names
- Keep functions focused and small

### Naming Conventions

- Files: `kebab-case.ts`
- Variables/functions: `camelCase`
- Types/interfaces: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`

### Import Order

1. Node built-in modules
2. External packages
3. Internal packages (`@phoenix/*`)
4. Relative imports

## Testing

- Write tests for new features and bug fixes
- Run the full test suite before submitting: `pnpm test`
- Tests use Vitest — see existing tests for patterns
- Aim for meaningful coverage, not 100% line coverage

## Pull Request Process

1. Update documentation if your change affects user-facing behavior
2. Add a changelog entry under `[Unreleased]` in `CHANGELOG.md`
3. Ensure CI passes (type checking, tests, build)
4. Request review from maintainers
5. Address review feedback promptly

### PR Title Convention

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

- `feat: add new MCP connector type`
- `fix: resolve memory leak in agent executor`
- `docs: update provider setup guide`
- `refactor: simplify tool registry initialization`
- `test: add unit tests for memory system`

## Issue Templates

### Bug Report

```markdown
**Describe the bug**
A clear description of what the bug is.

**To reproduce**
Steps to reproduce the behavior.

**Expected behavior**
What you expected to happen.

**Environment**
- OS: [e.g., Android 14, Ubuntu 22.04]
- Node.js version: [e.g., 20.10.0]
- PHOENIX version: [e.g., 0.1.0]
```

### Feature Request

```markdown
**Is your feature request related to a problem?**
A clear description of the problem.

**Describe the solution**
What you want to happen.

**Describe alternatives**
Any alternative solutions you considered.

**Additional context**
Any other context about the feature request.
```

## Community

- Be respectful and constructive
- Help others when you can
- Share feedback on the direction of the project

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
