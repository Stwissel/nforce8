# Code Refactoring Report — nforce8

**Generated**: 2026-03-23
**Analyzer**: Claude Sonnet 4.6 (Refactoring Expert)
**Source report**: code-smell-detector-report.md
**Codebase state**: Node 22+, 9 source files (1,627 LOC), 91 tests passing, 2 runtime dependencies (faye, mime-types)

---

## Executive Summary

The nforce8 codebase is in materially better shape following the recent refactoring sprint (lodash/node-fetch removal, Promise anti-pattern elimination, auto-refresh restructuring, bug fixes, dead code removal). The remaining debt splits into three clear tiers:

1. **One broken feature** (H3 — multipart upload sends no body)
2. **One correctness bug** (L4 — `previous()` returns wrong value for falsy fields) and **one silent misconfiguration** (M2 — timeout never enforced on API requests)
3. **Structural/architectural debt** (H1+H2 — God Object and orphaned parallel class) with supporting cleanup items

**20 distinct refactoring recommendations** are produced below, organized into four phases. Phase 1 items fix broken or incorrect behavior. Phase 2 items are mechanical quick wins with no design implications. Phase 3 items address design and consistency. Phase 4 is the architectural decomposition.

**Total recommendations**: 20
**Phase 1 — Fix Broken/Incorrect Behavior (3 items)**: Must-fix; directly affect callers
**Phase 2 — Mechanical Quick Wins (8 items)**: Zero to trivial risk; apply in one session
**Phase 3 — Design and Consistency (6 items)**: Low-medium risk; improve long-term quality
**Phase 4 — Architectural (3 items)**: High effort; highest long-term impact

---

## Validation Notes

All 18 findings from the code-smell-detector were validated against the live source files (commit `ba2fc3b`, branch `develop`). Key confirmations:

- `lib/multipart.js` returns a plain array (`[]`) in `request`-library format. `optionhelper.js:66-68` copies only `opts.body` to `ropts.body` — `opts.multipart` is never assigned to the body. The manual `content-type: multipart/form-data` header is set on line 55 but `fetch` receives a request with no body. **Confirmed broken.**
- `_apiRequest` (index.js:801-843) calls `optionHelper.getApiRequestOptions(opts)` which copies `opts.timeout` to `ropts.timeout` (optionhelper.js:81-83). Native `fetch` has no `timeout` property — this is silently ignored. `AbortSignal.timeout` is only applied in `_apiAuthRequest` (index.js:767-773). **Confirmed: all non-auth API calls have no timeout.**
- `Record.prototype.previous` line 147: `if (this._previous[field])` — truthiness check fails for `0`, `''`, `false`, `null`. **Confirmed bug.**
- `require('querystring')` at index.js:3, used at lines 190, 242, 287, and 461. **Confirmed deprecated module still present.**
- `new url.URL(opts.uri)` at optionhelper.js:89 uses the `url` module imported at line 4. `URL` is a Node 22 global. **Confirmed unnecessary require.**
- `lib/record.js:_changed` is initialized as `[]` (line 5), pushed to (line 12, 49), checked with `.includes()` (lines 48, 128, 175). **Confirmed O(n) Set-solvable.**
- `Record.prototype.hasChanged` lines 122-133: 12-line nested if/else/if for a 3-case predicate. **Confirmed unnecessary complexity.**
- `Connection.prototype._getOpts` parameter `c` (line 96): every call site in the codebase passes `null` as the second argument. `data.callback = callback` is set at line 115 but `callback` is always `null`. **Confirmed dead code.**
- `getVersions` line 352: `'http://na1.salesforce.com/services/data/'` — HTTP not HTTPS, hardcoded pod, ignores `instance_url`. **Confirmed.**
- `fdcstream.js:70`: `this._extensionEnabled = true` inside `replayExtension.incoming`, a plain `function` — `this` refers to `replayExtension`, not `Client`. Property never read anywhere. **Confirmed dead assignment to wrong object.**
- `'use strict'` absent from `lib/record.js`, `lib/util.js`, `lib/errors.js`, `lib/fdcstream.js`, `lib/multipart.js`. **Confirmed.**
- `_changed` as `Array` vs `Set`, `self = this` pattern, `_getPayload(bool)` flag argument, mixed class styles — all confirmed as described in the smell report.

---

## Phase 1 — Fix Broken or Incorrect Behavior

These three items affect observable behavior for callers. Apply before any other changes.

---

### R01 — Rewrite Multipart Upload to Use FormData

**Smell**: H3 — Broken Feature (Functional Abuser)
**Refactoring Technique**: Substitute Algorithm (1.9)
**Priority**: Critical
**Effort**: Medium (2–3 hours including a test)
**Risk**: Medium — changes the wire format for Document, Attachment, ContentVersion insert/update

**Problem**

`lib/multipart.js` returns an array of part-descriptor objects in the format used by the deprecated `request` npm library. `index.js` assigns this to `opts.multipart`. `optionhelper.js` detects `opts.multipart` and sets `Content-Type: multipart/form-data` but never assigns the array to `ropts.body`. Native `fetch` therefore sends a multipart-typed request with no body. Even if the array were transferred, `fetch` requires a `FormData` instance, not a plain array.

**Before** (`lib/multipart.js`):

