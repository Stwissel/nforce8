# Code Refactoring Report — nforce8 (Phase 3)

**Generated:** 2026-03-28
**Based on:** code-smell-detector-report.md (post Phase 1 & Phase 2 refactoring)
**Scope:** `index.js`, `lib/` (all files), `test/` (all files)
**Previous refactoring rounds:** R01–R14 (Phase 1 and Phase 2 complete)

---

## Executive Summary

Two prior refactoring phases (R01–R14) have substantially improved the nforce8 codebase: the original monolithic `index.js` was decomposed into focused domain modules, trivial inline getter/setter calls were eliminated from `auth.js` and `http.js`, the `executeOnRefresh` flag was replaced with explicit methods, and OAuth mutation logic was made non-mutating. The overall quality grade is now **B**.

This Phase 3 report addresses the **32 remaining issues** identified in the post-Phase-2 smell report. The issues split into three tiers:

- **2 high-severity** architectural problems: global mutable test state and a hidden `opts._retryCount` sentinel mutation.
- **17 medium-severity** design problems: duplicated GET/blob patterns, the `opts` property bag shape, magic numbers, mixed async paradigms, inconsistent error handling, and several SRP violations.
- **13 low-severity** readability/maintenance issues: test indecent exposure, dead code, naming inconsistencies, redundant variable declarations, and silent error swallowing.

The 15 recommendations below (R15–R29) are sequenced from highest-impact/lowest-risk to lowest-impact. Each recommendation carries a priority rating, complexity rating, and precise refactoring technique mapping from the Martin Fowler / refactoring.guru catalog.

---

## Recommendations Overview

| ID | Title | Severity Basis | Priority | Complexity | Risk |
|----|-------|----------------|----------|------------|------|
| R15 | Replace `opts._retryCount` sentinel with closure parameter | High (H-2) | High | Low | Low |
| R16 | Remove side-effect from `_apiAuthRequest` | High-adjacent (M-11) | High | Low | Low |
| R17 | Encapsulate mock server state in a class | High (H-1) | High | Medium | Low |
| R18 | Extract `_resubscribeAll()` helper in `cometd.js` | Medium (M-3) | High | Low | Low |
| R19 | Extract blob getter factory (`_blobGetter`) in `api.js` | Medium (M-2) | High | Low | Low |
| R20 | Extract private `_get()` helper for GET methods in `api.js` | Medium (M-1) | Medium | Low | Low |
| R21 | Replace `onRefresh` callback with Promise-returning hook | Medium (M-14) | Medium | Medium | Medium |
| R22 | Name WebSocket frame constants in `cometd-server.js` | Medium (M-5) | Medium | Low | Low |
| R23 | Name `WS_RESPONSE_TIMEOUT_MS` constant in `cometd.js` | Medium (M-6) | Medium | Low | Low |
| R24 | Standardize optional-argument pattern in `fdcstream.js` | Medium (M-7) | Medium | Low | Low |
| R25 | Add JSDoc `@typedef` shapes for `opts` bags | Medium (M-4) | Medium | Medium | Low |
| R26 | Remove section-divider comments in `api.js` | Medium (M-8) | Low | Low | Low |
| R27 | Fix `getLastRequest` naming / semantics in mock | Medium (M-13) | Medium | Low | Low |
| R28 | Eliminate dead code and redundant constructs | Low (L-3,L-5,M-15,L-9) | Low | Low | Low |
| R29 | Extract `_parseWsFrames` / `_buildWsFrame` helpers in test mock | Low (L-12) | Low | Medium | Low |

---

## Detailed Refactoring Recommendations

---

### R15 — Replace `opts._retryCount` Sentinel with Closure Parameter

**Addresses:** H-2 (Hidden Dependency / Temporal Coupling)
**Priority:** High | **Complexity:** Low | **Risk:** Low
**Refactoring Technique:** Remove Assignments to Parameters + Extract Method (Substitute Algorithm variant)
**SOLID fix:** OCP, ISP, Principle of Least Surprise

#### Problem

`_apiRequest` in `lib/http.js` prevents infinite auto-refresh retry loops by writing `opts._retryCount = 1` onto the caller's options object — a hidden mutation side-effect. If a caller reuses the same opts object across calls (or inspects it after the call), they see an undocumented `_retryCount` property that was silently injected.

```js
// Current (problematic):
.catch((err) => {
  if (!opts._retryCount && isTokenError && this.autoRefresh) {
    return this.autoRefreshToken(opts).then(() => {
      opts._retryCount = 1;      // mutates caller's object
      return this._apiRequest(opts);
    });
  }
  throw err;
});
```

#### Solution

Introduce a private `_apiRequestOnce` helper that accepts an explicit `retried` boolean parameter. The public `_apiRequest` delegates to it with `retried = false`.

```js
// Proposed:
const _isTokenError = (err) =>
  err.errorCode === 'INVALID_SESSION_ID' || err.errorCode === 'Bad_OAuth_Token';

const _apiRequestOnce = function (opts, retried) {
  const ropts = optionHelper.getApiRequestOptions(opts);
  ropts.signal = buildSignal(ropts.signal, this.timeout);
  const uri = optionHelper.getFullUri(ropts);
  const sobject = opts.sobject;

  return fetch(uri, ropts)
    .then((res) => responseFailureCheck(res))
    .then((res) => unsuccessfulResponseCheck(res))
    .then((res) => {
      if (opts.blob) return res.arrayBuffer();
      if (util.isJsonResponse(res)) {
        return res.json().catch((e) => {
          if (e instanceof SyntaxError) throw errors.invalidJson();
          throw e;
        });
      }
      return res.text();
    })
    .then((body) => addSObjectAndId(body, sobject))
    .catch((err) => {
      if (
        !retried &&
        _isTokenError(err) &&
        this.autoRefresh === true &&
        (opts.oauth?.refresh_token || (this.username && this.password))
      ) {
        return this.autoRefreshToken(opts).then(() =>
          _apiRequestOnce.call(this, opts, true)
        );
      }
      throw err;
    });
};

const _apiRequest = function (opts) {
  return _apiRequestOnce.call(this, opts, false);
};
```

