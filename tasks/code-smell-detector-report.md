# Code Smell Detection Report

## Executive Summary

**Project**: nforce8 — Node.js REST API wrapper for Salesforce
**Analysis Date**: 2026-03-30
**Languages**: JavaScript (Node.js, CommonJS modules)
**Scope**: `lib/` (13 files), `index.js`, `test/` (9 files), `test/mock/` (2 files)
**Total Lines Analyzed**: ~4,515 (source + test)

**Overall Assessment**: The codebase is in good health for its domain. It is well-structured, uses modern JavaScript idioms, and has solid test coverage. The majority of issues are low-to-medium severity style and design concerns rather than architectural problems.

| Severity | Count |
|----------|-------|
| High (Architectural) | 3 |
| Medium (Design) | 11 |
| Low (Readability/Style) | 16 |
| **Total** | **30** |

---

## Project Analysis

**Languages & Frameworks Detected**
- JavaScript (ES2022+, `'use strict'`, CommonJS `require/module.exports`)
- Node.js >= 22.4.0 (native `fetch`, `WebSocket`, `AbortSignal`)
- Test framework: Mocha + should.js
- Coverage: NYC (Istanbul)
- Lint: ESLint 10 flat config

**Project Structure**
- `index.js` — Public API surface (99 lines, entry point)
- `lib/api.js` — All Salesforce REST API methods (649 lines)
- `lib/auth.js` — OAuth flows (300 lines)
- `lib/http.js` — HTTP layer using native `fetch` (200 lines)
- `lib/cometd.js` — CometD/Bayeux streaming client (535 lines)
- `lib/fdcstream.js` — High-level FDC streaming wrapper (137 lines)
- `lib/record.js` — SObject record with change tracking (233 lines)
- `lib/optionhelper.js` — Request options builder (98 lines)
- `lib/connection.js` — Options validation (93 lines)
- `lib/constants.js` — URLs, version constants (56 lines)
- `lib/util.js` — Type/header utilities (106 lines)
- `lib/multipart.js` — FormData builder (67 lines)
- `lib/plugin.js` — Plugin registration system (52 lines)
- `lib/errors.js` — Error factory functions (23 lines)

---

## High Severity Issues (Architectural Impact)

### 1. Global Mutable State in Mock Server — Data Dealers: Global Data

**File**: `test/mock/sfdc-rest-api.js` — Lines 5–6
**Category**: Data Dealers
**Smell**: Global Data / Mutable Data

```js
let serverStack = [];
let requestStack = [];
```

Both `serverStack` and `requestStack` are module-level mutable arrays shared across all tests that import this module. Because they are module-level (persisted via `require` cache), all test files sharing this mock are implicitly coupled through shared state. The `reset()` function only clears `requestStack`, not `serverStack`. A test that forgets to call `afterEach(() => api.reset())` can corrupt the state of the next test.

**SOLID Violation**: Single Responsibility Principle — the mock module conflates server lifecycle management with request capture and response configuration.

**Refactoring**: Convert to a class-based mock where each `before()` creates a fresh instance. This eliminates cross-test contamination and makes teardown explicit.

---

### 2. Implicit Prototype Mixin Architecture — Object-Oriented Abusers: Inappropriate Static / Divergent Change

**File**: `index.js` — Line 52
**Category**: Object-Oriented Abusers, Change Preventers
**Smell**: Divergent Change / Inappropriate use of prototype augmentation

```js
Object.assign(Connection.prototype, httpMethods, authMethods, apiMethods);
```

The `Connection` constructor function has its prototype augmented by three separate modules containing 30+ methods. This means any method in any of the three source modules becomes a public method of `Connection`. Changes to `auth.js`, `api.js`, or `http.js` all change the `Connection` surface area, which is a Divergent Change smell applied in reverse — the single class changes for three different reasons. The pattern also makes it impossible to know the complete interface of `Connection` without reading four files.

**SOLID Violations**:
- **Open/Closed Principle**: Adding new API methods requires modifying `api.js` and ensuring no name collisions with `http.js` or `auth.js` methods.
- **Interface Segregation Principle**: Callers receive a single object with 35+ methods across authentication, CRUD, query, streaming, and HTTP utilities. There is no ability to depend on a smaller interface.

**GRASP Violation**: Low Coupling — all three modules directly use `this._getOpts` and `this._apiRequest` from each other's domains, creating invisible runtime dependencies.

**Refactoring**: Consider the Facade pattern — expose sub-objects like `connection.auth`, `connection.api`, etc. Or document the intentional design as a deliberate API surface constraint and add an explicit module interface map.

---

### 3. Missing Error on `crypto` Global in Mock — Dead Code / Hidden Dependency

**File**: `test/mock/cometd-server.js` — Lines 201–206
**Category**: Functional Abusers: Hidden Dependencies
**Smell**: Hidden Dependency / Implicit Global

