# Code Smell Detection Report — nforce8

**Generated:** 2026-03-28
**Scope:** `index.js`, `lib/` (all files), `test/` (all files)
**Languages:** JavaScript (Node.js >=22)
**Frameworks/Runtimes:** Node.js built-in `fetch`, EventEmitter, Mocha + should.js (tests)

---

## Executive Summary

The nforce8 codebase is a well-structured, modernized rewrite of a legacy Salesforce REST API client. The refactoring history is evident: the original monolithic `index.js` (~1089 lines mentioned in CLAUDE.md) has been broken into focused domain modules under `lib/`. The resulting code is significantly cleaner than its origin, but several code smells remain — mostly at the moderate and low severity tiers. No high-severity architectural smells were found.

**Total Issues Found:** 32
- High Severity (Architectural Impact): 2
- Medium Severity (Design / Maintainability): 17
- Low Severity (Readability / Style): 13

**Overall Code Quality Grade: B**

---

## Project Analysis

| File | Lines | Role |
|------|-------|------|
| `lib/api.js` | 649 | Salesforce API methods (CRUD, query, streaming) |
| `lib/cometd.js` | 504 | Lightweight CometD/Bayeux client |
| `test/mock/cometd-server.js` | 467 | Mock CometD server for tests |
| `test/record.js` | 379 | Record class test suite |
| `test/streaming.js` | 344 | Streaming API test suite |
| `test/connection.js` | 324 | Connection validation tests |
| `lib/auth.js` | 300 | OAuth authentication flows |
| `test/crud.js` | 273 | CRUD API test suite |
| `lib/record.js` | 233 | SObject record class |
| `test/query.js` | 204 | Query/search test suite |
| `lib/http.js` | 200 | HTTP request execution layer |
| `lib/fdcstream.js` | 137 | Streaming API facade (wraps cometd.js) |
| `lib/util.js` | 106 | Type/header utility functions |
| `lib/optionhelper.js` | 98 | API request options builder |
| `lib/connection.js` | 93 | Connection options validation |
| `lib/multipart.js` | 67 | Multipart form builder |
| `lib/constants.js` | 56 | Application constants |
| `lib/plugin.js` | 52 | Plugin system |
| `lib/errors.js` | 23 | Error factory functions |
| `index.js` | 99 | Entry point / Connection constructor |

---

## High Severity Issues (Architectural Impact)

### H-1: Mutable Data — Global Module-Level State in `test/mock/sfdc-rest-api.js`

**Category:** Data Dealers — Global Data / Mutable Data
**Severity:** High
**GRASP Violation:** Low Coupling (shared mutable state creates hidden coupling between tests)

**Location:** `test/mock/sfdc-rest-api.js`, lines 4–6

```js
let port = process.env.PORT || 33333;
let serverStack = [];
let requestStack = [];
```

**Description:** These three module-level mutable variables are shared across all test files that `require` this mock module. `serverStack` and `requestStack` are closures that persist for the process lifetime. Any test that calls `reset()`, `start()`, or `stop()` modifies state shared with all other test suites running in the same process.

**Observed impact:**
- `test/crud.js` and `test/query.js` both call `api.start(port, done)` with the same port `33333`. If a prior test suite does not fully call `api.stop()`, the second start will silently succeed (clearing the stack) but its behavior may be non-deterministic.
- `requestStack` uses `push` (but `getLastRequest` reads index `[0]`), meaning it reads the *first-pushed*, not the most recent request. This is consistent in practice because `reset()` clears the stack before each request, but it is fragile: if two requests arrive before `reset()` is called, the wrong request will be returned.

**Violated Principles:**
- **DRY / Isolation:** Tests should not share mutable state.
- **Single Responsibility:** The mock module serves dual roles (server lifecycle AND request recording).
- **GRASP Protected Variations:** Any test running out of order could corrupt the shared state.

**Refactoring Suggestion:** Encapsulate the server and request state in a class that is instantiated per test file:

```js
class MockSfdcApi {
  constructor() { this.serverStack = []; this.requestStack = []; }
  // ...
}
module.exports = { MockSfdcApi };
```

---

### H-2: Hidden Dependency / Temporal Coupling — `opts._retryCount` in `lib/http.js`

**Category:** Data Dealers — Temporary Field / Hidden Dependencies
**Severity:** High
**SOLID Violation:** ISP — callers must know about the invisible `_retryCount` sentinel field

**Location:** `lib/http.js`, lines 178–192

```js
.catch((err) => {
  if (
    err.errorCode &&
    (err.errorCode === 'INVALID_SESSION_ID' || err.errorCode === 'Bad_OAuth_Token') &&
    this.autoRefresh === true &&
    (opts.oauth?.refresh_token || (this.username && this.password)) &&
    !opts._retryCount          // <— hidden sentinel on the shared opts bag
  ) {
    return this.autoRefreshToken(opts).then(() => {
      opts._retryCount = 1;    // <— mutates the caller's object
      return this._apiRequest(opts);
    });
  }
  throw err;
});
```

**Description:** `opts` is the same object passed in by the caller. By writing `opts._retryCount = 1` on it, the method secretly mutates the caller's data bag to prevent re-entry. This is a Temporary Field smell: `_retryCount` exists purely to guard one internal code path, is never documented as part of the `opts` contract, and its name uses the private-by-convention `_` prefix on a public parameter object. If a caller reuses the same opts object across calls (unlikely but possible), it will silently suppress the auto-refresh on subsequent calls.

