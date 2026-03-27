# nforce8 Code Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 17 refactoring recommendations (R02–R18) from the code-refactoring-report.md to eliminate dead code, fix bugs, modernize patterns, and improve maintainability — all without breaking the public API.

**Architecture:** The nforce8 codebase is a Node.js (>=22) CommonJS module that wraps the Salesforce REST API. It uses a constructor-function-based `Connection` with methods mixed in via `Object.assign` from domain modules (`lib/api.js`, `lib/auth.js`, `lib/http.js`). Tests use Mocha + should.js against a local mock server. R01 (lint fix) is already complete.

**Tech Stack:** Node.js >= 22, CommonJS modules, Mocha + should.js + NYC, ESLint flat config

**Baseline:** 108 tests passing, lint clean. Verify with `npm test` and `npm run lint` before starting.

---

## File Map

| File | Tasks | Role |
|------|-------|------|
| `lib/util.js` | 1, 7 | Type-checking utilities; add `isObject` null fix + `getHeader` |
| `test/util.js` | 1 | **New file** — unit tests for `isObject` |
| `test/query.js` | 2 | Fix stray quote in expected URL (line 33) |
| `lib/connection.js` | 3 | Remove dead `Connection` class |
| `lib/constants.js` | 4, 10 | Remove `v54.0` fallback; add revoke URI constants |
| `test/record.js` | 5 | Remove empty `beforeEach`; implement stub test |
| `test/plugin.js` | 5 | Implement stub test |
| `test/integration.js` | 6 | Fix `client.logout()` to `client.revokeToken()` |
| `lib/api.js` | 8, 9, 12, 13, 14, 15 | Reorder `respToJson`; remove `singleProp` from `getLimits`; deprecate `stream`; consolidate `getIdentity`; extract `_urlRequest`; hide `_queryHandler` |
| `lib/optionhelper.js` | 7 | Remove constructor wrapper; export functions directly |
| `lib/http.js` | 7 | Update `require('./optionhelper')()` to `require('./optionhelper')`; use `getHeader` |
| `lib/auth.js` | 10 | Use configurable revoke URIs instead of hardcoded URLs |
| `lib/fdcstream.js` | 11 | Replace `let self = this` with arrow functions |
| `lib/record.js` | 12 | Replace `arguments.length` dispatch with type check |

---

## Phase 1 — Bug Fixes (Zero Semantic Risk)

### Task 1: Fix `isObject(null)` Bug (R03)

**Files:**
- Modify: `lib/util.js:32` — add null guard
- Create: `test/util.js` — new test file for util functions
- Reference: `lib/api.js:10-27` — `_getOpts` uses `isObject`

- [ ] **Step 1: Create failing test for `isObject(null)`**

Create `test/util.js`:

```javascript
'use strict';

const util = require('../lib/util');
require('should');

describe('util', function () {
  describe('#isObject', function () {
    it('should return false for null', function () {
      util.isObject(null).should.equal(false);
    });

    it('should return true for a plain object', function () {
      util.isObject({ a: 1 }).should.equal(true);
    });

    it('should return false for a string', function () {
      util.isObject('hello').should.equal(false);
    });

    it('should return false for undefined', function () {
      util.isObject(undefined).should.equal(false);
    });

    it('should return true for an array', function () {
      util.isObject([1, 2]).should.equal(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/util.js`
Expected: FAIL — `isObject(null)` returns `true`, test expects `false`

- [ ] **Step 3: Fix `isObject` in `lib/util.js`**

Change line 32 from:
```javascript
const isObject = (candidate) => typeof candidate === 'object';
```
To:
```javascript
const isObject = (candidate) => candidate !== null && typeof candidate === 'object';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/util.js`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All 113+ tests pass (108 existing + 5 new)

- [ ] **Step 6: Commit**

```bash
git add test/util.js lib/util.js
git commit -m "fix: isObject(null) returns false instead of true (R03)"
```

---

### Task 2: Fix Stray Quote in Query Test (R04)

**Files:**
- Modify: `test/query.js:33`

