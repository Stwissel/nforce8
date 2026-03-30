# Code Refactoring Report — nforce8

**Project**: nforce8 — Node.js REST API wrapper for Salesforce
**Analysis Date**: 2026-03-30
**Based On**: code-smell-detector-report.md (30 issues: 3 High, 11 Medium, 16 Low)
**Refactoring Techniques Applied**: From the complete Fowler / refactoring.guru catalog

---

## Executive Summary

The nforce8 codebase receives a **B-grade** overall and is in genuinely good health. No god-objects, no deep inheritance chains, no callback hell in production code. The refactoring work falls into three clear buckets:

1. **Bug-Fix Refactorings (3)** — Issues that can cause silent test failures or incorrect runtime behaviour. Fix these first, unconditionally.
2. **Design Refactorings (11)** — Smell-driven improvements that reduce future maintenance cost without changing the public API.
3. **Style / Hygiene Refactorings (16)** — Mechanical, low-risk changes that improve readability and lint compliance.

Total recommendations: **18** (some smells are resolved by the same refactoring; style items are grouped).

---

## Refactoring Recommendations

---

### R01 — Add Missing `require('crypto')` Import

| Attribute | Value |
|-----------|-------|
| File | `test/mock/cometd-server.js` lines 201–206 |
| Smell | Hidden Dependency / Latent Bug (High) |
| Technique | **Introduce Foreign Method** (repair the missing module import) |
| Priority | **Critical** |
| Complexity | Trivial |
| Risk | None |

**Problem**

`cometd-server.js` calls `crypto.createHash('sha1')` but never imports the `crypto` module. In Node.js >= 22 the `globalThis.crypto` Web Crypto API exists, but `globalThis.crypto.createHash` does not. Any test path that triggers a WebSocket upgrade will throw `TypeError: crypto.createHash is not a function`.

**Before**

```js
// test/mock/cometd-server.js — no crypto import at top
const http = require('http');
...
const acceptKey = crypto.createHash('sha1')
  .update(key + '258EAFA5-E914-47DA-95CA-5AB5DC65C97B')
  .digest('base64');
```

**After**

```js
const http = require('http');
const crypto = require('crypto');
...
const acceptKey = crypto.createHash('sha1')
  .update(key + '258EAFA5-E914-47DA-95CA-5AB5DC65C97B')
  .digest('base64');
```

**Steps**

1. Open `test/mock/cometd-server.js`.
2. Add `const crypto = require('crypto');` after the existing `require('http')` line.
3. Run the full test suite (`npm test`) to confirm no regressions.

---

### R02 — Fix Silent Error Swallowing in Test Promise Chains

| Attribute | Value |
|-----------|-------|
| Files | `test/crud.js` (4 occurrences), `test/query.js` (9 occurrences) |
| Smell | Afraid to Fail (High — Test Smell) |
| Technique | **Substitute Algorithm** (replace flawed pattern with correct Mocha idiom) |
| Priority | **Critical** |
| Complexity | Simple |
| Risk | Low — test-only change |

**Problem**

Thirteen tests use this pattern:

```js
.catch((err) => should.not.exist(err))
.finally(() => done());
```

The intent is to fail the test on unexpected errors, but the pattern is broken. When `should.not.exist(err)` throws an assertion error, the `.finally()` block calls `done()` unconditionally, which Mocha interprets as a passing test. Tests that should fail can silently pass.

**Before** (representative example from `test/crud.js`)

```js
it('should create a proper request on insert', (done) => {
  org.insert({ sobject: obj, oauth: oauth })
    .then((res) => {
      should.exist(res);
      api.getLastRequest().url.should.equal('/services/data/...');
    })
    .catch((err) => {
      should.not.exist(err);     // assertion error here is swallowed
    })
    .finally(() => done());       // done() called regardless
});
```

**After** — Option A (preferred for Mocha 6+): return the promise, remove the callback