**Violated Principles:**
- **OCP:** Changing retry logic requires understanding and modifying this mutation side-effect.
- **Principle of Least Surprise:** Callers do not expect `opts` to be mutated.
- **Law of Demeter / Information Expert:** The retry state belongs to the call, not the options bag.

**Refactoring Suggestion:** Track the retry at the call level, not on the shared opts:

```js
const _apiRequestWithRetry = function (opts, retried = false) {
  // ...
  .catch((err) => {
    if (!retried && isTokenError(err) && this.autoRefresh) {
      return this.autoRefreshToken(opts).then(() => _apiRequestWithRetry.call(this, opts, true));
    }
    throw err;
  });
};
```

---

## Medium Severity Issues (Design Problems)

### M-1: Duplicated Code — Repeated `opts.method = 'GET'` + `opts.resource = ...` + `return this._apiRequest(opts)` Pattern

**Category:** Dispensables — Duplicated Code
**Severity:** Medium
**SOLID Violation:** DRY

**Location:** `lib/api.js`, throughout (see lines 75–78, 139–141, 151–153, 165–167, 179–181, 189–193)

Almost every read-only API method follows the identical three-line pattern:

```js
opts.resource = <path>;
opts.method = 'GET';
return this._apiRequest(opts);
```

Six consecutive "GET metadata" methods (`getResources`, `getSObjects`, `getMetadata`, `getDescribe`, `getLimits`, `getPasswordStatus`) each replicate this structure. There is no helper that accepts a resource path and returns the request, making the pattern harder to change uniformly if the calling convention ever evolves (e.g., adding tracing headers to all reads).

**Refactoring Suggestion:** Introduce a private `_get(opts, resource)` helper:

```js
const _get = function (opts, resource) {
  opts.resource = resource;
  opts.method = 'GET';
  return this._apiRequest(opts);
};
```

---

### M-2: Duplicated Code — Repeated Blob Retrieval Methods

**Category:** Dispensables — Duplicated Code
**Severity:** Medium

**Location:** `lib/api.js`, lines 335–370

```js
const getAttachmentBody = function (data) {
  const opts = this._getOpts(data);
  const id = resolveId(opts);
  opts.resource = sobjectPath('attachment', id, 'body');
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};

const getDocumentBody = function (data) {
  // identical 6 lines with 'document' / 'body'
};

const getContentVersionData = function (data) {
  // identical 6 lines with 'contentversion' / 'versiondata'
};
```

All three are structurally identical, differing only in SObject type and body path segment. The `BODY_GETTER_MAP` (lines 308–312) already encodes the type→method-name relationship but then delegates to three identical functions. This is Oddball Solution and Duplicated Code combined.

**Refactoring Suggestion:** Introduce a single private factory:

```js
const _blobGetter = function (sobjectType, bodySegment) {
  return function (data) {
    const opts = this._getOpts(data);
    const id = resolveId(opts);
    opts.resource = sobjectPath(sobjectType, id, bodySegment);
    opts.method = 'GET';
    opts.blob = true;
    return this._apiRequest(opts);
  };
};

const getAttachmentBody = _blobGetter('attachment', 'body');
const getDocumentBody = _blobGetter('document', 'body');
const getContentVersionData = _blobGetter('contentversion', 'versiondata');
```

---

### M-3: Duplicated Code — Repeated `this._rehandshake()` Subscription Re-Subscription Logic

**Category:** Dispensables — Duplicated Code
**Severity:** Medium

**Location:** `lib/cometd.js`, lines 364–395 (`_rehandshake` and `_scheduleReconnect`)

Both `_rehandshake` and `_scheduleReconnect` contain the identical subscription-replay block:

```js
for (const topic of this._subscriptions.keys()) {
  await this._sendSubscribe(topic);
}
```

If the re-subscribe logic ever needs to change (e.g., to pass replay IDs), it must be updated in two places.

**Refactoring Suggestion:** Extract to a `_resubscribeAll()` helper method:

```js
async _resubscribeAll() {
  for (const topic of this._subscriptions.keys()) {
    await this._sendSubscribe(topic);
  }
}
```

---

### M-4: Primitive Obsession — The `opts` Bag as Catch-All Parameter Object

**Category:** Data Dealers — Primitive Obsession
**Severity:** Medium
**SOLID Violation:** ISP — callers cannot determine which properties are required vs. optional

**Location:** `lib/api.js` (all methods), `lib/http.js`, `lib/optionhelper.js`

The `opts` object has no defined shape. It grows and is mutated by `_getOpts`, then further mutated by each API method (`opts.resource`, `opts.method`, `opts.body`, etc.), then re-read by `optionHelper.getApiRequestOptions`. Properties include: `oauth`, `resource`, `uri`, `method`, `body`, `headers`, `qs`, `multipart`, `blob`, `raw`, `fetchAll`, `includeDeleted`, `sobject`, `type`, `id`, `fields`, `query`, `search`, `url`, `urlParams`, `topic`, `replayId`, `signal`, `requestOpts`, `_retryCount`.

This is a form of Primitive Obsession where a plain JavaScript object is used as a polymorphic, ever-growing data bag. There are no TypeScript types, JSDoc shapes, or factory functions that communicate what a valid opts object looks like for each method.