#### Step-by-step mechanics

1. Copy the body of `_apiRequest` into a new module-scoped function `_apiRequestOnce(opts, retried)`.
2. Replace `!opts._retryCount` with `!retried` in the catch guard.
3. Replace `opts._retryCount = 1; return this._apiRequest(opts)` with `_apiRequestOnce.call(this, opts, true)`.
4. Extract `_isTokenError(err)` as a named predicate (replaces the inline string comparisons — also addresses the Open/Closed violation for retry logic).
5. Change `_apiRequest` to be a one-line delegator: `return _apiRequestOnce.call(this, opts, false)`.
6. Remove all references to `opts._retryCount` from the codebase.
7. Update exports: `_apiRequest` remains exported; `_apiRequestOnce` and `_isTokenError` are module-private (not exported).
8. Run `npm test` to confirm no regressions.

#### Risks / Mitigations

- **Risk:** Internal recursion path changes. **Mitigation:** Tests in `test/errors.js` exercise the auto-refresh path; run them before and after.
- **Risk:** `_isTokenError` extraction could miss edge cases if error codes are not exhaustive. **Mitigation:** Extract as a const function with the exact same two-condition check.

---

### R16 — Remove Side-Effect from `_apiAuthRequest`

**Addresses:** M-11 (Side Effects — `_apiAuthRequest` Mutates Connection State)
**Priority:** High | **Complexity:** Low | **Risk:** Low
**Refactoring Technique:** Separate Query from Modifier
**SOLID fix:** SRP

#### Problem

`_apiAuthRequest` in `lib/http.js` is a transport method but secretly writes to `this.oauth` in single-user mode. This overlaps with the credential-merge work already done by its callers (`authenticate`, `refreshToken`), making state management confusing and violating SRP.

```js
// Current (problematic):
.then((jBody) => {
  if (jBody.access_token && this.mode === CONST.SINGLE_MODE) {
    Object.assign(this.oauth || (this.oauth = {}), jBody);  // side-effect
  }
  return jBody;
});
```

#### Solution

Remove the `Object.assign` side-effect block entirely from `_apiAuthRequest`. Responsibility for storing credentials belongs in `auth.js`, which already calls `_notifyAndResolve` and performs the oauth merge. For `authenticate()`, which does not call `_notifyAndResolve`, add explicit single-mode credential storage after the merge:

```js
// In auth.js authenticate():
return this._apiAuthRequest(opts).then((res) => {
  const newOauth = { ...opts.oauth, ...res };
  if (opts.assertion) newOauth.assertion = opts.assertion;
  if (this.mode === CONST.SINGLE_MODE) {
    this.oauth = newOauth;          // explicit, visible assignment
  }
  return newOauth;                  // also drop the redundant Promise.resolve (see R28)
});
```

#### Step-by-step mechanics

1. Delete the second `.then((jBody) => { ... })` block (lines 138–143 of `lib/http.js`) from `_apiAuthRequest`.
2. Remove the `CONST` import from `lib/http.js` if it becomes unused after this change.
3. In `lib/auth.js` `authenticate()`, after computing `newOauth`, add the explicit single-mode storage as shown above.
4. Verify `refreshToken()` already stores via `_notifyAndResolve` (it does — the notify path propagates to the connection).
5. Run `npm test` to confirm all auth flows still pass.

#### Risks / Mitigations

- **Risk:** Some edge case relies on the auto-set in `_apiAuthRequest`. **Mitigation:** The smell report notes the callers already do the merge; search for any direct callers of `_apiAuthRequest` outside `auth.js` (there should be none).

---

### R17 — Encapsulate Mock Server State in a Class

**Addresses:** H-1 (Mutable Data — Global Module-Level State in `test/mock/sfdc-rest-api.js`)
**Priority:** High | **Complexity:** Medium | **Risk:** Low
**Refactoring Technique:** Extract Class + Change Value to Reference (test isolation variant)
**GRASP fix:** Low Coupling, Protected Variations

#### Problem

`serverStack`, `requestStack`, and `port` are module-level mutable variables shared across all test files that `require` the mock module. The `getLastRequest()` function reads `requestStack[0]` — the first (not last) item — and the naming is misleading (see also R27).

#### Solution

Wrap all mock state in a `MockSfdcApi` class instantiated per test suite:

```js
// test/mock/sfdc-rest-api.js

'use strict';

const http = require('http');
const CONST = require('../../lib/constants');
const apiVersion = CONST.API;

class MockSfdcApi {
  constructor(port) {
    this.port = port || process.env.PORT || 33333;
    this._servers = [];
    this._recordedRequests = [];
  }

  reset() {
    this._recordedRequests.length = 0;
  }

  getLastRequest() {
    return this._recordedRequests[this._recordedRequests.length - 1];
  }

  // ... all instance methods using this._servers, this._recordedRequests, this.port
  getClient(opts = {}) {
    return {
      clientId: 'ADFJSD234ADF765SFG55FD54S',
      clientSecret: 'adsfkdsalfajdskfa',
      redirectUri: `http://localhost:${this.port}/oauth/_callback`,
      loginUri: `http://localhost:${this.port}/login/uri`,
      apiVersion: opts.apiVersion || apiVersion,
      mode: opts.mode || 'multi',
      autoRefresh: opts.autoRefresh || false,
      onRefresh: opts.onRefresh || undefined,
    };
  }

  getOAuth() {
    return {
      id: `http://localhost:${this.port}/id/00Dd0000000fOlWEAU/005d00000014XTPAA2`,
      issued_at: '1362448234803',
      instance_url: `http://localhost:${this.port}`,
      signature: 'djaflkdjfdalkjfdalksjfalkfjlsdj',
      access_token: 'aflkdsjfdlashfadhfladskfjlajfalskjfldsakjf',
    };
  }

  start(cb) {
    this.getGoodServerInstance()
      .then(() => cb())
      .catch((err) => { console.error(err); cb(err); });
  }

  stop(cb) {
    this._clearServers()
      .catch(console.error)
      .finally(() => cb());
  }

  // ... private helpers _clearServers, getServerInstance, getGoodServerInstance, getClosedServerInstance
}

module.exports = { MockSfdcApi };
```

Each test file then does:

```js
const { MockSfdcApi } = require('./mock/sfdc-rest-api');
const api = new MockSfdcApi(33333);

before((done) => api.start(done));
after((done) => api.stop(done));
beforeEach(() => api.reset());
```

#### Step-by-step mechanics

1. Create `MockSfdcApi` class in `test/mock/sfdc-rest-api.js`, moving all module-level vars to instance fields.
2. Convert all module-level functions to instance methods.
3. Fix `getLastRequest()` to return `this._recordedRequests[this._recordedRequests.length - 1]` (true last request) — also resolves M-13/R27.
4. Rename `serverStack` → `_servers`, `requestStack` → `_recordedRequests` in the class — also resolves L-8.
5. Export `{ MockSfdcApi }` (named export, not singleton functions).
6. Update `test/crud.js`, `test/query.js`, `test/errors.js`, `test/connection.js`, and any other consumer to instantiate `new MockSfdcApi(port)` instead of calling module functions directly.
7. Run `npm test` to confirm all suites pass independently.

#### Risks / Mitigations

- **Risk:** Multiple test files currently use the same module-level `start`/`stop` API. **Mitigation:** This is a mechanical search-and-replace across test files. The functional behavior is identical; only the invocation style changes.

---

### R18 — Extract `_resubscribeAll()` in `cometd.js`

**Addresses:** M-3 (Duplicated Code — Repeated Subscription Re-Subscription Loop)
**Priority:** High | **Complexity:** Low | **Risk:** Low
**Refactoring Technique:** Extract Method + Pull Up Method (within same class)
**SOLID fix:** DRY

#### Problem

Both `_rehandshake()` and `_scheduleReconnect()` contain the identical subscription re-subscription loop. Any change to re-subscribe logic must be applied in two places.

```js
// In both _rehandshake and _scheduleReconnect:
for (const topic of this._subscriptions.keys()) {
  await this._sendSubscribe(topic);
}
```

#### Solution

Extract to a named helper method `_resubscribeAll()`:

```js
/**
 * Re-subscribe to all active topics after a reconnect or re-handshake.
 * @returns {Promise<void>}
 */
async _resubscribeAll() {
  for (const topic of this._subscriptions.keys()) {
    await this._sendSubscribe(topic);
  }
}
```

Then in both callers:

```js
// _rehandshake:
await this.handshake();
await this._resubscribeAll();

// _scheduleReconnect:
await this.handshake();
await this._resubscribeAll();
await this.connect();
```

#### Step-by-step mechanics

1. Add `_resubscribeAll()` as a new `async` method on `CometDClient`.
2. Replace the two identical `for...of` loops in `_rehandshake` and `_scheduleReconnect` with `await this._resubscribeAll()`.
3. Run `npm test` (streaming tests) to confirm reconnect behavior unchanged.

---

### R19 — Extract Blob Getter Factory `_blobGetter` in `api.js`

**Addresses:** M-2 (Duplicated Code — Repeated Blob Retrieval Methods)
**Priority:** High | **Complexity:** Low | **Risk:** Low
**Refactoring Technique:** Extract Method + Parameterize Method
**SOLID fix:** DRY, OCP

#### Problem

`getAttachmentBody`, `getDocumentBody`, and `getContentVersionData` are structurally identical six-line functions differing only in the SObject type string and body path segment. The `BODY_GETTER_MAP` already recognizes the three variants but delegates to three identical implementations.

#### Solution

Introduce a higher-order factory function `_blobGetter`:

```js
/**
 * Factory that creates a blob-retrieval API method for a given SObject type and body segment.
 * @param {string} sobjectType - e.g. 'attachment', 'document', 'contentversion'
 * @param {string} bodySegment - e.g. 'body', 'versiondata'
 * @returns {Function} An API method (data) => Promise<ArrayBuffer>
 */
const _blobGetter = (sobjectType, bodySegment) =>
  function (data) {
    const opts = this._getOpts(data);
    const id = resolveId(opts);
    opts.resource = sobjectPath(sobjectType, id, bodySegment);
    opts.method = 'GET';
    opts.blob = true;
    return this._apiRequest(opts);
  };

