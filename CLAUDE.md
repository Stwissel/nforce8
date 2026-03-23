# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

nforce8 is a Node.js REST API wrapper for Salesforce, a modernized fork of the original `nforce` library. It is promise-based only (no callback support). Used with NodeRED and other Node.js applications. Requires Node.js >22.0.

## Commands

- **Run all tests with coverage:** `npm test`
- **Run a single test file:** `npx mocha test/<filename>.js` (e.g., `npx mocha test/crud.js`)
- **Lint:** `npx eslint .` (ESLint config in `.eslintrc.json`)

There is no build step — this is a plain Node.js module with no transpilation.

## Architecture

### Entry Point & Core

- **`index.js`** (~1089 lines) — Main module. Exports `createConnection()`, `createSObject()`, `Record`, `plugin`, `util`. Contains the Connection prototype with all Salesforce API methods (auth, CRUD, query, streaming).
- **`lib/connection.js`** — ES6 Connection class with options validation (clientId, redirectUri, environment, mode, apiVersion format).
- **`lib/record.js`** — SObject record class with field change tracking. Supports `get()`, `set()`, `getId()`, and attachment handling.

### Supporting Modules

- **`lib/fdcstream.js`** — Faye-based Streaming API client (EventEmitter). `Subscription` and `Client` classes with replay and auto-reconnection support.
- **`lib/optionhelper.js`** — Builds API request options (URIs, headers, multipart, gzip).
- **`lib/multipart.js`** — Multipart form-data builder for file uploads (ContentVersion, Attachment).
- **`lib/util.js`** — Type checking, response validation, OAuth validation, ID extraction.
- **`lib/constants.js`** — OAuth endpoints, API versions, environment/mode defaults.
- **`lib/errors.js`** — Custom error factories (nonJsonResponse, invalidJson, emptyResponse).

### Key Patterns

- **Single vs Multi user mode:** In single mode, OAuth is cached in the connection object. In multi mode, OAuth must be passed with each operation.
- **Auto token refresh:** Handles INVALID_SESSION_ID and Bad_OAuth_Token errors. Retries once with refreshed token when `autoRefresh: true`.
- **Plugin system:** Extensible via `nforce.plugin()` to add methods to the Connection prototype.
- **API version format:** Must be fully-qualified string like `"v45.0"` — bare numbers are rejected.

## Testing

- **Framework:** Mocha + should.js assertions + NYC coverage
- **Mock server:** Tests run against a local HTTP mock Salesforce API (`test/mock/`), not a live org.
- **Test files:** `test/crud.js`, `test/query.js`, `test/record.js`, `test/connection.js`, `test/errors.js`, `test/integration.js`, `test/plugin.js`

## CI/CD

- GitHub Actions: `codecheck.yml` runs tests on push to main/master/develop; `publish.yml` publishes to npm on release.
- Coverage uploaded to Codecov.

## Linting

ESLint with `eslint:recommended`. Notable rules: valid-jsdoc (error), wrap-iife (error), yoda (never). Environment: ES6 + Node.js + Mocha globals.