```js
it('should create a proper request on insert', () => {
  return org.insert({ sobject: obj, oauth: oauth })
    .then((res) => {
      should.exist(res);
      api.getLastRequest().url.should.equal('/services/data/...');
    });
  // Mocha handles promise rejections automatically — no .catch needed
});
```

**After** — Option B: pass error to `done()` when using callback style

```js
it('should create a proper request on insert', (done) => {
  org.insert({ sobject: obj, oauth: oauth })
    .then((res) => {
      should.exist(res);
      api.getLastRequest().url.should.equal('/services/data/...');
      done();
    })
    .catch(done);   // passes the error to Mocha, which marks the test as failed
});
```

**Steps**

1. In each of the 13 affected tests, choose Option A (return the promise) where the test uses no other side effects requiring explicit teardown.
2. Where explicit teardown is needed, choose Option B and replace `.finally(() => done())` with `.catch(done)` and add an explicit `done()` call at the end of the `.then()` block.
3. Run `npm test` — the test count should be unchanged, and any newly surfaced failures represent real bugs previously masked.

**Sequencing Note**: Run this refactoring after R03 to ensure any bugs it reveals in production code are distinguishable.

---

### R03 — Fix `upsert()` to Use `applyBody` Helper

| Attribute | Value |
|-----------|-------|
| File | `lib/api.js` lines 253–262 |
| Smell | Oddball Solution / Bug Risk (Medium, effective High) |
| Technique | **Substitute Algorithm** |
| Priority | **High** |
| Complexity | Simple |
| Risk | Low (functional improvement, no API surface change) |

**Problem**

`insert()` and `update()` both route through `applyBody(opts, type, payloadFn)` which correctly detects Document/Attachment/ContentVersion SObjects and builds a multipart body. `upsert()` skips `applyBody` and directly sets `opts.body = JSON.stringify(...)`, producing a JSON-only body for binary SObjects instead of the required multipart request. This is a silent functional bug.

**Before**

```js
const upsert = function (data) {
  const opts = this._getOpts(data);
  const type = opts.sobject.getType();
  const extIdField = opts.sobject.getExternalIdField();
  const extId = opts.sobject.getExternalId();
  opts.resource = sobjectPath(type, extIdField, extId);
  opts.method = 'PATCH';
  opts.body = JSON.stringify(opts.sobject.toPayload());   // bypasses applyBody
  return this._apiRequest(opts);
};
```

**After**

```js
const upsert = function (data) {
  const opts = this._getOpts(data);
  const type = opts.sobject.getType();
  const extIdField = opts.sobject.getExternalIdField();
  const extId = opts.sobject.getExternalId();
  opts.resource = sobjectPath(type, extIdField, extId);
  opts.method = 'PATCH';
  applyBody(opts, type, () => opts.sobject.toPayload());  // consistent with insert/update
  return this._apiRequest(opts);
};
```

**Steps**

1. In `lib/api.js`, locate the `upsert` function (lines 253–262).
2. Replace `opts.body = JSON.stringify(opts.sobject.toPayload());` with `applyBody(opts, type, () => opts.sobject.toPayload());`.
3. Verify that `applyBody` is already in scope at this point in the file (it is — defined above the CRUD section).
4. Add a test case for upserting a ContentVersion SObject with binary data to `test/crud.js` to cover the multipart path for upsert.

---

### R04 — Fix Assignment Spacing in `lib/api.js`

| Attribute | Value |
|-----------|-------|
| File | `lib/api.js` lines 226, 240, 241, 255, 257, 271, 272 |
| Smell | Inconsistent Style (Medium) |
| Technique | **Rename Method** analogue — mechanical formatting correction |
| Priority | Medium |
| Complexity | Trivial |
| Risk | None |

**Problem**

Seven assignment statements are missing a space between the variable name and `=`:

```js
const type =opts.sobject.getType();    // should be: const type = opts.sobject.getType();
const id =opts.sobject.getId();        // should be: const id = opts.sobject.getId();
const extId =opts.sobject.getExternalId();
```