const getAttachmentBody    = _blobGetter('attachment',    'body');
const getDocumentBody      = _blobGetter('document',      'body');
const getContentVersionData = _blobGetter('contentversion', 'versiondata');
```

The JSDoc comment previously on each individual function should be consolidated as a comment above the factory, with per-constant annotations if desired.

#### Step-by-step mechanics

1. Add `_blobGetter` as a module-scoped factory above the three functions.
2. Replace the three function bodies with the factory invocations.
3. Confirm that the `BODY_GETTER_MAP` and `getBinaryContent` dispatch table still point to the same exported names — no change needed there.
4. Run `npm test` (specifically blob/binary tests in `test/crud.js`).

---

### R20 — Extract Private `_get()` Helper for GET Methods in `api.js`

**Addresses:** M-1 (Duplicated Code — Repeated `opts.resource/method/return` Pattern)
**Priority:** Medium | **Complexity:** Low | **Risk:** Low
**Refactoring Technique:** Extract Method + Parameterize Method
**SOLID fix:** DRY

#### Problem

Six consecutive API methods (`getResources`, `getSObjects`, `getMetadata`, `getDescribe`, `getLimits`, `getPasswordStatus`) share an identical three-line structure: assign `opts.resource`, set `opts.method = 'GET'`, return `this._apiRequest(opts)`.

#### Solution

Introduce a private helper `_get(opts, resource)` as a module-scoped function:

```js
/**
 * Convenience helper: set resource and method, then dispatch via _apiRequest.
 * Used by all read-only metadata API methods.
 * @param {object} opts - Request options (mutated in place).
 * @param {string} resource - Resource path to set on opts.
 * @returns {Promise<object>}
 */
const _get = function (opts, resource) {
  opts.resource = resource;
  opts.method = 'GET';
  return this._apiRequest(opts);
};
```

Example usage in `getResources`:

```js
const getResources = function (data) {
  const opts = this._getOpts(data);
  return _get.call(this, opts, '/');
};
```

Note: This helper is **not exported** — it is module-internal, called via `.call(this, ...)`.

#### Step-by-step mechanics

1. Add `_get` as a module-scoped `function` (not a method — it needs `this` via `.call`).
2. Replace the three-line pattern in each of the six GET-only methods.
3. Run `npm test` (query/crud tests) to verify.

**Important:** Do not use `_get` for methods that also set `opts.body` or other properties beyond resource/method, e.g. `updatePassword`. Only apply to pure GET dispatchers.

---

### R21 — Replace `onRefresh` Callback Convention with Promise-Returning Hook

**Addresses:** M-14 (Callback-Style API Mixed with Promise)
**Priority:** Medium | **Complexity:** Medium | **Risk:** Medium
**Refactoring Technique:** Replace Error Code with Exception (async variant) — specifically, migrating the legacy callback-bridge to a native Promise chain
**SOLID fix:** Consistent interface contract, eliminates mixed async paradigms
**Breaking Change:** Yes — requires semver minor or major bump

#### Problem

`_notifyAndResolve` in `lib/auth.js` bridges the Promise-based library to an error-first callback convention for `onRefresh`. The entire library is Promise-based; this is the sole callback exception.

```js
// Current (problematic):
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

#### Solution

Accept `onRefresh` as a function that may return a Promise (or `void`). Use `Promise.resolve()` wrapping to handle both sync and async returns uniformly:

```js
/**
 * Notify the onRefresh hook if configured, then resolve with the updated OAuth.
 * onRefresh may be async (return a Promise) or synchronous (return void/undefined).
 * @param {object} newOauth - The newly obtained OAuth credentials.
 * @param {object} oldOauth - The previous OAuth credentials.
 * @returns {Promise<object>} Resolves with newOauth.
 */
const _notifyAndResolve = function (newOauth, oldOauth) {
  if (this.onRefresh) {
    return Promise.resolve(this.onRefresh(newOauth, oldOauth)).then(() => newOauth);
  }
  return Promise.resolve(newOauth);
};
```

#### Migration notes

- Callers that pass `onRefresh: (newOauth, oldOauth, cb) => { cb(); }` will continue to work **silently** because:
  - Their function receives `(newOauth, oldOauth)` — the third `cb` argument is never provided.
  - The function returns `undefined`, which `Promise.resolve(undefined)` handles correctly.
  - However, callers relying on calling `cb(err)` to signal errors will silently swallow those errors under the new API.
- **Document the migration** in the changelog: `onRefresh` must now either return a rejected Promise to signal an error, or throw synchronously.
- If backward compatibility with callback-style consumers is required in the same minor version, add a shim detection:

```js
const _notifyAndResolve = function (newOauth, oldOauth) {
  if (!this.onRefresh) return Promise.resolve(newOauth);
  // Shim: detect if caller expects 3-argument callback form
  if (this.onRefresh.length >= 3) {
    // Legacy callback bridge — deprecated
    return new Promise((resolve, reject) => {
      this.onRefresh.call(this, newOauth, oldOauth, (err) => {
        if (err) reject(err); else resolve(newOauth);
      });
    });
  }
  return Promise.resolve(this.onRefresh(newOauth, oldOauth)).then(() => newOauth);
};
```

The shim can be removed in the next major version.

#### Step-by-step mechanics

1. Replace `_notifyAndResolve` body with the Promise-wrapping version.
2. Update documentation/README to describe the new contract.
3. Update `test/connection.js` tests for `_notifyAndResolve` if they pass a callback.
4. Run `npm test` to confirm all auth/refresh tests pass.

---

### R22 — Name WebSocket Frame Constants in `test/mock/cometd-server.js`

**Addresses:** M-5 (Magic Numbers — WebSocket Frame Constants)
**Priority:** Medium | **Complexity:** Low | **Risk:** Low
**Refactoring Technique:** Replace Magic Number with Symbolic Constant