**Refactoring Suggestion (incremental):** Add JSDoc `@typedef` declarations for the common shapes (`ApiRequestOptions`, `QueryOptions`, `CrudOptions`) to at least communicate intent without requiring TypeScript migration.

---

### M-5: Magic Numbers — WebSocket Frame Constants in `test/mock/cometd-server.js`

**Category:** Lexical Abusers — Magic Number
**Severity:** Medium

**Location:** `test/mock/cometd-server.js`, lines 285–355

The hand-rolled WebSocket frame parser contains numerous unexplained byte values:

```js
const masked = (secondByte & 0x80) !== 0;
let payloadLen = secondByte & 0x7f;
// ...
if (payloadLen === 126) { ... payloadLen = buffer.readUInt16BE(2); offset = 4; }
else if (payloadLen === 127) { ... payloadLen = Number(buffer.readBigUInt64BE(2)); offset = 10; }
// ...
if (opcode === 0x1) { ... }   // text frame
else if (opcode === 0x8) { ... }  // close frame
header[0] = 0x81; // FIN + text (partially commented)
header[0] = 0x88; // FIN + close (commented)
```

Some constants have inline comments (`// FIN + text`, `// FIN + close`) but others (`0x80`, `0x7f`, `0x0f`, `126`, `127`, `4`, `10`) do not. While these are part of RFC 6455 and somewhat self-documenting to WebSocket-familiar readers, using named constants throughout would make the intent explicit.

**Refactoring Suggestion:** Define named constants:

```js
const WS_FIN_TEXT    = 0x81;
const WS_FIN_CLOSE   = 0x88;
const WS_OPCODE_MASK = 0x0f;
const WS_OPCODE_TEXT = 0x01;
const WS_OPCODE_CLOSE= 0x08;
const WS_MASK_BIT    = 0x80;
const WS_PAYLOAD_MASK= 0x7f;
const WS_PAYLOAD_16  = 126;
const WS_PAYLOAD_64  = 127;
const WS_OFFSET_16   = 4;
const WS_OFFSET_64   = 10;
const WS_MAX_16      = 65536;
```

---

### M-6: Magic Number — Hardcoded WebSocket Timeout in `lib/cometd.js`

**Category:** Lexical Abusers — Magic Number
**Severity:** Medium

**Location:** `lib/cometd.js`, line 170

```js
setTimeout(() => {
  this._ws.removeEventListener('message', handler);
  reject(new Error('CometD WebSocket response timeout'));
}, 10000);
```

The value `10000` (10 seconds) is hardcoded inline. Unlike `DEFAULT_TIMEOUT` (110000 ms, defined at module level with a comment), this timeout for non-connect WS responses has no name, no configuration, and no documentation for why 10 seconds was chosen.

**Refactoring Suggestion:** Define as a named constant:

```js
const WS_RESPONSE_TIMEOUT_MS = 10000; // non-connect WebSocket response timeout
```

---

### M-7: Inconsistent Style — Mixed `opts || {}` and Default Parameter Syntax

**Category:** Lexical Abusers — Inconsistent Style
**Severity:** Medium

**Location:**
- `lib/fdcstream.js`, lines 18, 63, 115: `opts = opts || {};`
- `lib/cometd.js`, line 20: `constructor(endpoint, opts = {})` (default parameter)
- `lib/connection.js`, line 13: `(testFunction, testVar, errorText) =>` (no defaults)
- `lib/auth.js`, line 67: `const getAuthUri = function (opts = {}) {`

The codebase inconsistently uses three different patterns to handle optional object arguments:
1. Default parameter syntax: `function f(opts = {})`
2. Guard assignment: `opts = opts || {};`
3. No guard (caller expected to pass valid args)

`fdcstream.js` was modified during refactoring but kept the old `opts = opts || {}` style, while newer code (auth.js, cometd.js) uses the ES6 default parameter syntax.

**Refactoring Suggestion:** Standardize on ES6 default parameters for all new code and update the three `opts = opts || {}` instances in `fdcstream.js`:

```js
subscribe(opts = {}) { ... }
```

---

### M-8: What Comment / Redundant Comments in `lib/api.js`

**Category:** Other — What Comment
**Severity:** Medium

**Location:** `lib/api.js`, lines 196–198, 303–305, 462–464

```js
/*
 * CRUD methods
 */

/*
 * Blob/binary methods
 */

/*
 * Search
 */
```

These section divider comments add no information beyond what the function names immediately below convey. The JSDoc on each function already explains what each one does. The dividers clutter the file and would go stale if methods were reorganized.

**Refactoring Suggestion:** Remove section divider comments. Let function names and JSDoc do the work. Group related functions visually with blank lines if needed.

---

### M-9: Speculative Generality — Publicly Exported Internal Methods

**Category:** Dispensables — Speculative Generality / Indecent Exposure
**Severity:** Medium
**SOLID Violation:** ISP

**Location:** `lib/http.js`, line 199; `lib/api.js`, line 619

```js
// lib/http.js
module.exports = {
  _apiAuthRequest,
  _apiRequest,
  _buildSignal: buildSignal,   // <— exported solely for test/errors.js
};

// lib/api.js
module.exports = {
  _getOpts,                    // <— internal helper, exposed on Connection.prototype
  // ...
};
```