```javascript
const multipart = function (opts) {
  const type = opts.sobject.getType();
  const entity = type === 'contentversion' ? 'content' : type;
  const name = type === 'contentversion' ? 'VersionData' : 'Body';
  const fileName = opts.sobject.getFileName();
  const isPatch = opts.method === 'PATCH';
  const multipart = [];

  multipart.push({
    'content-type': 'application/json',
    'content-disposition': 'form-data; name="entity_' + entity + '"',
    body: JSON.stringify(opts.sobject._getPayload(isPatch))
  });

  multipart.push({
    'content-type': mimeTypes.lookup(fileName) || 'application/octet-stream',
    'content-disposition':
      'form-data; name="' + name + '"; filename="' + fileName + '"',
    body: opts.sobject.getBody()
  });

  return multipart;  // <-- array, not FormData
};
```

**Before** (`lib/optionhelper.js`, lines 54–68):

```javascript
if (opts.multipart) {
  ropts.headers['content-type'] = 'multipart/form-data';  // manual override
} else {
  ropts.headers['content-type'] = 'application/json';
}
// ...
if (opts.body) {
  ropts.body = opts.body;  // opts.multipart never transferred
}
```

**After** (`lib/multipart.js`):

```javascript
const mimeTypes = require('mime-types');

const multipart = function (opts) {
  const type = opts.sobject.getType();
  const entity = type === 'contentversion' ? 'content' : type;
  const name = type === 'contentversion' ? 'VersionData' : 'Body';
  const fileName = opts.sobject.getFileName();
  const isPatch = opts.method === 'PATCH';

  const form = new FormData();

  form.append(
    'entity_' + entity,
    new Blob([JSON.stringify(opts.sobject._getPayload(isPatch))], {
      type: 'application/json'
    }),
    'entity'
  );

  form.append(
    name,
    new Blob([opts.sobject.getBody()], {
      type: mimeTypes.lookup(fileName) || 'application/octet-stream'
    }),
    fileName
  );

  return form;  // FormData instance — fetch sets Content-Type with boundary automatically
};

module.exports = multipart;
```

**After** (`lib/optionhelper.js`, multipart section):

```javascript
// Replace the content-type block and body block with:
if (opts.multipart) {
  ropts.body = opts.multipart;  // FormData instance; fetch auto-sets Content-Type + boundary
} else {
  ropts.headers['content-type'] = 'application/json';
  if (opts.body) {
    ropts.body = opts.body;
  }
}
```

**Mechanics**:
1. Rewrite `lib/multipart.js` to construct and return a `FormData` instance.
2. In `optionhelper.js`, when `opts.multipart` is present, assign it to `ropts.body` and omit the manual `Content-Type` header — `fetch` sets it automatically with the correct boundary.
3. Remove the now-dead `ropts.headers['content-type'] = 'multipart/form-data'` line.
4. Add a unit test that calls `insert` with a Document sobject and asserts the request body is a `FormData` instance.

**Risk Mitigation**: The feature is currently completely broken (sends no body). Any correct `FormData` implementation is strictly better. Add an integration test against a sandbox before declaring complete.

---

### R02 — Apply AbortSignal.timeout to `_apiRequest`

**Smell**: M2 — Inconsistent Timeout Handling (Obfuscator)
**Refactoring Technique**: Substitute Algorithm (1.9), Remove Parameter (5.3)
**Priority**: High
**Effort**: Low (30 minutes)
**Risk**: Low — adds enforcement that callers already expect

**Problem**

`_apiAuthRequest` (index.js:767-773) correctly applies `AbortSignal.timeout(this.timeout)`. `_apiRequest` (index.js:801-843) does not — all CRUD, query, search, and streaming calls are unbounded. Meanwhile, `optionhelper.js:81-83` copies `opts.timeout` to `ropts.timeout`, which `fetch` silently ignores.

**Before** (`_apiRequest`, index.js:801):

```javascript
Connection.prototype._apiRequest = function (opts) {
  const self = this;
  const ropts = optionHelper.getApiRequestOptions(opts);
  const uri = optionHelper.getFullUri(ropts);
  const sobject = opts.sobject;

  return fetch(uri, ropts)  // <-- no timeout signal
    .then(...)
```

**Before** (`optionhelper.js`, lines 80-84):

```javascript
if (opts.timeout) {
  ropts.timeout = opts.timeout;  // fetch ignores this
}
```

**After** (`_apiRequest`):

```javascript
Connection.prototype._apiRequest = function (opts) {
  const self = this;
  const ropts = optionHelper.getApiRequestOptions(opts);

  if (this.timeout) {
    const timeoutSignal = AbortSignal.timeout(this.timeout);
    ropts.signal =
      ropts.signal !== undefined
        ? AbortSignal.any([timeoutSignal, ropts.signal])
        : timeoutSignal;
  }

  const uri = optionHelper.getFullUri(ropts);
  const sobject = opts.sobject;

  return fetch(uri, ropts)
    .then(...)
```

**After** (`optionhelper.js`): Remove the `opts.timeout` → `ropts.timeout` block entirely (lines 80-84).

**Mechanics**:
1. Copy the `AbortSignal.timeout` block from `_apiAuthRequest` verbatim into `_apiRequest`, placed after `getApiRequestOptions` returns.
2. Remove `ropts.timeout = opts.timeout` from `optionhelper.js`.
3. The existing timeout test in `test/connection.js` (if present) should now also cover `_apiRequest`.

---

### R03 — Fix `previous()` Falsy Value Bug

