# nforce8 :: node.js salesforce REST API wrapper

A promise-based Node.js REST API wrapper for Salesforce, a modernized fork of Kevin O'Hara's [nforce](https://github.com/kevinohara80/nforce) library.

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/719bc9f8685247fc8fdac704e596ee67)](https://www.codacy.com/app/Stwissel/nforce8?utm_source=github.com&utm_medium=referral&utm_content=Stwissel/nforce8&utm_campaign=Badge_Grade)
[![Codacy Badge](https://api.codacy.com/project/badge/Coverage/719bc9f8685247fc8fdac704e596ee67)](https://www.codacy.com/app/Stwissel/nforce8?utm_source=github.com&utm_medium=referral&utm_content=Stwissel/nforce8&utm_campaign=Badge_Coverage)
[![npm version](https://badge.fury.io/js/nforce8.svg)](https://badge.fury.io/js/nforce8)
[![Known Vulnerabilities](https://snyk.io/test/github/Stwissel/nforce8/badge.svg?targetFile=package.json)](https://snyk.io/test/github/Stwissel/nforce8?targetFile=package.json)
[![Snyk security (npm package)](https://snyk.io/test/npm/nforce8/badge.svg)](https://security.snyk.io/package/npm/nforce8)
[![Coverage Status](https://coveralls.io/repos/github/Stwissel/nforce8/badge.svg?branch=master)](https://coveralls.io/github/Stwissel/nforce8?branch=master)
[![CI](https://github.com/Stwissel/nforce8/actions/workflows/codecheck.yml/badge.svg)](https://github.com/Stwissel/nforce8/actions/workflows/codecheck.yml)

## Requirements

- **Node.js >= 22.4.0** — uses built-in `fetch` and a stable built-in `WebSocket` (Node’s global `WebSocket` was experimental in 22.0–22.3)

## Features

- Promise-based API (no callback support)
- Intelligent sObjects with field change tracking
- CRUD operations (insert, update, upsert, delete, getRecord)
- SOQL queries with automatic pagination (`fetchAll`)
- SOSL search
- Streaming API support (PushTopics, Platform Events, Change Data Capture)
  - Built-in CometD/Bayeux client with long-polling and WebSocket transports
  - Replay ID support for event replay
  - No external streaming dependencies
- Binary content retrieval (Attachments, Documents, ContentVersions)
- Apex REST endpoint support
- OAuth authentication (authorization code, username/password, SAML assertion)
- Automatic token refresh on session expiration
- Single-user and multi-user modes
- Plugin system for extending the Connection prototype

## Installation

```bash
npm install nforce8
```

## Quick Start

### Create a Connection

```js
const nforce = require('nforce8');

const org = nforce.createConnection({
  clientId: 'YOUR_CLIENT_ID',
  clientSecret: 'YOUR_CLIENT_SECRET',
  redirectUri: 'http://localhost:3000/oauth/_callback',
  apiVersion: 'v62.0',  // optional, defaults to current API version
  environment: 'production',  // optional, 'production' or 'sandbox'
  mode: 'multi' // optional, 'single' or 'multi' user mode
});
```

### Authenticate

```js
// Multi-user mode
const oauth = await org.authenticate({
  username: 'user@example.com',
  password: 'password'
});

// Single-user mode — OAuth is cached on the connection
await org.authenticate({
  username: 'user@example.com',
  password: 'password'
});
```

### CRUD Operations

```js
// Insert
const acc = nforce.createSObject('Account');
acc.set('Name', 'ACME Corporation');
acc.set('Phone', '800-555-2345');

const result = await org.insert({ sobject: acc, oauth });
console.log('Created:', result.id);

// Query
const resp = await org.query({
  query: 'SELECT Id, Name FROM Account WHERE Name = \'ACME Corporation\' LIMIT 1',
  oauth
});

// Update (only changed fields are sent)
const record = resp.records[0];
record.set('Name', 'ACME Coyote');
record.set('Industry', 'Explosives');
await org.update({ sobject: record, oauth });

// Delete
await org.delete({ sobject: record, oauth });
```

### Streaming API

Subscribe to PushTopics, Platform Events, or Change Data Capture events:

```js
const oauth = await org.authenticate(creds);
const client = org.createStreamClient();
const sub = client.subscribe({ topic: '/data/ChangeEvents' });

sub.on('data', (event) => console.log(event));
sub.on('connect', () => console.log('Subscribed'));
sub.on('error', (err) => {
  console.error(err);
  client.disconnect();
});
```

**Replay support** — resume from a specific event replay ID:

```js
const sub = client.subscribe({
  topic: '/event/MyPlatformEvent__e',
  replayId: -2  // -1 = new only, -2 = all available
});
```

### Apex REST

```js
const result = await org.apexRest({
  uri: 'MyCustomEndpoint',
  method: 'POST',
  body: { key: 'value' },
  oauth
});
```

### Binary Content

```js
// Retrieve attachment, document, or content version binary data
const buffer = await org.getBinaryContent({
  sobject: attachmentRecord,
  oauth
});
```

## API Version Format

API versions **must** be fully-qualified strings like `'v62.0'`. Bare numbers (`42`, `42.0`) and short strings (`'v42'`) are rejected.

## Single vs Multi User Mode

- **Multi mode** (default): pass `oauth` with each API call
- **Single mode**: OAuth is cached on the connection after `authenticate()`, no need to pass it

## Important Differences from nforce

- Promise-only API, no callback support
- API version must be fully-qualified (`'v45.0'`, not `42` or `'42'`)
- Streaming subscriptions require the full topic path (e.g. `/topic/MyTopic`)
- Requires Node.js >= 22.4.0 (stable built-in `WebSocket`; experimental in 22.0–22.3)
- Built-in CometD client replaces the faye dependency

## Documentation

- [Changelog](https://stwissel.github.io/nforce8/Changelog.html)
- [Streaming API guide](docs/streamingApi.md)
- [Original nforce documentation](https://www.npmjs.com/package/nforce) (for inherited API details)

## Development

```bash
# Run tests
npm test

# Lint
npm run lint
```

## License

See [LICENSE](LICENSE) file.
