
# Contributing to nforce8

Thank you for your interest in contributing to nforce8! All contributions are welcome, whether they are bug reports, feature suggestions, documentation improvements, or code changes.

## Code of Conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold it. Please report unacceptable behavior to [stephan@wissel.net](mailto:stephan@wissel.net).

## Reporting Bugs

Before opening a new issue, please check [existing issues](https://github.com/Stwissel/nforce8/issues) to avoid duplicates.

When filing a bug report, include:

- **Node.js version** (`node --version`)
- **nforce8 version** (`npm ls nforce8`)
- **Steps to reproduce** the issue
- **Expected behavior** vs **actual behavior**
- A **minimal reproduction case** if possible
- Any relevant error messages or stack traces

## Suggesting Features

Open a [GitHub Issue](https://github.com/Stwissel/nforce8/issues) describing:

- The **use case** and why it matters
- How it would work from the caller's perspective
- Any alternatives you have considered

For larger changes, please discuss the approach in an issue before submitting a pull request.

## Development Setup

### Prerequisites

- **Node.js >= 22.0** (uses built-in `fetch` and `WebSocket`)

### Getting Started

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/<your-username>/nforce8.git
cd nforce8
npm install
```

### Running Tests

Tests run against a local mock Salesforce API server -- no live org credentials are needed.

```bash
# Full test suite with coverage
npm test

# Single test file
npx mocha test/<filename>.js
```

### Linting

```bash
npm run lint
```

## Submitting Pull Requests

1. **Fork** the repository and create a feature branch from `main`
2. **Keep PRs focused** -- one concern per pull request
3. **Include tests** for new functionality and bug fixes
4. **Ensure all tests pass** (`npm test`)
5. **Ensure lint passes** (`npm run lint`)
6. **Update documentation** if your change affects the public API
7. **Reference related issues** in the PR description (e.g., "Fixes #42")

### Commit Messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

Examples:

```
feat(streaming): add platform event batch subscribe
fix(auth): handle expired refresh token in single-user mode
docs: update streaming API guide
test(crud): add upsert external ID coverage
refactor(api): extract blob retrieval factory
```

## Coding Standards

- **ESLint** enforces the project style -- run `npm run lint` before committing
- **Single quotes** for strings
- **CommonJS** modules (`require` / `module.exports`)
- **Promise-based** patterns only -- no callbacks
- **No build step** -- plain Node.js, no transpilation
- **API version format** must be fully-qualified strings (e.g., `'v62.0'`)

## Testing Guidelines

- All new features and bug fixes need tests
- Tests use **Mocha** + **should.js** assertions
- Tests run against mock servers in `test/mock/` -- do not require a live Salesforce org
- Aim for meaningful coverage of both success and error paths

## License

By contributing to nforce8, you agree that your contributions will be licensed under the [MIT License](LICENSE).