```js
const acceptKey = crypto
  .createHash('sha1')
  .update(key + '258EAFA5-E914-47DA-95CA-5AB5DC65C97B')
  .digest('base64');
```

`crypto` is used as a global variable but is never imported. The file only has `require('http')` at the top. In Node.js >= 22, the `crypto` module is available as a Web Crypto global (`globalThis.crypto`), but `globalThis.crypto.createHash` does not exist — only `globalThis.crypto.subtle` exists. The traditional Node.js `require('crypto').createHash` is a different API. This code will throw `ReferenceError: crypto is not defined` (or `TypeError: crypto.createHash is not a function`) at runtime whenever the WebSocket upgrade code path is exercised.

This is a latent bug currently hidden because the WebSocket code path requires a WebSocket client to initiate the upgrade, which is not always exercised in the test suite.

**Refactoring**: Add `const crypto = require('crypto');` at the top of the file.

---

## Medium Severity Issues (Design Problems)

### 4. Whitespace Missing After Assignment Operator — Inconsistent Style

**File**: `lib/api.js` — Lines 226, 240–241, 255–257, 271–272
**Category**: Lexical Abusers: Inconsistent Style
**Smell**: Inconsistent Style / Formatting

```js
const type =opts.sobject.getType();   // Line 226
const type =opts.sobject.getType();   // Line 240
const id =opts.sobject.getId();       // Line 241
const type =opts.sobject.getType();   // Line 255
const extId =opts.sobject.getExternalId(); // Line 257
const type =opts.sobject.getType();   // Line 271
const id =opts.sobject.getId();       // Line 272
```

Seven consecutive assignments are missing a space between `=` and the left-hand side token. All other assignments in the file use standard spacing (`const type = opts.sobject.getType()`). This is an inconsistent style smell that suggests copy-paste construction without a final formatting pass.

**Note**: ESLint `space-around-ops` or Prettier would catch this automatically.

---

### 5. Redundant Intermediate Variable in `createSObject` — Dispensables: Lazy Element

**File**: `index.js` — Lines 81–87
**Category**: Dispensables
**Smell**: Lazy Element (unnecessary intermediate variable)

```js
const createSObject = (type, fields) => {
  const data = fields || {};
  data.attributes = {
    type: type,
  };
  const rec = new Record(data);
  return rec;          // <-- rec is only used to return it
};
```

The variable `rec` is declared solely to be returned on the very next line. It adds no clarifying value and is a classic Lazy Element. The simpler form is `return new Record(data)`.

---

### 6. Unnecessary `Promise.resolve()` Wrapping — Functional Abusers: Dispensable Code

**File**: `lib/auth.js` — Lines 187, 133
**Category**: Dispensables
**Smell**: Redundant `Promise.resolve()` in a `.then()` chain

```js
// Line 187 (authenticate)
return Promise.resolve(newOauth);

// Line 133 (_notifyAndResolve)
return Promise.resolve(newOauth);
```

Both occurrences are inside `.then()` callbacks. A `.then()` callback's return value is already automatically wrapped in a resolved promise if it is not a promise itself. `return Promise.resolve(newOauth)` is functionally identical to `return newOauth` in this context but adds noise.

---

### 7. Duplicated Request-Building Logic — Duplicated Code

**File**: `lib/api.js` — Lines 85–92 (updatePassword), 221–231 (insert), 238–246 (update), 253–262 (upsert), 269–276 (delete)
**Category**: Dispensables
**Smell**: Duplicated Code

The pattern of `this._getOpts(data)`, resolve type/id, set `opts.resource`, set `opts.method`, call `this._apiRequest(opts)` repeats in nearly identical form across 15+ functions. While each function has a unique resource path and method, the structural scaffolding is boilerplate. The `applyBody` helper already partially addresses this for CRUD methods. The `_urlRequest` private helper already demonstrates that this refactoring can be applied. Consider a more generalized request-builder that composes resource, method, and body from declarative specs.

---

### 8. `_queryHandler` Closes Over Mutable External Array — Data Dealers: Mutable Data

**File**: `lib/api.js` — Lines 429–460
**Category**: Data Dealers
**Smell**: Mutable Data / Side Effects

```js
const _queryHandler = function (data) {
  const recs = [];       // mutable accumulator
  ...
  const handleResponse = (respCandidate) => {
    ...
    resp.records.forEach((r) => {
      recs.push(opts.raw ? r : Record.fromResponse(r));  // mutates outer array
    });
    ...
    resp.records = recs;  // mutates the API response object too
    return resp;
  };
```

The `recs` array is declared in the outer function and mutated by the inner `handleResponse` closure across potentially multiple recursive calls (when `fetchAll: true`). Mutating `resp.records` also modifies the API response object in place rather than returning a new object. For single-page queries this is harmless, but the pattern is fragile: if `handleResponse` is ever called concurrently or reused, the accumulated `recs` state would be incorrect.