`_buildSignal` (renamed from `buildSignal` on export) is exported from `lib/http.js` only because `test/errors.js` imports it directly for unit testing. This creates a permanent public API surface for what should be an internal function. Similarly, `_getOpts` is mixed onto `Connection.prototype` and becomes a public method on every connection instance.

`_notifyAndResolve` is also tested directly in `test/connection.js` (line 278–312) through `org._notifyAndResolve(...)`, cementing the private implementation as de-facto public API.

**Refactoring Suggestion:** Move `buildSignal` tests to integration tests (testing via `_apiRequest` behavior) and remove the export. Consider making `_getOpts` a module-scoped function that is passed to domain modules during initialization rather than mixed onto the prototype.

---

### M-10: Inconsistent Error Handling — Mixed `throw` vs. `Promise.reject` Patterns

**Category:** Object-Oriented Abusers — Inconsistent Style
**Severity:** Medium

**Location:** `lib/api.js` vs. `lib/http.js`

- `insert()` (line 223): synchronously throws `new Error('insert requires opts.sobject')`
- `getIdentity()` (lines 102–110): returns `Promise.reject(new Error(...))`
- `getVersions()` does not guard missing oauth at all
- `refreshToken()` (line 220): returns `Promise.reject(...)`

The inconsistency between synchronous `throw` and `Promise.reject` means callers must either always wrap calls in try/catch (for sync errors) AND `.catch()` (for async errors), or risk uncaught errors. In an async context, synchronous throws inside a function that the caller chains with `.then()` will be caught by the downstream `.catch()`, but the inconsistency makes the contract unclear.

**Refactoring Suggestion:** Establish a consistent convention: all public API methods return Promises, and validation errors within async-context methods should use `Promise.reject()`. For truly synchronous validators (called before any await), `throw` is appropriate — but document this clearly.

---

### M-11: Side Effects — `_apiAuthRequest` Mutates Connection State

**Category:** Functional Abusers — Side Effects
**Severity:** Medium
**SOLID Violation:** SRP

**Location:** `lib/http.js`, lines 138–141

```js
.then((jBody) => {
  if (jBody.access_token && this.mode === CONST.SINGLE_MODE) {
    Object.assign(this.oauth || (this.oauth = {}), jBody);  // side-effect
  }
  return jBody;
});
```

`_apiAuthRequest` is nominally an HTTP transport method, but it has a hidden side-effect: it writes to `this.oauth` when in single-user mode. This is a violation of SRP because transport logic should not also manage credential state. The caller (`authenticate()` in `auth.js`) already receives the response body and merges it:

```js
return this._apiAuthRequest(opts).then((res) => {
  const newOauth = { ...opts.oauth, ...res };
  // ...
});
```

So the side-effect in `_apiAuthRequest` and the merge in `authenticate()` are doing overlapping work. In `refreshToken`, the caller also merges and delegates to `_notifyAndResolve`, making the auto-set in `_apiAuthRequest` redundant and confusing.

**Refactoring Suggestion:** Remove the `this.oauth` assignment from `_apiAuthRequest`. Let the auth-layer callers (`authenticate`, `refreshToken`) manage credential state explicitly.

---

### M-12: Feature Envy — `multipart.js` Extensively Uses `Record` Internals

**Category:** Couplers — Feature Envy
**Severity:** Medium
**GRASP Violation:** Information Expert

**Location:** `lib/multipart.js`, lines 27–65

```js
const multipart = (opts) => {
  const type = opts.sobject.getType();        // Record method
  const entity = type === 'contentversion' ? 'content' : type;
  const name = type === 'contentversion' ? 'VersionData' : 'Body';
  const fileName = opts.sobject.getFileName(); // Record method
  const safeFileName = fileName || 'file.bin';
  const isPatch = opts.method === 'PATCH';
  // ... uses opts.sobject.toChangedPayload() and opts.sobject.getBody()
};
```

This function reaches into a `Record` instance and extracts data, applies type-specific business rules (`contentversion → 'content'`, `contentversion → 'VersionData'`), and constructs the multipart body. The Information Expert principle suggests this logic should live closer to where the data resides — either on the `Record` class itself (e.g., a `toMultipart(method)` method), or at least the type-mapping constants should be in `lib/constants.js`.

**Refactoring Suggestion (minimal):** Move the `contentversion` → `entity`/`name` mapping to constants:

```js
// lib/constants.js
const MULTIPART_ENTITY_NAME = { contentversion: 'content' };
const MULTIPART_BODY_NAME   = { contentversion: 'VersionData' };
```

---

### M-13: Fallacious Method Name — `getLastRequest()` Returns First-Pushed, Not Last

**Category:** Lexical Abusers — Fallacious Method Name
**Severity:** Medium

**Location:** `test/mock/sfdc-rest-api.js`, lines 9–12

```js
const reset = () => {
  requestStack.length = 0;  // clears array
};

const getLastRequest = () => requestStack[0];  // reads index 0!
```

The function is named `getLastRequest` but reads `requestStack[0]` — the first element. The array is also populated with `push()` (which appends to the end), so `requestStack[0]` is the *first* request recorded since the last `reset()`. This works correctly in current tests because `reset()` is called in `afterEach`, leaving only one request per test. However, the name is misleading; `getFirstRequest()` or using `requestStack[requestStack.length - 1]` would be correct.