This appears in `insert`, `update`, `upsert`, and `_delete` — all four core CRUD functions — suggesting copy-paste construction without a final formatting pass.

**Steps**

1. Run `npx eslint --fix lib/api.js` (the `space-infix-ops` rule will auto-correct these).
2. If the ESLint rule is not enabled, manually add the spaces using search-and-replace with regex `=opts` → `= opts`.
3. Verify no logic change: `git diff lib/api.js` should show whitespace-only changes.

**Note**: R03 also touches these lines for `upsert`, so apply R03 first to avoid conflicts.

---

### R05 — Extract `_resubscribeAll()` Method in `lib/cometd.js`

| Attribute | Value |
|-----------|-------|
| File | `lib/cometd.js` lines 382–384 and 417–419 |
| Smell | Duplicated Code (Low) |
| Technique | **Extract Method** |
| Priority | Medium |
| Complexity | Simple |
| Risk | Low |

**Problem**

The identical re-subscription loop appears in two separate async methods:

```js
// _rehandshake() — lines 382–384
for (const topic of this._subscriptions.keys()) {
  await this._sendSubscribe(topic);
}

// _scheduleReconnect() — lines 417–419
for (const topic of this._subscriptions.keys()) {
  await this._sendSubscribe(topic);
}
```

Any change to re-subscription logic (e.g., error handling per topic, replay extension state) must be made in two places.

**After**

```js
/**
 * Re-subscribe all active topics after a handshake.
 */
async _resubscribeAll() {
  for (const topic of this._subscriptions.keys()) {
    await this._sendSubscribe(topic);
  }
}

// In _rehandshake():
await this.handshake();
await this._resubscribeAll();

// In _scheduleReconnect():
await this.handshake();
this._reconnectAttempts = 0;
await this._resubscribeAll();
await this.connect();
```

**Steps**

1. Create the `_resubscribeAll()` async method in `CometDClient` (place it near `_sendSubscribe`).
2. Replace both inline loops with `await this._resubscribeAll()`.
3. Run `npm test` to confirm behaviour is unchanged.

---

### R06 — Remove Redundant `Promise.resolve()` Wrappers in `lib/auth.js`

| Attribute | Value |
|-----------|-------|
| File | `lib/auth.js` lines 133, 187 |
| Smell | Dispensable Code (Medium) |
| Technique | **Inline Temp** |
| Priority | Low |
| Complexity | Trivial |
| Risk | None |

**Problem**

Inside `.then()` callbacks, `return Promise.resolve(value)` is functionally identical to `return value`. The `.then()` handler's return value is automatically wrapped in a resolved promise by the Promises/A+ specification. The `Promise.resolve()` call adds noise without behaviour change.

**Before**

```js
// lib/auth.js line 133 (_notifyAndResolve)
return Promise.resolve(newOauth);

// lib/auth.js line 187 (authenticate)
return Promise.resolve(newOauth);
```

**After**

```js
return newOauth;
```

**Steps**

1. In `lib/auth.js`, find the two occurrences of `return Promise.resolve(newOauth);`.
2. Replace both with `return newOauth;`.
3. Run `npm test` to verify no behaviour change.

---

### R07 — Fix Quote Style in `lib/cometd.js`

| Attribute | Value |
|-----------|-------|
| File | `lib/cometd.js` — all string literals |
| Smell | Inconsistent Style (Medium) |
| Technique | **Substitute Algorithm** (mechanical style normalization) |
| Priority | Medium |
| Complexity | Simple |
| Risk | Low |

**Problem**

`lib/cometd.js` uses double-quoted strings throughout (`"use strict"`, `"Content-Type"`, `"websocket"`) while the ESLint config enforces `quotes: ['error', 'single']` across the rest of the codebase. Running `npx eslint lib/cometd.js` likely reports errors on every string literal in the file.

**Steps**