**Refactoring**: Carry the accumulator as an explicit parameter to `handleResponse` rather than closing over a mutable variable.

---

### 9. `_notifyAndResolve` Uses Callback-in-Promise Anti-Pattern — Change Preventers: Callback Hell

**File**: `lib/auth.js` — Lines 124–134
**Category**: Change Preventers
**Smell**: Callback Hell (mixing callback and Promise styles within async API)

```js
const _notifyAndResolve = function (newOauth, oldOauth) {
  if (this.onRefresh) {
    return new Promise((resolve, reject) => {
      this.onRefresh.call(this, newOauth, oldOauth, (err) => {  // callback inside Promise
        if (err) reject(err);
        else resolve(newOauth);
      });
    });
  }
  return Promise.resolve(newOauth);
};
```

The `onRefresh` API surface is callback-based (the function receives `(newOauth, oldOauth, callback)`) while the rest of the library is promise-based. This is an inconsistency that forces users who implement `onRefresh` to use old-style callbacks, and creates a seam where callback errors must be manually promisified. The test for this in `test/connection.js` lines 284–297 confirms the callback contract is tested and intentional, but it represents a mixed paradigm in an otherwise promise-only library.

**Refactoring**: Accept `onRefresh` as either a callback or a function returning a Promise, using `Promise.resolve(this.onRefresh(...))` and gracefully handling both patterns.

---

### 10. `upsert` Does Not Use `applyBody` Helper — Oddball Solution

**File**: `lib/api.js` — Lines 253–262
**Category**: Other: Oddball Solution
**Smell**: Inconsistent approach to the same problem

```js
const upsert = function (data) {
  const opts = this._getOpts(data);
  ...
  opts.body = JSON.stringify(opts.sobject.toPayload());  // direct serialization
  return this._apiRequest(opts);
};
```

The `insert` and `update` functions use the `applyBody(opts, type, payloadFn)` helper to correctly handle multipart content types for Document/Attachment/ContentVersion SObjects. The `upsert` function bypasses `applyBody` and directly sets `opts.body`, meaning that upserting a Document or ContentVersion with binary data would silently produce an incorrect JSON-only request body instead of the required multipart form.

**Impact**: Functional bug risk for multipart upsert operations.

---

### 11. `getAuthUri` Builds Options Object with Conditional Property Mutation — Conditional Complexity

**File**: `lib/auth.js` — Lines 67–115
**Category**: Obfuscators: Conditional Complexity
**Smell**: Conditional Complexity (8 sequential if-blocks)

```js
const getAuthUri = function (opts = {}) {
  let urlOpts = { response_type, client_id, redirect_uri };
  if (opts.display) { ... }
  if (opts.immediate) { ... }
  if (opts.scope) { if (Array.isArray) ... else ... }
  if (opts.state) { ... }
  if (opts.nonce) { ... }
  if (opts.prompt) { if (Array.isArray) ... else ... }
  if (opts.loginHint) { ... }
  if (opts.urlOpts) { ... }
  return endpoint + '?' + new URLSearchParams(urlOpts).toString();
};
```

Eight consecutive conditional blocks all perform the same operation (conditionally copying a property from `opts` to `urlOpts`). The pattern is highly regular and can be collapsed using a declarative mapping:

```js
const copyIfPresent = ['display', 'immediate', 'scope', 'state', 'nonce', 'prompt'];
```

Combined with `URLSearchParams` which already handles arrays, this could reduce to a few lines.

---

### 12. Mixed Quote Styles in `cometd.js` vs Rest of Codebase — Inconsistent Style

**File**: `lib/cometd.js` — Multiple lines
**Category**: Lexical Abusers: Inconsistent Style
**Smell**: Inconsistent Style

The file `lib/cometd.js` uses double-quoted strings (`"use strict"`, `"Content-Type"`, `"websocket"`, `"long-polling"`) throughout, while all other library files consistently use single quotes (`'use strict'`, `'content-type'`). The ESLint config enforces single quotes (`quotes: ['error', 'single']`). This suggests `cometd.js` was written or ported with different style settings and may not be passing lint cleanly.

---

### 13. `_connectWebSocket` Promise Never Rejects on Error — Afraid to Fail

**File**: `lib/cometd.js` — Lines 229–267
**Category**: Other: Afraid to Fail
**Smell**: Silent error absorption

```js
_connectWebSocket() {
  return new Promise((resolve) => {  // no reject parameter
    ...
    this._ws.addEventListener("error", () => {
      if (!this._connected) {
        // Failed to connect — fall back to long-polling
        this._transport = "long-polling";
        this._ws = null;
        resolve();   // <-- resolves silently even on error
      }
    });
  });
}
```

The `error` event handler silently falls back to long-polling and resolves the promise. The caller in `connect()` also wraps this in a try/catch that similarly swallows errors and falls back. While graceful degradation is intentional, there is no mechanism for callers to know that WebSocket negotiation failed — the `transport:up` event fires whether or not WebSocket was actually used, and no `warning` or `info` event is emitted.