**Smell**: L4 — Truthiness Bug (Obfuscator)
**Refactoring Technique**: Replace Nested Conditional with Guard Clauses (4.5), Introduce Assertion (4.8)
**Priority**: High
**Effort**: Low (5 minutes)
**Risk**: Low — behavior change is a bug fix; previous value of `0`, `''`, `false`, or `null` now correctly returned

**Problem**

`Record.prototype.previous` (record.js:147) uses `if (this._previous[field])` — a truthiness check. If a field's previous value was `0`, `''`, `false`, or `null`, the method incorrectly returns `undefined`.

**Before**:

```javascript
Record.prototype.previous = function (field) {
  if (field) field = field.toLowerCase();
  if (typeof field === 'string') {
    if (this._previous[field]) {      // BUG: fails for 0, '', false, null
      return this._previous[field];
    } else {
      return;
    }
  } else {
    return this._previous || {};
  }
};
```

**After**:

```javascript
Record.prototype.previous = function (field) {
  if (field) field = field.toLowerCase();
  if (typeof field === 'string') {
    if (field in this._previous) {    // presence check, not truthiness check
      return this._previous[field];
    }
    return undefined;
  }
  return this._previous || {};
};
```

**Mechanics**:
1. Change `if (this._previous[field])` to `if (field in this._previous)`.
2. Add a test: set a field to `0`, change it, confirm `record.previous('field')` returns `0`.

---

## Phase 2 — Mechanical Quick Wins

These items are mechanical, zero-risk, and do not change observable behavior. Apply in any order in a single session.

---

### R04 — Replace Deprecated `querystring` with `URLSearchParams`

**Smell**: M4 — Deprecated Module (Incomplete Library Class)
**Refactoring Technique**: Substitute Algorithm (1.9), Introduce Local Extension (2.8)
**Priority**: Medium
**Effort**: Low (20 minutes)
**Risk**: Low — `URLSearchParams.toString()` is functionally equivalent for all three call sites

**Problem**

`index.js:3` imports the deprecated `querystring` module. Node.js documentation marks it superseded by the WHATWG `URLSearchParams` API. It is used at four locations: lines 190, 242, 287 (OAuth flows), and line 461 (`getRecord` fields query string).

**Before**:

```javascript
const qs = require('querystring');
// ...
return endpoint + '?' + qs.stringify(urlOpts);          // line 190
// ...
opts.body = qs.stringify(bopts);                        // line 242
// ...
opts.body = qs.stringify(refreshOpts);                  // line 287
// ...
opts.resource += '?' + qs.stringify({ fields: opts.fields.join() });  // line 461
```

**After**:

```javascript
// Remove: const qs = require('querystring');
// ...
return endpoint + '?' + new URLSearchParams(urlOpts).toString();
// ...
opts.body = new URLSearchParams(bopts).toString();
// ...
opts.body = new URLSearchParams(refreshOpts).toString();
// ...
opts.resource += '?' + new URLSearchParams({ fields: opts.fields.join() }).toString();
```

**Mechanics**:
1. Delete `const qs = require('querystring')` from line 3.
2. Replace all four `qs.stringify(x)` calls with `new URLSearchParams(x).toString()`.
3. Run `npm test` — all 91 tests should still pass.

---

### R05 — Remove Unnecessary `url` Module Import

**Smell**: L6 — Dead Code / Unnecessary Import (Dispensable)
**Refactoring Technique**: Inline Method (1.2)
**Priority**: Low
**Effort**: Low (5 minutes)
**Risk**: None

**Problem**

`optionhelper.js:4` imports `const url = require('url')` and uses it only as `new url.URL(opts.uri)` on line 89. `URL` is a global in Node.js 22 — no import needed.

**Before**:

```javascript
const url = require('url');
// ...
let result = new url.URL(opts.uri);
```

**After**:

```javascript
// (remove require line)
// ...
let result = new URL(opts.uri);
```

**Mechanics**: Delete line 4, change `url.URL` to `URL` on line 89.

---

### R06 — Replace `_changed` Array with `Set` in `record.js`

**Smell**: M8 — Primitive Obsession / O(n) Membership Tests (Functional Abuser)
**Refactoring Technique**: Replace Data Value with Object (3.2), Self Encapsulate Field (3.1)
**Priority**: Medium
**Effort**: Low (30 minutes)
**Risk**: Low — behavior-preserving; `Set` iteration order is insertion order, same as `Array`

**Problem**

`Record._changed` is an `Array` used exclusively as a membership set. `Array.includes()` is O(n). Every `set()` call checks `_changed.includes(key)` inside a loop over incoming fields — quadratic for records with many fields. A `Set` provides O(1) `has()`, automatic deduplication (eliminating the guard on line 48), and equivalent iteration.

**Before**:

```javascript
// Constructor
this._changed = [];
// ...

// In constructor body (reduce callback):
self._changed.push(key);

// In set():
if (!self._changed.includes(key)) {  // O(n) guard unnecessary with Set
  self._changed.push(key);
}

// In _reset():
this._changed = [];

// In hasChanged():
if (!this._changed || this._changed.length === 0) {
// ...
if (this._changed.includes(field.toLowerCase())) {

// In changed():
this._changed.forEach(function (field) { ... });

// In _getPayload():
if (changedOnly && !self._changed.includes(key)) return result;
```

**After**:

```javascript
// Constructor
this._changed = new Set();
// ...

// In constructor body (reduce callback):
self._changed.add(key);

// In set():
// No guard needed — Set.add() is idempotent
self._changed.add(key);

// In _reset():
this._changed = new Set();

// In hasChanged():
if (!this._changed || this._changed.size === 0) {
// ...
if (this._changed.has(field.toLowerCase())) {

// In changed():
this._changed.forEach(function (field) { ... });  // unchanged — Set has forEach

// In _getPayload():
if (changedOnly && !self._changed.has(key)) return result;
```

**Mechanics**:
1. Change all `= []` initializations of `_changed` to `= new Set()`.
2. Replace `.push(key)` with `.add(key)`.
3. Remove the `!self._changed.includes(key)` guard in `set()` — `Set.add()` is idempotent.
4. Replace `.length` checks with `.size` checks.
5. Replace `.includes()` calls with `.has()` calls.
6. Run `npm test` — the `_changed` data structure is internal; all 91 tests should pass unchanged.

---

### R07 — Simplify `hasChanged` Control Flow

**Smell**: L2 — Conditional Complexity (Obfuscator)
**Refactoring Technique**: Replace Nested Conditional with Guard Clauses (4.5), Consolidate Conditional Expression (4.2)
**Priority**: Low
**Effort**: Low (5 minutes)
**Risk**: None — purely cosmetic restructuring of identical logic

**Problem**

`Record.prototype.hasChanged` (record.js:122-133) uses a 12-line nested if/else-if/else chain for a simple 3-case predicate. The trailing `return false` is dead code (the `else if` already covers all remaining cases).

**Before**:

```javascript
Record.prototype.hasChanged = function (field) {
  if (!this._changed || this._changed.length === 0) {
    return false;
  } else if (!field) {
    return true;
  } else {
    if (this._changed.includes(field.toLowerCase())) {
      return true;
    }
  }
  return false;
};
```