#### Problem

The hand-rolled WebSocket frame parser in `test/mock/cometd-server.js` uses raw RFC 6455 byte values (`0x80`, `0x7f`, `0x0f`, `0x1`, `0x8`, `0x81`, `0x88`, `126`, `127`, `4`, `10`, `65536`) without names, making the frame-handling logic opaque.

#### Solution

Add a named-constant block at the top of the file:

```js
// RFC 6455 WebSocket frame constants
const WS_FIN_TEXT    = 0x81;  // FIN bit set + opcode 0x1 (text frame)
const WS_FIN_CLOSE   = 0x88;  // FIN bit set + opcode 0x8 (close frame)
const WS_OPCODE_MASK = 0x0f;  // low nibble mask for opcode extraction
const WS_OPCODE_TEXT = 0x1;   // text data frame
const WS_OPCODE_CLOSE= 0x8;   // connection close frame
const WS_MASK_BIT    = 0x80;  // masking bit in second byte
const WS_PAYLOAD_MASK= 0x7f;  // 7-bit payload length mask
const WS_PAYLOAD_16  = 126;   // payload length sentinel: read next 2 bytes
const WS_PAYLOAD_64  = 127;   // payload length sentinel: read next 8 bytes
const WS_OFFSET_16   = 4;     // header offset when 16-bit extended length used
const WS_OFFSET_64   = 10;    // header offset when 64-bit extended length used
const WS_MAX_INLINE  = 126;   // max payload bytes in inline (1-byte) length form
const WS_MAX_16BIT   = 65536; // max payload bytes in 16-bit length form
```

Then replace every bare literal in `_createWsWrapper` with these constants.

#### Step-by-step mechanics

1. Add the constant block near the top of `test/mock/cometd-server.js` (after `require` statements).
2. Use global find-replace within that file only to substitute each literal.
3. Read through `_createWsWrapper` once to confirm all usages are covered.
4. Run streaming tests to confirm mock server still parses frames correctly.

---

### R23 — Name `WS_RESPONSE_TIMEOUT_MS` Constant in `cometd.js`

**Addresses:** M-6 (Magic Number — Hardcoded WebSocket Timeout)
**Priority:** Medium | **Complexity:** Low | **Risk:** Low
**Refactoring Technique:** Replace Magic Number with Symbolic Constant

#### Problem

`10000` (ms) appears inline in `lib/cometd.js` as the non-connect WebSocket response timeout. Unlike `DEFAULT_TIMEOUT` (110000 ms), it has no name, no configuration option, and no rationale comment.

#### Solution

Add to the module-level constants block at the top of `lib/cometd.js`:

```js
const WS_RESPONSE_TIMEOUT_MS = 10000; // non-connect WebSocket response timeout
```

Replace the inline `10000` with `WS_RESPONSE_TIMEOUT_MS`.

#### Step-by-step mechanics

1. Add the constant to the module-level block alongside `DEFAULT_TIMEOUT`, `BAYEUX_VERSION`, etc.
2. Replace `}, 10000);` with `}, WS_RESPONSE_TIMEOUT_MS);`.
3. Run streaming tests.

---

### R24 — Standardize Optional-Argument Pattern in `fdcstream.js`

**Addresses:** M-7 (Inconsistent Style — Mixed `opts || {}` and Default Parameter Syntax)
**Priority:** Medium | **Complexity:** Low | **Risk:** Low
**Refactoring Technique:** Substitute Algorithm (style normalization)

#### Problem

`lib/fdcstream.js` uses the old `opts = opts || {}` guard in three places, while all other modules use ES6 default parameter syntax `(opts = {})`.

```js
// fdcstream.js (old style):
constructor(opts) {
  opts = opts || {};
  ...
}
subscribe(opts) {
  opts = opts || {};
  ...
}
```

#### Solution

Convert to ES6 default parameters throughout `fdcstream.js`:

```js
constructor(opts = {}) {
  // opts is guaranteed an object, remove the guard assignment
  ...
}

subscribe(opts = {}) {
  // same
  ...
}
```

Note: The `Subscription` constructor also uses `opts = opts || {}` on line 18. Fix that too.

#### Step-by-step mechanics

1. Change all three method signatures in `fdcstream.js` to use `= {}` default.
2. Remove the `opts = opts || {};` assignment lines inside the method bodies.
3. Run `npm test` (streaming tests) to confirm behavior unchanged.

---

### R25 — Add JSDoc `@typedef` Shapes for `opts` Bags

**Addresses:** M-4 (Primitive Obsession — The `opts` Bag as Catch-All Parameter Object)
**Priority:** Medium | **Complexity:** Medium | **Risk:** Low
**Refactoring Technique:** Introduce Parameter Object (documentation tier — no runtime change)
**SOLID fix:** ISP — makes the interface contract explicit

#### Problem

The `opts` object flowing through all API methods has no defined shape. Over 20 undocumented properties spread across `api.js`, `http.js`, and `optionhelper.js` with no typedef, making the API contract invisible to callers and IDE tooling.

#### Solution

Add a JSDoc `@typedef` file (or block at the top of `lib/api.js`) defining the common option shapes:

```js
/**
 * @typedef {object} ApiRequestOptions
 * @property {object}  oauth              - OAuth credentials.
 * @property {string}  [resource]         - Relative API resource path (e.g. '/sobjects/Account').
 * @property {string}  [uri]              - Absolute URI (overrides resource).
 * @property {string}  [method]           - HTTP method: 'GET', 'POST', 'PATCH', 'DELETE'.
 * @property {string}  [body]             - Serialized request body.
 * @property {object}  [headers]          - Additional HTTP headers.
 * @property {object}  [qs]               - Query string parameters.
 * @property {boolean} [blob=false]       - If true, return response as ArrayBuffer.
 * @property {boolean} [raw=false]        - If true, skip Record wrapping on responses.
 * @property {AbortSignal} [signal]       - AbortSignal for request cancellation.
 * @property {object}  [requestOpts]      - Additional fetch options merged onto request.
 */

/**
 * @typedef {object} CrudOptions
 * @extends ApiRequestOptions
 * @property {Record|object} [sobject]    - SObject record instance or plain object.
 * @property {string}        [type]       - SObject API name (e.g. 'Account').
 * @property {string}        [id]         - Salesforce record ID.
 * @property {string[]}      [fields]     - Field names to retrieve (for retrieve()).
 */

/**
 * @typedef {object} QueryOptions
 * @extends ApiRequestOptions
 * @property {string}  query              - SOQL query string.
 * @property {boolean} [fetchAll=false]   - If true, auto-paginate all result pages.
 * @property {boolean} [includeDeleted=false] - If true, query deleted records.
 * @property {boolean} [raw=false]        - If true, return plain objects not Record instances.
 */
```

Place these typedef blocks at the top of `lib/api.js` (after requires). They provide IDE autocomplete and serve as living documentation without requiring TypeScript migration.

#### Step-by-step mechanics

1. Add `@typedef` blocks at the top of `lib/api.js`.
2. Update method-level `@param {object} data` annotations to reference the relevant typedef (e.g., `@param {CrudOptions} data`).
3. No runtime changes — this is documentation only.

---

### R26 — Remove Section-Divider Comments in `api.js`

**Addresses:** M-8 (What Comment / Redundant Comments)
**Priority:** Low | **Complexity:** Low | **Risk:** Low
**Refactoring Technique:** Remove Comments (where function names make them redundant)

#### Problem

Three section-divider comments in `lib/api.js` (`/* CRUD methods */`, `/* Blob/binary methods */`, `/* Search */`) add no information beyond what the function names and JSDoc already convey.

#### Solution

Delete the three `/* ... */` section divider blocks. Separate logical groups visually with a single blank line between them.

#### Step-by-step mechanics

1. Delete lines containing `/* CRUD methods */`, `/* Blob/binary methods */`, and `/* Search */`.
2. If desired, add blank lines to preserve visual grouping.
3. No tests required — comment deletion is a cosmetic change.

---

### R27 — Fix `getLastRequest` Naming / Semantics in Mock

**Addresses:** M-13 (Fallacious Method Name)
**Priority:** Medium | **Complexity:** Low | **Risk:** Low
**Refactoring Technique:** Rename Method + Substitute Algorithm (fix the semantics, not just the name)
**Note:** Subsumed into R17 if that refactoring is done — implement as part of the class redesign.

#### Problem

`getLastRequest()` returns `requestStack[0]` — the first-pushed item, not the last. The name is wrong, and the current behavior is only safe because `reset()` is called in `afterEach`, keeping the stack to a single item.

#### Solution (if R17 is not implemented)

Change the accumulation strategy to unshift (prepend) so `[0]` is always the most-recent request:

```js
// In the request handler:
requestStack.unshift(req);           // prepend — index 0 is newest

// getLastRequest is now semantically correct:
const getLastRequest = () => requestStack[0];
```

Alternatively, change to read from the end:

```js
const getLastRequest = () => requestStack[requestStack.length - 1];
```

**If R17 is implemented,** fix this as part of the `MockSfdcApi` class (see R17 solution — `_recordedRequests` uses `push` + `length - 1` for true last).

#### Step-by-step mechanics

1. Change `requestStack.push(req)` to `requestStack.unshift(req)` in the request handler, OR change `getLastRequest` to read from `length - 1`.
2. Run all test suites to verify request assertions still hold.

---

### R28 — Eliminate Dead Code and Redundant Constructs

**Addresses:** L-3 (Dead Code), L-5 (Redundant Assignment), M-15 (Redundant `Promise.resolve`), L-9 (Unused `isBoolean` Export)
**Priority:** Low | **Complexity:** Low | **Risk:** Low
**Refactoring Technique:** Inline Temp (for `Promise.resolve` wrap), Remove Dead Code

#### Problem

Several small dead-code and redundant-code instances remain:

1. **`test/integration.js` lines 15–16:** Empty `if (creds == null) { /* comments */ }` block — no executable code.
2. **`test/integration.js` line 7:** `let client = undefined;` — explicit `undefined` is redundant.
3. **`lib/auth.js` line 187:** `return Promise.resolve(newOauth)` inside a `.then()` — wrapping is unnecessary.
4. **`lib/util.js` `isBoolean`:** Exported but unused in `lib/` or tests.

#### Solution

Fix each instance:

```js
// 1. Remove empty if block in test/integration.js
// Delete:
if (creds == null) {
  // Can't run integration tests
  // Mocha.suite.skip();
}

// 2. Change redundant undefined assignment:
let client;   // was: let client = undefined;

// 3. Remove Promise.resolve wrap in auth.js authenticate():
return newOauth;   // was: return Promise.resolve(newOauth);

// 4. lib/util.js — remove isBoolean from module.exports,
//    or add a JSDoc comment explaining it is intentionally kept for plugin authors.
```

#### Step-by-step mechanics

1. In `test/integration.js`: delete the empty `if` block; change `let client = undefined` to `let client`.
2. In `lib/auth.js` `authenticate()`: change `return Promise.resolve(newOauth)` to `return newOauth`.
3. In `lib/util.js`: decide — either remove `isBoolean` from exports, or add `// Exported for plugin authors` comment. If removed, run `npm test` to confirm nothing imports it.