---

### 14. `respToJson` is a Private Helper Exported by Naming Convention Only — Indecent Exposure

**File**: `lib/api.js` — Lines 417–426
**Category**: Object-Oriented Abusers: Indecent Exposure
**Smell**: Internal implementation detail not protected from external access

```js
const respToJson = (respCandidate) => { ... };
```

`respToJson` is not exported, which is correct. However, several internal helpers follow no consistent naming convention. Some private methods are prefixed with `_` (e.g., `_getOpts`, `_apiRequest`, `_apiAuthRequest`, `_queryHandler`) while others are not (`respToJson`, `resolveId`, `resolveType`, `sobjectPath`, `applyBody`, `requireForwardSlash`). These module-private functions are not accessible externally due to CommonJS scoping, but the inconsistency makes it unclear which helpers are candidates for future export.

---

## Low Severity Issues (Readability / Maintenance)

### 15. `let` Used for Variables That Are Never Reassigned — Uncommunicative Name / Style

**File**: `lib/cometd.js` — Lines 75, 90
**File**: `lib/api.js` — Lines 19, 444
**File**: `lib/optionhelper.js` — Lines 88, 90
**File**: `lib/auth.js` — Line 68
**File**: `lib/util.js` — Line 14
**Category**: Lexical Abusers: Inconsistent Style

```js
// lib/cometd.js:75
let msg = message;      // msg is reassigned in the for-loop below — correct use of let

// lib/api.js:19
let data = {};          // data IS reassigned (line 23 or 25) — correct use of let

// lib/optionhelper.js:88
let result = new URL(opts.uri);   // result is never reassigned — should be const

// lib/optionhelper.js:90
let params = opts.qs;             // params is never reassigned — should be const

// lib/auth.js:68
let urlOpts = { ... };            // urlOpts IS mutated with property assignment — acceptable

// lib/util.js:14
let headerContent;                // headerContent IS conditionally reassigned — correct
```

`lib/optionhelper.js` lines 88 and 90 use `let` for values that are never reassigned, which should be `const`. Using `const` where possible communicates immutability intent clearly.

---

### 16. `What Comment` — Comments Explaining "What" Instead of "Why"

**File**: `lib/api.js` — Lines 196–198
**File**: `lib/cometd.js` — Lines 350–351, 361–362
**Category**: Other: What Comment

```js
/*
 * CRUD methods
 */

// Apply advice interval before next connect

// Dispatch any data messages piggybacked on the connect response
```

These comments describe the obvious code operation ("CRUD methods" before CRUD methods, "apply advice interval" before a delay call). More valuable comments would explain *why* this code structure was chosen — e.g., why the advice interval must be applied between connect loops, or why data messages may be piggybacked on connect responses (CometD protocol reasoning).

---

### 17. `Fallacious Comment` — Doc Comment Says "discovered on the header" but Is Unclear

**File**: `lib/api.js` — Lines 413–415
**Category**: Lexical Abusers: Fallacious Comment

```js
/**
 * If it hasn't been discovered on the header, try to convert it to object here.
```

The phrase "discovered on the header" is opaque. The actual intent is: "if the response body was not automatically parsed as JSON (based on Content-Type header), attempt manual parsing." The comment's use of "header" is ambiguous — it could mean response header, file header, or section header.

---

### 18. Test Uses `should.not.exist(err)` in `.catch()` as Error Suppressor — Afraid to Fail (Test Smell)

**File**: `test/crud.js` — Lines 68–70, 93–95, 123, 146
**File**: `test/query.js` — Multiple lines
**Category**: Other: Afraid to Fail

```js
.catch((err) => should.not.exist(err))
.finally(() => done());
```

This pattern appears 13 times across test files. The intent is to fail the test if an error is thrown, but the pattern is fragile: `.catch()` receives the error and `should.not.exist(err)` throws a new assertion error. However, this new error is swallowed by `.finally()` which unconditionally calls `done()`. In practice, the test will pass even if `should.not.exist` throws, because `done()` is called without the error.

The correct pattern for Mocha promise-based tests is simply `return promise` (Mocha 6+ handles promise rejections as failures), or `return promise.should.be.fulfilled()`.

**Impact**: Tests that should fail on unexpected errors may pass silently.

---

### 19. Integration Test Uses `describe.skip` Pattern With Redundant Dead Code

**File**: `test/integration.js` — Lines 7–21
**Category**: Dispensables: Dead Code

```js
let client = undefined;   // initialization to undefined is unnecessary

(checkEnvCredentials() ? describe : describe.skip)(
  'Integration Test against an actual Salesforce instance',
  () => {
    before(() => {
      let creds = checkEnvCredentials();  // checkEnvCredentials called a second time
      if (creds == null) {
        // Can't run integration tests
        // Mocha.suite.skip();           // commented-out dead code
```