- [ ] **Step 1: Fix the stray quote**

Change line 33 from:
```javascript
let expected = `/services/data/'${apiVersion}/query?q=SELECT+Id+FROM+Account+LIMIT+1`;
```
To:
```javascript
let expected = `/services/data/${apiVersion}/query?q=SELECT+Id+FROM+Account+LIMIT+1`;
```

- [ ] **Step 2: Run tests to verify the assertion now fires and passes**

Run: `npx mocha test/query.js`
Expected: PASS — the URL assertion now actually compares correctly

- [ ] **Step 3: Commit**

```bash
git add test/query.js
git commit -m "fix: remove stray quote from query test expected URL (R04)"
```

---

## Phase 2 — Dead Code Removal

### Task 3: Remove Dead `Connection` Class (R02)

**Files:**
- Modify: `lib/connection.js:7-20` — remove unused ES6 class
- Reference: `index.js:6` — only imports `validateConnectionOptions` (unchanged)

- [ ] **Step 1: Verify the `Connection` class is not imported anywhere**

Run: `grep -r "Connection" lib/ index.js test/ --include="*.js" | grep -v "validateConnectionOptions" | grep -v "createConnection" | grep -v "Connection.prototype" | grep -v "connection.js"` — should show no imports of the class itself from `lib/connection.js`.

- [ ] **Step 2: Remove the dead class from `lib/connection.js`**

Remove lines 7-20 (the `class Connection` block) and its closing. Also remove `Connection` from the exports at line 102-105.

The file should keep:
- `'use strict';` (line 1)
- `const CONST = require('./constants');` (line 3)
- `const util = require('./util');` (line 5)
- `optionTest` function (lines 23-27)
- `optionTestIfPresent` function (lines 29-33)
- All validation helpers (lines 36-50)
- `validateConnectionOptions` function (lines 53-100)
- Export only: `module.exports = { validateConnectionOptions };`

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass — class was never used

- [ ] **Step 4: Commit**

```bash
git add lib/connection.js
git commit -m "refactor: remove dead Connection class from lib/connection.js (R02)"
```

---

### Task 4: Remove Stale `v54.0` Fallback (R17)

**Files:**
- Modify: `lib/constants.js:14`
- Reference: `package.json:33` — `sfdx.api` is already `v63.0`

- [ ] **Step 1: Remove the `v54.0` fallback**

Change line 14 from:
```javascript
const API = process.env.SFDC_API_VERSION || API_PACKAGE_VERSION || 'v54.0';
```
To:
```javascript
const API = process.env.SFDC_API_VERSION || API_PACKAGE_VERSION;
```

Since `package.json` `sfdx.api` is `v63.0`, `API_PACKAGE_VERSION` will always have a value. The `v54.0` fallback is dead code.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add lib/constants.js
git commit -m "refactor: remove stale v54.0 fallback from constants (R17)"
```

---

### Task 5: Remove Empty Test Hooks and Implement Stubs (R15)

**Files:**
- Modify: `test/record.js:16-18` — remove empty `beforeEach`
- Modify: `test/record.js:62` — implement stub test for `set`
- Modify: `test/plugin.js:35` — implement stub test for non-function validation

- [ ] **Step 1: Remove empty `beforeEach` from `test/record.js`**

Remove lines 16-18:
```javascript
beforeEach(function (done) {
  done();
});
```

- [ ] **Step 2: Implement the stub `set` test in `test/record.js`**

Change the empty test at line 62 from:
```javascript
it('should allow me to set properties', function () {});
```
To:
```javascript
it('should allow me to set properties', function () {
  const rec = nforce.createSObject('Account');
  rec.set({ Name: 'Acme', Industry: 'Tech' });
  rec.get('name').should.equal('Acme');
  rec.get('industry').should.equal('Tech');
});
```

- [ ] **Step 3: Implement the stub plugin test in `test/plugin.js`**