**Refactoring Suggestion:** Either rename to `getFirstRecordedRequest()` and document the invariant, or change the accumulation to use `unshift()` so index `[0]` truly is the most-recent request.

---

### M-14: Callback-Style API Mixed with Promise — `onRefresh` in `lib/auth.js`

**Category:** Change Preventers — Callback Hell (partial)
**Severity:** Medium

**Location:** `lib/auth.js`, lines 124–134

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

The entire library is promise-based (no callback support), yet `onRefresh` uses Node.js error-first callback convention (`(err) => ...`). This mixes two async paradigms. A caller defining `onRefresh` must know they receive a callback, not that they can return a Promise. This also requires wrapping in `new Promise()` to bridge the callback to the Promise chain.

**Refactoring Suggestion:** Accept a Promise-returning `onRefresh`:

```js
const _notifyAndResolve = function (newOauth, oldOauth) {
  if (this.onRefresh) {
    return Promise.resolve(this.onRefresh(newOauth, oldOauth)).then(() => newOauth);
  }
  return Promise.resolve(newOauth);
};
```

This is a breaking change that should be versioned — note that `onRefresh` returning `void` (most common case) still works since `Promise.resolve(undefined)` is valid.

---

### M-15: Redundant `Promise.resolve` Wrapping in `lib/auth.js`

**Category:** Dispensables — Dead Code / Redundant Wrapping
**Severity:** Medium

**Location:** `lib/auth.js`, line 187

```js
return this._apiAuthRequest(opts).then((res) => {
  const newOauth = { ...opts.oauth, ...res };
  if (opts.assertion) newOauth.assertion = opts.assertion;
  return Promise.resolve(newOauth);   // <— redundant
});
```

Inside a `.then()` callback, returning a plain value is already equivalent to returning `Promise.resolve(value)`. The extra wrap adds noise with no functional benefit.

**Refactoring Suggestion:** `return newOauth;` is sufficient.

---

### M-16: Divergent Change Candidate — `CometDClient._connectLoop` Has Multiple Responsibilities

**Category:** Change Preventers — Divergent Change
**Severity:** Medium
**SOLID Violation:** SRP

**Location:** `lib/cometd.js`, lines 306–358

`_connectLoop` handles all of:
1. Sending `/meta/connect` messages
2. Parsing the connect response and updating `_advice`
3. Detecting failure codes and dispatching to `_rehandshake`
4. Dispatching piggybacked data messages to subscription callbacks
5. Applying advice intervals between reconnects
6. Error recovery by scheduling reconnect