Issues:
1. `let client = undefined` — explicit `undefined` initialization adds noise; `let client;` suffices
2. `checkEnvCredentials()` is called twice: once at the describe level and once inside `before()`. The second call is redundant since if it returned falsy at describe-time, the entire suite is skipped.
3. The commented-out `// Mocha.suite.skip()` is dead code that should be removed.

---

### 20. `findId` Hard-Codes Three String Variants of "id" — Magic Number / Primitive Obsession

**File**: `lib/util.js` — Lines 58–63
**Category**: Lexical Abusers: Magic Number, Data Dealers: Primitive Obsession

```js
const flavors = ['Id', 'id', 'ID'];

for (let flavor of flavors) {
  if (data[flavor]) {
    return data[flavor];
  }
}
```

The array `['Id', 'id', 'ID']` is an inline magic literal. The name `flavors` is also slightly uncommunicative — `ID_VARIANTS` or `ID_FIELD_NAMES` would be clearer. Additionally, `if (data[flavor])` is falsy-checking: if a Salesforce ID were somehow `0` or an empty string, it would be skipped. For IDs this is practically impossible, but `data[flavor] !== undefined` would be more semantically precise.

---

### 21. `checkHeaderCaseInsensitive` Name Complexity — Uncommunicative / Long Name

**File**: `lib/util.js` — Line 11
**Category**: Lexical Abusers: Uncommunicative Name

```js
const checkHeaderCaseInsensitive = (headers, key, searchfor) => {
```

`checkHeaderCaseInsensitive` is verbose. The parameter `searchfor` is non-standard (typically `searchFor` or `substring`). The function is private and does a substring search — a more descriptive name would be `headerContains(headers, key, substring)`.

---

### 22. `_apiAuthRequest` Directly Embeds OAuth Cache Side Effect — Mutable Data / Side Effects

**File**: `lib/http.js` — Lines 139–141
**Category**: Data Dealers: Mutable Data, Functional Abusers: Side Effects

```js
.then((jBody) => {
  if (jBody.access_token && this.mode === CONST.SINGLE_MODE) {
    Object.assign(this.oauth || (this.oauth = {}), jBody);  // side effect: mutates this.oauth
  }
  return jBody;
});
```

The HTTP layer (`http.js`) directly modifies `this.oauth` on the connection object as a side effect of any successful auth request. This couples the transport layer to connection state management. The mutation `(this.oauth = {})` inside the `||` expression is particularly obscure — it simultaneously assigns and uses the assignment as a fallback, making the code harder to read. The side effect violates the principle that HTTP request functions should return data and let callers decide what to do with it.

---

### 23. `_connectLoop` Silently Suppresses All Catch Errors — Afraid to Fail

**File**: `lib/cometd.js` — Lines 365–370
**Category**: Other: Afraid to Fail

```js
} catch {
  if (this._disconnecting) return;
  this._connected = false;
  this.emit("transport:down");
  this._scheduleReconnect();
  return;
}
```

The `catch` block in `_connectLoop` catches all errors from the connect loop iteration with no logging or error event. The error is completely dropped. While `transport:down` is emitted and reconnection is scheduled, consumers have no way to inspect what error caused the disconnect. Consider emitting the error alongside `transport:down`, or buffering the last error for inspection.

---

### 24. `_scheduleReconnect` Duplicates Subscription Re-Subscribe Logic — Duplicated Code

**File**: `lib/cometd.js` — Lines 395–425
**File**: `lib/cometd.js` — Lines 378–390 (`_rehandshake`)

Both `_scheduleReconnect` (line 416–420) and `_rehandshake` (lines 382–386) contain the exact same loop:

```js
for (const topic of this._subscriptions.keys()) {
  await this._sendSubscribe(topic);
}
```

This duplicated re-subscription logic should be extracted into a `_resubscribeAll()` method.

---

### 25. `_handleWsUpgrade` Creates Mock WebSocket Wrapper With Inline `require` — Clever Code

**File**: `test/mock/cometd-server.js` — Line 277
**Category**: Obfuscators: Clever Code

```js
const emitter = new (require('events').EventEmitter)();
```

An inline `require()` inside a method body is unusual. `EventEmitter` should be required once at the top of the file with `const EventEmitter = require('events').EventEmitter` or `const { EventEmitter } = require('events')`. The inline form is a minor cleverness that adds friction when reading.

---

### 26. `getAuthUri` Converts Scope/Prompt Arrays to Space-Joined Strings but URLSearchParams Will Encode Differently

**File**: `lib/auth.js` — Lines 83–103
**Category**: Obfuscators: Obscured Intent

```js
if (opts.scope) {
  if (Array.isArray(opts.scope)) {
    urlOpts.scope = opts.scope.join(' ');
  } else {
    urlOpts.scope = opts.scope;
  }
}
```