Change line 35 from:
```javascript
it('should not allow non-functions when calling fn', function () {});
```
To:
```javascript
it('should not allow non-functions when calling fn', function () {
  const p = nforce.plugin({ namespace: 'test-nonfn-' + Date.now() });
  (function () {
    p.fn('myFn', 'not-a-function');
  }).should.throw();
});
```

Note: Check what `p.fn()` actually throws before writing the assertion. Read `lib/plugin.js` to see the error message.

- [ ] **Step 4: Run both test files**

Run: `npx mocha test/record.js test/plugin.js`
Expected: All tests pass, including the two newly implemented tests

- [ ] **Step 5: Commit**

```bash
git add test/record.js test/plugin.js
git commit -m "test: implement stub tests and remove empty beforeEach (R15)"
```

---

### Task 6: Fix `client.logout()` Non-Existent Call (R16)

**Files:**
- Modify: `test/integration.js:23-27`

- [ ] **Step 1: Fix the `after` hook**

Change lines 23-27 from:
```javascript
after(() => {
  if (client != undefined) {
    client.logout();
  }
});
```
To:
```javascript
after(() => {
  if (client != null && client.oauth && client.oauth.access_token) {
    return client.revokeToken({ token: client.oauth.access_token });
  }
});
```

- [ ] **Step 2: Run integration tests**

Run: `npx mocha test/integration.js`
Expected: Tests pass (integration tests are conditional on env vars)

- [ ] **Step 3: Commit**

```bash
git add test/integration.js
git commit -m "fix: replace non-existent client.logout() with revokeToken (R16)"
```

---

## Phase 3 — Structural Improvements

### Task 7: Remove `OptionHelper` Constructor Wrapper + Extract `getHeader` (R05, R06)

**Files:**
- Modify: `lib/optionhelper.js` — export functions directly instead of constructor
- Modify: `lib/http.js:5` — remove trailing `()` from require
- Modify: `lib/util.js` — add `getHeader` function
- Modify: `lib/http.js:18-30` — use `util.getHeader()` for header access

These two changes are bundled because they both modify `lib/http.js`.

- [ ] **Step 1: Rewrite `lib/optionhelper.js` to export directly**

Replace the `OptionHelper` constructor wrapper. Keep the two functions (`getApiRequestOptions` and `getFullUri`) exactly as they are inside the constructor, but export them directly:

```javascript
'use strict';

const CONST = require('./constants');

function getApiRequestOptions(opts) {
  // ... exact same body as currently inside the constructor (lines 58-117)
}

function getFullUri(opts) {
  // ... exact same body as currently inside the constructor (lines 126-135)
}

module.exports = { getApiRequestOptions, getFullUri };
```

- [ ] **Step 2: Update `lib/http.js` require**

Change line 5 from:
```javascript
const optionHelper = require('./optionhelper')();
```
To:
```javascript
const optionHelper = require('./optionhelper');
```

- [ ] **Step 3: Run tests to verify OptionHelper change works**

Run: `npm test`
Expected: All tests pass — the exported object shape is identical

- [ ] **Step 4: Add `getHeader` to `lib/util.js`**

Add before the `module.exports` block:

```javascript
const getHeader = (headers, key) => {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') {
    const val = headers.get(key);
    return val === null ? undefined : val;
  }
  const lower = key.toLowerCase();
  const found = Object.keys(headers).find((k) => k.toLowerCase() === lower);
  return found ? headers[found] : undefined;
};
```

Add `getHeader` to the exports object.

- [ ] **Step 5: Use `getHeader` in `lib/http.js` `responseFailureCheck`**

Replace the duplicated header access pattern (lines ~18-30) with:
```javascript
const headerError = util.getHeader(res.headers, 'error');
const contentLength = util.getHeader(res.headers, 'content-length');
```

- [ ] **Step 6: Add tests for `getHeader` in `test/util.js`**