---

### R29 — Extract `_parseWsFrames` / `_buildWsFrame` Helpers in Test Mock

**Addresses:** L-12 (Long Method — `_createWsWrapper`)
**Priority:** Low | **Complexity:** Medium | **Risk:** Low
**Refactoring Technique:** Extract Method (applied to test helper code)

#### Problem

`_createWsWrapper` in `test/mock/cometd-server.js` is 84 lines long and handles WebSocket frame parsing, unmasking, opcode dispatch, and frame serialization in a single inline closure. This makes the method difficult to read and maintain even for test code.

#### Solution

Extract two focused helper methods on `MockCometDServer`:

```js
/**
 * Parse as many complete WebSocket frames as possible from `buffer`.
 * @param {Buffer} buffer - Current accumulation buffer.
 * @returns {{ frames: Array<{opcode: number, payload: string}>, remainder: Buffer }}
 */
_parseWsFrames(buffer) {
  const frames = [];
  let buf = buffer;
  while (buf.length >= 2) {
    const secondByte = buf[1];
    const masked = (secondByte & WS_MASK_BIT) !== 0;
    let payloadLen = secondByte & WS_PAYLOAD_MASK;
    let offset = 2;

    if (payloadLen === WS_PAYLOAD_16) {
      if (buf.length < WS_OFFSET_16) break;
      payloadLen = buf.readUInt16BE(2);
      offset = WS_OFFSET_16;
    } else if (payloadLen === WS_PAYLOAD_64) {
      if (buf.length < WS_OFFSET_64) break;
      payloadLen = Number(buf.readBigUInt64BE(2));
      offset = WS_OFFSET_64;
    }

    const maskSize = masked ? 4 : 0;
    const totalLen = offset + maskSize + payloadLen;
    if (buf.length < totalLen) break;

    let payload = buf.subarray(offset + maskSize, totalLen);
    if (masked) {
      const mask = buf.subarray(offset, offset + maskSize);
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }

    const opcode = buf[0] & WS_OPCODE_MASK;
    buf = buf.subarray(totalLen);
    frames.push({ opcode, payload: payload.toString('utf8') });
  }
  return { frames, remainder: buf };
}

/**
 * Build a WebSocket text frame for `text`.
 * @param {string} text
 * @returns {Buffer}
 */
_buildWsFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  let header;
  if (payload.length < WS_MAX_INLINE) {
    header = Buffer.alloc(2);
    header[0] = WS_FIN_TEXT;
    header[1] = payload.length;
  } else if (payload.length < WS_MAX_16BIT) {
    header = Buffer.alloc(WS_OFFSET_16);
    header[0] = WS_FIN_TEXT;
    header[1] = WS_PAYLOAD_16;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(WS_OFFSET_64);
    header[0] = WS_FIN_TEXT;
    header[1] = WS_PAYLOAD_64;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, payload]);
}
```

`_createWsWrapper` then becomes a thin orchestrator: calling `_parseWsFrames`, dispatching based on opcode, and using `_buildWsFrame` in the `send` method.

**Note:** R22 (named WS constants) should be implemented before or alongside R29 since both modify the same method and constants are used in the extracted helpers.

#### Step-by-step mechanics

1. Add `_parseWsFrames(buffer)` and `_buildWsFrame(text)` as methods on `MockCometDServer`.
2. Refactor `_createWsWrapper` to call these methods.
3. The `emitter.send` closure calls `this._buildWsFrame` — note `this` context; bind appropriately or pass as parameter.
4. Run streaming tests to confirm mock behavior unchanged.

---

## Additional Observations (No New Recommendations)

### L-1, L-2 — Test Indecent Exposure of Private Fields

Tests in `test/record.js` and `test/streaming.js` directly access `_fields`, `_changed`, `_previous` (Record) and `_clientId`, `_subscriptions`, `_connected` (CometDClient). These smells were identified in the report but no specific refactoring action is recommended at this time because:
- Fixing them requires either adding public query methods to `Record` and `CometDClient` (API surface expansion) or restructuring the tests (non-trivial test rewrite).
- The tests are functionally correct; the coupling is a maintenance risk, not a correctness issue.

**Defer to a future phase** if/when `Record` or `CometDClient` internals are restructured.

### L-4 — Loose Equality in `test/integration.js`

`== null` is used in two places. These are intentional (they catch both `null` and `undefined`), but they are inconsistent with the rest of the codebase. Could be addressed in the same commit as R28 by changing to `=== null || === undefined` or using the nullish coalescing operator. Not assigned a separate recommendation number due to trivial scope.

### L-6 — Inline `require('crypto')` in `cometd-server.js`

Move `const crypto = require('crypto')` to the top of the file. This is a one-line fix; it can be done in the same commit as R22 or R29 to keep related changes together.

### L-7 — Hardcoded Test Port Numbers

Define `34445` as a named constant at the top of `test/streaming.js` where it currently appears as a magic literal for the second mock CometD server. This is one line; address in the same commit as R22 if touching that file.

### L-11 — `_connectLoop` Catches Without Logging

The catch blocks in `_connectLoop`, `_rehandshake`, and `_scheduleReconnect` silently discard errors. Emitting the original error via `transport:down` event data would improve debuggability:

```js
} catch (err) {
  if (this._disconnecting) return;
  this._connected = false;
  this.emit('transport:down', err);   // pass error as event payload
  this._scheduleReconnect();
  return;
}
```

