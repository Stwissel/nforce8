# Code Refactoring Report

## Project: nforce8 — Node.js REST API Wrapper for Salesforce

**Report Date**: 2026-03-28
**Analyst**: Refactoring Expert (Claude Sonnet 4.6)
**Source Report**: code-smell-detector-report.md
**Total Recommendations**: 22

---

## Executive Summary

The nforce8 codebase is in good structural shape following a prior refactoring campaign that decomposed a monolithic `index.js` into domain modules. The 30 remaining code smells cluster into three actionable themes:

1. **Public surface pollution**: Private implementation helpers are mixed onto the Connection prototype alongside the public API, creating an invisible coupling surface for any external consumer.
2. **Pervasive opts-bag mutation**: A single mutable plain object accumulates properties across every architectural layer, making individual functions impossible to test or reason about in isolation.
3. **Scattered duplication**: Multiple blocks of 4–6 lines of identical code are repeated across related functions; each is a low-risk, high-clarity refactoring opportunity.

The recommended roadmap is organized into three phases: Phase 1 (quick wins, zero architectural risk), Phase 2 (design improvements, moderate risk), and Phase 3 (architectural uplift, coordinated effort required). Each recommendation below maps directly to one or more of the 66 canonical refactoring techniques.

---

## Recommendation Index

| # | Recommendation | Technique | Phase | Impact | Complexity | Risk |
|---|---|---|---|---|---|---|
| R01 | Remove dead `opts._refreshResult` write | **Remove Dead Code** | 1 | M | L | L |
| R02 | Remove commented-out credential block in integration test | **Remove Dead Code** | 1 | L | L | L |
| R03 | Fix fallacious test description (`#getUrl`) | **Rename Method** (test desc) | 1 | L | L | L |
| R04 | Eliminate duplicate `package.json` read in `index.js` | **Inline Temp** | 1 | L | L | L |
| R05 | Add `err.type = 'empty-response'` to `emptyResponse()` | **Introduce Assertion** / symmetry fix | 1 | M | L | L |
| R06 | Extract `buildSignal()` helper to remove duplicated timeout/AbortSignal setup | **Extract Method** | 1 | M | L | L |
| R07 | Extract `applyBody()` to unify duplicated multipart/JSON body logic | **Extract Method** | 2 | M | L | L |
| R08 | Extract `_resolveEndpoint()` to unify three environment-conditional endpoint functions | **Extract Method** | 2 | M | L | L |
| R09 | Inline `_resolveOAuth` — replace with `Promise.resolve()` directly | **Inline Method** | 2 | M | L | L |
| R10 | Add fail-fast guard for single-mode missing OAuth | **Introduce Assertion** / **Replace Exception with Test** | 2 | H | L | L |
| R11 | Extract `makeOrg()` test helper to eliminate repeated connection boilerplate | **Extract Method** | 2 | M | L | L |
| R12 | Replace magic strings `'sandbox'` / `'single'` with named constants | **Replace Magic Number with Symbolic Constant** | 2 | M | L | L |
| R13 | Add `err.type` to `emptyResponse` and align error factory API | **Introduce Parameter Object** (align API) | 2 | L | L | L |
| R14 | Rename `d` parameter to `input` in `_getOpts` | **Rename Method** (parameter) | 2 | L | L | L |
| R15 | Rename `getBody` API method to `getBinaryContent` | **Rename Method** | 2 | M | M | M |
| R16 | Fix spacing inconsistencies via `eslint --fix` | Style tooling | 1 | L | L | L |
| R17 | Move multipart form-building into `Record` (`toMultipartForm`) | **Move Method** / **Hide Delegate** | 3 | H | M | M |
| R18 | Separate private helpers from `module.exports` in `auth.js`, `api.js`, `http.js` | **Hide Method** / **Extract Interface** | 3 | H | H | H |
| R19 | Sub-divide `lib/api.js` into domain modules | **Extract Class** (module) | 3 | H | H | H |
| R20 | Introduce typed request value objects to replace the opts bag | **Introduce Parameter Object** / **Replace Data Value with Object** | 3 | H | H | H |
| R21 | Separate retry state from the opts bag in `_apiRequest` | **Split Temporary Variable** / **Remove Assignments to Parameters** | 3 | M | M | M |
| R22 | Standardize on ES6 class syntax for `Connection` and `Record` | **Extract Superclass** pattern | 3 | M | H | M |

---

## Phase 1 — Quick Wins

### R01: Remove Dead `opts._refreshResult` Write

