# Code Refactoring Report: nforce8

**Date**: 2026-03-26
**Codebase**: nforce8 — Node.js REST API wrapper for Salesforce
**Smell Report Source**: code-smell-detector-report.md (28 issues: 4 high, 12 medium, 12 low)
**Test Baseline**: 96 tests passing (Mocha + should.js + NYC)
**Node.js Target**: >= 22.0 (ES2022, CommonJS modules)
**Runtime Dependencies**: faye, mime-types (2 total)

---

## Executive Summary

The nforce8 codebase recently completed a significant architectural split that decomposed a 1,089-line monolith (`index.js`) into domain-focused modules (`lib/auth.js`, `lib/api.js`, `lib/http.js`). That refactoring resolved the largest structural concerns. What remains falls into four clear clusters:

1. **Lint hygiene** — 182 ESLint quote-style errors across six new files (CI-blocking)
2. **Dead artifacts** — An unused `Connection` class and a purposeless constructor function in `optionhelper.js`
3. **Method-level code smells** — Duplicated URL-building logic, a null bug in `isObject`, magic numbers, exposed internals
4. **Low-priority maintenance** — Empty test bodies, stale API version fallback, test fixture bugs

This report provides 18 concrete refactoring recommendations, each mapped to the code smell it addresses, with before/after code examples, risk ratings, and an implementation sequence designed to preserve all 96 passing tests.

---

## Recommendation Index

| ID  | Title                                                    | Smell IDs | Technique                                    | Impact | Complexity | Risk |
|-----|----------------------------------------------------------|-----------|----------------------------------------------|--------|------------|------|
| R01 | Fix quote-style lint errors (182 violations)             | H1, L1    | Substitute Algorithm                         | H      | L          | L    |
| R02 | Remove dead `Connection` class from `lib/connection.js`  | H2, M1    | Inline Class / Remove Dead Code              | H      | L          | L    |
| R03 | Fix `isObject` null bug in `lib/util.js`                 | M8        | Introduce Assertion + Bug Fix                | H      | L          | L    |
| R04 | Fix stray quote in query test expected URL               | L11       | Bug Fix                                      | H      | L          | L    |
| R05 | Remove purposeless `OptionHelper` constructor wrapper    | M3        | Inline Class                                 | M      | L          | L    |
| R06 | Extract `getHeader` utility to eliminate duplication     | M11       | Extract Method                               | M      | L          | L    |
| R07 | Consolidate four URL methods via `_urlRequest` helper    | M5        | Extract Method + Parameterize Method         | M      | M          | L    |
| R08 | Remove `_queryHandler` from public exports               | M6        | Hide Method                                  | M      | L          | L    |
| R09 | Replace hardcoded URLs in `revokeToken` with constants   | M4, L6    | Replace Magic Number with Symbolic Constant  | M      | L          | L    |
| R10 | Replace `let self = this` with arrow functions           | M9        | Substitute Algorithm                         | M      | L          | L    |
| R11 | Replace `arguments.length` dispatch in `Record.set`      | M10       | Substitute Algorithm                         | M      | L          | L    |
| R12 | Move `respToJson` above its call site                    | M12       | Extract Method (reorder)                     | L      | L          | L    |
| R13 | Remove unused `singleProp: 'type'` from `getLimits`      | L9        | Remove Parameter                             | L      | L          | L    |
| R14 | Deprecate the `stream` alias method                      | M7        | Inline Method (deprecation path)             | L      | L          | L    |
| R15 | Remove empty `beforeEach` hook and stub test cases       | L3, L4    | Remove Dead Code                             | L      | L          | L    |
| R16 | Fix non-existent `client.logout()` in integration test   | L5        | Rename Method                                | L      | L          | L    |
| R17 | Remove stale `'v54.0'` fallback constant                 | L6        | Replace Magic Number with Symbolic Constant  | L      | L          | L    |
| R18 | Consolidate `getIdentity` redundant null-guard chain     | L8        | Consolidate Conditional Expression           | L      | L          | L    |

---

## Detailed Recommendations

---

### R01 — Fix Quote-Style Lint Errors (182 Violations)

**Addresses**: H1 (Inconsistent Style — Active Lint Failure), L1 (variant)
**Technique**: Substitute Algorithm (automated style normalization)
**Files**: `index.js`, `lib/api.js`, `lib/auth.js`, `lib/http.js`, `lib/multipart.js`, `lib/plugin.js`
**Impact**: High | **Complexity**: Low | **Risk**: Low

#### Problem

Running `npm run lint` produces 182 ESLint `Strings must use singlequote` errors. The six files listed above use double-quoted strings throughout, while the project's ESLint flat config mandates single quotes and all pre-existing files (`lib/record.js`, `lib/connection.js`, `lib/util.js`, `lib/fdcstream.js`, `lib/errors.js`) already comply. This is a CI-blocking issue that prevents any automated pull request gate from passing.

#### Root Cause

The six files were introduced during the architectural split refactoring and were authored with double quotes rather than the project's established single-quote convention.

#### Solution

```bash
# Auto-fix all 182 violations in one deterministic pass
npx eslint . --fix

# Verify zero errors remain
npm run lint

# Verify tests still pass (eslint --fix is purely lexical)
npm test
```

#### Prevention: Add a Pre-Commit Hook

```bash
npm install --save-dev husky lint-staged
npx husky install
```

```json
// package.json additions
{
  "lint-staged": {
    "*.js": ["eslint --fix", "git add"]
  }
}
```

#### Sequencing Note

Run this **first**, before any other change. It has zero semantic impact and makes subsequent diffs readable because style noise is absent.

---

### R02 — Remove Dead `Connection` Class from `lib/connection.js`

**Addresses**: H2 (Lazy Element — Dead Class), M1 (Constructor vs. ES6 Class Inconsistency)
**Technique**: Inline Class (absorb useful content; delete the unused class), Remove Dead Code
**Files**: `lib/connection.js`, `index.js`
**Impact**: High | **Complexity**: Low | **Risk**: Low

#### Problem

`lib/connection.js` exports two items:

1. `Connection` — an ES6 class that is **never imported anywhere** in the codebase
2. `validateConnectionOptions` — a validation function that **is** imported in `index.js`

```javascript
// index.js line 6 — only this is used
const { validateConnectionOptions } = require('./lib/connection');
// The Connection class is never imported
```