This method is 52 lines long (beyond Python's typical threshold, well-within typical JS but still complex). If any one of these responsibilities changes (e.g., changing how piggybacked messages are dispatched, or how advice intervals work), the entire method must be read and understood.

**Refactoring Suggestion:** Extract data-message dispatching and failure-handling into dedicated methods:

```js
_dispatchDataMessages(responses) { ... }
_handleConnectFailure(response) { ... }
```

---

### M-17: Incomplete Null/Guard in `lib/api.js` `apexRest`

**Category:** Bloaters — Null Check (inconsistent)
**Severity:** Medium

**Location:** `lib/api.js`, lines 556–566

```js
const apexRest = function (data) {
  const opts = this._getOpts(data, { singleProp: 'uri' });
  const apexPath = opts.uri.startsWith('/') ? opts.uri.substring(1) : opts.uri;
  opts.uri = opts.oauth.instance_url + '/services/apexrest/' + apexPath;
  // ...
};
```

If `opts.uri` is `undefined` (caller passes `{}` without `uri`), `opts.uri.startsWith('/')` will throw a `TypeError`. Other methods like `getIdentity` (lines 101–110) explicitly guard against missing required fields and return `Promise.reject(...)`. `apexRest` silently throws. This is an inconsistency in error handling strategy.

---

## Low Severity Issues (Readability / Maintenance)

### L-1: Indecent Exposure — Tests Access Private Fields of `Record` Directly

**Category:** Object-Oriented Abusers — Indecent Exposure
**Severity:** Low

**Location:** `test/record.js`, multiple lines; `test/connection.js` lines 146–151

```js
// test/record.js
acc._changed = new Set();      // line 217 — directly manipulates private state
acc._previous = {};            // line 218
acc._fields.id                 // line 160 — reads private field
acc._getPayload(false)         // line 350 — tests private method directly

// test/connection.js
obj._fields.should.have.property('name');      // line 146
obj._fields.name.should.equal('Test Me');      // line 147
```

Testing against private fields (`_fields`, `_changed`, `_previous`) creates tests that are tightly coupled to implementation details. If the storage internals change (e.g., `_changed` becomes a plain object instead of a Set), tests break for non-behavioral reasons.

**Refactoring Suggestion:** Test observable behavior through public API:
- Instead of `acc._changed.size.should.equal(2)`, use `acc.hasChanged().should.equal(true)` and `Object.keys(acc.changed()).length.should.equal(2)`.
- Instead of `acc._fields.id`, use `acc.getId()`.

---

### L-2: Indecent Exposure — Tests Access `CometDClient` Internals Directly

**Category:** Object-Oriented Abusers — Indecent Exposure
**Severity:** Low

**Location:** `test/streaming.js`, lines 29–30, 139–143, 168–169, 290

```js
client._clientId.should.startWith('mock-client-');   // line 30
client._subscriptions.size.should.equal(1);           // line 139
client._clientId = 'invalid-client';                  // line 168 — directly mutates!
client._connected = true;                             // line 169 — directly mutates!
should.exist(client._cometd);                         // line 290
```

Line 168–169 is particularly concerning: the test directly mutates two private fields to set up a contrived failure scenario. This is test setup bypassing the public API, which suggests either the class needs a better way to test failure modes or the test is testing implementation rather than behavior.

---

### L-3: Dead Code — Commented-Out Code in `test/integration.js`

**Category:** Dispensables — Dead Code
**Severity:** Low

**Location:** `test/integration.js`, lines 15–16

```js
if (creds == null) {
  // Can't run integration tests
  // Mocha.suite.skip();    // <— commented out
}
```

This is a dead code block: the `if` branch contains only comments and no executable code. The commented-out `Mocha.suite.skip()` was presumably replaced by the `(checkEnvCredentials() ? describe : describe.skip)` pattern at line 9, but the empty `if` block was not removed.

**Refactoring Suggestion:** Remove the empty `if (creds == null)` block entirely, or replace with an assertion that validates credentials are present.

---

### L-4: Inconsistent Use of Equality Operators — `== null` vs. `=== null`

**Category:** Lexical Abusers — Inconsistent Style
**Severity:** Low

**Location:** `test/integration.js`, lines 14, 23

```js
if (creds == null) {      // line 14 — loose equality
if (client != null &&     // line 23 — loose equality
```

These are the only instances of loose null equality in the codebase. All other null checks (`lib/util.js:44`, `lib/util.js:86`) use strict equality or conditional access. The ESLint config does not appear to enforce `eqeqeq`, but the inconsistency is notable.

---

### L-5: Redundant Variable Declaration — `let client = undefined`

**Category:** Lexical Abusers — Uncommunicative Name / Redundant Assignment
**Severity:** Low

**Location:** `test/integration.js`, line 7

```js
let client = undefined;
```

In JavaScript, uninitialized `let` declarations are already `undefined`. Explicitly assigning `undefined` is redundant and can cause linters to flag it. The intent (signaling that `client` will be conditionally assigned later) is better communicated by `let client;`.

---

### L-6: Inline `require` in Production-Adjacent Test Helper

**Category:** Object-Oriented Abusers — Inappropriate Static / Indecent Exposure
**Severity:** Low

**Location:** `test/mock/cometd-server.js`, line 201

```js
_handleWsUpgrade(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  // ...
  const crypto = require('crypto');   // <— inside a method
```

`require` inside a method body is a runtime `require`, not a module-level import. While Node.js caches modules, the pattern is inconsistent with every other file in the codebase where `require` appears at the top. If the method is called thousands of times, the cache lookup still adds overhead. More importantly, this obscures dependencies from readers who expect all imports to be at the top of the file.

**Refactoring Suggestion:** Move `const crypto = require('crypto');` to the top of the file.

---

### L-7: Hardcoded Test Port Numbers

**Category:** Lexical Abusers — Magic Number
**Severity:** Low

**Location:**
- `test/crud.js`, line 7: `const port = process.env.PORT || 33333;`
- `test/query.js`, line 6: `const port = process.env.PORT || 33333;`
- `test/streaming.js`, line 8: `const PORT = 34444;`
- `test/streaming.js`, line 268: `new MockCometDServer(34445)` (second server, no constant)

`34445` appears inline with no named constant. The two streaming test servers use adjacent ports with no explanation. If these collide in CI environments running parallel test suites, tests fail intermittently with no helpful diagnostic.

**Refactoring Suggestion:** Define all port constants in a shared `test/config.js` or at the top of each file, with comments explaining port selection.

---

### L-8: Type Embedded in Name — `requestStack` / `serverStack`

**Category:** Lexical Abusers — Type Embedded in Name
**Severity:** Low

**Location:** `test/mock/sfdc-rest-api.js`, lines 5–6

```js
let serverStack = [];
let requestStack = [];
```

The `Stack` suffix implies LIFO semantics (push/pop), but `requestStack` is used as a queue where items are pushed to the end and read from index `[0]`. The naming suggests the wrong data structure. Neither variable is used with LIFO behavior for `requestStack` (it only uses `push` and `length` reset).

**Refactoring Suggestion:** Rename to `activeServers` and `recordedRequests` respectively to communicate actual semantics.

---

### L-9: Speculative Generality — `isBoolean` Exported but Unused in Production

**Category:** Dispensables — Speculative Generality
**Severity:** Low

**Location:** `lib/util.js`, line 40; `lib/constants.js` exports

```js
const isBoolean = (candidate) => typeof candidate === 'boolean';
```

`isBoolean` is exported from `lib/util.js` but is never used in any `lib/` or `index.js` file. It is not used in any test file either. It was presumably added for future validation or carried over from the legacy codebase but is now dead weight in the public API surface.

**Refactoring Suggestion:** Remove from exports, or document why it is intentionally kept for plugin authors.

---

### L-10: `getOAuth`/`setOAuth`/`getUsername`/`setPassword` — Trivial Getter/Setter Proliferation

**Category:** Dispensables — Lazy Element / Middle Man
**Severity:** Low

**Location:** `lib/auth.js`, lines 6–36

```js
const getOAuth = function () { return this.oauth; };
const setOAuth = function (oauth) { this.oauth = oauth; };
const getUsername = function () { return this.username; };
const setUsername = function (username) { this.username = username; };
const getPassword = function () { return this.password; };
const setPassword = function (password) { this.password = password; };
const getSecurityToken = function () { return this.securityToken; };
const setSecurityToken = function (token) { this.securityToken = token; };
```

These eight one-line trivial getter/setter functions add no encapsulation value — they directly read and write public properties on `this`. The `Connection` object is not a class with private fields, so the properties are already directly accessible. These functions exist only as a thin naming convention, providing no validation, no change notification, and no encapsulation.

Callers could simply write `connection.oauth = myOAuth` with identical results. The getters/setters appear in tests (`orgSingle.setOAuth(oauth)`) which suggests they are part of the public API contract. However, they were previously identified in prior refactoring reports and the simpler direct-access form is arguably cleaner.

**Note:** These are an intentional API contract decision rather than pure smell — removing them would be a breaking change. The issue is that they appear to offer encapsulation but provide none.

---

### L-11: `_connectLoop` Catches Without Logging

**Category:** Other — Afraid to Fail / Silent Error Swallowing
**Severity:** Low

**Location:** `lib/cometd.js`, lines 350–357; `lib/cometd.js`, lines 371–375; `lib/cometd.js`, lines 384–394

```js
} catch {
  if (this._disconnecting) return;
  this._connected = false;
  this.emit('transport:down');
  this._scheduleReconnect();
  return;
}
```

```js
} catch {
  this._connected = false;
  this.emit('transport:down');
  this._scheduleReconnect();
}
```

```js
} catch {
  this._scheduleReconnect();
}
```

All three catch blocks silently discard the error. The error is emitted through the EventEmitter via `transport:down`, but the original error is lost. Callers who attach `client.on('transport:down', ...)` handlers cannot distinguish between a network timeout, a parse error, and a deliberate disconnect. Logging or emitting the error would aid debugging.

---

### L-12: `_createWsWrapper` — Long Method in Test Helper

**Category:** Bloaters — Long Method
**Severity:** Low

**Location:** `test/mock/cometd-server.js`, `_createWsWrapper` method, lines 277–361 (84 lines)

This method manually parses WebSocket frames from raw TCP socket data. It is 84 lines long and contains the full RFC 6455 framing logic. While WebSocket frame parsing is inherently detailed, the method handles payload length negotiation, masking, opcode dispatch, and frame emission all in one function.

**Refactoring Suggestion:** Extract frame parsing (`_parseWsFrame(buffer)`) and frame serialization (`_buildWsFrame(payload)`) into separate helper functions:

```js
_parseWsFrames(buffer) { /* returns { frames, remainder } */ }
_buildWsFrame(text) { /* returns Buffer */ }
```

---

### L-13: `_handleHttp` and `_handleWsUpgrade` Duplicate Message-Processing Structure

**Category:** Dispensables — Duplicated Code
**Severity:** Low

**Location:** `test/mock/cometd-server.js`, `_handleHttp` (lines 137–188) and `_handleWsUpgrade` (lines 193–269)

Both methods contain nearly identical message-processing loops:

```js
// In both methods:
if (!Array.isArray(messages)) messages = [messages];
const responses = [];
for (const msg of messages) {
  const result = this._processMessage(msg);
  if (result === 'hold') { ... }
  else if (result) { responses.push(result); }
}
if (responses.length > 0) { /* send responses */ }
```

The hold-handling differs (HTTP vs WS), but the core dispatch loop is duplicated. This is acceptable in test code but worth noting.

---

## SOLID Principle Violations Summary

| Principle | Violations | Files |
|-----------|-----------|-------|
| **S - Single Responsibility** | 2 | `lib/http.js` (transport + auth state), `lib/cometd.js` (_connectLoop multiple responsibilities) |
| **O - Open/Closed** | 1 | `lib/http.js` (retry logic tightly coupled to error codes) |
| **L - Liskov Substitution** | 0 | No inheritance hierarchies detected |
| **I - Interface Segregation** | 2 | `opts` bag (callers must know full shape), `_getOpts` and `_buildSignal` exposed publicly |
| **D - Dependency Inversion** | 1 | `lib/multipart.js` directly creates `FormData`/`Blob` (untestable without Web APIs) |

---

## GRASP Principle Violations Summary

| Principle | Violations | Notes |
|-----------|-----------|-------|
| **Information Expert** | 1 | `multipart.js` knows too much about `Record` internals |
| **Creator** | 0 | Object creation is appropriate throughout |
| **Controller** | 0 | No bloated controllers |
| **Low Coupling** | 1 | `sfdc-rest-api.js` mock uses global state shared across test files |
| **High Cohesion** | 1 | `_connectLoop` in `cometd.js` handles 6 concerns |
| **Polymorphism** | 0 | `BODY_GETTER_MAP` is a clean dispatch table |
| **Pure Fabrication** | 0 | Domain logic is appropriately placed |
| **Indirection** | 0 | Module boundaries are clear |
| **Protected Variations** | 1 | `opts._retryCount` sentinel mutates caller's object |

---

## Impact Assessment

**Total Issues Found:** 32 issues

**Breakdown by Severity:**
- High Severity Issues: 2 (Architectural impact)
- Medium Severity Issues: 17 (Design impact)
- Low Severity Issues: 13 (Readability / maintenance impact)

**Breakdown by Category:**
- Dispensables (Duplicated Code, Dead Code, Speculative Generality): 9 issues
- Lexical Abusers (Magic Number, Naming, Style): 7 issues
- Data Dealers (Global Data, Mutable Data, Temporary Field): 3 issues
- Object-Oriented Abusers (Indecent Exposure): 3 issues
- Functional Abusers (Side Effects, Hidden Dependencies): 2 issues
- Change Preventers (Divergent Change, Callback Hell): 2 issues
- Couplers (Feature Envy): 1 issue
- Bloaters (Long Method): 1 issue
- Other (What Comment, Silent Error): 4 issues

**Risk Factors:**
- The `opts` property bag (M-4) is the single largest maintenance liability. It permeates all API methods and makes it impossible to statically know what a valid call looks like.
- The callback-style `onRefresh` (M-14) is a breaking change to fix — but it is the only callback in an otherwise fully async library.
- The global mock state (H-1) is a test isolation risk that becomes real if the test suite grows or runs in parallel.

---

## Recommendations and Refactoring Roadmap

### Phase 1 — Quick Wins (Low Risk, High Value)

1. **Remove redundant `Promise.resolve` wrapping** in `lib/auth.js` (M-15) — 1-line fix.
2. **Move `const crypto = require('crypto')` to top of file** in `test/mock/cometd-server.js` (L-6) — 1-line change.
3. **Extract `_resubscribeAll()` helper** in `lib/cometd.js` (M-3) — removes one duplication, ~5 lines.
4. **Define named WebSocket constants** in `test/mock/cometd-server.js` (M-5) — improves readability.
5. **Remove section-divider comments** in `lib/api.js` (M-8) — cleanup.
6. **Remove dead `if (creds == null)` block** in `test/integration.js` (L-3) — cleanup.
7. **Replace `let client = undefined`** with `let client;` in `test/integration.js` (L-5).

### Phase 2 — Design Improvements (Moderate Risk)

8. **Replace `opts._retryCount` sentinel** with a local closure variable (H-2) — prevents hidden mutation.
9. **Remove side-effect from `_apiAuthRequest`** — move auth state management to `authenticate` caller (M-11).
10. **Introduce `_blobGetter` factory** to deduplicate three identical blob retrieval functions (M-2).
11. **Introduce `_get` helper** to reduce the repeated GET request pattern (M-1).
12. **Standardize `opts = opts || {}` to default parameter** in `fdcstream.js` (M-7).
13. **Replace test access to Record private fields** with public API assertions (L-1) — reduces coupling.

### Phase 3 — Architectural Improvements (Higher Risk, Breaking Changes)

14. **Encapsulate mock server state in a class** to eliminate global mutable state (H-1).
15. **Migrate `onRefresh` from callback to Promise-returning function** (M-14) — breaking API change, requires semver major bump.
16. **Add JSDoc `@typedef`** for the `opts` parameter shapes (M-4) — non-breaking documentation improvement.
17. **Consider whether trivial getters/setters** in `lib/auth.js` should be kept as documented public API or simplified (L-10).

### Prevention Strategies

- Enable `eqeqeq` in ESLint config to catch `== null` comparisons.
- Consider adding TypeScript `.d.ts` type definitions for the public API to make the `opts` bag contract explicit.
- Add a lint rule or test that prevents `require()` calls inside function bodies.
- Document the `onRefresh` callback convention explicitly in README, noting it as a known deviation from the library's Promise-only contract.

---

## Appendix

### Files Analyzed
- `index.js`
- `lib/api.js`
- `lib/auth.js`
- `lib/cometd.js`
- `lib/connection.js`
- `lib/constants.js`
- `lib/errors.js`
- `lib/fdcstream.js`
- `lib/http.js`
- `lib/multipart.js`
- `lib/optionhelper.js`
- `lib/plugin.js`
- `lib/record.js`
- `lib/util.js`
- `test/connection.js`
- `test/crud.js`
- `test/errors.js`
- `test/integration.js`
- `test/plugin.js`
- `test/query.js`
- `test/record.js`
- `test/streaming.js`
- `test/util.js`
- `test/mock/cometd-server.js`
- `test/mock/sfdc-rest-api.js`

### Files Excluded
- `examples/` — snippet-style scripts, not production code
- `node_modules/` — third-party dependencies

### Detection Methodology

Analysis performed by systematic code reading using:
1. Full read of all 25 source and test files
2. Line-count analysis to identify large files (>200 lines)
3. Grep-based pattern detection for: magic numbers, global state, duplicate code patterns, inconsistent styles, private field access
4. Manual review against the 50+ smell catalog from Fowler (1999/2018), Wake (2004), Martin (2008), and Jerzyk (2022)
5. SOLID/GRASP principle check for each identified smell

### Code Quality Assessment

The codebase shows evidence of active, thoughtful refactoring. The original `index.js` was ~1089 lines; the current `index.js` is 99 lines with domain logic properly distributed across `lib/`. The test suite is comprehensive with a mock server pattern that enables offline testing. The code smells found are predominantly in the moderate-to-low range, consistent with a library that has been recently refactored but not yet at the "clean" stage of stabilization.