**Smell**: Dead Code (Issue #9 in detector report)
**Technique**: Remove Dead Code
**File**: `lib/http.js`, line 177
**Risk**: Low | **Complexity**: Low | **Impact**: Medium

**Problem**: `opts._refreshResult = res` is assigned in the auto-refresh retry path but is never read anywhere in the codebase (confirmed by global search). The assignment is a dead write.

**Before**:
```js
return this.autoRefreshToken(opts).then((res) => {
  opts._refreshResult = res;   // dead write — never consumed
  opts._retryCount = 1;
  return this._apiRequest(opts);
});
```

**After**:
```js
return this.autoRefreshToken(opts).then(() => {
  opts._retryCount = 1;
  return this._apiRequest(opts);
});
```

**Steps**:
1. Delete line 177 (`opts._refreshResult = res;`).
2. Change the arrow function parameter from `res` to `_` or remove it (change to `() =>`).
3. Run `npm test` to verify no regression.

**Note**: `opts._retryCount` is addressed as a separate concern in R21.

---

### R02: Remove Commented-Out Credential Block in Integration Test

**Smell**: Dead Code (Issue #20)
**Technique**: Remove Dead Code
**File**: `test/integration.js`, lines 56–67 and the `TODO` on line 18
**Risk**: Low | **Complexity**: Low | **Impact**: Low

**Problem**: A commented-out object literal with placeholder credentials was left in the integration test. The `TODO: fix the creds` comment on line 18 is the corresponding hanging marker.

**Steps**:
1. Delete `test/integration.js` lines 56–67 (the `/* let x = { ... } */` block).
2. Delete the `// TODO: fix the creds` comment on line 18.
3. Run `npm test` to confirm no change in test output.

---

### R03: Fix Fallacious Test Description

**Smell**: Fallacious Comment (Issue #19)
**Technique**: Rename Method (applied to test description string)
**File**: `test/record.js`, line 202
**Risk**: Low | **Complexity**: Low | **Impact**: Low

**Before**:
```js
describe('#getUrl', function () {
  it('should let me get the id', function () {   // wrong — tests getUrl, not getId
    acc.getUrl().should.equal('http://www.salesforce.com');
  });
});
```

**After**:
```js
describe('#getUrl', function () {
  it('should let me get the url', function () {
    acc.getUrl().should.equal('http://www.salesforce.com');
  });
});
```

---

### R04: Eliminate Duplicate `package.json` Read in `index.js`

**Smell**: Duplicate Code (Issue #7)
**Technique**: Inline Temp
**Files**: `index.js` line 68; `lib/constants.js` line 15
**Risk**: Low | **Complexity**: Low | **Impact**: Low

**Problem**: Both `lib/constants.js` and `index.js` independently `require('../package.json').sfdx.api`. `index.js` already imports `CONST` from `lib/constants`, which already exposes this value as `CONST.API`.

**Before** (`index.js` lines 67–68):
```js
const version = require('./package.json').version;
const API_VERSION = require('./package.json').sfdx.api;
```

**After**:
```js
const version = require('./package.json').version;
const API_VERSION = CONST.API;
```

**Steps**:
1. In `index.js` line 68, replace `require('./package.json').sfdx.api` with `CONST.API`.
2. Verify `CONST` is already imported at the top of `index.js` (it is, line 5).
3. Run `npm test`.

---

### R05: Add `err.type` to `emptyResponse()` for API Symmetry

**Smell**: Incomplete Error Factory (Issue #29)
**Technique**: Introduce Assertion (align error factory API)
**File**: `lib/errors.js`, lines 9–11
**Risk**: Low | **Complexity**: Low | **Impact**: Medium

**Problem**: `invalidJson()` sets `err.type = 'invalid-json'`, enabling programmatic error discrimination. `emptyResponse()` lacks a corresponding `type`, making the API asymmetric. A caller cannot catch empty-response errors by type.

**Before**:
```js
const emptyResponse = () => {
  return new Error('Unexpected empty response');
};
```

**After**:
```js
const emptyResponse = () => {
  const err = new Error('Unexpected empty response');
  err.type = 'empty-response';
  return err;
};
```

**Steps**:
1. Edit `lib/errors.js` as shown above.
2. Update `test/errors.js` to assert `err.type === 'empty-response'` on empty-response error (currently this assertion is absent; add it for consistency with the `invalidJson` test).
3. Run `npm test`.

---

### R06: Extract `buildSignal()` to Eliminate Duplicated Timeout/AbortSignal Setup

**Smell**: Duplicate Code (Issue #4)
**Technique**: Extract Method
**File**: `lib/http.js`, lines 100–106 and 139–145
**Risk**: Low | **Complexity**: Low | **Impact**: Medium

**Problem**: An identical 6-line block for merging an `AbortSignal.timeout` with an optional existing signal appears in both `_apiAuthRequest` and `_apiRequest`.

**Duplicated block** (appears twice):
```js
if (this.timeout) {
  const timeoutSignal = AbortSignal.timeout(this.timeout);
  opts.signal =
    opts.signal !== undefined
      ? AbortSignal.any([timeoutSignal, opts.signal])
      : timeoutSignal;
}
```

**Extracted helper**:
```js
/**
 * Build an AbortSignal that fires after `timeout` ms, optionally
 * combining it with a caller-supplied signal.
 * @param {AbortSignal|undefined} existingSignal
 * @param {number|undefined} timeout  milliseconds; falsy = no timeout
 * @returns {AbortSignal|undefined}
 */
function buildSignal(existingSignal, timeout) {
  if (!timeout) return existingSignal;
  const timeoutSignal = AbortSignal.timeout(timeout);
  return existingSignal !== undefined
    ? AbortSignal.any([timeoutSignal, existingSignal])
    : timeoutSignal;
}
```

**After** (both call sites):
```js
// In _apiAuthRequest:
opts.signal = buildSignal(opts.signal, this.timeout);

// In _apiRequest:
ropts.signal = buildSignal(ropts.signal, this.timeout);
```

**Steps**:
1. Add `buildSignal` as a module-level function at the top of `lib/http.js`.
2. Replace both 6-line timeout blocks with one-line calls to `buildSignal`.
3. Run `npm test` to verify identical behaviour.

---

### R16: Fix Spacing Inconsistencies via ESLint

**Smell**: Inconsistent Style (Issue #11)
**Technique**: Substitute Algorithm (tooling-assisted)
**File**: `lib/api.js`, lines 150, 163–164, 177–179, 188–189, 454
**Risk**: Low | **Complexity**: Low | **Impact**: Low

**Problem**: Several assignments omit the required space before the `=` operator: `const type =opts.sobject.getType()`.

**Steps**:
1. Run `npx eslint --fix lib/api.js`.
2. Verify the corrected assignments in the affected lines.
3. Run `npm test`.

---

## Phase 2 — Design Improvements

### R07: Extract `applyBody()` to Unify Duplicated Multipart/JSON Body Logic

**Smell**: Duplicate Code (Issue #5)
**Technique**: Extract Method, Parameterize Method
**File**: `lib/api.js`, lines 153–157 and 167–171
**Risk**: Low | **Complexity**: Low | **Impact**: Medium

**Problem**: The `insert` and `update` functions each contain an identical 5-line conditional that selects multipart vs JSON serialization. The only difference is the payload-extraction function: `toPayload()` for insert, `toChangedPayload()` for update.

**Duplicated pattern**:
```js
if (CONST.MULTIPART_TYPES.includes(type)) {
  opts.multipart = multipart(opts);
} else {
  opts.body = JSON.stringify(opts.sobject.toPayload());  // differs
}
```

**Extracted helper**:
```js
/**
 * Attach either a multipart form or a JSON body to opts, based on the SObject type.
 * @param {object} opts - Request options bag (mutated in-place).
 * @param {string} type - Lowercased SObject type string.
 * @param {Function} payloadFn - Zero-argument function that returns the payload object.
 */
function applyBody(opts, type, payloadFn) {
  if (CONST.MULTIPART_TYPES.includes(type)) {
    opts.multipart = multipart(opts);
  } else {
    opts.body = JSON.stringify(payloadFn());
  }
}
```

**After**:
```js
const insert = function (data) {
  const opts = this._getOpts(data);
  if (!opts.sobject) throw new Error('insert requires opts.sobject');
  const type = opts.sobject.getType();
  opts.resource = sobjectPath(type);
  opts.method = 'POST';
  applyBody(opts, type, () => opts.sobject.toPayload());
  return this._apiRequest(opts);
};

const update = function (data) {
  const opts = this._getOpts(data);
  const type = opts.sobject.getType();
  const id = opts.sobject.getId();
  opts.resource = sobjectPath(type, id);
  opts.method = 'PATCH';
  applyBody(opts, type, () => opts.sobject.toChangedPayload());
  return this._apiRequest(opts);
};
```

**Steps**:
1. Add `applyBody` as a module-level function inside `lib/api.js`.
2. Replace both 5-line conditional blocks in `insert` and `update` with `applyBody(...)` calls.
3. Run `npm test`.

---

### R08: Extract `_resolveEndpoint()` to Unify Environment-Conditional Endpoint Selection

**Smell**: Duplicate Code (Issue #6)
**Technique**: Extract Method, Consolidate Conditional Expression
**File**: `lib/auth.js`, lines 37–48
**Risk**: Low | **Complexity**: Low | **Impact**: Medium

**Problem**: Three functions apply the identical sandbox-vs-production conditional to different URL properties:

```js
const _authEndpoint = function (opts = {}) {
  if (opts.authEndpoint) return opts.authEndpoint;
  return this.environment === 'sandbox' ? this.testAuthEndpoint : this.authEndpoint;
};
const _loginEndpoint = function () {
  return this.environment === 'sandbox' ? this.testLoginUri : this.loginUri;
};
const _revokeEndpoint = function () {
  return this.environment === 'sandbox' ? this.testRevokeUri : this.revokeUri;
};
```

**Extracted helper** (module-private, not exported):
```js
// Pure function — no 'this' dependency, safe to test standalone.
function resolveEndpoint(environment, prod, test) {
  return environment === 'sandbox' ? test : prod;
}
```

**After**:
```js
const _authEndpoint = function (opts = {}) {
  if (opts.authEndpoint) return opts.authEndpoint;
  return resolveEndpoint(this.environment, this.authEndpoint, this.testAuthEndpoint);
};

const _loginEndpoint = function () {
  return resolveEndpoint(this.environment, this.loginUri, this.testLoginUri);
};

const _revokeEndpoint = function () {
  return resolveEndpoint(this.environment, this.revokeUri, this.testRevokeUri);
};
```

**Steps**:
1. Add `resolveEndpoint` as a module-level function (not exported) at the top of `lib/auth.js`.
2. Update the three endpoint functions as shown.
3. Run `npm test`. The public observable behaviour of `getAuthUri`, `authenticate`, `refreshToken`, and `revokeToken` must be unchanged.

---

### R09: Inline `_resolveOAuth` — Replace with `Promise.resolve()` Directly

**Smell**: Lazy Element (Issue #13)
**Technique**: Inline Method
**File**: `lib/auth.js`, lines 120–122; `test/connection.js`, lines 426–443
**Risk**: Low | **Complexity**: Low | **Impact**: Medium

**Problem**: `_resolveOAuth` is a trivially thin wrapper around `Promise.resolve` that adds no behaviour, documentation, or abstraction value. It is exported publicly, creating an unnecessary coupling point.

```js
const _resolveOAuth = function (newOauth) {
  return Promise.resolve(newOauth);  // only ever does this
};
```

**Steps**:
1. In `lib/auth.js` `authenticate()`, replace `return this._resolveOAuth(newOauth)` with `return Promise.resolve(newOauth)`.
2. Remove `_resolveOAuth` from the function definition and from `module.exports`.
3. In `test/connection.js`, find the test block exercising `org._resolveOAuth` (lines 426–443). Replace the assertion with an equivalent test using `authenticate()` or `Promise.resolve(...)` directly — the test should verify that after authentication the OAuth object resolves correctly, not that a private method exists.
4. Run `npm test`.

**Risk Mitigation**: Any external code that calls `org._resolveOAuth` will break; however, because it has always been a private helper (leading underscore convention), breaking this is semantically correct and the change is warranted.

---

### R10: Add Fail-Fast Guard for Single-Mode Missing OAuth

**Smell**: Missing Fail-Fast Guard (Issue #26)
**Technique**: Introduce Assertion, Replace Exception with Test
**File**: `lib/api.js`, lines 18–21 (`_getOpts`)
**Risk**: Low | **Complexity**: Low | **Impact**: High

**Problem**: When `mode === 'single'` and `authenticate()` has never been called, `this.oauth` is `undefined`. `_getOpts` silently sets `data.oauth = undefined`, which propagates through the stack until `optionhelper.js` crashes with a cryptic `TypeError: Cannot read properties of undefined (reading 'instance_url')`.

**Before**:
```js
if (this.mode === 'single' && !data.oauth) {
  data.oauth = this.oauth;   // silently injects undefined if not authenticated
}
```

**After**:
```js
if (this.mode === 'single' && !data.oauth) {
  if (!this.oauth) {
    throw new Error(
      'Connection is in single-user mode but no OAuth token has been set. ' +
      'Call authenticate() first.'
    );
  }
  data.oauth = this.oauth;
}
```

**Steps**:
1. Apply the change above in `lib/api.js`.
2. Add a test in `test/connection.js` that creates a single-mode connection without calling `authenticate()`, then calls any API method, and asserts that the descriptive error is thrown.
3. Run `npm test`.

---

### R11: Extract `makeOrg()` Test Helper in `test/connection.js`

**Smell**: Required Setup Code Duplication (Issue #16)
**Technique**: Extract Method
**File**: `test/connection.js`, lines 8–168
**Risk**: Low | **Complexity**: Low | **Impact**: Medium

**Problem**: The same `nforce.createConnection({...})` call with `FAKE_CLIENT_ID` and `FAKE_REDIRECT_URI` is inlined approximately 17 times. Any option defaults change requires editing 17 locations.

**Extracted helper**:
```js
function makeOrg(overrides = {}) {
  return nforce.createConnection(Object.assign({
    clientId: FAKE_CLIENT_ID,
    clientSecret: FAKE_CLIENT_ID,
    redirectUri: FAKE_REDIRECT_URI,
    environment: 'production'
  }, overrides));
}
```

**Before** (repeated):
```js
let org = nforce.createConnection({
  clientId: FAKE_CLIENT_ID,
  clientSecret: FAKE_CLIENT_ID,
  redirectUri: FAKE_REDIRECT_URI,
  environment: 'production'
});
```

**After**:
```js
let org = makeOrg();
// Or, for variant:
let org = makeOrg({ environment: 'sandbox' });
```

**Steps**:
1. Add `makeOrg` function after the constant declarations at the top of `test/connection.js`.
2. Replace each verbatim `nforce.createConnection({clientId: FAKE_CLIENT_ID, ...})` call with `makeOrg()` or `makeOrg({ <changed option> })`.
3. Run `npm test` to confirm all tests still pass.

---

### R12: Replace Magic Strings `'sandbox'` and `'single'` with Named Constants

**Smell**: Magic Strings (Issue #27)
**Technique**: Replace Magic Number with Symbolic Constant
**Files**: `lib/auth.js`, `lib/http.js`, `lib/constants.js`
**Risk**: Low | **Complexity**: Low | **Impact**: Medium

**Problem**: The string literals `'sandbox'`, `'single'`, and `'multi'` are used as direct string comparisons in multiple files even though `constants.js` already defines `CONST.ENVS = ['sandbox', 'production']` and `CONST.MODES = ['multi', 'single']`. The constants exist but their individual values are never imported for comparisons.

**Recommended additions to `lib/constants.js`**:
```js
const SANDBOX = 'sandbox';
const SINGLE_MODE = 'single';

const constants = {
  ...
  SANDBOX,
  SINGLE_MODE,
};
```

**Usage in `lib/auth.js`** (after importing CONST):
```js
// Before:
return this.environment === 'sandbox' ? ...

// After:
return this.environment === CONST.SANDBOX ? ...
```

**Usage in `lib/http.js`**:
```js
// Before:
if (jBody.access_token && this.mode === 'single') {

// After:
if (jBody.access_token && this.mode === CONST.SINGLE_MODE) {
```

**Steps**:
1. Add `SANDBOX` and `SINGLE_MODE` named constants to `lib/constants.js`.
2. Export them from the `constants` object.
3. Import `CONST` in `lib/auth.js` (it is not currently imported there — add the require).
4. Replace all `'sandbox'` comparisons in `auth.js` with `CONST.SANDBOX`.
5. Replace `'single'` in `http.js` and `auth.js` with `CONST.SINGLE_MODE`.
6. Run `npm test`.

---

### R13: Rename `_getOpts` Parameter `d` to `input`

**Smell**: Uncommunicative Name (Issue #24)
**Technique**: Rename Method (applied to parameter)
**File**: `lib/api.js`, line 10
**Risk**: Low | **Complexity**: Low | **Impact**: Low

**Before**:
```js
const _getOpts = function (d, opts = {}) {
  let data = {};
  if (opts.singleProp && d && !util.isObject(d)) {
    data[opts.singleProp] = d;
  } else if (util.isObject(d)) {
    data = d;
  }
  ...
```

**After**:
```js
const _getOpts = function (input, opts = {}) {
  let data = {};
  if (opts.singleProp && input && !util.isObject(input)) {
    data[opts.singleProp] = input;
  } else if (util.isObject(input)) {
    data = input;
  }
  ...
```

**Steps**:
1. Rename `d` to `input` throughout `_getOpts` in `lib/api.js` (4 occurrences within the function body).
2. Run `npm test`.

---

### R14: Rename API Method `getBody` to `getBinaryContent`

**Smell**: Ambiguous Method Name (Issue #28)
**Technique**: Rename Method
**File**: `lib/api.js`, lines 226–234 and `module.exports` block
**Risk**: Medium | **Complexity**: Medium | **Impact**: Medium

**Problem**: The API dispatcher `getBody` (routing to attachment/document/contentversion data) shares its name with `Record.prototype.getBody` (retrieving binary body from a record). Both exist in the same domain, creating conceptual ambiguity.

**Steps**:
1. Rename the function definition `const getBody = function(...)` to `const getBinaryContent = function(...)` in `lib/api.js`.
2. Update the export: `module.exports = { ..., getBinaryContent, ... }` (remove `getBody`).
3. Search all existing callers: `test/crud.js`, `examples/`, any external documentation.
4. Update caller references from `org.getBody(...)` to `org.getBinaryContent(...)`.
5. Update `BODY_GETTER_MAP` references that dispatch through `this[getter]` — the `getter` values (`getDocumentBody`, `getAttachmentBody`, `getContentVersionData`) are unaffected.
6. Run `npm test`.

**Breaking Change Note**: This is a public API rename. For a published npm package it warrants either a major version bump or a deprecation shim:
```js
// Deprecation shim (optional bridge):
Connection.prototype.getBody = function (data) {
  process.emitWarning('getBody() is deprecated. Use getBinaryContent() instead.',
    { code: 'NFORCE8_DEPRECATED_GETBODY' });
  return this.getBinaryContent(data);
};
```

---

## Phase 3 — Architectural Improvements

### R17: Move Multipart Form-Building into `Record` (`toMultipartForm`)

**Smell**: Feature Envy / Inappropriate Intimacy (Issue #12)
**Technique**: Move Method, Hide Delegate
**Files**: `lib/multipart.js`, `lib/record.js`, `lib/api.js`
**Risk**: Medium | **Complexity**: Medium | **Impact**: High

**Problem**: `multipart.js` reaches deeply into `Record` internals to build the multipart form:

```js
const type = opts.sobject.getType();           // reaches into Record
const fileName = opts.sobject.getFileName();   // reaches into Record
isPatch ? opts.sobject.toChangedPayload() : opts.sobject.toPayload()  // reaches in
opts.sobject.getBody()                         // reaches in
```

The `Record` class is the Information Expert for its own representation; `multipart.js` violates this by owning the "how to serialize a Record as multipart" logic.

**Target design**:

```js
// lib/record.js — new method
Record.prototype.toMultipartForm = function (isPatch) {
  const type = this.getType();
  const entity = type === 'contentversion' ? 'content' : type;
  const fieldName = type === 'contentversion' ? 'VersionData' : 'Body';
  const safeFileName = this.getFileName() || 'file.bin';

  const form = new FormData();
  form.append(
    'entity_' + entity,
    new Blob(
      [JSON.stringify(isPatch ? this.toChangedPayload() : this.toPayload())],
      { type: 'application/json' }
    ),
    'entity',
  );

  const body = this.getBody();
  if (hasNonEmptyAttachmentBody(body)) {
    form.append(
      fieldName,
      new Blob([body], { type: mimeTypes.lookup(safeFileName) || 'application/octet-stream' }),
      safeFileName,
    );
  }
  return form;
};
```

**After** (`lib/api.js`):
```js
// insert:
if (CONST.MULTIPART_TYPES.includes(type)) {
  opts.multipart = opts.sobject.toMultipartForm(false);
}

// update:
if (CONST.MULTIPART_TYPES.includes(type)) {
  opts.multipart = opts.sobject.toMultipartForm(true);
}
```

**After** (`lib/multipart.js`): `multipart.js` can be simplified to a thin delegation shim or removed entirely once `toMultipartForm` is proven and all callers updated.

**Steps**:
1. Move `hasNonEmptyAttachmentBody` and the FormData construction logic into `Record.prototype.toMultipartForm`.
2. Add `require('mime-types')` and `require('mime-types')` usage to `record.js`, or keep `multipart.js` as a pure helper that is called only by `toMultipartForm`.
3. Update `lib/api.js` to call `opts.sobject.toMultipartForm(false/true)` instead of `multipart(opts)`.
4. Update the `applyBody` helper introduced in R07 to delegate to `toMultipartForm`.
5. Run `npm test`.

**Dependency**: Implement after R07 (applyBody extraction).

---

### R18: Separate Private Helpers from `module.exports` in `auth.js`, `api.js`, `http.js`

**Smell**: Indecent Exposure (Issue #1)
**Technique**: Hide Method, Extract Interface
**Files**: `lib/auth.js`, `lib/api.js`, `lib/http.js`, `index.js`
**Risk**: High | **Complexity**: High | **Impact**: High

**Problem**: Private helpers (identified by underscore prefix) are exported from their modules, and then mixed indiscriminately onto `Connection.prototype` via `Object.assign`. This makes `org._authEndpoint()`, `org._apiRequest()`, `org._getOpts()`, etc. genuinely callable from external code.

**Exported private symbols currently on Connection prototype**:
- `lib/auth.js`: `_authEndpoint`, `_loginEndpoint`, `_revokeEndpoint`, `_notifyAndResolve`, `_resolveOAuth`
- `lib/api.js`: `_getOpts`
- `lib/http.js`: `_apiAuthRequest`, `_apiRequest`

**Target Architecture**:

The simplest compliant approach within the existing mixin pattern is to keep private symbols as module-local functions (not exported) and bind them to the instance in the `Connection` constructor using `Object.defineProperty` with `enumerable: false`:

```js
// index.js — Connection constructor
const Connection = function (opts) {
  // ... existing setup ...

  // Bind private helpers non-enumerably
  Object.defineProperty(this, '_getOpts', {
    value: _getOpts.bind(this),
    enumerable: false, writable: false, configurable: false
  });
  Object.defineProperty(this, '_apiRequest', {
    value: _apiRequest.bind(this),
    enumerable: false, writable: false, configurable: false
  });
  // ... etc for all private helpers
};
```

**Alternative (simpler, smaller change surface)**: Introduce a private namespace object:
```js
// In Connection constructor:
const _private = {
  getOpts: _getOpts.bind(this),
  apiRequest: _apiRequest.bind(this),
  apiAuthRequest: _apiAuthRequest.bind(this),
  // ...
};
// Store privately (not enumerable):
Object.defineProperty(this, '_private', { value: _private, enumerable: false });
```
Then all internal callers use `this._private.apiRequest(opts)` instead of `this._apiRequest(opts)`.

**Steps**:
1. Audit all callers of each private helper in the codebase (use grep for `this\._getOpts`, `this\._apiRequest`, etc.).
2. For `_getOpts`: it is called by all public API methods in `api.js`. These are on the prototype and use `this._getOpts`; they already work after R18 since the binding installs the function on the instance.
3. For test files that call private methods directly (e.g., `test/connection.js` lines 377–443): refactor tests to exercise the observable public behaviour instead.
4. Remove private symbols from `module.exports` in each of the three files.
5. Update `index.js` `Connection` constructor to install private bindings.
6. Run `npm test` after each file is updated.

**Risk Mitigation**:
- This is the highest-risk recommendation. Implement after full test suite runs green on all prior phases.
- Maintain a backwards-compatibility shim for one major version if the package has downstream consumers relying on private methods.
- Document the breaking change clearly in CHANGELOG.md.

---

### R19: Sub-divide `lib/api.js` into Domain Modules

**Smell**: God Module (Issue #3)
**Technique**: Extract Class (module-level), Move Method
**File**: `lib/api.js` (503 lines, 30 exported symbols)
**Risk**: High | **Complexity**: High | **Impact**: High

**Problem**: `lib/api.js` combines eight conceptually distinct concerns:
- **System Metadata**: `getVersions`, `getResources`, `getSObjects`, `getMetadata`, `getDescribe`, `getLimits`
- **Identity**: `getPasswordStatus`, `updatePassword`, `getIdentity`
- **CRUD**: `insert`, `update`, `upsert`, `delete`, `getRecord`
- **Binary/Blob**: `getBody`/`getBinaryContent`, `getAttachmentBody`, `getDocumentBody`, `getContentVersionData`
- **Query/Search**: `query`, `queryAll`, `search`, `_queryHandler`, `respToJson`
- **URL Access**: `getUrl`, `putUrl`, `postUrl`, `deleteUrl`, `_urlRequest`
- **Apex REST**: `apexRest`
- **Streaming**: `createStreamClient`, `subscribe`, `stream`

**Target file structure**:
```
lib/
  crud.js        — insert, update, upsert, delete, getRecord
  query.js       — query, queryAll, search, _queryHandler, respToJson
  metadata.js    — getVersions, getResources, getSObjects, getMetadata, getDescribe, getLimits, getIdentity, getPasswordStatus, updatePassword
  blob.js        — getBinaryContent, getAttachmentBody, getDocumentBody, getContentVersionData
  url.js         — getUrl, putUrl, postUrl, deleteUrl, _urlRequest
  apexrest.js    — apexRest
  streaming.js   — createStreamClient, subscribe, stream
  apiutils.js    — _getOpts, sobjectPath, resolveId, resolveType, requireForwardSlash, applyBody (from R07)
```

**Updated `index.js`**:
```js
const crudMethods      = require('./lib/crud');
const queryMethods     = require('./lib/query');
const metadataMethods  = require('./lib/metadata');
const blobMethods      = require('./lib/blob');
const urlMethods       = require('./lib/url');
const apexMethods      = require('./lib/apexrest');
const streamingMethods = require('./lib/streaming');

Object.assign(Connection.prototype,
  httpMethods, authMethods,
  crudMethods, queryMethods, metadataMethods, blobMethods,
  urlMethods, apexMethods, streamingMethods
);
```

**Steps**:
1. Begin with `streaming.js` — the most self-contained concern (creates `FDCStream.Client`, no shared utilities beyond `_getOpts`).
2. Extract `query.js` next — `_queryHandler` and `respToJson` are query-only concerns.
3. Extract `blob.js` — blob methods all follow the same resource-path + `blob: true` pattern.
4. Extract `crud.js` — depends on `applyBody` (R07) and `multipart`.
5. Extract `metadata.js` — pure GET calls against system endpoints.
6. Extract `url.js` and `apexrest.js` — each is small and independent.
7. Create `apiutils.js` (or `lib/requestutils.js`) for shared helpers (`_getOpts`, `sobjectPath`, etc.).
8. Update all `require` references across affected modules.
9. Update `index.js` to mix in from the new modules.
10. Run `npm test` after each extraction.

**Dependency**: Implement after R07 (applyBody), R17 (multipart into Record). Coordinate with R18 (private helpers) to avoid extracting private symbols into new public module exports.

---

### R20: Introduce Typed Request Value Objects to Replace the Opts Bag

**Smell**: Primitive Obsession / Data Clump (Issue #2)
**Technique**: Introduce Parameter Object, Replace Data Value with Object
**Files**: `lib/api.js`, `lib/auth.js`, `lib/http.js`, `lib/optionhelper.js`
**Risk**: High | **Complexity**: High | **Impact**: High

**Problem**: A single mutable plain object (`opts`) accumulates all properties — OAuth credentials, HTTP verb, URL fragments, serialized body, retry counter, feature flags — as it flows through every layer. Each layer is implicitly coupled to the full bag schema. Runtime state (`_retryCount`) is grafted onto the caller's object.

**Target design** — introduce three lightweight boundary objects:

```js
// Represents what a caller provides to an API method (pre-HTTP):
class ApiRequestOptions {
  constructor({ oauth, resource, method = 'GET', body, qs, headers, blob, raw, signal } = {}) {
    this.oauth    = oauth;
    this.resource = resource;
    this.method   = method;
    this.body     = body;
    this.qs       = qs;
    this.headers  = headers;
    this.blob     = blob;
    this.raw      = raw;
    this.signal   = signal;
  }
}

// Represents the resolved HTTP-layer request (post-optionhelper):
class HttpRequest {
  constructor({ uri, method, headers, body, qs, signal } = {}) {
    this.uri     = uri;
    this.method  = method;
    this.headers = headers;
    this.body    = body;
    this.qs      = qs;
    this.signal  = signal;
  }
}

// Retry context — separate from the request:
class RetryContext {
  constructor({ maxRetries = 1, count = 0 } = {}) {
    this.maxRetries = maxRetries;
    this.count      = count;
  }
  get canRetry() { return this.count < this.maxRetries; }
  increment()    { return new RetryContext({ maxRetries: this.maxRetries, count: this.count + 1 }); }
}
```

**Migration strategy** (incremental):
1. Start with `RetryContext` only: remove `opts._retryCount` and pass context as a second parameter to `_apiRequest`. This is a low-disruption first step.
2. Introduce `HttpRequest` as the output type of `optionhelper.getApiRequestOptions`. Internal to `http.js`; no external surface change required.
3. Introduce `ApiRequestOptions` for the boundary between public API methods and `_apiRequest`. This is the highest-effort step as it touches every API method in `api.js`.

**Immediate partial improvement** (extract retry state only — see also R21):
```js
// _apiRequest with explicit retry context:
const _apiRequest = function (opts, retryCtx = new RetryContext()) {
  // ...
  .catch((err) => {
    if (isAuthError(err) && this.autoRefresh && retryCtx.canRetry) {
      return this.autoRefreshToken(opts).then(() =>
        this._apiRequest(opts, retryCtx.increment())
      );
    }
    throw err;
  });
};
```

**Steps**: See detailed sub-steps in R21 for the retry extraction. Full typed-object introduction is an ongoing refactoring and need not be done in a single commit.

---

### R21: Separate Retry State from the Opts Bag in `_apiRequest`

**Smell**: Temporary Field, Status Variable (Issue #8)
**Technique**: Split Temporary Variable, Remove Assignments to Parameters
**File**: `lib/http.js`, lines 167–182
**Risk**: Medium | **Complexity**: Medium | **Impact**: Medium

**Problem**: `opts._retryCount` is used as a guard to prevent infinite recursion during auto-refresh. It is written onto the caller's opts object — an object the caller owns. `opts._refreshResult` is already removed by R01.

**Before**:
```js
return this.autoRefreshToken(opts).then((res) => {
  opts._retryCount = 1;
  return this._apiRequest(opts);
});
```

**After** — pass retry state as a separate parameter (can be private/internal; callers never set it):
```js
const _apiRequest = function (opts, _retryCount = 0) {
  const ropts = optionHelper.getApiRequestOptions(opts);
  ropts.signal = buildSignal(ropts.signal, this.timeout);
  const uri = optionHelper.getFullUri(ropts);
  const sobject = opts.sobject;

  return fetch(uri, ropts)
    .then((res) => responseFailureCheck(res))
    .then((res) => unsuccessfulResponseCheck(res))
    .then((res) => { /* blob/json/text handling ... */ })
    .then((body) => addSObjectAndId(body, sobject))
    .catch((err) => {
      if (
        isAuthError(err) &&
        this.autoRefresh === true &&
        hasRefreshCredentials(opts) &&
        _retryCount === 0
      ) {
        return this.autoRefreshToken(opts).then(() =>
          this._apiRequest(opts, 1)
        );
      }
      throw err;
    });
};
```

Where `isAuthError` and `hasRefreshCredentials` are extracted helper functions:
```js
function isAuthError(err) {
  return err.errorCode === 'INVALID_SESSION_ID' || err.errorCode === 'Bad_OAuth_Token';
}
function hasRefreshCredentials(opts) {
  return opts.oauth?.refresh_token || (this.username && this.password);
}
```

**Steps**:
1. Add `_retryCount = 0` as a second parameter to `_apiRequest`.
2. Replace `!opts._retryCount` guard with `_retryCount === 0`.
3. Replace `opts._retryCount = 1` mutation with passing `1` as the second argument to `this._apiRequest(opts, 1)`.
4. Extract `isAuthError(err)` as a module-level helper.
5. Verify `_apiRequest` is never called externally with a `_retryCount` argument (it should not be; callers always pass only opts).
6. Run `npm test`.

---

### R22: Standardize on ES6 Class Syntax for `Connection` and `Record`

**Smell**: Inconsistent Module Pattern (Issue #30)
**Technique**: Extract Superclass pattern, Substitute Algorithm
**Files**: `index.js`, `lib/record.js`, `lib/fdcstream.js`
**Risk**: Medium | **Complexity**: High | **Impact**: Medium

**Problem**: `fdcstream.js` uses ES6 `class` syntax while `index.js` (Connection) and `lib/record.js` use the older ES5 constructor-function-with-prototype pattern. This is a stylistic inconsistency that increases cognitive load for contributors unfamiliar with both patterns.

**Target design for `Record`**:
```js
class Record {
  constructor(data) {
    this.attributes = {};
    this._changed   = new Set();
    this._previous  = {};
    this._fields    = Object.entries(data).reduce(/* ... same logic ... */);
  }

  static fromResponse(data) {
    const rec = new Record(data);
    rec.reset();
    return rec;
  }

  get(field) { /* ... */ }
  set(field, value) { /* ... */ }
  // ... all existing prototype methods as class methods ...
}

module.exports = Record;
```

**Target design for `Connection`** (with prototype-mixin maintained):
```js
class Connection {
  constructor(opts) {
    // ... same body as the existing constructor function ...
  }
}

// Mixin remains valid with ES6 class:
Object.assign(Connection.prototype, httpMethods, authMethods, apiMethods);
```

**Steps**:
1. Convert `lib/record.js` first: translate `const Record = function(data) {...}` and all `Record.prototype.*` assignments to a `class Record { ... }` body.
2. Verify no external code reads `Record.prototype` directly.
3. Convert `index.js` Connection function to `class Connection`.
4. Verify the mixin `Object.assign(Connection.prototype, ...)` still works (it does; classes are syntactic sugar over prototypes in JS).
5. Run `npm test` after each conversion.

**Sequencing Note**: This is the lowest-priority item in Phase 3. It is purely stylistic and carries no functional benefit. Implement it last, after all functional improvements are in place and tests are green.

---

## Risk Assessment Summary

### High-Risk Recommendations

| Recommendation | Primary Risk | Mitigation |
|---|---|---|
| R18 (Separate private helpers) | External code may call `org._apiRequest()` etc. | Release as a major version bump; add deprecation warnings; maintain one-version shim |
| R19 (Sub-divide api.js) | Cross-module require graph changes; shared helper dependencies | Extract one module at a time; run tests between each extraction |
| R20 (Typed request objects) | All API method signatures change at the boundary | Migrate incrementally; start with retry context (R21) only |

### Medium-Risk Recommendations

| Recommendation | Primary Risk | Mitigation |
|---|---|---|
| R14 (Rename getBody to getBinaryContent) | Public API rename; downstream breakage | Emit deprecation warning from old name; keep shim for one major version |
| R17 (Move multipart into Record) | Requires adding `mime-types` dependency to record.js | Record already indirectly depends on the data; keep mime-types in a helper module that Record delegates to |
| R21 (Separate retry state) | Internal API change; verify no external callers depend on `opts._retryCount` | grep for `_retryCount` across all files first |
| R22 (ES6 class syntax) | Prototype-mixin pattern unchanged, but class syntax may confuse legacy tooling | Test across minimum supported Node.js version (>22 — no issue here) |

---

## Dependencies and Recommended Sequencing

```
Phase 1 (all independent, can be done in any order):
  R01 → R02 → R03 → R04 → R05 → R06 → R16

Phase 2 (R08 before R12; others independent):
  R07 (extract applyBody)
  R08 (extract resolveEndpoint)  ← before R12
  R09 (inline _resolveOAuth)
  R10 (fail-fast guard)
  R11 (makeOrg test helper)
  R12 (magic string constants)   ← after R08
  R13 (rename _getOpts param)
  R14 (rename getBody)

Phase 3 (strict ordering required):
  R21 (retry state separation)   ← prerequisite for R20
  R07 already done               ← prerequisite for R17
  R17 (multipart into Record)    ← prerequisite for R19
  R19 (subdivide api.js)         ← coordinate with R18
  R18 (hide private helpers)     ← last, after all modules stabilized
  R20 (typed request objects)    ← ongoing, can begin with R21 as first step
  R22 (ES6 class syntax)         ← truly last, purely cosmetic
```

---

## Before/After Code Summary

| File | Before | After | Technique |
|---|---|---|---|
| `lib/http.js` | Two 6-line AbortSignal blocks | `buildSignal(signal, timeout)` helper | Extract Method |
| `lib/http.js` | `opts._retryCount = 1` mutation | `_apiRequest(opts, 1)` second param | Remove Assignments to Parameters |
| `lib/http.js` | `opts._refreshResult = res` dead write | Deleted | Remove Dead Code |
| `lib/api.js` | Duplicate multipart/JSON conditional | `applyBody(opts, type, payloadFn)` | Extract Method |
| `lib/auth.js` | Three `environment === 'sandbox'` conditionals | `resolveEndpoint(env, prod, test)` | Extract Method, Consolidate Conditional |
| `lib/auth.js` | `_resolveOAuth` one-liner wrapper | `Promise.resolve(newOauth)` inline | Inline Method |
| `lib/api.js` | `_getOpts(d, ...)` | `_getOpts(input, ...)` | Rename Method (parameter) |
| `lib/api.js` | `getBody` name collision | `getBinaryContent` | Rename Method |
| `lib/errors.js` | `emptyResponse()` no `.type` | `.type = 'empty-response'` added | Error API alignment |
| `index.js` | `require('./package.json').sfdx.api` | `CONST.API` | Inline Temp |
| `test/connection.js` | 17 inline `createConnection(...)` blocks | `makeOrg(overrides)` helper | Extract Method |
| `lib/multipart.js` | Deep reach into Record internals | `record.toMultipartForm(isPatch)` | Move Method |
| `lib/api.js` | 503 lines, 8 concerns | Domain modules: crud, query, metadata, etc. | Extract Class (module) |
| `lib/constants.js` | `ENVS`, `MODES` arrays only | + `SANDBOX`, `SINGLE_MODE` named strings | Replace Magic Number with Symbolic Constant |