The unused `Connection` class duplicates the initialization logic already in `index.js`'s constructor function (both call `Object.assign({}, CONST.defaultOptions, opts)`, both call `validateConnectionOptions`, both normalize `environment` and `mode`). This is Duplicated Code and Speculative Generality.

Additionally, the codebase has two inconsistent definitions of `Connection`:
- `index.js`: traditional constructor function `const Connection = function(opts) { ... }`
- `lib/connection.js`: ES6 class `class Connection { ... }`

These have no relationship to each other. The constructor function is what actually runs at runtime.

#### Solution: Remove the Dead Class (Minimal Impact)

**Step 1** — Edit `lib/connection.js` to remove the `Connection` class and its unused `require` of `util` for the class-only features:

```javascript
// lib/connection.js — AFTER (dead class removed, validation function unchanged)
'use strict';

const CONST = require('./constants');
const util = require('./util');

const optionTest = (testFunction, testVar, errorText) => {
  if (testFunction(testVar) === false) {
    throw new Error(errorText);
  }
};

const optionTestIfPresent = (testFunction, testVar, errorText) => {
  if (testVar && testFunction(testVar) === false) {
    throw new Error(errorText);
  }
};

const API_VERSION_RE = /^v\d+\.\d+$/;
const apiMatch = (apiVersion) =>
  typeof apiVersion === 'string' && API_VERSION_RE.test(apiVersion);

const nonEmptyString = (s) => util.isString(s) && s.trim().length > 0;

const redirectUriFormat = (uri) => {
  if (!nonEmptyString(uri)) return false;
  try {
    const u = new URL(uri);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const validateConnectionOptions = (con) => {
  optionTest(nonEmptyString, con.clientId, 'invalid or missing clientId');
  optionTest(redirectUriFormat, con.redirectUri, 'invalid or missing redirectUri');
  optionTest(util.isString, con.authEndpoint, 'invalid or missing authEndpoint');
  optionTest(util.isString, con.testAuthEndpoint, 'invalid or missing testAuthEndpoint');
  optionTest(util.isString, con.loginUri, 'invalid or missing loginUri');
  optionTest(util.isString, con.testLoginUri, 'invalid or missing testLoginUri');
  optionTest(
    (val) => util.isString(val) && CONST.ENVS.includes(val.toLowerCase()),
    con.environment,
    `invalid environment, only ${CONST.ENVS.join(' and ')} are allowed`
  );
  optionTest(
    (val) => util.isString(val) && CONST.MODES.includes(val.toLowerCase()),
    con.mode,
    `invalid mode, only ${CONST.MODES.join(' and ')} are allowed`
  );
  optionTestIfPresent(util.isFunction, con.onRefresh, 'onRefresh must be a function');
  optionTestIfPresent(util.isNumber, con.timeout, 'timeout must be a number');
  optionTest(
    apiMatch,
    con.apiVersion,
    `invalid apiVersion [${con.apiVersion}], use dotted form like v45.0`
  );
};

// Export only the validation function (the Connection class is no longer defined here)
module.exports = { validateConnectionOptions };
```

**Step 2** — `index.js` import is already correct and needs no change:

```javascript
// index.js line 6 — unchanged
const { validateConnectionOptions } = require('./lib/connection');
```

**Step 3** — Run `npm test` to verify all 96 tests still pass.

#### Optional Future Step (Option B): Migrate to ES6 Class

In a subsequent PR, migrate `index.js`'s constructor function to a proper ES6 class to match `Record`, `Plugin`, `Subscription`, and `Client`:

```javascript
// index.js — possible future state
class Connection {
  constructor(opts) {
    opts = Object.assign({}, CONST.defaultOptions, opts || {});
    Object.assign(this, opts);
    validateConnectionOptions(this);
    this.environment = this.environment.toLowerCase();
    this.mode = this.mode.toLowerCase();
    this.timeout = parseInt(this.timeout, 10);
    // plugin loading ...
  }
}
Object.assign(Connection.prototype, httpMethods, authMethods, apiMethods);
```

This is deferred because it is a cosmetic change with no functional impact and would require careful re-testing of the plugin binding logic.

---

### R03 — Fix `isObject` Null Bug

**Addresses**: M8 (Side Effects — Null Bug in `isObject`)
**Technique**: Introduce Assertion (add unit test), Bug Fix
**File**: `lib/util.js` line 32
**Impact**: High | **Complexity**: Low | **Risk**: Low

#### Problem

```javascript
// lib/util.js line 32 — BEFORE
const isObject = (candidate) => typeof candidate === 'object';
```

In JavaScript, `typeof null === 'object'` evaluates to `true`. Therefore `isObject(null)` returns `true`. The function is used in `_getOpts` in `lib/api.js`:

```javascript
// lib/api.js lines 13–26 — _getOpts (abbreviated)
const _getOpts = function (d, opts = {}) {
  let data = {};
  if (opts.singleProp && d && !util.isObject(d)) {
    data[opts.singleProp] = d;
  } else if (util.isObject(d)) {
    data = d;   // <-- if d is null, data becomes null
  }
  // ...
  if (opts.defaults && util.isObject(opts.defaults)) {
    data = Object.assign({}, opts.defaults, data); // <-- crash: Object.assign({}, {}, null)
  }
  return data;
};
```

If `null` is passed as `d` and `opts.defaults` is present, `Object.assign({}, opts.defaults, null)` would be called. In modern JavaScript `Object.assign` tolerates `null` as a source (it is silently skipped), but the semantic is still wrong: a caller passing `null` intends "no data", not "an empty object treated as a data container."

The bug is currently dormant because all callers pass `undefined` rather than `null`. But `isObject(null) === true` is a well-known JavaScript footgun that makes the function's contract incorrect.

#### Solution

```javascript
// lib/util.js line 32 — AFTER
const isObject = (candidate) => candidate !== null && typeof candidate === 'object';
```

#### Tests to Add

```javascript
// Add to test/connection.js or a new test/util.js
const util = require('../lib/util');

describe('util.isObject', function () {
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
});
```

---

### R04 — Fix Stray Quote in Query Test Expected URL

**Addresses**: L11 (Malformed Template Literal — Bug Risk / False Test Confidence)
**Technique**: Bug Fix
**File**: `test/query.js` line 33
**Impact**: High | **Complexity**: Low | **Risk**: Low