The manual `join(' ')` followed by `URLSearchParams` encoding produces `scope=visualforce+web` (plus-encoded space). The test at `test/connection.js:204` confirms this with `uri.should.match(/.*scope=visualforce(\+|%20)web.*/)`. The ambiguity in the regex (`+` or `%20`) hints at uncertainty about the encoding behavior. Consider documenting the encoding contract or using `URLSearchParams`'s built-in array handling if supported.

---

### 27. Test File Accesses Private `_fields`, `_changed`, `_previous` Properties Directly

**File**: `test/record.js` — Lines 41, 49, 109, 117, 172
**File**: `test/connection.js` — Line 147–150
**Category**: Couplers: Insider Trading

```js
// test/record.js:41
Object.keys(acc._fields).forEach(function (key) { ... });

// test/record.js:49
acc._changed.size.should.equal(2);

// test/connection.js:148
obj._fields.should.have.property('name');
obj._fields.name.should.equal('Test Me');
obj._getPayload(false);
```

Tests directly access `_fields`, `_changed`, `_previous`, and `_getPayload` (a private-by-convention method). This tightly couples tests to internal implementation details, meaning any refactoring of Record internals — even while preserving the public API — requires updating tests. The `_getPayload` method is also called directly in tests, which is intentional for coverage but means the "private" prefix is effectively ignored.

---

### 28. `plugin.js` Accepts Both String and Object Input — Flag Argument / Inconsistent API

**File**: `lib/plugin.js` — Lines 35–39
**Category**: Obfuscators: Flag Argument, Lexical Abusers: Inconsistent Names

```js
const plugin = (opts) => {
  if (typeof opts === 'string') {
    opts = { namespace: opts };
  }
  ...
};
```

The `plugin()` function accepts either a string (namespace only) or an object with a `namespace` property. This dual-input API creates implicit overloading and can obscure intent at call sites. The test in `test/plugin.js` exercises both forms. A more explicit API would be `plugin(namespace, options = {})`.

---

### 29. `getFullUri` Returns a `URL` Object but Callers Pass It to `fetch` — Implicit Type Contract

**File**: `lib/optionhelper.js` — Lines 87–96
**File**: `lib/http.js` — Line 161
**Category**: Other: Obscured Intent

```js
// optionhelper.js
function getFullUri(opts) {
  let result = new URL(opts.uri);   // returns URL object
  ...
  return result;
}

// http.js
const uri = optionHelper.getFullUri(ropts);  // receives URL object
return fetch(uri, ropts);                     // passes URL object to fetch
```

The function name `getFullUri` implies it returns a string URI, but it returns a `URL` object. While `fetch` accepts both `string` and `URL`, the naming creates a mismatch between expectation and reality. Consider renaming to `buildUrl` or `getFullUrl` to match the actual return type.

---

### 30. `constants.js` Comment Is a Manual Reminder Rather Than Automation

**File**: `lib/constants.js` — Line 16
**Category**: Other: What Comment / Technical Debt Marker

```js
// This needs update for each SFDC release!
const API_PACKAGE_VERSION = require('../package.json').sfdx.api;
```

The comment "This needs update for each SFDC release!" is a manual process reminder embedded in code. The `package.json` approach of reading `sfdx.api` and allowing `SFDC_API_VERSION` environment variable override is actually a reasonable automated solution. The comment is therefore misleading — the real update procedure is editing `package.json`, not this line. The comment should be updated or removed.

---

## Detailed Findings by File

### `lib/api.js` — 7 issues
- **Whitespace missing after `=`** (Lines 226, 240, 241, 255, 257, 271, 272): Medium — Inconsistent Style
- **`respToJson` helper** (Lines 417–426): Low — unclear comment
- **`_queryHandler` mutable closure** (Lines 429–460): Medium — Mutable Data
- **Duplicated request scaffolding** (Multiple): Medium — Duplicated Code
- **`upsert` bypasses `applyBody`** (Lines 253–262): Medium — Oddball Solution / Bug Risk
- **`getUrl`/`putUrl`/`postUrl`/`deleteUrl` as thin wrappers**: Low — Middle Man (minor)
- **`respToJson` naming**: Low — Uncommunicative Name

### `lib/auth.js` — 4 issues
- **`_notifyAndResolve` mixes callback/Promise** (Lines 124–134): Medium — Callback Hell
- **Redundant `Promise.resolve()`** (Lines 133, 187): Medium — Dispensable Code
- **`getAuthUri` conditional complexity** (Lines 67–115): Medium — Conditional Complexity
- **Scope/prompt array encoding ambiguity** (Lines 83–103): Low — Obscured Intent

### `lib/http.js` — 2 issues
- **`_apiAuthRequest` OAuth mutation side effect** (Lines 139–141): Medium — Side Effects
- **`responseFailureCheck` placed above doc comment block** (Line 13): Low — formatting