1. Run `npx eslint --fix lib/cometd.js`.
2. Review the diff to confirm only quote characters changed — no logic was modified.
3. Run `npm test`.

**Note**: This is a pure style change. If the file was intentionally excluded from ESLint (unlikely), document that decision instead.

---

### R08 — Replace Inline `require` with Top-Level Import in `test/mock/cometd-server.js`

| Attribute | Value |
|-----------|-------|
| File | `test/mock/cometd-server.js` line 277 |
| Smell | Clever Code (Low) |
| Technique | **Inline Method** analogue — hoist the require |
| Priority | Low |
| Complexity | Trivial |
| Risk | None |

**Problem**

```js
const emitter = new (require('events').EventEmitter)();
```

An inline `require()` inside a method body is unusual and adds visual noise. `require()` calls are conventionally placed at the top of the file.

**After**

```js
// At top of file with other requires:
const EventEmitter = require('events');

// In the method:
const emitter = new EventEmitter();
```

**Steps**

1. Add `const EventEmitter = require('events');` to the top of `test/mock/cometd-server.js` with the other requires (after R01 adds `const crypto = require('crypto')`).
2. Replace the inline `new (require('events').EventEmitter)()` with `new EventEmitter()`.

---

### R09 — Modernise `onRefresh` to Accept Promises in `lib/auth.js`

| Attribute | Value |
|-----------|-------|
| File | `lib/auth.js` lines 117–135 (`_notifyAndResolve`) |
| Smell | Callback Hell / Mixed Paradigm (Medium) |
| Technique | **Replace Parameter with Method Call** + **Substitute Algorithm** |
| Priority | Medium |
| Complexity | Moderate |
| Risk | Medium — changes the documented `onRefresh` contract |

**Problem**

`_notifyAndResolve` wraps the `onRefresh` callback in a `Promise` constructor, forcing library users to write old-style callbacks inside an otherwise fully promise-based library:

```js
const _notifyAndResolve = function (newOauth, oldOauth) {
  if (this.onRefresh) {
    return new Promise((resolve, reject) => {
      this.onRefresh.call(this, newOauth, oldOauth, (err) => {
        if (err) reject(err);
        else resolve(newOauth);
      });
    });
  }
  return Promise.resolve(newOauth);
};
```

Users must write `onRefresh: (newOauth, oldOauth, done) => { ...; done(); }` when `onRefresh: async (newOauth, oldOauth) => { ... }` would be far more natural.

**After**

```js
const _notifyAndResolve = function (newOauth, oldOauth) {
  if (this.onRefresh) {
    // Accept both: callback-style (arity=3) for backwards compatibility,
    // and promise-returning or async functions (arity<3).
    if (this.onRefresh.length >= 3) {
      // Legacy callback path — wrap for backward compatibility
      return new Promise((resolve, reject) => {
        this.onRefresh.call(this, newOauth, oldOauth, (err) => {
          if (err) reject(err);
          else resolve(newOauth);
        });
      });
    }
    // Modern path: onRefresh returns a value or a Promise
    return Promise.resolve(this.onRefresh.call(this, newOauth, oldOauth))
      .then(() => newOauth);
  }
  return newOauth;
};
```

**Steps**

1. In `lib/auth.js`, update `_notifyAndResolve` as shown above.
2. Update the JSDoc to document both signatures.
3. Add a test to `test/connection.js` for the async `onRefresh` path.
4. Keep the existing callback test to confirm backward compatibility.

**Risk Mitigation**: The `function.length` check preserves full backward compatibility for existing `onRefresh` implementations. The breaking behaviour (accepting a Promise) is additive only.

---

### R10 — Decompose `getAuthUri` Conditional Blocks in `lib/auth.js`

| Attribute | Value |
|-----------|-------|
| File | `lib/auth.js` lines 67–115 |
| Smell | Conditional Complexity (Medium) |
| Technique | **Substitute Algorithm** + **Extract Method** |
| Priority | Low |
| Complexity | Simple |
| Risk | Low |