#### Problem

```javascript
// test/query.js line 33 — BEFORE
let expected = `/services/data/'${apiVersion}/query?q=SELECT+Id+FROM+Account+LIMIT+1`;
//                              ^ stray single-quote embedded in the URL string
```

The stray `'` character before `${apiVersion}` causes `expected` to evaluate to:
```
/services/data/'v45.0/query?q=SELECT+Id+FROM+Account+LIMIT+1
```

The actual request URL produced by the library is:
```
/services/data/v45.0/query?q=SELECT+Id+FROM+Account+LIMIT+1
```

These two strings will never be equal. The `url.should.equal(expected)` assertion silently never fires — the test absorbs the failure inside a `.catch((err) => should.not.exist(err))` handler. The test passes vacuously, giving false confidence that URL construction is verified.

#### Solution

```javascript
// test/query.js line 33 — AFTER
let expected = `/services/data/${apiVersion}/query?q=SELECT+Id+FROM+Account+LIMIT+1`;
```

After this fix, run `npm test`. The assertion will now actually exercise URL construction, and the test should pass cleanly against the correct URL.

---

### R05 — Remove Purposeless `OptionHelper` Constructor Wrapper

**Addresses**: M3 (Lazy Element — Unnecessary Constructor / Clever Code)
**Technique**: Inline Class (replace instantiated constructor with direct module exports)
**Files**: `lib/optionhelper.js`, `lib/http.js`
**Impact**: Medium | **Complexity**: Low | **Risk**: Low

#### Problem

`OptionHelper` is a constructor function that has no instance state, no initialization, and returns a frozen plain object containing two pure functions:

```javascript
// lib/optionhelper.js lines 33–138 — BEFORE
function OptionHelper() {
  // Defaults if needed   <-- comment refers to a removed feature

  function getApiRequestOptions(opts) { /* pure function */ }
  function getFullUri(opts) { /* pure function */ }

  return Object.freeze({ getApiRequestOptions, getFullUri });
}
module.exports = OptionHelper;
```

The caller must invoke it with a trailing `()` invocation:

```javascript
// lib/http.js line 5 — BEFORE
const optionHelper = require('./optionhelper')();
//                                             ^^ counterintuitive invocation
```

This is a surprising API: requiring a module and immediately calling it as a function. There is no benefit — no initialization parameters, no instance state, no configuration injection. The constructor wrapper is pure overhead and a readability trap.

#### Solution

**Step 1** — Rewrite `lib/optionhelper.js` to export the functions directly:

```javascript
// lib/optionhelper.js — AFTER
'use strict';

const CONST = require('./constants');

/**
 * Build and normalize HTTP request options for Salesforce API calls.
 *
 * @param {Object} opts - Input options.
 * @param {string} [opts.apiVersion] - API version string (e.g. 'v45.0').
 * @param {string} [opts.uri] - Full URI; when present used as-is.
 * @param {string} [opts.resource] - Resource path appended to instance URL.
 * @param {Object} [opts.oauth] - OAuth credentials.
 * @param {string} [opts.method] - HTTP method, defaults to 'GET'.
 * @param {Object|FormData} [opts.multipart] - Multipart body.
 * @param {*} [opts.body] - Request body.
 * @param {Object} [opts.headers] - Additional headers.
 * @param {Object} [opts.qs] - Query string parameters.
 * @param {Object} [opts.requestOpts] - Extra request options to merge.
 * @returns {Object} Normalized request options.
 */
function getApiRequestOptions(opts) {
  const ropts = {};
  const apiVersion = opts.apiVersion || CONST.defaultOptions.apiVersion;

  if (opts.uri) {
    ropts.uri = opts.uri;
  } else {
    if (!opts.resource || opts.resource.charAt(0) !== '/') {
      opts.resource = '/' + (opts.resource || '');
    }
    ropts.uri = [
      opts.oauth.instance_url,
      '/services/data/',
      apiVersion,
      opts.resource
    ].join('');
  }

  ropts.method = opts.method || 'GET';
  ropts.headers = {
    Accept: 'application/json;charset=UTF-8'
  };

  if (opts.oauth) {
    ropts.headers.Authorization = 'Bearer ' + opts.oauth.access_token;
  }

  if (opts.multipart) {
    ropts.body = opts.multipart;
  } else {
    ropts.headers['content-type'] = 'application/json';
    if (opts.body) {
      ropts.body = opts.body;
    }
  }

  if (opts.headers) {
    Object.assign(ropts.headers, opts.headers);
  }

  if (opts.qs) {
    ropts.qs = opts.qs;
  }

  if (opts.requestOpts) {
    Object.assign(ropts, opts.requestOpts);
  }

  return ropts;
}

/**
 * Build a URL from opts.uri with optional query parameters from opts.qs.
 *
 * @param {Object} opts
 * @param {string} opts.uri - Base URI.
 * @param {Object} [opts.qs] - Key/value query parameters.
 * @returns {URL} The constructed URL.
 */
function getFullUri(opts) {
  const result = new URL(opts.uri);
  if (opts.qs) {
    Object.keys(opts.qs).forEach((key) =>
      result.searchParams.append(key, opts.qs[key])
    );
  }
  return result;
}

module.exports = { getApiRequestOptions, getFullUri };
```

**Step 2** — Update `lib/http.js` line 5 (remove the trailing `()`):

```javascript
// lib/http.js line 5 — BEFORE
const optionHelper = require('./optionhelper')();

// lib/http.js line 5 — AFTER
const optionHelper = require('./optionhelper');
```

All downstream call sites in `lib/http.js` (`optionHelper.getApiRequestOptions(opts)` and `optionHelper.getFullUri(ropts)`) remain unchanged — the object shape is identical.

---

### R06 — Extract `getHeader` Utility to Eliminate Duplicated Header Access

**Addresses**: M11 (Duplicated Code — Dual-Mode Header Access Pattern)
**Technique**: Extract Method
**Files**: `lib/util.js`, `lib/http.js`
**Impact**: Medium | **Complexity**: Low | **Risk**: Low

#### Problem

The dual-mode header access pattern — handling both Fetch API `Headers` objects (with `.get()`) and plain objects — is duplicated twice inside `responseFailureCheck`:

```javascript
// lib/http.js lines 18–30 — BEFORE (duplicated pattern)

// First occurrence: access 'error' header
const headerError =
  res.headers && typeof res.headers.get === 'function'
    ? res.headers.get('error')
    : res.headers && res.headers.error;

// Second occurrence: access 'content-length' header
const contentLength =
  res.headers && typeof res.headers.get === 'function'
    ? res.headers.get('content-length')
    : res.headers && res.headers['content-length'];
```

This is 12 lines of conditional logic repeated verbatim with only the header name varying. The utility `checkHeaderCaseInsensitive` in `lib/util.js` already handles the same dual-mode pattern but returns a boolean (contains-check). A `getHeader` function returning the raw value would DRY up `responseFailureCheck` and provide a reusable building block.

#### Solution

**Step 1** — Add `getHeader` to `lib/util.js` after the existing `checkHeaderCaseInsensitive`:

```javascript
// lib/util.js — add new function after checkHeaderCaseInsensitive

/**
 * Retrieve a header value from either a Fetch Headers object or a plain object.
 * Returns undefined if the header is not present or headers is falsy.
 *
 * @param {Headers|Object|null|undefined} headers - The headers collection.
 * @param {string} key - The header name (case-insensitive for plain objects).
 * @returns {string|null|undefined} The header value, or undefined if not found.
 */
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

Add it to the exports:

```javascript
// lib/util.js module.exports — AFTER
module.exports = {
  checkHeaderCaseInsensitive,   // already exported implicitly via isJsonResponse
  isJsonResponse,
  isFunction,
  isString,
  isBoolean,
  isObject,
  isNumber,
  findId,
  validateOAuth,
  getHeader,    // <-- new export
};
```

Note: `checkHeaderCaseInsensitive` is currently not exported (it is module-private). That is fine to leave as-is.

**Step 2** — Update `responseFailureCheck` in `lib/http.js`:

```javascript
// lib/http.js — BEFORE (12 lines of duplicated ternary)
const headerError =
  res.headers && typeof res.headers.get === 'function'
    ? res.headers.get('error')
    : res.headers && res.headers.error;
// ...
const contentLength =
  res.headers && typeof res.headers.get === 'function'
    ? res.headers.get('content-length')
    : res.headers && res.headers['content-length'];

// lib/http.js — AFTER (2 lines, same semantics)
const headerError = util.getHeader(res.headers, 'error');
const contentLength = util.getHeader(res.headers, 'content-length');
```

The `responseFailureCheck` function drops from 32 lines to 22 lines. Existing test coverage for error headers continues to apply.

---

### R07 — Consolidate Four URL Methods via `_urlRequest` Helper

**Addresses**: M5 (Duplicated Code — URL Construction Pattern)
**Technique**: Extract Method, Parameterize Method
**File**: `lib/api.js` lines 386–426
**Impact**: Medium | **Complexity**: Medium | **Risk**: Low

#### Problem

Four methods share an identical structural skeleton, differing only in HTTP method and optional body serialization:

```javascript
// lib/api.js lines 386–426 — BEFORE (four near-identical methods)

const getUrl = function (data) {
  let opts = this._getOpts(data, { singleProp: 'url' });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = 'GET';
  return this._apiRequest(opts);
};

const putUrl = function (data) {
  let opts = this._getOpts(data, { singleProp: 'url' });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = 'PUT';
  if (opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
  }
  return this._apiRequest(opts);
};

const postUrl = function (data) {
  let opts = this._getOpts(data, { singleProp: 'url' });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = 'POST';
  if (opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
  }
  return this._apiRequest(opts);
};

const deleteUrl = function (data) {
  let opts = this._getOpts(data, { singleProp: 'url' });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = 'DELETE';
  return this._apiRequest(opts);
};
```

The body serialization guard `if (opts.body && typeof opts.body !== 'string')` is duplicated verbatim in both `putUrl` and `postUrl`. Any bug fix or enhancement to URL construction or body handling must be applied to all four methods.

#### Solution

Extract a private `_urlRequest` function (not exported) that encapsulates the common logic:

```javascript
// lib/api.js — AFTER

// Private: not added to module.exports
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

const getUrl = function (data) {
  return this._urlRequest(data, 'GET');
};

const putUrl = function (data) {
  return this._urlRequest(data, 'PUT');
};

const postUrl = function (data) {
  return this._urlRequest(data, 'POST');
};

const deleteUrl = function (data) {
  return this._urlRequest(data, 'DELETE');
};
```

Because `_urlRequest` must be callable as `this._urlRequest(...)` from the four public methods (which are mixed onto `Connection.prototype`), it needs to appear in `module.exports`:

```javascript
// lib/api.js module.exports — add _urlRequest
module.exports = {
  _getOpts,
  _urlRequest,    // <-- must be on prototype so public methods can call this._urlRequest
  // ... all public methods unchanged
};
```

This reduces the four-method block from ~40 lines to ~20 lines and provides a single location for any future URL construction bug fix.

---

### R08 — Remove `_queryHandler` from Public Exports

**Addresses**: M6 (Indecent Exposure — Internal Method on Public API Surface)
**Technique**: Hide Method
**File**: `lib/api.js` lines 477–509
**Impact**: Medium | **Complexity**: Low | **Risk**: Low

#### Problem

`_queryHandler` is prefixed with `_` to signal "private", but it appears in `module.exports`:

```javascript
// lib/api.js module.exports — BEFORE
module.exports = {
  _getOpts,
  // ...
  _queryHandler,   // <-- private implementation detail exposed on every Connection instance
  search,
  // ...
};
```

Because `lib/api.js` methods are mixed onto `Connection.prototype` via `Object.assign`, every `Connection` instance exposes `conn._queryHandler()` as a publicly callable method. This:
- Inflates the public API surface the library must maintain as stable
- Prevents future internal refactoring of `_queryHandler` without risk of breaking caller code
- Contradicts the `_` prefix convention

No test file calls `_queryHandler` directly. The two callers — `query()` and `queryAll()` — call it as `this._queryHandler(opts)`, which works because it is on the prototype.

#### Solution

Remove `_queryHandler` from `module.exports`. Update `query` and `queryAll` to use the module-local function reference directly via `Function.prototype.call`:

```javascript
// lib/api.js — query function — AFTER
const query = function (data) {
  let opts = this._getOpts(data, {
    singleProp: 'query',
    defaults: {
      fetchAll: false,
      includeDeleted: false,
      raw: false,
    },
  });
  return _queryHandler.call(this, opts);   // local function, not prototype method
};