```javascript
describe('#getHeader', function () {
  it('should return undefined for falsy headers', function () {
    (util.getHeader(null, 'foo') === undefined).should.equal(true);
  });

  it('should get header from plain object', function () {
    util.getHeader({ 'Content-Type': 'text/html' }, 'content-type').should.equal('text/html');
  });

  it('should get header from object with .get method', function () {
    const headers = new Map([['error', 'something']]);
    // Map has a .get() method like Fetch Headers
    util.getHeader(headers, 'error').should.equal('something');
  });

  it('should return undefined for missing header', function () {
    (util.getHeader({}, 'missing') === undefined).should.equal(true);
  });
});
```

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add lib/optionhelper.js lib/http.js lib/util.js test/util.js
git commit -m "refactor: inline OptionHelper exports and extract getHeader utility (R05, R06)"
```

---

### Task 8: Remove `_queryHandler` from Public Exports (R08)

**Files:**
- Modify: `lib/api.js` — change `query()` and `queryAll()` to use `_queryHandler.call(this, opts)` instead of `this._queryHandler(opts)`, then remove `_queryHandler` from `module.exports`

- [ ] **Step 1: Verify no tests call `_queryHandler` directly**

Run: `grep -r "_queryHandler" test/` — should find no direct calls.

- [ ] **Step 2: Update `query()` in `lib/api.js`**

Change line ~267 from:
```javascript
return this._queryHandler(opts);
```
To:
```javascript
return _queryHandler.call(this, opts);
```

- [ ] **Step 3: Update `queryAll()` in `lib/api.js`**

Change line ~279 from:
```javascript
return this._queryHandler(opts);
```
To:
```javascript
return _queryHandler.call(this, opts);
```

- [ ] **Step 4: Remove `_queryHandler` from `module.exports`**

In the exports object (lines 477-509), remove the `_queryHandler,` line.

- [ ] **Step 5: Run query tests**

Run: `npx mocha test/query.js`
Expected: All query tests pass

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add lib/api.js
git commit -m "refactor: hide _queryHandler from public exports (R08)"
```

---

### Task 9: Move `respToJson` Above Its Call Site (R12)

**Files:**
- Modify: `lib/api.js` — move `respToJson` definition (lines 326-335) to before `_queryHandler` (line 281)

- [ ] **Step 1: Move `respToJson`**

Cut the `respToJson` function definition from lines 326-335 and paste it immediately before the `_queryHandler` definition (before line 281). This is a pure reorder — no logic changes.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add lib/api.js
git commit -m "refactor: move respToJson above its call site in api.js (R12)"
```

---

### Task 10: Add Revoke URI Constants + Use in `revokeToken` (R09)

**Files:**
- Modify: `lib/constants.js` — add `REVOKE_URI` and `TEST_REVOKE_URI` constants + default options
- Modify: `lib/auth.js:214-230` — use `this.revokeUri` / `this.testRevokeUri`

- [ ] **Step 1: Add constants to `lib/constants.js`**

After line 8 (`TEST_LOGIN_URI`), add:
```javascript
const REVOKE_URI = 'https://login.salesforce.com/services/oauth2/revoke';
const TEST_REVOKE_URI = 'https://test.salesforce.com/services/oauth2/revoke';
```

Add to the `constants` object (after `TEST_LOGIN_URI`):
```javascript
REVOKE_URI: REVOKE_URI,
TEST_REVOKE_URI: TEST_REVOKE_URI,
```

Add to `defaultOptions` (after `testLoginUri`):
```javascript
revokeUri: REVOKE_URI,
testRevokeUri: TEST_REVOKE_URI,
```

- [ ] **Step 2: Update `revokeToken` in `lib/auth.js`**

Replace the hardcoded URL block (lines ~219-222):
```javascript
if (this.environment === 'sandbox') {
  opts.uri = 'https://test.salesforce.com/services/oauth2/revoke';
} else {
  opts.uri = 'https://login.salesforce.com/services/oauth2/revoke';
}
```
With:
```javascript
opts.uri = this.environment === 'sandbox'
  ? this.testRevokeUri
  : this.revokeUri;
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add lib/constants.js lib/auth.js
git commit -m "refactor: replace hardcoded revoke URLs with configurable constants (R09)"
```

---

### Task 11: Replace `let self = this` with Arrow Functions (R10)

**Files:**
- Modify: `lib/fdcstream.js` — convert all `function` callbacks to arrow functions, remove `self` variables

- [ ] **Step 1: Rewrite `Subscription` constructor (lines 7-31)**

Remove `let self = this;` (line 9). Replace all `function (...)` callbacks with `(...) =>` and change `self.emit` to `this.emit`:

```javascript
constructor(opts, client) {
  super();
  this.client = client;
  opts = opts || {};
  this._topic = opts.topic;

  if (opts.replayId) {
    this.client.addReplayId(this._topic, opts.replayId);
  }

  this._sub = client._fayeClient.subscribe(this._topic, (d) => {
    this.emit('data', d);
  });

  this._sub.callback(() => {
    this.emit('connect');
  });

  this._sub.errback((err) => {
    this.emit('error', err);
  });
}
```

- [ ] **Step 2: Rewrite `Client` constructor (lines 43-82)**

Remove `let self = this;` (line 45). Replace all `function` callbacks with arrow functions and change `self.` to `this.`:

```javascript
this._fayeClient.on('transport:up', () => {
  this.emit('connect');
});