### `lib/cometd.js` — 4 issues
- **Double-quoted strings** (Multiple): Medium — Inconsistent Style
- **`_connectWebSocket` swallows WebSocket errors** (Lines 247–254): Medium — Afraid to Fail
- **`_connectLoop` catch drops error** (Lines 365–370): Low — Afraid to Fail
- **Duplicated re-subscription loop** (Lines 382–386, 416–420): Low — Duplicated Code

### `lib/optionhelper.js` — 2 issues
- **`let` instead of `const`** (Lines 88, 90): Low — Inconsistent Style
- **`getFullUri` returns URL but named as URI** (Lines 87–96): Low — Uncommunicative Name

### `lib/util.js` — 2 issues
- **`checkHeaderCaseInsensitive` verbose name** (Line 11): Low — Uncommunicative Name
- **`findId` inline magic array** (Lines 58–63): Low — Magic Literal

### `lib/record.js` — 0 significant issues
This file is well-designed. The change-tracking with `Set` and `_previous` object is clean and explicit.

### `lib/constants.js` — 1 issue
- **Misleading update comment** (Line 16): Low — What Comment

### `lib/plugin.js` — 1 issue
- **Dual-input API** (Lines 35–39): Low — Flag Argument

### `lib/connection.js` — 0 significant issues
Clean validation module.

### `lib/errors.js` — 0 significant issues
Minimal and appropriate.

### `lib/fdcstream.js` — 0 significant issues
Clean adapter pattern.

### `lib/multipart.js` — 0 significant issues
Clear and focused.

### `index.js` — 2 issues
- **Prototype mixin architecture** (Line 52): High — Divergent Change / ISP violation
- **Redundant intermediate variable in `createSObject`** (Lines 85–86): Low — Lazy Element

### `test/mock/sfdc-rest-api.js` — 1 issue
- **Module-level global mutable state** (Lines 5–6): High — Global Data

### `test/mock/cometd-server.js` — 2 issues
- **Missing `crypto` import** (Lines 201–206): High — Hidden Dependency / Latent Bug
- **Inline `require` in method** (Line 277): Low — Clever Code

### `test/crud.js` — 1 issue
- **`.catch((err) => should.not.exist(err))` pattern** (Lines 68, 93, 123, 146): Medium — Afraid to Fail

### `test/query.js` — 1 issue
- **`.catch((err) => should.not.exist(err))` pattern** (9 occurrences): Medium — Afraid to Fail

### `test/record.js` — 1 issue
- **Direct access to private `_fields`, `_changed`, `_previous`** (Lines 41, 49, 109): Low — Insider Trading

### `test/connection.js` — 1 issue
- **Direct access to `_fields` and `_getPayload`** (Lines 147–150): Low — Insider Trading

### `test/integration.js` — 1 issue
- **Dead code and redundant call** (Lines 7–21): Low — Dead Code

---

## SOLID Principle Compliance

| Principle | Score (0–10) | Notes |
|-----------|-------------|-------|
| **S** — Single Responsibility | 7/10 | Each module has a clear domain, but `api.js` (649 lines) spans CRUD, query, search, streaming, and URL helpers. The prototype mixin blurs responsibility on `Connection`. |
| **O** — Open/Closed | 7/10 | Plugin system is extensible without modification. Adding new API methods requires touching `api.js`. |
| **L** — Liskov Substitution | 9/10 | No inheritance hierarchies; records behave consistently. |
| **I** — Interface Segregation | 6/10 | `Connection` exposes 35+ methods as a single flat object. Consumers cannot depend on a subset interface. |
| **D** — Dependency Inversion | 7/10 | HTTP layer is reasonably abstracted. `_apiRequest`/`_apiAuthRequest` are injectable via prototype. `cometd.js` uses native `fetch` and `WebSocket` globals directly. |

---

## GRASP Principle Compliance

| Principle | Assessment |
|-----------|-----------|
| **Information Expert** | Good — `Record` owns its own field logic; `optionhelper` owns URI construction. |
| **Creator** | Acceptable — `createSObject` in `index.js` creates Records; `createStreamClient` creates streaming clients. |
| **Controller** | `Connection` acts as the system controller for all Salesforce operations — clear boundary. |
| **Low Coupling** | Moderate — `api.js` methods implicitly depend on `this._getOpts`, `this._apiRequest` from http module. |
| **High Cohesion** | `api.js` has lower cohesion (CRUD + query + search + streaming). Other modules are cohesive. |
| **Polymorphism** | Limited OOP — no polymorphism needed in this domain-specific library. |
| **Pure Fabrication** | `optionhelper`, `multipart`, `errors` are appropriate pure fabrications without domain coupling. |
| **Indirection** | Good — `http.js` provides indirection over `fetch`. `fdcstream.js` provides indirection over `cometd.js`. |
| **Protected Variations** | Plugin system protects against future extension needs. API version as config protects against API changes. |

---