// lib/api.js — queryAll function — AFTER
const queryAll = function (data) {
  let opts = this._getOpts(data, {
    singleProp: 'query',
    defaults: {
      fetchAll: false,
      raw: false,
    },
  });
  opts.includeDeleted = true;
  return _queryHandler.call(this, opts);   // local function, not prototype method
};
```

```javascript
// lib/api.js module.exports — AFTER
module.exports = {
  _getOpts,
  getPasswordStatus,
  updatePassword,
  getIdentity,
  getVersions,
  getResources,
  getSObjects,
  getMetadata,
  getDescribe,
  getLimits,
  insert,
  update,
  upsert,
  delete: _delete,
  getRecord,
  getBody,
  getAttachmentBody,
  getDocumentBody,
  getContentVersionData,
  query,
  queryAll,
  // _queryHandler removed
  search,
  getUrl,
  putUrl,
  postUrl,
  deleteUrl,
  apexRest,
  createStreamClient,
  subscribe,
  stream,
};
```

---

### R09 — Replace Hardcoded OAuth Revoke URLs with Constants

**Addresses**: M4 (Magic Number — Hardcoded URLs), L6 (Stale API Version Fallback)
**Technique**: Replace Magic Number with Symbolic Constant
**Files**: `lib/auth.js` lines 219–222, `lib/constants.js` lines 14 and 25–43
**Impact**: Medium | **Complexity**: Low | **Risk**: Low

#### Problem

```javascript
// lib/auth.js lines 219–222 — BEFORE
if (this.environment === 'sandbox') {
  opts.uri = 'https://test.salesforce.com/services/oauth2/revoke';
} else {
  opts.uri = 'https://login.salesforce.com/services/oauth2/revoke';
}
```

Every other auth method uses `this.testLoginUri` or `this.loginUri` (configurable per-connection options). The revoke endpoint shares the same base domain as the token endpoint. Hardcoding the domain means `revokeToken` silently uses the wrong endpoint for private Salesforce instances with custom OAuth domains — a common enterprise deployment pattern.

Also addressed here (L6): the stale hardcoded fallback `'v54.0'` in `lib/constants.js` line 14.

#### Solution

**Step 1** — Add revoke URI constants and defaults to `lib/constants.js`:

```javascript
// lib/constants.js — AFTER additions
const AUTH_ENDPOINT = 'https://login.salesforce.com/services/oauth2/authorize';
const TEST_AUTH_ENDPOINT = 'https://test.salesforce.com/services/oauth2/authorize';
const LOGIN_URI = 'https://login.salesforce.com/services/oauth2/token';
const TEST_LOGIN_URI = 'https://test.salesforce.com/services/oauth2/token';
const REVOKE_URI = 'https://login.salesforce.com/services/oauth2/revoke';      // <-- new
const TEST_REVOKE_URI = 'https://test.salesforce.com/services/oauth2/revoke';  // <-- new

// Remove 'v54.0' fallback — API_PACKAGE_VERSION is the single source of truth
const API = process.env.SFDC_API_VERSION || API_PACKAGE_VERSION;               // <-- remove || 'v54.0'

const constants = {
  AUTH_ENDPOINT,
  TEST_AUTH_ENDPOINT,
  LOGIN_URI,
  TEST_LOGIN_URI,
  REVOKE_URI,           // <-- new
  TEST_REVOKE_URI,      // <-- new
  ENVS,
  MODES,
  MULTIPART_TYPES,
  API,
  defaultOptions: {
    // ... existing fields ...
    revokeUri: REVOKE_URI,          // <-- new
    testRevokeUri: TEST_REVOKE_URI, // <-- new
  }
};
```

**Step 2** — Update `revokeToken` in `lib/auth.js` to use the configurable instance properties:

```javascript
// lib/auth.js revokeToken — AFTER
const revokeToken = function (data) {
  let opts = this._getOpts(data, {
    singleProp: 'token'
  });

  opts.uri = this.environment === 'sandbox'
    ? this.testRevokeUri
    : this.revokeUri;

  const params = { token: opts.token };
  if (opts.callbackParam) {
    params.callback = opts.callbackParam;
  }
  opts.uri += '?' + new URLSearchParams(params).toString();
  return this._apiAuthRequest(opts);
};
```

This is now consistent with how `authenticate`, `refreshToken`, and `getAuthUri` resolve their endpoints: they read from `this.loginUri` / `this.testLoginUri`, which come from `defaultOptions` and can be overridden per-connection.

**Note on L6** — Also update `package.json`'s `sfdx.api` field to the current Salesforce API version (`v63.0` as of Spring '25) to keep `API_PACKAGE_VERSION` accurate and meaningful.

---

### R10 — Replace `let self = this` with Arrow Functions in `fdcstream.js`

**Addresses**: M9 (`let self = this` Anti-Pattern)
**Technique**: Substitute Algorithm
**File**: `lib/fdcstream.js` lines 9, 20–30, 45, 59–78
**Impact**: Medium | **Complexity**: Low | **Risk**: Low

#### Problem

Both `Subscription` and `Client` use the pre-ES6 `let self = this` idiom to capture `this` in regular function expression callbacks:

```javascript
// lib/fdcstream.js Subscription constructor — BEFORE
class Subscription extends EventEmitter {
  constructor(opts, client) {
    super();
    let self = this;   // <-- unnecessary in ES6 classes

    this._sub = client._fayeClient.subscribe(this._topic, function (d) {
      self.emit('data', d);   // <-- self used here
    });
    this._sub.callback(function () {
      self.emit('connect');
    });
    this._sub.errback(function (err) {
      self.emit('error', err);
    });
  }
}
```

```javascript
// lib/fdcstream.js Client constructor — BEFORE
class Client extends EventEmitter {
  constructor(opts) {
    super();
    let self = this;   // <-- unnecessary

    this._fayeClient.on('transport:up', function () {
      self.emit('connect');   // <-- self used here
    });
    this._fayeClient.on('transport:down', function () {
      self.emit('disconnect');
    });

    const replayExtension = {
      outgoing: function (message, callback) {
        // ...
        message.ext['replay'] = self._replayFromMap;  // <-- self used here
      }
    };
  }
}
```

Since the codebase targets Node.js >= 22 and uses ES6 classes throughout, arrow functions are the idiomatic replacement. Arrow functions lexically bind `this`, eliminating the need for the `self` alias.

#### Solution: Full `fdcstream.js` After Replacement

```javascript
// lib/fdcstream.js — AFTER
'use strict';

