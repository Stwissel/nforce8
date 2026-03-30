# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

nforce8 is a Node.js REST API wrapper for Salesforce, a modernized fork of the original `nforce` library. It is promise-based only (no callback support). Used with NodeRED and other Node.js applications. Requires Node.js >=22.4.0 (stable built-in `WebSocket`; experimental in 22.0–22.3).

## Commands

- **Run all tests with coverage:** `npm test` (optional root `.env` is loaded via Node’s `--env-file-if-exists=.env` when present)
- **Run a single test file:** `npx mocha test/<filename>.js` (e.g., `npx mocha test/crud.js`)
- **Lint:** `npm run lint` or `npx eslint .` (flat config in `eslint.config.js`)

There is no build step — this is a plain Node.js module with no transpilation.

## Architecture

### Entry Point & Core

- **`index.js`** (~1089 lines) — Main module. Exports `createConnection()`, `createSObject()`, `Record`, `plugin`, `util`. Contains the Connection prototype with all Salesforce API methods (auth, CRUD, query, streaming).
- **`lib/connection.js`** — ES6 Connection class with options validation (clientId, redirectUri, environment, mode, apiVersion format).
- **`lib/record.js`** — SObject record class with field change tracking. Supports `get()`, `set()`, `getId()`, and attachment handling.

### Supporting Modules

- **`lib/fdcstream.js`** — CometD-based Streaming API client (EventEmitter). `Subscription` and `Client` classes with replay and auto-reconnection support.
- **`lib/optionhelper.js`** — Builds API request options (URIs, headers, multipart, gzip).
- **`lib/multipart.js`** — Multipart form-data builder for file uploads (ContentVersion, Attachment).
- **`lib/util.js`** — Type checking, response validation, OAuth validation, ID extraction.
- **`lib/constants.js`** — OAuth endpoints, API versions, environment/mode defaults.
- **`lib/errors.js`** — Custom error factories (nonJsonResponse, invalidJson, emptyResponse).

### Key Patterns

- **Single vs Multi-user mode:** In single mode, OAuth is cached in the connection object. In multi mode, OAuth must be passed with each operation.
- **Auto token refresh:** Handles INVALID_SESSION_ID and Bad_OAuth_Token errors. Retries once with refreshed token when `autoRefresh: true`.
- **Plugin system:** Extensible via `nforce.plugin()` to add methods to the Connection prototype.
- **API version format:** Must be fully-qualified string like `"v45.0"` — bare numbers are rejected.

## Testing

- **Framework:** Mocha + should.js assertions + NYC coverage
- **Mock server:** Tests run against a local HTTP mock Salesforce API (`test/mock/`), not a live org.
- **Test files:** `test/crud.js`, `test/query.js`, `test/record.js`, `test/connection.js`, `test/errors.js`, `test/integration.js`, `test/plugin.js`

## CI/CD

- GitHub Actions: `codecheck.yml` runs tests on push to main/master/develop; `publish.yml` publishes to npm on release.
- **npm publish from CI:** set secret `NPM_TOKEN` (granular write for `nforce8` or classic Automation). `NODE_AUTH_TOKEN` must be set at **job** level so `setup-node` writes `.npmrc` (see `docs/npm-publish-github-actions.md`).
- Coverage uploaded to Codecov.

## Linting

ESLint 10 with flat config (`eslint.config.js`): `eslint:recommended` rules plus quotes (single), wrap-iife, yoda (never), etc. Main code uses Node + Mocha globals; `examples/**` is linted with `no-undef` / `no-unused-vars` off for snippet-style scripts.