**Problem**

Eight consecutive `if` blocks all perform the same operation: conditionally copy an option from `opts` to `urlOpts`, with optional array-join for `scope` and `prompt`. The pattern is highly regular but verbose.

**Before** (pattern repeated 8 times)

```js
if (opts.display) {
  urlOpts.display = opts.display.toLowerCase();
}
if (opts.scope) {
  if (Array.isArray(opts.scope)) {
    urlOpts.scope = opts.scope.join(' ');
  } else {
    urlOpts.scope = opts.scope;
  }
}
// ... 6 more identical if-blocks
```

**After**

```js
const getAuthUri = function (opts = {}) {
  const urlOpts = {
    response_type: opts.responseType || 'code',
    client_id: this.clientId,
    redirect_uri: this.redirectUri,
  };

  // Simple copy: include field if present in opts
  const simpleCopyFields = ['immediate', 'state', 'nonce'];
  for (const field of simpleCopyFields) {
    if (opts[field] !== undefined) urlOpts[field] = opts[field];
  }

  // Transformed copy: apply value transform before including
  if (opts.display) urlOpts.display = opts.display.toLowerCase();
  if (opts.loginHint) urlOpts.login_hint = opts.loginHint;

  // Array-or-string fields (Salesforce uses space-delimited values)
  const spaceJoinFields = ['scope', 'prompt'];
  for (const field of spaceJoinFields) {
    if (opts[field] !== undefined) {
      urlOpts[field] = Array.isArray(opts[field])
        ? opts[field].join(' ')
        : opts[field];
    }
  }

  if (opts.urlOpts) Object.assign(urlOpts, opts.urlOpts);

  return this._authEndpoint(opts) + '?' + new URLSearchParams(urlOpts).toString();
};
```

**Steps**

1. Replace the body of `getAuthUri` in `lib/auth.js` with the refactored version.
2. Run `npm test` to confirm `test/connection.js` tests for `getAuthUri` still pass (especially the scope/prompt array encoding tests).

---

### R11 — Remove Redundant Intermediate Variable in `createSObject` (`index.js`)

| Attribute | Value |
|-----------|-------|
| File | `index.js` lines 85–86 |
| Smell | Lazy Element (Low) |
| Technique | **Inline Temp** |
| Priority | Low |
| Complexity | Trivial |
| Risk | None |

**Problem**

```js
const createSObject = (type, fields) => {
  const data = fields || {};
  data.attributes = { type: type };
  const rec = new Record(data);
  return rec;           // rec used only to be returned immediately
};
```

The `rec` variable is assigned solely to be returned on the next line. It adds no explanatory value.

**After**

```js
const createSObject = (type, fields) => {
  const data = fields || {};
  data.attributes = { type: type };
  return new Record(data);
};
```

**Steps**

1. In `index.js`, remove the `const rec = new Record(data);` line and replace `return rec;` with `return new Record(data);`.

---

### R12 — Replace Magic Array in `findId` with Named Constant (`lib/util.js`)

| Attribute | Value |
|-----------|-------|
| File | `lib/util.js` lines 58–63 |
| Smell | Magic Number / Primitive Obsession (Low) |
| Technique | **Replace Magic Number with Symbolic Constant** |
| Priority | Low |
| Complexity | Trivial |
| Risk | None |

**Problem**

```js
const flavors = ['Id', 'id', 'ID'];
```

The name `flavors` is whimsical. The inline array is an unnamed magic literal — its meaning is "the valid case variants of the Salesforce ID field name". Additionally, `if (data[flavor])` is a falsy check; while practically safe for Salesforce IDs, `!== undefined` is semantically more precise.

**After**

```js
const ID_FIELD_VARIANTS = ['Id', 'id', 'ID'];

...

for (const variant of ID_FIELD_VARIANTS) {
  if (data[variant] !== undefined) {
    return data[variant];
  }
}
```

**Steps**