const EventEmitter = require('events');
const faye = require('faye');

class Subscription extends EventEmitter {
  constructor(opts, client) {
    super();
    this.client = client;
    opts = opts || {};
    this._topic = opts.topic;

    if (opts.replayId) {
      this.client.addReplayId(this._topic, opts.replayId);
    }

    this._sub = client._fayeClient.subscribe(this._topic, (d) => {
      this.emit('data', d);   // arrow function: 'this' is the Subscription instance
    });

    this._sub.callback(() => {
      this.emit('connect');
    });

    this._sub.errback((err) => {
      this.emit('error', err);
    });
  }

  cancel() {
    if (this._sub) {
      this._sub.cancel();
    }
  }
}

class Client extends EventEmitter {
  constructor(opts) {
    super();
    opts = opts || {};

    this._endpoint =
      opts.oauth.instance_url + '/cometd/' + opts.apiVersion.substring(1);
    this._fayeClient = new faye.Client(this._endpoint, {
      timeout: opts.timeout,
      retry: opts.retry
    });
    this._fayeClient.setHeader(
      'Authorization',
      'Bearer ' + opts.oauth.access_token
    );

    this._fayeClient.on('transport:up', () => {
      this.emit('connect');   // arrow function
    });

    this._fayeClient.on('transport:down', () => {
      this.emit('disconnect');
    });

    this._replayFromMap = {};
    const replayExtension = {
      incoming: (message, callback) => {
        callback(message);
      },
      outgoing: (message, callback) => {
        if (message && message.channel === '/meta/subscribe') {
          message.ext = message.ext || {};
          message.ext['replay'] = this._replayFromMap;  // 'this' via arrow function
        }
        callback(message);
      }
    };

    this._fayeClient.addExtension(replayExtension);
  }

  subscribe(opts) {
    opts = opts || {};
    return new Subscription(opts, this);
  }

  disconnect() {
    this._fayeClient.disconnect();
  }

  addReplayId(topic, replayId) {
    this._replayFromMap[topic] = replayId;
  }
}

module.exports = {
  Subscription: Subscription,
  Client: Client
};
```

Note: The `apiVersion.substring(1)` call (L10 smell) is left for R17-adjacent cleanup since it is a separate concern and this recommendation focuses on the `self` anti-pattern.

---

### R11 — Replace `arguments.length` Dispatch in `Record.set`

**Addresses**: M10 (Conditional Complexity — `arguments` Object Usage)
**Technique**: Substitute Algorithm
**File**: `lib/record.js` lines 29–38
**Impact**: Medium | **Complexity**: Low | **Risk**: Low

#### Problem

```javascript
// lib/record.js lines 29–38 — BEFORE
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
  // ...
};
```

The `arguments` object is an ES5-era implicit. The `arguments.length === 2` check is functionally equivalent to testing whether `field` is a string (single-field form: `set('Name', 'Alice')`) or an object (bulk-set form: `set({ Name: 'Alice', Age: 30 })`). Modern JavaScript makes intent explicit through type inspection.

Additionally, this function uses `function` syntax (required for `arguments` to work in the original form) while the rest of `record.js` consistently uses the same prototype style. The change does not require converting to arrow function syntax.

#### Solution

```javascript
// lib/record.js lines 29–38 — AFTER
Record.prototype.set = function (field, value) {
  const data = (typeof field === 'object' && field !== null)
    ? Object.fromEntries(
        Object.entries(field).map(([k, v]) => [k.toLowerCase(), v])
      )
    : { [field.toLowerCase()]: value };

  Object.keys(data).forEach((key) => {
    key = key.toLowerCase();
    if (key === 'attachment') {
      this._attachment = data[key];
      return;
    }
    if (!(key in this._fields) || data[key] !== this._fields[key]) {
      this._changed.add(key);
      if (!(key in this._previous)) {
        this._previous[key] = this._fields[key];
      }
      this._fields[key] = data[key];
    }
  });
};
```

The null check on `field` (`field !== null`) is consistent with the R03 fix to `isObject`. Both calling conventions (`set('field', value)` and `set({field: value})`) behave identically to the original. The `Object.fromEntries + map` pattern replaces the `reduce` for slightly better readability.

---

### R12 — Move `respToJson` Above Its Call Site in `lib/api.js`

**Addresses**: M12 (Obscured Intent — Function Defined After Usage Site)
**Technique**: Move Method (reorder within module)
**File**: `lib/api.js` lines 281–335
**Impact**: Low | **Complexity**: Low | **Risk**: Low

#### Problem

`respToJson` is called at line 297 inside `handleResponse` (a closure within `_queryHandler`), but is defined at line 326 — after the call site:

```javascript
// lib/api.js lines 281–335 — BEFORE (ordering)

const _queryHandler = function (data) {
  // ...
  const handleResponse = (respCandidate) => {
    let resp = respToJson(respCandidate);  // line 297: CALLS respToJson
    // ...
  };
};

// line 326: DEFINES respToJson (after call site)
const respToJson = (respCandidate) => {
  // ...
};
```

There is no runtime error because `handleResponse` is a callback invoked asynchronously after module initialization. However, the ordering violates the declaration-before-use convention and forces a reader to scroll down to find the definition of something called earlier in the file.

#### Solution

Move the `respToJson` definition immediately before `_queryHandler`:

```javascript
// lib/api.js — AFTER (correct ordering)

// respToJson defined BEFORE _queryHandler
const respToJson = (respCandidate) => {
  if (typeof respCandidate === 'object') {
    return respCandidate;
  }
  try {
    return JSON.parse(respCandidate);
  } catch {
    throw errors.invalidJson();
  }
};