this._fayeClient.on('transport:down', () => {
  this.emit('disconnect');
});

const replayExtension = {
  incoming: (message, callback) => {
    callback(message);
  },
  outgoing: (message, callback) => {
    if (message && message.channel === '/meta/subscribe') {
      message.ext = message.ext || {};
      message.ext['replay'] = this._replayFromMap;
    }
    callback(message);
  }
};
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass (streaming tests use mock, arrow functions bind `this` correctly in class constructors)

- [ ] **Step 4: Commit**

```bash
git add lib/fdcstream.js
git commit -m "refactor: replace let self = this with arrow functions in fdcstream (R10)"
```

---

### Task 12: Replace `arguments.length` in `Record.set` (R11)

**Files:**
- Modify: `lib/record.js:29-54`

- [ ] **Step 1: Rewrite the `set` dispatch logic**

Replace lines 29-38 in `Record.prototype.set`. Change:
```javascript
Record.prototype.set = function (field, value) {
  let data = {};
  if (arguments.length === 2) {
    data[field.toLowerCase()] = value;
  } else {
    data = Object.entries(field).reduce((result, [key, val]) => {
      result[key.toLowerCase()] = val;
      return result;
    }, {});
  }
```
To:
```javascript
Record.prototype.set = function (field, value) {
  const data = (typeof field === 'object' && field !== null)
    ? Object.fromEntries(
        Object.entries(field).map(([k, v]) => [k.toLowerCase(), v])
      )
    : { [field.toLowerCase()]: value };
```

The rest of the function body (the `Object.keys(data).forEach(...)` block) stays unchanged.

- [ ] **Step 2: Run record tests**