## Impact Assessment

**Total Issues**: 30
**Breakdown by Severity**:
- High Severity: 3 (Architectural / Latent Bug)
- Medium Severity: 11 (Design Impact)
- Low Severity: 16 (Readability/Maintenance)

**Breakdown by Category**:
- Lexical Abusers (Naming/Style): 7
- Data Dealers (Mutable/Global Data): 5
- Dispensables (Dead/Redundant Code): 5
- Functional Abusers (Side Effects): 3
- Object-Oriented Abusers: 2
- Change Preventers: 2
- Obfuscators: 3
- Couplers: 2
- Other: 1

---

## Recommendations and Refactoring Roadmap

### Phase 1 — Immediate (Bugs and High Risk)

1. **Add `const crypto = require('crypto');`** to `test/mock/cometd-server.js` — this is a latent `ReferenceError` waiting to surface when WebSocket tests run in environments where `globalThis.crypto.createHash` is undefined.

2. **Fix `.catch((err) => should.not.exist(err)).finally(done)` test pattern** in `test/crud.js` and `test/query.js` — replace with `return promise` (Mocha handles promise rejections) or use `.should.be.fulfilled()`.

3. **Fix `upsert` to use `applyBody` helper** in `lib/api.js` line 260 — this prevents a silent bug where upserting binary SObjects (Document/ContentVersion) produces incorrect JSON-only requests.

### Phase 2 — Short-Term (Medium Severity Design)

4. **Fix whitespace in assignments** in `lib/api.js` lines 226, 240–241, 255–257, 271–272 — add spaces after `=`.

5. **Extract `_resubscribeAll()` method** in `lib/cometd.js` — eliminate the duplicated subscription re-subscription loop.

6. **Convert `cometd.js` to single-quoted strings** to match the rest of the codebase and satisfy the ESLint `quotes` rule.

7. **Replace mutable query accumulator** in `_queryHandler` with functional reduce or explicit parameter passing.

8. **Remove redundant `Promise.resolve(newOauth)` wrapping** in `lib/auth.js` — return `newOauth` directly in `.then()` callbacks.

### Phase 3 — Long-Term (Architectural Improvements)

9. **Consider whether `api.js` should be split** — CRUD methods, query/search, streaming setup, and utility URL methods are distinct concerns. A split would improve cohesion even if the public API surface stays the same.

10. **Migrate `onRefresh` to accept both callback and Promise** — reduces friction for library users who prefer the Promise-only API already offered everywhere else.

11. **Refactor mock server to class-based isolation** — eliminate module-level global state in `test/mock/sfdc-rest-api.js`.

---

## Prevention Strategies

- **Formatting**: Add Prettier or enforce `eslint --fix` in pre-commit hooks to prevent spacing inconsistencies.
- **Quote style**: Configure ESLint to auto-fix `cometd.js` quote style.
- **Test patterns**: Add an ESLint custom rule or code review checklist item for the `.catch(should.not.exist)` anti-pattern.
- **API contracts**: Add JSDoc `@returns` type annotations to all public methods, making the `URL` vs `string` return type of `getFullUri` explicit and detectable.

---

## Appendix: Analyzed Files

| File | Lines | Issues Found |
|------|-------|-------------|
| `index.js` | 99 | 2 |
| `lib/api.js` | 649 | 7 |
| `lib/auth.js` | 300 | 4 |
| `lib/http.js` | 200 | 2 |
| `lib/cometd.js` | 535 | 4 |
| `lib/fdcstream.js` | 137 | 0 |
| `lib/record.js` | 233 | 0 |
| `lib/optionhelper.js` | 98 | 2 |
| `lib/connection.js` | 93 | 0 |
| `lib/constants.js` | 56 | 1 |
| `lib/util.js` | 106 | 2 |
| `lib/multipart.js` | 67 | 0 |
| `lib/plugin.js` | 52 | 1 |
| `lib/errors.js` | 23 | 0 |
| `test/crud.js` | 273 | 1 |
| `test/query.js` | 204 | 1 |
| `test/record.js` | 379 | 1 |
| `test/connection.js` | 324 | 1 |
| `test/errors.js` | 122 | 0 |
| `test/streaming.js` | 355 | 0 |
| `test/plugin.js` | 108 | 0 |
| `test/util.js` | 47 | 0 |
| `test/integration.js` | 55 | 1 |
| `test/mock/sfdc-rest-api.js` | 131 | 1 |
| `test/mock/cometd-server.js` | 466 | 2 |

**Detection Methodology**: Manual static analysis using the comprehensive code smell catalog from Luzkan (2022), cross-referenced against Martin Fowler (1999/2018), Robert C. Martin (2008), and William C. Wake (2004). Language-specific thresholds applied for JavaScript/Node.js.

**Excluded**: `examples/` (documented as snippet-style scripts not subject to standard lint rules), `node_modules/`, generated coverage reports.