const _queryHandler = function (data) {
  // ... calls respToJson — now defined above
};
```

---

### R13 — Remove Unused `singleProp: 'type'` from `getLimits`

**Addresses**: L9 (Dead Configuration / Copy-Paste Artifact)
**Technique**: Remove Parameter
**File**: `lib/api.js` lines 116–123
**Impact**: Low | **Complexity**: Low | **Risk**: Low

#### Problem

```javascript
// lib/api.js lines 116–123 — BEFORE
const getLimits = function (data) {
  let opts = this._getOpts(data, {
    singleProp: 'type',   // if a string is passed, it becomes opts.type
  });
  opts.resource = '/limits';  // opts.type is never consulted
  opts.method = 'GET';
  return this._apiRequest(opts);
};
```

`singleProp: 'type'` is a copy-paste artifact from `getMetadata` and `getDescribe`, which both use `opts.type` in their resource paths. `getLimits` ignores `opts.type` entirely. If a caller passes a string to `getLimits`, it is silently treated as `type` and then discarded.

#### Solution

```javascript
// lib/api.js lines 116–123 — AFTER
const getLimits = function (data) {
  let opts = this._getOpts(data);
  opts.resource = '/limits';
  opts.method = 'GET';
  return this._apiRequest(opts);
};
```

---

### R14 — Deprecate the `stream` Alias Method

**Addresses**: M7 (Middle Man — Transparent Single-Line Alias)
**Technique**: Inline Method (via documented deprecation path)
**File**: `lib/api.js` lines 473–475
**Impact**: Low | **Complexity**: Low | **Risk**: Low

#### Problem

```javascript
// lib/api.js lines 473–475 — BEFORE
const stream = function (data) {
  return this.subscribe(data);
};
```

`stream` does nothing but delegate to `subscribe`. It adds no logic, no parameter transformation, and no error handling. A user reading the public API documentation may wonder whether `stream` and `subscribe` are semantically different — they are not. Removing it would be a breaking change, so a deprecation path is the responsible approach.

#### Solution

```javascript
// lib/api.js — AFTER
/**
 * @deprecated Use subscribe() instead. Will be removed in the next major version.
 * @param {*} data - Subscription options (passed through to subscribe()).
 * @returns {Subscription}
 */
const stream = function (data) {
  return this.subscribe(data);
};
```

Add a migration note to CHANGELOG.md and the package README:
> `stream()` is deprecated. Use `subscribe()` directly. `stream` will be removed in the next major version.

Plan removal of the method (and its export) in the next semver major bump.

---

### R15 — Remove Empty `beforeEach` Hook and Implement Stub Test Cases

**Addresses**: L3 (Dead Code — No-Op `beforeEach`), L4 (Dead Code — Empty Test Bodies)
**Technique**: Remove Dead Code
**Files**: `test/record.js` lines 16–18 and 62, `test/plugin.js` line 35
**Impact**: Low | **Complexity**: Low | **Risk**: Low

#### Problem

```javascript
// test/record.js lines 16–18 — BEFORE
beforeEach(function (done) {
  done(); // does nothing; adds noise
});

// test/record.js line 62 — BEFORE
it('should allow me to set properties', function () {}); // vacuously passes

// test/plugin.js line 35 — BEFORE
it('should not allow non-functions when calling fn', function () {}); // vacuously passes
```

Empty test cases always pass, giving false confidence that coverage exists. The empty `beforeEach` is dead code that adds cognitive overhead.

#### Solution

Remove the no-op `beforeEach`:

```javascript
// test/record.js — AFTER (beforeEach removed entirely)
// No beforeEach — none needed
```

Implement the stub test cases with real assertions, or convert to `it.skip` to make the omission explicit:

```javascript
// test/record.js — AFTER (implement the set test)
it('should allow me to set properties', function () {
  const rec = nforce.createSObject('Account');
  rec.set({ Name: 'Acme', Industry: 'Tech' });
  rec.get('name').should.equal('Acme');
  rec.get('industry').should.equal('Tech');
});

// test/plugin.js — AFTER (implement the non-function validation test)
it('should not allow non-functions when calling fn', function () {
  const p = nforce.plugin({ namespace: 'test-nonfn-' + Date.now() });
  (function () {
    p.fn('myFn', 'not-a-function');
  }).should.throw('invalid function provided');
});
```

---

### R16 — Fix Non-Existent `client.logout()` in Integration Test

**Addresses**: L5 (Fallacious Method Name — Non-Existent Method)
**Technique**: Rename Method (call the correct existing method)
**File**: `test/integration.js` lines 23–27
**Impact**: Low | **Complexity**: Low | **Risk**: Low

#### Problem

```javascript
// test/integration.js lines 23–27 — BEFORE
after(() => {
  if (client != undefined) {
    client.logout(); // TypeError: client.logout is not a function
  }
});
```

There is no `logout` method anywhere in the `Connection` prototype chain. This would throw `TypeError: client.logout is not a function` if the integration test ever ran with valid credentials. The correct method for token revocation is `revokeToken`.

#### Solution

```javascript
// test/integration.js — AFTER
after(() => {
  if (client != null && client.oauth && client.oauth.access_token) {
    return client.revokeToken({ token: client.oauth.access_token });
  }
});
```

---

### R17 — Remove Stale `'v54.0'` Hardcoded Fallback Constant

**Addresses**: L6 (Magic Number — Stale Hardcoded API Version)
**Technique**: Replace Magic Number with Symbolic Constant (remove extraneous literal)
**File**: `lib/constants.js` line 14
**Impact**: Low | **Complexity**: Low | **Risk**: Low

This is addressed as part of R09. The standalone change:

```javascript
// lib/constants.js line 14 — BEFORE
const API = process.env.SFDC_API_VERSION || API_PACKAGE_VERSION || 'v54.0';
// ^ 'v54.0' is a newer version than the package.json value 'v45.0', and both are stale