Run: `npx mocha test/record.js`
Expected: All record tests pass — both `set('field', value)` and `set({field: value})` forms work

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add lib/record.js
git commit -m "refactor: replace arguments.length with type check in Record.set (R11)"
```

---

### Task 13: Remove Unused `singleProp` from `getLimits` (R13)

**Files:**
- Modify: `lib/api.js:116-123`

- [ ] **Step 1: Remove the unused option**

Change:
```javascript
const getLimits = function (data) {
  let opts = this._getOpts(data, {
    singleProp: 'type',
  });
```
To:
```javascript
const getLimits = function (data) {
  let opts = this._getOpts(data);
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add lib/api.js
git commit -m "refactor: remove unused singleProp from getLimits (R13)"
```

---

### Task 14: Consolidate URL Methods via `_urlRequest` (R07)

**Files:**
- Modify: `lib/api.js:386-426` — extract `_urlRequest` helper, simplify four methods
- Modify: `lib/api.js` exports — add `_urlRequest` to module.exports (needed on prototype)

- [ ] **Step 1: Add `_urlRequest` helper before `getUrl` (before line 386)**

```javascript
const _urlRequest = function (data, method) {
  let opts = this._getOpts(data, { singleProp: 'url' });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = method;
  if ((method === 'PUT' || method === 'POST') &&
      opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
  }
  return this._apiRequest(opts);
};
```

- [ ] **Step 2: Simplify the four URL methods**

```javascript
const getUrl = function (data) {
  return _urlRequest.call(this, data, 'GET');
};

const putUrl = function (data) {
  return _urlRequest.call(this, data, 'PUT');
};

const postUrl = function (data) {
  return _urlRequest.call(this, data, 'POST');
};

const deleteUrl = function (data) {
  return _urlRequest.call(this, data, 'DELETE');
};
```

Note: Use `_urlRequest.call(this, ...)` so we don't need to export `_urlRequest` to the prototype. This keeps it truly private (unlike the report's suggestion to export it).

- [ ] **Step 3: Run CRUD and integration tests**

Run: `npx mocha test/crud.js`
Expected: All CRUD tests pass (URL methods are exercised here)

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/api.js
git commit -m "refactor: consolidate URL methods via _urlRequest helper (R07)"
```

---

## Phase 4 — Documentation / Final Polish

### Task 15: Consolidate `getIdentity` Null-Guard Chain (R18)

**Files:**
- Modify: `lib/api.js:53-71`

- [ ] **Step 1: Simplify the guard chain**

Replace:
```javascript
const getIdentity = function (data) {
  let opts = this._getOpts(data);
  if (!opts.oauth) {
    return Promise.reject(
      new Error('getIdentity requires oauth including access_token'),
    );
  }
  if (!opts.oauth.access_token) {
    return Promise.reject(new Error('getIdentity requires oauth.access_token'));
  }
  if (!opts.oauth.id) {
    return Promise.reject(
      new Error('getIdentity requires oauth.id (identity URL)'),
    );
  }
```
With:
```javascript
const getIdentity = function (data) {
  let opts = this._getOpts(data);
  if (!util.validateOAuth(opts.oauth)) {
    return Promise.reject(
      new Error('getIdentity requires oauth with instance_url and access_token'),
    );
  }
  if (!opts.oauth.id) {
    return Promise.reject(
      new Error('getIdentity requires oauth.id (identity URL)'),
    );
  }
```

Note: `util` is already imported at the top of `lib/api.js`. Verify with `grep "require.*util" lib/api.js`.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add lib/api.js
git commit -m "refactor: consolidate getIdentity null-guard using validateOAuth (R18)"
```

---

### Task 16: Deprecate `stream` Alias (R14)

**Files:**
- Modify: `lib/api.js:473-475` — add `@deprecated` JSDoc

- [ ] **Step 1: Add deprecation JSDoc**

Change:
```javascript
const stream = function (data) {
  return this.subscribe(data);
};
```
To:
```javascript
/**
 * @deprecated Use subscribe() instead. Will be removed in the next major version.
 * @param {*} data - Subscription options (passed through to subscribe()).
 * @returns {Subscription}
 */
const stream = function (data) {
  return this.subscribe(data);
};
```

- [ ] **Step 2: Run lint and tests**

Run: `npm run lint && npm test`
Expected: Both pass

- [ ] **Step 3: Commit**

```bash
git add lib/api.js
git commit -m "docs: deprecate stream() alias in favor of subscribe() (R14)"
```

---

## Final Verification

### Task 17: Full Verification Pass

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 2: Run full test suite with coverage**

Run: `npm test`
Expected: All tests pass, coverage maintained or improved

- [ ] **Step 3: Verify no regressions in public API**

Run: `node -e "const nf = require('.'); console.log(Object.keys(nf)); const c = nf.createConnection({clientId:'x',redirectUri:'http://localhost:3000/callback'}); console.log(typeof c.query, typeof c.insert, typeof c.authenticate, typeof c.subscribe, typeof c.stream)"`
Expected: All methods are `function`

- [ ] **Step 4: Review the full diff**

Run: `git diff main --stat`
Review for unexpected changes.