1. Declare `const ID_FIELD_VARIANTS = ['Id', 'id', 'ID'];` as a module-level constant near the top of `lib/util.js`.
2. Rename the loop variable from `flavor` to `variant` (more descriptive).
3. Change the condition from `if (data[flavor])` to `if (data[variant] !== undefined)`.
4. Run `npm test`.

---

### R13 — Rename `checkHeaderCaseInsensitive` to `headerContains` (`lib/util.js`)

| Attribute | Value |
|-----------|-------|
| File | `lib/util.js` line 11 |
| Smell | Uncommunicative Name (Low) |
| Technique | **Rename Method** |
| Priority | Low |
| Complexity | Trivial |
| Risk | None (module-private function) |

**Problem**

`checkHeaderCaseInsensitive(headers, key, searchfor)` is verbose and the parameter `searchfor` is non-standard casing. The function performs a case-insensitive substring search on an HTTP header value — `headerContains` communicates this more precisely. Since the function is module-private (not exported), the rename affects only `lib/util.js` and its callers within the module.

**After**

```js
const headerContains = (headers, key, substring) => {
  ...
};
```

**Steps**

1. Rename the function and parameter in `lib/util.js`.
2. Update all callers within `lib/util.js`.
3. Confirm no external exports need updating (the function is not in `module.exports`).

---

### R14 — Replace `let` with `const` in `lib/optionhelper.js`

| Attribute | Value |
|-----------|-------|
| File | `lib/optionhelper.js` lines 88, 90 |
| Smell | Inconsistent Style / `let` used for non-reassigned variables (Low) |
| Technique | **Remove Assignments to Parameters** analogue — use proper binding keyword |
| Priority | Low |
| Complexity | Trivial |
| Risk | None |

**Before**

```js
let result = new URL(opts.uri);   // never reassigned
let params = opts.qs;             // never reassigned
```

**After**

```js
const result = new URL(opts.uri);
const params = opts.qs;
```

**Steps**

1. Change `let` to `const` on lines 88 and 90 of `lib/optionhelper.js`.
2. Verify ESLint passes with no `prefer-const` warnings.

---

### R15 — Rename `getFullUri` to `buildUrl` in `lib/optionhelper.js`

| Attribute | Value |
|-----------|-------|
| File | `lib/optionhelper.js` lines 87–96; `lib/http.js` line 158 |
| Smell | Uncommunicative Name (Low) |
| Technique | **Rename Method** |
| Priority | Low |
| Complexity | Trivial |
| Risk | Low (internal module API) |

**Problem**

`getFullUri` returns a `URL` object (not a string URI), making the name misleading. The word "URI" implies a string. `buildUrl` accurately describes both the action (construction) and the return type.

**Steps**

1. Rename `getFullUri` to `buildUrl` in `lib/optionhelper.js`.
2. Update the caller in `lib/http.js`: `const uri = optionHelper.buildUrl(ropts);`.
3. Update any JSDoc comments referencing the old name.

---

### R16 — Extract `_resubscribeAll` and Propagate Errors in `lib/cometd.js`

| Attribute | Value |
|-----------|-------|
| File | `lib/cometd.js` lines 365–370 |
| Smell | Afraid to Fail (Low) |
| Technique | **Introduce Assertion** + improve error propagation |
| Priority | Low |
| Complexity | Moderate |
| Risk | Low |

**Problem**

The `_connectLoop` `catch` block silently swallows all errors — no error detail is surfaced to event consumers. The `transport:down` event fires with no information about why the connection dropped.

**Before**

```js
} catch {
  if (this._disconnecting) return;
  this._connected = false;
  this.emit('transport:down');
  this._scheduleReconnect();
  return;
}
```

**After**

```js
} catch (err) {
  if (this._disconnecting) return;
  this._connected = false;
  this.emit('transport:down', err);   // forward error for diagnostics
  this._scheduleReconnect();
  return;
}
```

**Steps**