// lib/constants.js line 14 — AFTER
const API = process.env.SFDC_API_VERSION || API_PACKAGE_VERSION;
```

`API_PACKAGE_VERSION` (from `package.json`'s `sfdx.api` field) should be the single source of truth. Removing the final `'v54.0'` literal makes it clear when the version is unset and prevents silent drift between the fallback and the package default.

Also update `package.json`'s `sfdx.api` to the current Salesforce API version (`v63.0` as of Spring '25).

---

### R18 — Consolidate `getIdentity` Redundant Null-Guard Chain

**Addresses**: L8 (Null Check — Redundant Guard Chain)
**Technique**: Consolidate Conditional Expression
**File**: `lib/api.js` lines 54–70
**Impact**: Low | **Complexity**: Low | **Risk**: Low

#### Problem

```javascript
// lib/api.js lines 54–70 — BEFORE
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
  opts.uri = opts.oauth.id;
  opts.method = 'GET';
  return this._apiRequest(opts);
};
```

The first two guards are exactly what `util.validateOAuth()` checks (`oauth && oauth.instance_url && oauth.access_token`). Using the existing utility function provides consistency with the rest of the codebase.

#### Solution

```javascript
// lib/api.js — AFTER
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
  opts.uri = opts.oauth.id;
  opts.method = 'GET';
  return this._apiRequest(opts);
};
```

The function drops from three guards to two, the error message is slightly more informative for the combined check, and the pattern is consistent with how other methods validate OAuth.

---

## Risk Assessment Summary

### Risk Levels by Category

**All 18 recommendations are Low risk.** The highest-effort items are:

| Recommendation | Why Extra Care |
|----------------|---------------|
| R07 (consolidate URL methods) | Changes internal structure of four public methods; verify with existing URL tests |
| R08 (hide `_queryHandler`) | Requires updating two internal call sites; verify no test exercises the method directly |
| R10 (arrow functions in fdcstream) | The Faye callback API's behavior with arrow functions is well-defined; Faye's own docs use both function styles |
| R11 (Record.set) | The two calling conventions (`set(str, val)` and `set(obj)`) must both continue to work; run all Record tests |

### Items Requiring Test Validation Before Merging

- **R03**: Add `isObject(null)` test case before deploying to ensure the fix is regression-free
- **R04**: After fix, run `npm test` to verify the query URL assertion now fires and passes
- **R08**: After removing `_queryHandler` from exports, run `npm test` to confirm no test references it directly
- **R11**: Run all tests in `test/record.js` to confirm both `set` calling conventions work correctly

### Breaking Changes

None of the 18 recommendations introduce breaking changes to the public API. The only potentially breaking future action is:
- **R14** (stream alias): Removing the `stream` method in a future major version is a breaking change and requires a semver major bump.

---

## Recommended Implementation Sequence

### Phase 1 — Immediate (CI Fix, Zero Semantic Risk)

| Step | Recommendation | Action |
|------|---------------|--------|
| 1 | R01 | Run `npx eslint . --fix`; commit; `npm run lint` |
| 2 | R04 | Remove stray `'` in `test/query.js`; `npm test` |
| 3 | R03 | Fix `isObject` + add unit test; `npm test` |

### Phase 2 — Dead Code Removal (Low Effort)

| Step | Recommendation | Action |
|------|---------------|--------|
| 4 | R02 | Remove dead `Connection` class from `lib/connection.js` |
| 5 | R17 | Remove `'v54.0'` literal from `lib/constants.js` |
| 6 | R15 | Remove empty `beforeEach`; implement stub tests |
| 7 | R16 | Fix `client.logout()` → `client.revokeToken()` |
| 8 | R13 | Remove `singleProp: 'type'` from `getLimits` |
| 9 | R12 | Reorder `respToJson` above `_queryHandler` |

### Phase 3 — Structural Improvements (Require Careful Testing)

| Step | Recommendation | Action |
|------|---------------|--------|
| 10 | R05 | Inline `OptionHelper` constructor; update `lib/http.js` |
| 11 | R06 | Add `getHeader` utility; update `responseFailureCheck` |
| 12 | R08 | Remove `_queryHandler` from exports; use `.call()` |
| 13 | R09 | Add revoke URI constants; fix `revokeToken` |
| 14 | R07 | Extract `_urlRequest`; consolidate four URL methods |
| 15 | R10 | Replace `self` with arrow functions in `fdcstream.js` |
| 16 | R11 | Replace `arguments.length` in `Record.set` |

### Phase 4 — Documentation and Cleanup

| Step | Recommendation | Action |
|------|---------------|--------|
| 17 | R18 | Consolidate `getIdentity` guards |
| 18 | R14 | Add `@deprecated` JSDoc to `stream`; update README |

---

## Expected Outcomes After All Refactorings Applied

| Metric | Before | After |
|--------|--------|-------|
| ESLint errors | 182 | 0 |
| Dead exported classes | 1 (`Connection` in connection.js) | 0 |
| Null-unsafe `isObject(null)` | `true` (bug) | `false` (correct) |
| Broken test assertion (stray quote) | Silent false-pass | Active verification |
| Duplicated URL build blocks | 4 near-identical functions (~40 lines) | 1 helper + 4 one-liners (~20 lines) |
| Duplicated header access expressions | 2 inline ternaries | 2 `getHeader()` calls |
| `arguments` object usages | 1 | 0 |
| `let self = this` usages | 2 | 0 |
| Hardcoded OAuth domain URLs | 2 in `revokeToken` | 0 (use configurable properties) |
| Exported internal methods on prototype | `_queryHandler` | removed |
| Purposeless constructor wrappers | 1 (`OptionHelper`) | 0 |
| Empty test bodies | 2 | 0 (implemented or skipped) |
| Lines in production code | ~1,627 | ~1,580 (net ~47 lines removed) |

---

## Out-of-Scope Architectural Items (Future Major Version)

Two high-severity issues from the smell report are architecturally significant but require larger coordinated changes that go beyond the scope of incremental refactoring. They are documented here for planning purposes.

### Global Plugin Registry (H3)

The module-level `plugins` singleton in `lib/plugin.js` is a global mutable object that persists for the lifetime of the Node.js process. Tests that register plugins affect all subsequent tests; there is no way to reset the registry between test runs. The recommended future refactoring is:

- Introduce a `PluginRegistry` class with `register()`, `get()`, and `clear()` methods
- Accept a registry instance as an optional parameter in `createConnection(opts, registry?)`
- Default to a shared process-level registry for backward compatibility
- Export the default registry for users who need direct access

### OAuth as Untyped Plain Object (H4)

The OAuth token object (`{ access_token, instance_url, refresh_token, id }`) flows through every module as an unvalidated plain object. Runtime crashes produce obscure `TypeError: Cannot read property 'instance_url' of undefined` messages. The recommended future refactoring is:

- Create an `OAuth` value class (or factory function `createOAuth(data)`) that validates required fields on construction
- Use `validateOAuth()` consistently before all API operations, or enforce it once in `_getOpts()`
- Consider using `OAuth.fromResponse(res)` to replace the scattered `Object.assign(opts.oauth, res)` mutation pattern in `authenticate` and `refreshToken`