**After** (compatible with R06's Set change):

```javascript
Record.prototype.hasChanged = function (field) {
  if (!this._changed || this._changed.size === 0) return false;
  if (!field) return true;
  return this._changed.has(field.toLowerCase());
};
```

**Note**: Apply after R06 (Set migration) so `.size` and `.has()` are already correct.

---

### R08 — Fix `getVersions` Magic HTTP URL

**Smell**: M5 — Magic String / Hardcoded Dependency (Lexical Abuser)
**Refactoring Technique**: Replace Magic Number with Symbolic Constant (3.11), Parameterize Method (5.5)
**Priority**: Medium
**Effort**: Low (10 minutes)
**Risk**: Low — corrects wrong behavior for all non-na1 orgs

**Problem**

`Connection.prototype.getVersions` (index.js:352) hardcodes `'http://na1.salesforce.com/services/data/'` — HTTP (not HTTPS), wrong pod for every org except na1, bypasses `instance_url`.

**Before**:

```javascript
Connection.prototype.getVersions = function () {
  let opts = this._getOpts(null);
  opts.uri = 'http://na1.salesforce.com/services/data/';
  opts.method = 'GET';
  return this._apiAuthRequest(opts);
};
```

**After**:

```javascript
Connection.prototype.getVersions = function (data) {
  const opts = this._getOpts(data);
  // Use the authenticated org's instance URL if oauth is present;
  // fall back to the configured login URI base for pre-auth discovery.
  if (opts.oauth && opts.oauth.instance_url) {
    opts.uri = opts.oauth.instance_url + '/services/data/';
  } else {
    opts.uri = this.loginUri.replace('/oauth2/token', '/data/');
  }
  opts.method = 'GET';
  return this._apiAuthRequest(opts);
};
```

**Mechanics**:
1. Replace the hardcoded string with the two-branch logic above.
2. Add a test asserting the URI uses `opts.oauth.instance_url` when oauth is present.

---

### R09 — Remove Dead Callback Scaffolding from `_getOpts`

**Smell**: L3 — Dead Code (Dispensable)
**Refactoring Technique**: Remove Parameter (5.3), Inline Method (1.2)
**Priority**: Low
**Effort**: Low (20 minutes)
**Risk**: Low — confirmed no call site passes a non-null second argument

**Problem**

`Connection.prototype._getOpts(d, c, opts)` captures `c` as `callback` and stores it at `data.callback`. Every call site in the codebase passes `null` as the second argument. The entire `if (util.isFunction(d))` branch at line 101 (which would route `d` as callback) is also unreachable — callers always pass an object or `null` as the first argument. `data.callback` is never read anywhere.

**Before**:

```javascript
Connection.prototype._getOpts = function (d, c, opts = {}) {
  let data = {};
  let callback;
  let dataTransfer;

  if (util.isFunction(d)) {
    callback = d;
    dataTransfer = null;
  } else {
    callback = c;
    dataTransfer = d;
  }

  if (opts.singleProp && dataTransfer && !util.isObject(dataTransfer)) {
    data[opts.singleProp] = dataTransfer;
  } else if (util.isObject(dataTransfer)) {
    data = dataTransfer;
  }

  data.callback = callback;  // always null

  if (this.mode === 'single' && !data.oauth) {
    data.oauth = this.oauth;
  }
  // ...
```

**After**:

```javascript
Connection.prototype._getOpts = function (d, opts = {}) {
  let data = {};

  if (opts.singleProp && d && !util.isObject(d)) {
    data[opts.singleProp] = d;
  } else if (util.isObject(d)) {
    data = d;
  }

  if (this.mode === 'single' && !data.oauth) {
    data.oauth = this.oauth;
  }
  // ...
```

**Mechanics**:
1. Remove the `c` parameter, `callback` variable, `dataTransfer` alias, and `data.callback = callback` assignment.
2. Rename `dataTransfer` usages to `d` directly.
3. Update every `_getOpts(data, null, {...})` call site to `_getOpts(data, {...})` (remove the `null` argument).
4. Update every `_getOpts(data, null)` to `_getOpts(data)`.
5. Run `npm test`.

---

### R10 — Add `'use strict'` to All Five Missing Files

**Smell**: L7 — Inconsistent Strict Mode (Lexical Abuser)
**Refactoring Technique**: Introduce Assertion (4.8) — enforces implicit assumptions explicitly
**Priority**: Low
**Effort**: Low (5 minutes)
**Risk**: None for well-written code; if any file used `with`, `arguments.caller`, or similar deprecated constructs they would error — but none do

**Problem**

`'use strict'` is present in `index.js`, `lib/constants.js`, and `lib/optionhelper.js` but absent from `lib/record.js`, `lib/util.js`, `lib/errors.js`, `lib/fdcstream.js`, and `lib/multipart.js`. CommonJS modules are not strict by default.

**After**: Add `'use strict';` as the first line of each of the five files.

---

### R11 — Remove `self = this` Pattern Where Unnecessary

**Smell**: M3 — Inconsistent `self` Alias (Lexical Abuser)
**Refactoring Technique**: Substitute Algorithm (1.9) — replace manual `this` binding with lexical arrow functions
**Priority**: Low
**Effort**: Medium (1–2 hours across all files)
**Risk**: Low — mechanical arrow-function conversion

**Problem**

`self = this` is a pre-ES6 pattern for preserving `this` context inside nested `function` callbacks. Arrow functions bind `this` lexically and make `self` unnecessary. The codebase mixes both patterns inconsistently.

Specific cases where `self` is unnecessary:

**`index.js:775`** (`_apiAuthRequest`):
```javascript
const self = this;
// ...
.then((jBody) => {
  if (jBody.access_token && self.mode === 'single') {   // <-- arrow function; `this` works
    self.oauth = jBody;
  }
```
`self` is used only inside an arrow function `.then()` callback — `this` is identical. Remove `const self = this` and replace `self.` with `this.`.

**`index.js:132`** (`getAuthUri`):
```javascript
const self = this;
// ...
client_id: self.clientId,      // uses self
// ...
endpoint = this.testAuthEndpoint;  // uses this directly — inconsistent
```
Replace `self.clientId`, `self.redirectUri` with `this.clientId`, `this.redirectUri`. Remove `const self = this`.

**`index.js:206`** (`authenticate`):
`const self = this` used for `self.clientId`, `self.clientSecret`, `self.redirectUri`, `self._resolveWithRefresh`. All are inside regular function scope, not nested callbacks. Convert to `this.` directly.

**`lib/record.js`**:
The `Record` constructor, `set()`, `changed()`, and `_getPayload()` use `self = this` inside nested `function` callbacks passed to `reduce` and `forEach`. Convert these to arrow functions:
```javascript
// Before:
this._fields = Object.entries(data).reduce(function (result, [key, val]) {
  key = key.toLowerCase();
  if (key !== 'attributes' && key !== 'attachment') {
    result[key] = val;
    self._changed.add(key);       // self needed because function callback
// ...

// After:
this._fields = Object.entries(data).reduce((result, [key, val]) => {
  key = key.toLowerCase();
  if (key !== 'attributes' && key !== 'attachment') {
    result[key] = val;
    this._changed.add(key);       // this works in arrow function
// ...
```

**`lib/fdcstream.js`**: `self` is genuinely needed in `Subscription` constructor (the `function (d)` callback for subscribe, and the `.callback`/`.errback` handlers) and in `Client` constructor (the `transport:up`/`transport:down` handlers). These cannot be trivially converted to arrow functions because the Faye API requires standard functions in some positions. Leave `fdcstream.js` `self` aliases unchanged.

**Mechanics**:
1. `index.js`: Remove `const self = this` from `_apiAuthRequest`, `getAuthUri`, `authenticate`, `refreshToken`. Replace remaining `self.` references with `this.` in those methods.
2. `record.js`: Convert `reduce`, `forEach`, and similar inline callbacks from `function` to arrow functions. Remove `const self = this` and `let self = this` declarations. Remove `let self = this` from `Record` constructor, `set()`, and `changed()`.
3. Verify tests still pass after each file.

---

## Phase 3 — Design and Consistency

These items improve design quality and resolve named code smells without restructuring the major modules.

---

### R12 — Split `_getPayload(bool)` into Two Named Methods

**Smell**: M6 — Flag Argument / Boolean Blindness (Bloater)
**Refactoring Technique**: Replace Parameter with Explicit Methods (5.6)
**Priority**: Medium
**Effort**: Low (30 minutes)
**Risk**: Low — purely additive; old method can be removed after all call sites updated

**Problem**

`Record.prototype._getPayload(changedOnly)` takes a boolean flag that controls whether all fields or only changed fields are returned. Call sites (`false`, `true`, `false`, and the `isPatch` variable in multipart.js) have no intrinsic meaning without reading the method definition.

**Before**:

```javascript
opts.body = JSON.stringify(opts.sobject._getPayload(false));  // insert — all fields
opts.body = JSON.stringify(opts.sobject._getPayload(true));   // update — changed only
opts.body = JSON.stringify(opts.sobject._getPayload(false));  // upsert — all fields
body: JSON.stringify(opts.sobject._getPayload(isPatch))       // multipart
```

**After**:

```javascript
// New methods in record.js:
Record.prototype._getFullPayload = function () {
  return this._getPayload(false);
};

Record.prototype._getChangedPayload = function () {
  return this._getPayload(true);
};

// Call sites:
opts.body = JSON.stringify(opts.sobject._getFullPayload());    // insert
opts.body = JSON.stringify(opts.sobject._getChangedPayload()); // update
opts.body = JSON.stringify(opts.sobject._getFullPayload());    // upsert
body: JSON.stringify(opts.sobject[isPatch ? '_getChangedPayload' : '_getFullPayload']())
```

**Mechanics**:
1. Add `_getFullPayload()` and `_getChangedPayload()` to `record.js` (delegating to `_getPayload`).
2. Update the five call sites in `index.js` and `lib/multipart.js`.
3. Optionally: leave `_getPayload(bool)` as a private implementation detail and mark the new methods as the public API.

---

### R13 — Replace `getBody` if/else Chain with Dispatch Map

**Smell**: OCP violation — if/else type dispatch (Simplifying Conditionals)
**Refactoring Technique**: Replace Conditional with Polymorphism (4.6) — simplified as a lookup map
**Priority**: Low
**Effort**: Low (15 minutes)
**Risk**: Low — behavior-identical refactor

**Problem**

`Connection.prototype.getBody` (index.js:477-492) dispatches to `getDocumentBody`, `getAttachmentBody`, or `getContentVersionData` based on a string type. Adding a new blob type requires modifying `getBody`.

**Before**:

```javascript
Connection.prototype.getBody = function (data) {
  const opts = this._getOpts(data);
  const type = (
    opts.sobject ? opts.sobject.getType() : opts.type
  ).toLowerCase();

  if (type === 'document') {
    return this.getDocumentBody(opts);
  } else if (type === 'attachment') {
    return this.getAttachmentBody(opts);
  } else if (type === 'contentversion') {
    return this.getContentVersionData(opts);
  } else {
    return Promise.reject(new Error('invalid type: ' + type));
  }
};
```

**After**:

```javascript
const BODY_GETTER_MAP = {
  document: 'getDocumentBody',
  attachment: 'getAttachmentBody',
  contentversion: 'getContentVersionData'
};

Connection.prototype.getBody = function (data) {
  const opts = this._getOpts(data);
  const type = (
    opts.sobject ? opts.sobject.getType() : opts.type
  ).toLowerCase();

  const methodName = BODY_GETTER_MAP[type];
  if (!methodName) {
    return Promise.reject(new Error('invalid type: ' + type));
  }
  return this[methodName](opts);
};
```

---

### R14 — Fix `_extensionEnabled` Assignment in `fdcstream.js`

**Smell**: L5 — Dead State Assignment on Wrong Object (Data Dealer)
**Refactoring Technique**: Move Field (2.2), Remove Setting Method (5.10)
**Priority**: Low
**Effort**: Low (10 minutes)
**Risk**: Low

**Problem**

`fdcstream.js:70`: `this._extensionEnabled = true` is inside `replayExtension.incoming`, a plain `function`. When Faye calls it as a method of `replayExtension`, `this` refers to `replayExtension`, not the `Client` instance. The property is never read anywhere.

**After** (remove the dead assignment):

```javascript
const replayExtension = {
  incoming: function (message, callback) {
    if (message.channel === '/meta/handshake') {
      if (message.ext && message.ext['replay'] === true) {
        // Replay extension confirmed active.
        // Store on the Client instance if needed: self._extensionEnabled = true;
      }
    }
    callback(message);
  },
  // ...
};
```

If replay-extension detection is genuinely needed in future, the correct fix is to use the captured `self` reference: `self._extensionEnabled = true` (where `self = this` is the `Client` instance captured in the outer constructor).

---

### R15 — Implement or Remove the `gzip` Option

**Smell**: M7 — Configured but Non-Functional Option (Speculative Generality)
**Refactoring Technique**: Substitute Algorithm (1.9) — implement decompression; or dead-code removal
**Priority**: Medium
**Effort**: Medium (1–2 hours) to implement; Low (20 minutes) to remove
**Risk**: Low for removal; Medium for implementation (needs testing against gzip-encoded responses)

**Problem**

`optionhelper.js:49-51` sets `Accept-Encoding: gzip` when `opts.gzip === true`. Node.js native `fetch` does not automatically decompress gzip. `connection.js:65` validates `gzip` as boolean and `constants.js:36` includes it in `defaultOptions`. The feature is validated and documented but produces broken responses when used.

**Option A — Implement (recommended)**:

```javascript
// In _apiRequest, after receiving the response:
.then((res) => responseFailureCheck(res))
.then((res) => unsuccessfulResponseCheck(res))
.then(async (res) => {
  // Decompress gzip if the response is compressed
  const encoding = res.headers.get('content-encoding');
  if (encoding && encoding.includes('gzip')) {
    const ds = new DecompressionStream('gzip');
    const decompressed = res.body.pipeThrough(ds);
    // Re-wrap in a Response for consistent downstream handling
    return new Response(decompressed, { headers: res.headers, status: res.status });
  }
  return res;
})
.then((res) => { ... })
```

**Option B — Remove (simpler)**:
1. Remove `gzip: false` from `constants.js` defaultOptions.
2. Remove `optionTest(util.isBoolean, con.gzip, ...)` from `connection.js`.
3. Remove the `Accept-Encoding` block from `optionhelper.js`.
4. Document in CHANGELOG that gzip was removed pending proper implementation.

**Recommendation**: If gzip is not actively used by any callers (check README and examples), Option B is lower risk and avoids shipping a half-implemented feature. Add a GitHub issue to track a proper implementation.

---

### R16 — Add `'use strict'` Consistency as ESM Migration Checkpoint

**See R10** for the immediate fix. The longer-term option is migrating to ESM (`"type": "module"` in `package.json`), which makes strict mode automatic and eliminates `require`. This is a larger change that affects the test suite, all `require()` calls, and `module.exports` statements. Flag as a separate future initiative; implement R10 now.

---

## Phase 4 — Architectural Decomposition

These three items form a coordinated migration. Apply in sequence after all Phase 1–3 changes are in place.

---

### R17 — Complete ES6 Class Migration — Merge Into `lib/connection.js`

**Smell**: H2 — Parallel Connection Definitions Out of Sync (Alternative Classes with Different Interfaces)
**Refactoring Technique**: Extract Superclass (6.7), Pull Up Method (6.2), Pull Up Constructor Body (6.3)
**Priority**: High (foundational for R18)
**Effort**: High (3–5 hours)
**Risk**: High — moves all 46 prototype methods; requires comprehensive test run after

**Problem**

`lib/connection.js` contains an ES6 `class Connection` stub with field declarations and a `validateConnectionOptions` call. `index.js:23` has a `// TODO turn into ES6 class` comment and contains the real `Connection` function constructor with all 46 prototype methods. `index.js` imports only `validateConnectionOptions` from `lib/connection.js`, ignoring the class entirely. A developer reading `lib/connection.js` sees a `Connection` class but all behavior is in `index.js`.

**Migration Plan**:

1. In `lib/connection.js`, expand the `class Connection` to include the full constructor body from `index.js:24-54` (plugin loading, timeout parsing).
2. Move all `Connection.prototype.*` method definitions from `index.js` into the class as regular methods. Order: constructor → auth getters/setters → `_getOpts` → OAuth methods → system API methods → CRUD → blob → query → search → URL helpers → streaming → auto-refresh → internal HTTP.
3. Move the module-level helper functions (`responseFailureCheck`, `unsuccessfulResponseCheck`, `addSObjectAndId`, `respToJson`, `requireForwardSlash`) into `lib/connection.js` as module-private functions (not class members).
4. In `index.js`, replace the function constructor and all prototype assignments with `const Connection = require('./lib/connection').Connection`.
5. Keep `createConnection`, `createSObject`, `plugin`, `Record`, `version`, `API_VERSION`, and `module.exports` in `index.js` — it becomes a thin composition/export root.

**Before** (`index.js:24`):
```javascript
// TODO turn into ES6 class
const Connection = function (opts) { ... };
Connection.prototype.getOAuth = function () { ... };
// ... 45 more prototype assignments
```

**After** (`lib/connection.js`):
```javascript
class Connection {
  constructor(opts) {
    opts = Object.assign({}, CONST.defaultOptions, opts || {});
    opts.environment = opts.environment.toLowerCase();
    opts.mode = opts.mode.toLowerCase();
    Object.assign(this, opts);
    validateConnectionOptions(this);
    this.timeout = parseInt(this.timeout, 10);
    if (opts.plugins && Array.isArray(opts.plugins)) {
      opts.plugins.forEach((pname) => {
        if (!plugins[pname]) throw new Error('plugin ' + pname + ' not found');
        this[pname] = { ...plugins[pname]._fns };
        for (const key of Object.keys(this[pname])) {
          this[pname][key] = this[pname][key].bind(this);
        }
      });
    }
  }

  getOAuth() { return this.oauth; }
  setOAuth(oauth) { this.oauth = oauth; }
  // ... all 46 methods as class methods
}
```

**After** (`index.js`):
```javascript
'use strict';

const { Connection } = require('./lib/connection');
const Record = require('./lib/record');
const util = require('./lib/util');
const version = require('./package.json').version;
const API_VERSION = require('./package.json').sfdx.api;

const createConnection = (opts) => new Connection(opts);
const createSObject = function (type, fields) { ... };

module.exports = { util, plugin, Record, version, API_VERSION, createConnection, createSObject };
```

**Risk Mitigation**: Run `npm test` after each group of methods is moved. Move in logical groups (auth, CRUD, query, etc.) rather than all at once.

---

### R18 — Extract `lib/plugin.js` — Separate Plugin System

**Smell**: H1 — Divergent Change / God Object (Bloater + Change Preventer)
**Refactoring Technique**: Extract Class (2.3), Move Method (2.1), Move Field (2.2)
**Priority**: Medium (do in parallel with or after R17)
**Effort**: Low (1 hour)
**Risk**: Low — Plugin system is self-contained

**Problem**

`Plugin` constructor, `Plugin.prototype.fn`, and the `plugin()` factory function are completely self-contained in `index.js` (lines 932-969). They have no dependency on `Connection` internals and no reason to live in the same file.

**After** (`lib/plugin.js`):

```javascript
'use strict';

const util = require('./util');

const plugins = {};

function Plugin(opts) {
  this.namespace = opts.namespace;
  this._fns = {};
  this.util = { ...util };
}

Plugin.prototype.fn = function (fnName, fn) {
  if (typeof fn !== 'function') {
    throw new Error('invalid function provided');
  }
  if (typeof fnName !== 'string') {
    throw new Error('invalid function name provided');
  }
  this._fns[fnName] = fn;
  return this;
};

const plugin = function (opts) {
  if (typeof opts === 'string') {
    opts = { namespace: opts };
  }
  if (!opts || !opts.namespace) {
    throw new Error('no namespace provided for plugin');
  }
  opts = Object.assign({ override: false }, opts);
  if (plugins[opts.namespace] && opts.override !== true) {
    throw new Error(
      'a plugin with namespace ' + opts.namespace + ' already exists'
    );
  }
  plugins[opts.namespace] = new Plugin(opts);
  return plugins[opts.namespace];
};

module.exports = { plugin, plugins, Plugin };
```

**Mechanics**:
1. Create `lib/plugin.js` with the content above.
2. In `index.js` (or `lib/connection.js` post-R17), replace the inline definitions with `const { plugin, plugins } = require('./lib/plugin')`.
3. The `plugins` object must be imported into `Connection` (or `lib/connection.js`) since the constructor reads `plugins[pname]`.

---

### R19 — Split `index.js` by Responsibility Domain

**Smell**: H1 — Divergent Change / God Object, High Cohesion Violation (GRASP)
**Refactoring Technique**: Extract Class (2.3), Move Method (2.1)
**Priority**: Medium (requires R17 complete)
**Effort**: High (4–6 hours)
**Risk**: Medium — public API surface must remain unchanged

**Problem**

Even after R17 (class migration), `lib/connection.js` will have 46 methods spanning authentication, CRUD, query, search, blob, streaming, HTTP infrastructure, and auto-refresh. This is still a Large Class with Divergent Change risk.

**Proposed Module Boundaries**:

```
lib/connection.js     — Class definition, constructor, getters/setters, _getOpts
lib/auth.js           — authenticate, refreshToken, revokeToken, getAuthUri, autoRefreshToken, _resolveWithRefresh
lib/api.js            — All Salesforce REST API methods (CRUD, query, search, blob, URL helpers, apexRest, streaming)
lib/http.js           — _apiRequest, _apiAuthRequest, responseFailureCheck, unsuccessfulResponseCheck, addSObjectAndId, respToJson
lib/plugin.js         — Plugin, plugin() (from R18)
index.js              — Composition root: requires and re-exports public API only
```

**Approach**: Use mixins or composition rather than inheritance to keep `Connection` as the single public class while distributing the method implementations:

```javascript
// lib/connection.js — after class definition
const authMethods = require('./auth');
const apiMethods = require('./api');
Object.assign(Connection.prototype, authMethods, apiMethods);
```

Or group methods directly into the class file and add file-level commentary marking each responsibility boundary. The mixin approach preserves the single public class without introducing a class hierarchy.

**Risk Mitigation**: The public API (all exports from `index.js`) must not change. Callers use `createConnection()` and call methods on the returned object — the class shape is invisible to them. Run the full test suite after each module extraction.

---

## Risk Summary

| ID | Recommendation | Risk | Effort |
|----|---------------|------|--------|
| R01 | Rewrite multipart to use FormData | Medium | Medium |
| R02 | Apply AbortSignal.timeout to _apiRequest | Low | Low |
| R03 | Fix previous() falsy value bug | Low | Low |
| R04 | Replace querystring with URLSearchParams | Low | Low |
| R05 | Remove url module import | None | Low |
| R06 | Replace _changed Array with Set | Low | Low |
| R07 | Simplify hasChanged control flow | None | Low |
| R08 | Fix getVersions magic HTTP URL | Low | Low |
| R09 | Remove dead callback from _getOpts | Low | Low |
| R10 | Add 'use strict' to five files | None | Low |
| R11 | Remove unnecessary self = this aliases | Low | Medium |
| R12 | Split _getPayload into two methods | Low | Low |
| R13 | Replace getBody if/else with dispatch map | Low | Low |
| R14 | Fix _extensionEnabled dead assignment | Low | Low |
| R15 | Implement or remove gzip option | Low–Medium | Low–Medium |
| R16 | (ESM migration checkpoint — deferred) | — | — |
| R17 | Complete ES6 class migration | High | High |
| R18 | Extract lib/plugin.js | Low | Low |
| R19 | Split index.js by responsibility | Medium | High |

---

## Recommended Implementation Sequence

```
Phase 1 (fix broken behavior):
  R01 → R02 → R03

Phase 2 (mechanical wins, any order):
  R04, R05, R06, R07, R08, R09, R10

Phase 3 (design, any order after Phase 2):
  R11 → R12 → R13 → R14 → R15

Phase 4 (architectural, in this order):
  R18 → R17 → R19
```

After each recommendation, run `npm test` to confirm all 91 tests remain green. The architectural Phase 4 changes should be done on a feature branch with a pull request and full review.