This is non-breaking (existing listeners receive the error object as the first argument, which they currently ignore). Address in the same commit as R18.

### M-10 — Inconsistent Error Handling (`throw` vs `Promise.reject`)

The inconsistency between synchronous `throw` in `insert()` and `Promise.reject()` in `getIdentity()` is intentional in practice (both are safe inside `.then()` chains) but creates a confusing contract. Adding `Introduce Assertion` JSDoc documentation (`@throws` annotations) to clarify the synchronous validators would be sufficient without requiring a behavior change.

### M-16 — `_connectLoop` Divergent Change

`_connectLoop` in `cometd.js` handles six responsibilities (send connect, parse response, detect failure, dispatch data, apply interval, error recovery). Extracting `_dispatchDataMessages(responses)` and `_handleConnectFailure(response)` would improve SRP compliance, but the method is 52 lines and currently readable. Deferring to Phase 4 when the streaming module is next touched.

### M-17 — `apexRest` Missing Guard for `opts.uri`

`apexRest` in `lib/api.js` should guard against missing `opts.uri`:

```js
if (!opts.uri) {
  return Promise.reject(new Error('apexRest requires opts.uri'));
}
```

This aligns with `getIdentity()`'s pattern and eliminates the cryptic `TypeError: Cannot read properties of undefined (reading 'startsWith')`.

### M-12 — Feature Envy in `multipart.js`

The `contentversion` → `entity`/`name` mapping logic in `lib/multipart.js` belongs in `lib/constants.js`. Minimal fix:

```js
// lib/constants.js
const MULTIPART_ENTITY_MAP = { contentversion: 'content' };
const MULTIPART_BODY_MAP   = { contentversion: 'VersionData' };
```

---

## SOLID Principle Impact Matrix

| Principle | Current Violations | Resolved by | Remaining After Phase 3 |
|-----------|-------------------|-------------|------------------------|
| **S — Single Responsibility** | `http.js` (transport + auth state), `cometd.js` (_connectLoop) | R16, (M-16 deferred) | M-16 deferred |
| **O — Open/Closed** | `http.js` (hardcoded error codes in retry) | R15 (_isTokenError extracted) | None |
| **L — Liskov Substitution** | None | — | None |
| **I — Interface Segregation** | `opts` bag, `_getOpts`/`_buildSignal` public exposure | R25 (typedef), R17 (test isolation) | `_getOpts` still on prototype |
| **D — Dependency Inversion** | `multipart.js` directly creates `FormData`/`Blob` | Not in scope (Web API dependency) | Remains |

---

## Risk Assessment Summary

| Recommendation | Risk | Mitigation |
|---------------|------|------------|
| R15 — `_retryCount` → closure parameter | Low | Auto-refresh path covered by `test/errors.js` |
| R16 — Remove `_apiAuthRequest` side-effect | Low | Auth flow tests in `test/crud.js`, `test/connection.js` |
| R17 — Mock server class encapsulation | Low | Mechanical test file updates; run full `npm test` |
| R18 — `_resubscribeAll()` extract | Low | Covered by `test/streaming.js` |
| R19 — `_blobGetter` factory | Low | Covered by blob tests in `test/crud.js` |
| R20 — `_get()` helper | Low | Wide coverage in `test/query.js`, `test/crud.js` |
| R21 — `onRefresh` Promise migration | Medium | Breaking change; use shim pattern; document in changelog |
| R22 — WS frame constants | Low | No logic change — streaming test suite confirms |
| R23 — `WS_RESPONSE_TIMEOUT_MS` | Low | Constant rename only |
| R24 — `fdcstream.js` default params | Low | Streaming test suite confirms |
| R25 — JSDoc typedefs | Low | Documentation only; no runtime change |
| R26 — Remove section comments | Low | Cosmetic; no test needed |
| R27 — `getLastRequest` fix | Low | Mock invariant; run full test suite |
| R28 — Dead code removal | Low | Small scope; run `npm test` |
| R29 — WS frame helpers | Low | Streaming tests; `this` context binding must be correct |

---

## Recommended Implementation Sequence

The following sequence minimizes merge conflicts and builds on each change:

1. **R26** — Remove section divider comments in `api.js` (cosmetic, zero risk, establishes clean baseline).
2. **R28** — Eliminate dead code and redundant constructs (removes noise before deeper changes).
3. **R23** — Add `WS_RESPONSE_TIMEOUT_MS` constant (one-line, zero risk).
4. **R24** — Standardize `fdcstream.js` optional-argument style (isolated to one file).
5. **R15** — Replace `opts._retryCount` sentinel with closure parameter (high-impact, low-risk).
6. **R16** — Remove side-effect from `_apiAuthRequest` (depends on reviewing R15's changes to retry path).
7. **R18** — Extract `_resubscribeAll()` in `cometd.js` (isolated; add error emission as noted in L-11 observation).
8. **R19** — Extract `_blobGetter` factory (isolated to `api.js`).
9. **R20** — Extract `_get()` helper (isolated to `api.js`; do after R19 since both touch `api.js`).
10. **R22** — Name WS frame constants in `cometd-server.js` (prerequisite for R29).
11. **R29** — Extract WS frame helpers (build on R22).
12. **R17** — Encapsulate mock server state in class (larger test refactor; do after mock constants settled).
13. **R27** — Fix `getLastRequest` semantics (subsumed into R17 if done together).
14. **R25** — Add JSDoc `@typedef` shapes (documentation pass; do near end to incorporate all changes).
15. **R21** — Replace `onRefresh` callback with Promise hook (breaking change; do last, coordinate with version bump).