1. Change `catch {` to `catch (err) {` in `_connectLoop`.
2. Change `this.emit('transport:down')` to `this.emit('transport:down', err)`.
3. Update the JSDoc for the `transport:down` event to document the optional error argument.
4. Update `_connectWebSocket` similarly to emit a non-fatal warning event when WebSocket fallback occurs (optional, lower priority).

---

### R17 — Clean Up Dead Code in `test/integration.js`

| Attribute | Value |
|-----------|-------|
| File | `test/integration.js` lines 7–21 |
| Smell | Dead Code (Low) |
| Technique | Remove dead code |
| Priority | Low |
| Complexity | Trivial |
| Risk | None |

**Problem**

1. `let client = undefined;` — explicit `undefined` initialization is redundant.
2. `checkEnvCredentials()` is called twice — once to gate the `describe` block and again inside `before()`.
3. `// Mocha.suite.skip();` is a commented-out dead code line.

**After**

```js
let client;   // implicit undefined

(checkEnvCredentials() ? describe : describe.skip)(
  'Integration Test against an actual Salesforce instance',
  () => {
    before(() => {
      const creds = checkEnvCredentials();
      // creds is guaranteed truthy here — describe.skip handled the false case
      client = nforce.createConnection({ ... });
    });
    ...
  }
);
```

**Steps**

1. Change `let client = undefined;` to `let client;`.
2. Remove the commented-out `// Mocha.suite.skip()` line.
3. Keep the second `checkEnvCredentials()` call if the `before()` block uses its return value; otherwise remove the redundant call.

---

### R18 — Convert Mock Server to Class-Based Instance (Long-Term)

| Attribute | Value |
|-----------|-------|
| File | `test/mock/sfdc-rest-api.js` lines 1–50 |
| Smell | Global Data / Shared Mutable State (High) |
| Technique | **Extract Class** |
| Priority | Medium (Long-term) |
| Complexity | Moderate |
| Risk | Medium — touches all test files |

**Problem**

`serverStack` and `requestStack` are module-level mutable arrays. All test files that `require` this mock share the same state. `reset()` only clears `requestStack`, not `serverStack`. If a test file fails to call `reset()`, later tests may observe stale request data.

**After (conceptual)**

```js
class MockSfdcApi {
  constructor() {
    this._serverStack = [];
    this._requestStack = [];
  }

  reset() {
    this._requestStack.length = 0;
  }

  getLastRequest() {
    return this._requestStack[0];
  }

  async getServerInstance(serverListener) { ... }
  async clearServerStack() { ... }
}

module.exports = { MockSfdcApi };
```

Each test file creates its own `MockSfdcApi` instance in `before()` and closes it in `after()`, eliminating all shared state.

**Steps**

1. Wrap the existing module-level state and functions in a `MockSfdcApi` class.
2. Update all test files (`crud.js`, `query.js`, `auth.js`, etc.) to instantiate `new MockSfdcApi()` in their `before()` blocks.
3. Update `reset()` to also clear `_serverStack`.
4. Run the full test suite after each file update.

**Why deferred to long-term**: This change touches every test file. The risk of accidentally breaking tests is moderate. The existing tests pass reliably today, so this is a quality-of-life improvement rather than a bug fix.

---

## Risk Assessment Summary

| Recommendation | Risk | Rationale |
|----------------|------|-----------|
| R01 — Add `require('crypto')` | None | One-line addition with no logic change |
| R02 — Fix test error swallowing | Low | Test-only change; may reveal real bugs |
| R03 — Fix `upsert` applyBody | Low | Corrects incorrect behaviour; no API change |
| R04 — Spacing in api.js | None | Whitespace-only diff |
| R05 — Extract `_resubscribeAll` | Low | Extracts identical code; no behaviour change |
| R06 — Remove `Promise.resolve()` wrappers | None | Spec-equivalent simplification |
| R07 — Fix quote style in cometd.js | Low | ESLint auto-fix; no logic change |
| R08 — Hoist inline `require` | None | Module loading is identical |
| R09 — `onRefresh` Promise support | Medium | Additive with backward-compat guard; update docs |
| R10 — Decompose `getAuthUri` conditionals | Low | Algorithm refactor; existing tests validate |
| R11 — Inline `rec` temp variable | None | Pure simplification |
| R12 — Named constant for ID variants | None | Readability only |
| R13 — Rename `checkHeaderCaseInsensitive` | None | Module-private, no external callers |
| R14 — `let` → `const` in optionhelper | None | Communicates intent, no logic change |
| R15 — Rename `getFullUri` → `buildUrl` | Low | Internal API; two-file change |
| R16 — Propagate errors from `catch` | Low | Adds error argument to existing event |
| R17 — Clean up dead code in integration.js | None | Removes noise |
| R18 — Class-based mock server | Medium | Broad test refactor; schedule carefully |

---

## Sequencing and Dependencies

The recommended implementation order respects these dependencies:

### Phase 1 — Critical Bug Fixes (apply immediately, in order)

1. **R01** (crypto import) — prerequisite for reliable WebSocket test paths
2. **R03** (upsert applyBody) — fixes silent functional bug before R02 exposes masked failures
3. **R02** (fix test error swallowing) — apply after R03 so revealed failures are distinguishable

### Phase 2 — Code Quality Improvements (short sprint)

4. **R04** (spacing in api.js) — no-risk ESLint fix
5. **R07** (quote style in cometd.js) — no-risk ESLint fix
6. **R14** (`let` → `const` in optionhelper) — no-risk ESLint fix
7. **R05** (extract `_resubscribeAll`) — Extract Method with clear scope
8. **R06** (remove `Promise.resolve()` wrappers) — trivial inline
9. **R11** (inline `rec` in createSObject) — trivial inline
10. **R08** (hoist inline `require`) — best done after R01 adds the first hoist

### Phase 3 — Design Improvements (medium sprint)

11. **R12** (named constant for ID variants)
12. **R13** (rename `checkHeaderCaseInsensitive`)
13. **R15** (rename `getFullUri` → `buildUrl`)
14. **R10** (decompose `getAuthUri` conditionals)
15. **R16** (propagate errors from `_connectLoop` catch)
16. **R17** (clean up integration.js dead code)

### Phase 4 — Architectural Improvements (planned work)

17. **R09** (`onRefresh` Promise support) — coordinate with documentation update
18. **R18** (class-based mock server) — schedule as a dedicated test-infrastructure task

---

## SOLID Principle Improvements Expected

| Principle | Before | After | Improvement |
|-----------|--------|-------|-------------|
| SRP | 7/10 | 8/10 | R10 reduces `getAuthUri` complexity; R05 isolates reconnect logic |
| OCP | 7/10 | 8/10 | R09 opens `onRefresh` to Promise implementations without modification |
| LSP | 9/10 | 9/10 | No inheritance changes recommended |
| ISP | 6/10 | 6/10 | R18 (if applied) reduces test surface coupling; prototype mixin remains |
| DIP | 7/10 | 7/10 | No inversion changes in scope |

---

## Before/After Code Summary

| File | Lines Changed | Type |
|------|--------------|------|
| `test/mock/cometd-server.js` | +2 | Import addition |
| `test/crud.js` | ~12 | Pattern replacement (4 tests) |
| `test/query.js` | ~27 | Pattern replacement (9 tests) |
| `lib/api.js` | 1 functional + 7 whitespace | Bug fix + style |
| `lib/auth.js` | ~15 | Simplification + modernisation |
| `lib/cometd.js` | ~20 | Style + dedup + error propagation |
| `lib/util.js` | ~5 | Rename + constant extraction |
| `lib/optionhelper.js` | 4 | `let`→`const` + rename |
| `index.js` | 2 | Inline temp removal |
| `test/integration.js` | 3 | Dead code removal |

---

*Generated by the Refactoring Expert Agent — nforce8 project — 2026-03-30*
