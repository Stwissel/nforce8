# Code Smell Detection Report — nforce8

## Executive Summary

**Project**: nforce8 — Node.js REST API wrapper for Salesforce (Promise-based, Node 22+)
**Languages**: JavaScript (CommonJS modules), Node.js 22+
**Analysis Date**: 2026-03-23
**Files Analyzed**: 9 source files (1,627 total lines)
**Scope**: Remaining issues after the recent refactoring sprint

| Severity | Count |
|----------|-------|
| High (Architectural) | 3 |
| Medium (Design) | 8 |
| Low (Readability/Maintenance) | 7 |
| **Total** | **18** |

The codebase is in materially better shape after the recent sprint. The remaining issues are dominated by one large structural problem (the split `Connection` definition across `index.js` and `lib/connection.js`), one broken feature (multipart upload produces malformed HTTP requests), and a set of smaller consistency and correctness issues.

---

## Project Analysis

### Languages and Frameworks
- **JavaScript** (CommonJS, `'use strict'` selectively applied)
- **Node.js 22+** — native `fetch`, `AbortSignal.timeout`, `URL`
- **Runtime dependencies**: `faye` (streaming), `mime-types` (multipart)
- **Dev**: `mocha`, `nyc`, `should`, `eslint`

### Project Structure

```
index.js            994 lines  — Connection constructor + all 46 prototype methods + Plugin system
lib/connection.js    93 lines  — Stub ES6 class + validateConnectionOptions (partially used)
lib/record.js       186 lines  — SObject record model
lib/optionhelper.js 102 lines  — HTTP request options builder
lib/fdcstream.js    104 lines  — CometD/Faye streaming wrapper
lib/multipart.js     27 lines  — Multipart payload builder (produces request-library format, not FormData)
lib/util.js          63 lines  — Type predicates, header utilities
lib/constants.js     47 lines  — URLs, defaults, CONST values
lib/errors.js        11 lines  — Error factory functions
```

### Key Architectural Observation

`index.js` at 994 lines is the single largest concern in the codebase. It contains the `Connection` constructor, 46 prototype methods spanning authentication, CRUD, query, search, streaming, blob retrieval, and HTTP infrastructure, plus the `Plugin` system. A `lib/connection.js` exists with an ES6 `class Connection` stub and a `// TODO turn into ES6 class` comment in `index.js` line 23, confirming the migration was started but never completed.

---

## High Severity Issues (Architectural Impact)

### H1 — Divergent Change / God Object: `index.js` (994 lines, 46 methods)

**Category**: Bloater + Change Preventer
**Smells**: Large Class, Divergent Change
**Principle Violations**: Single Responsibility (SOLID-S), High Cohesion (GRASP)

`index.js` is responsible for seven distinct concerns simultaneously:

1. `Connection` constructor and configuration merging (lines 24–54)
2. Auth getter/setter methods — `getOAuth`, `setOAuth`, `getUsername`, `setPassword`, etc. (lines 60–90)
3. OAuth flow methods — `authenticate`, `refreshToken`, `revokeToken`, `getAuthUri` (lines 131–317)
4. Salesforce REST API methods — 20+ methods for CRUD, query, search, blob, streaming (lines 350–734)
5. Internal HTTP infrastructure — `_apiRequest`, `_apiAuthRequest`, `_resolveWithRefresh` (lines 762–843)
6. Module-level HTTP helper functions — `responseFailureCheck`, `unsuccessfulResponseCheck`, `addSObjectAndId`, `respToJson`, `requireForwardSlash` (lines 849–926)
7. Plugin system — `Plugin` constructor, `Plugin.prototype.fn`, `plugin()` factory (lines 932–969)

Any change to authentication logic, HTTP transport, streaming, the plugin system, or CRUD operations all require touching the same 994-line file. This is the canonical definition of Divergent Change — the module changes for multiple unrelated reasons.

**Location**: `/Users/stw/Code/nforce8/index.js` — entire file

**Refactoring**:
- Complete the ES6 class migration started in `lib/connection.js`
- Extract `lib/auth.js` for OAuth flows (`authenticate`, `refreshToken`, `revokeToken`, `getAuthUri`)
- Extract `lib/crud.js` or `lib/api.js` for Salesforce API method groups
- Extract `lib/http.js` for `_apiRequest`, `_apiAuthRequest`, and the response-check helpers
- Extract `lib/plugin.js` for the Plugin system
- `index.js` becomes a thin composition root that wires the modules together and re-exports the public API

---

### H2 — Incomplete Migration: Parallel `Connection` Definitions Out of Sync

**Category**: Object-Oriented Abuser + Dispensable
**Smells**: Alternative Classes with Different Interfaces, Orphaned Abstraction
**Principle Violations**: Single Responsibility (SOLID-S), Information Expert (GRASP)

Two `Connection` definitions coexist and are out of sync:

- `lib/connection.js` line 5: `class Connection` with field declarations (`oauth`, `username`, `password`, `securityToken`) and a constructor that calls `validateConnectionOptions`
- `index.js` line 24: `const Connection = function(opts) { ... }` — the real, fully-implemented constructor with all 46 prototype methods

`index.js` imports **only** `validateConnectionOptions` from `lib/connection.js` (line 11) and ignores the `Connection` class there entirely. The constructor bodies duplicate the same three lines (lines 12–16 of `lib/connection.js` mirror lines 27–34 of `index.js`). The `// TODO turn into ES6 class` comment on line 23 of `index.js` acknowledges the debt explicitly.

A developer reading `lib/connection.js` sees a `Connection` class with fields and assumes it is canonical. All behavior is actually in `index.js`. This creates a genuine maintenance trap.

**Location**:
- `index.js:11` — imports only `validateConnectionOptions`, not the class
- `index.js:23` — `// TODO turn into ES6 class`
- `index.js:24–54` — the real constructor
- `lib/connection.js:5–17` — duplicate stub constructor

**Refactoring**: Complete the migration. Move all prototype methods into the ES6 `class Connection` in `lib/connection.js`, delete the function constructor from `index.js`, and import the completed class.

---

### H3 — Broken Feature: Multipart Upload Produces Malformed HTTP Requests

**Category**: Functional Abuser + Dispensable
**Smells**: Side Effects, Speculative Generality
**Principle Violations**: Protected Variations (GRASP), DRY

`lib/multipart.js` builds an array of part objects in the format used by the deprecated `request` npm library. `index.js` assigns this array to `opts.multipart` (lines 408, 422). `optionhelper.js` detects `opts.multipart` and sets `ropts.headers['content-type'] = 'multipart/form-data'` (line 55). However, the multipart array is **never transferred to `ropts.body`** — `optionhelper.js` only copies `opts.body` to `ropts.body` (line 67), not `opts.multipart`. The native `fetch` call therefore sends a request with a multipart `Content-Type` header and no body.

Even if the array were transferred, native `fetch` does not accept arrays of part-descriptor objects. It requires a `FormData` instance. The entire multipart pipeline — `lib/multipart.js`, the `CONST.MULTIPART_TYPES` check in `insert` and `update`, and the header in `optionhelper.js` — is configured but produces broken HTTP requests for Document, Attachment, and ContentVersion uploads.

**Location**:
- `index.js:407–411` — `opts.multipart = multipart(opts)` (insert path)
- `index.js:421–423` — `opts.multipart = multipart(opts)` (update path)
- `lib/optionhelper.js:54–55` — sets `content-type` header but never sets the body
- `lib/optionhelper.js:66–68` — copies `opts.body`, never `opts.multipart`
- `lib/multipart.js:1–25` — builds array in `request`-library format, not `FormData`

**Refactoring**: Rewrite `lib/multipart.js` to return a `FormData` object. In `optionhelper.js`, when `opts.multipart` is present, set `ropts.body = opts.multipart` (a `FormData` instance) and remove the manual `content-type` override (let `fetch` set it with the auto-generated boundary). Add an integration test covering Document and Attachment insert.

---

## Medium Severity Issues (Design Problems)

### M1 — Feature Envy: `getApiRequestOptions` in `lib/optionhelper.js`

**Category**: Coupler
**Smell**: Feature Envy
**Principle Violations**: Information Expert (GRASP), Low Coupling (GRASP)

`getApiRequestOptions` (lines 15–86) reads 13 distinct fields from the caller's `opts` object: `opts.uri`, `opts.resource`, `opts.oauth`, `opts.method`, `opts.gzip`, `opts.multipart`, `opts.headers`, `opts.body`, `opts.qs`, `opts.requestOpts`, `opts.timeout`, `opts.apiVersion`, `opts.blob`. It is more interested in the Connection's data than in any state of its own. The function is a pure data-transformation pipeline over foreign data, containing no behaviour that belongs to `OptionHelper` intrinsically.

**Location**: `lib/optionhelper.js:15–86`

**Refactoring**: The `opts` bag is effectively a typed request descriptor. Define an explicit `RequestDescriptor` type or class with a `toFetchOptions()` method. Alternatively, since `getApiRequestOptions` exists entirely to serve `Connection._apiRequest`, move the transformation logic directly into `_apiRequest` (which already has access to all the fields), eliminating the middleman.

---

### M2 — Inconsistent and Incomplete Timeout Handling

**Category**: Obfuscator
**Smell**: Inconsistent Behavior, Dead Code
**Principle Violations**: Principle of Least Surprise

Timeout is handled correctly in `_apiAuthRequest` via `AbortSignal.timeout(this.timeout)` (index.js lines 767–773). However, `optionhelper.js` lines 81–83 copy `opts.timeout` to `ropts.timeout`. The native `fetch` API has no `timeout` option — `ropts.timeout` is silently ignored by fetch. `_apiRequest` has no `AbortSignal` handling at all.

The result: authentication requests respect the configured timeout; all other API requests (CRUD, query, search, etc.) do not.

**Location**:
- `lib/optionhelper.js:81–83` — `ropts.timeout = opts.timeout` (silently ignored by fetch)
- `index.js:767–773` — `AbortSignal.timeout` only in `_apiAuthRequest`
- `index.js:801–843` — `_apiRequest` has no timeout enforcement

**Refactoring**: Apply the identical `AbortSignal.timeout` pattern used in `_apiAuthRequest` to `_apiRequest`. Remove `ropts.timeout` from `optionhelper.js`.

---

### M3 — Inconsistent `self = this` Alias Usage

**Category**: Lexical Abuser
**Smell**: Inconsistent Style, Unnecessary Pattern

The `self = this` alias is a pre-ES6 idiom to preserve `this` context inside nested `function` callbacks. Arrow functions bind `this` lexically and make `self` unnecessary. The codebase uses both patterns inconsistently:

- `self` declared inside methods where all callbacks are already arrow functions — `index.js:775` (`const self = this` inside `_apiAuthRequest`, where the only use is `self.oauth = jBody` inside a `.then()` arrow callback; `this.oauth` would be equally correct)
- `self` declared but partially used — `index.js:132` (`const self = this` used for `self.clientId` at line 136, then `this` is used for `this.testAuthEndpoint`, `this.authEndpoint` in the same method without `self`)
- `self` genuinely needed inside traditional `function` callbacks: `record.js:2, 30`, `fdcstream.js:7, 43`

**Location**:
- `index.js:25, 132, 206, 255, 550, 706, 775, 802`
- `lib/record.js:2, 30, 136, 171`
- `lib/fdcstream.js:7, 43`

**Refactoring**: For `record.js`, convert nested `function` callbacks to arrow functions and remove all `self` aliases. For `index.js`, audit each `self` declaration — either convert the inner callback to an arrow function (eliminating `self`) or use `self` consistently throughout the method rather than mixing `self` and `this`.

---

### M4 — Deprecated Module: `querystring`

**Category**: Object-Oriented Abuser
**Smell**: Incomplete Library Class, Outdated Dependency
**Principle Violations**: Node.js best practice

`index.js` line 3 imports `const qs = require('querystring')`. The Node.js `querystring` module is a **legacy module** — its documentation explicitly states it is superseded by the `URLSearchParams` API (WHATWG URL standard). Node 22 ships with `URLSearchParams` as a global without the legacy quirks of `querystring`.

`qs` is used at three call sites:
- `index.js:190` — `qs.stringify(urlOpts)` to build the auth URI query string
- `index.js:242` — `qs.stringify(bopts)` to build the POST body for `authenticate`
- `index.js:287` — `qs.stringify(refreshOpts)` to build the POST body for `refreshToken`

**Location**: `index.js:3, 190, 242, 287`

**Refactoring**: Replace `require('querystring')` and all `qs.stringify()` calls with `new URLSearchParams(obj).toString()`. This is a native, non-deprecated API that produces equivalent output for these use cases.

---

### M5 — Magic String: Hardcoded Non-HTTPS URL in `getVersions`

**Category**: Lexical Abuser
**Smell**: Magic Number (string variant), Hardcoded Dependency
**Principle Violations**: DRY, Protected Variations (GRASP)

`Connection.prototype.getVersions` (index.js lines 350–355) hardcodes `'http://na1.salesforce.com/services/data/'` as the endpoint. This is problematic in three distinct ways:

1. **HTTP not HTTPS** — Salesforce requires HTTPS for all API traffic
2. **Hardcoded pod** — `na1` is a specific legacy North American instance pod; this URL is incorrect for all other orgs
3. **Bypasses configuration** — all other methods use `opts.oauth.instance_url` or the configurable `loginUri`/`testLoginUri` constants; this one does not

**Location**: `index.js:352`

**Refactoring**: Replace with `opts.oauth.instance_url + '/services/data/'` to retrieve API versions for the authenticated org's actual instance. If the intent is a public endpoint (discovery before auth), use `CONST.LOGIN_URI.replace('/oauth2/token', '/data/')` or a named constant, and use HTTPS.

---

### M6 — Flag Argument: `_getPayload(changedOnly)`

**Category**: Bloater
**Smells**: Flag Argument, Boolean Blindness
**Principle Violations**: Single Responsibility, Clarity at call site

`Record.prototype._getPayload(changedOnly)` (record.js line 170) takes a boolean flag that fundamentally changes the shape of the returned data. At call sites the boolean value has no intrinsic meaning without reading the method signature:

- `index.js:410` — `opts.sobject._getPayload(false)` — returns all fields (insert)
- `index.js:424` — `opts.sobject._getPayload(true)` — returns only changed fields (update)
- `index.js:436` — `opts.sobject._getPayload(false)` — returns all fields (upsert)
- `lib/multipart.js:14` — `opts.sobject._getPayload(isPatch)` — slightly better (named variable)
- `lib/record.js:158` — `this._getPayload(false)`

**Location**: `lib/record.js:170`, `index.js:410, 424, 436`, `lib/multipart.js:14`

**Refactoring**: Replace with two distinct methods: `_getFullPayload()` and `_getChangedPayload()`. The `multipart.js` pattern of an `isPatch` named variable is the right direction — the same named variable (or enum-like const) should be used at all call sites. Alternatively, name the methods `_getInsertPayload()` and `_getUpdatePayload()` to match their Salesforce semantics.

---

### M7 — Configured but Non-Functional `gzip` Option

**Category**: Dispensable
**Smell**: Speculative Generality
**Principle Violations**: YAGNI

`optionhelper.js` sets `Accept-Encoding: gzip` when `opts.gzip === true` (lines 49–51). This tells the server to send compressed responses. However, Node.js native `fetch` does **not** automatically decompress gzip responses. If the server honours the header, the response body will be a compressed binary stream that `res.json()` and `res.text()` will fail to parse. The `gzip` option is validated in `lib/connection.js` (line 65) and present in `CONST.defaultOptions` (line 36 of `constants.js`), giving users the impression that gzip compression is a functional, supported feature.

**Location**:
- `lib/connection.js:65` — validates `gzip` is boolean
- `lib/constants.js:36` — `gzip: false` in defaults
- `lib/optionhelper.js:49–51` — sets `Accept-Encoding` header

**Refactoring**: Either implement actual decompression (use `DecompressionStream` on the response body, available natively in Node 22+), or remove the `gzip` option entirely with a clear changelog entry. Leaving it as a validated-but-broken option is more harmful than removing it.

---

### M8 — `_changed` Array: O(n) Membership Tests on Every `set()`

**Category**: Functional Abuser
**Smells**: Primitive Obsession, Imperative Loops
**Principle Violations**: Information Expert (GRASP), performance correctness

`Record._changed` is maintained as an **Array** but used exclusively for membership testing (`_changed.includes(key)`) and iteration. `Array.includes()` is O(n). On every `set()` call, `_changed.includes(key)` is called inside a loop over the incoming fields (record.js line 48). For records with many fields or many successive `set()` operations, the cost is quadratic. The same O(n) lookup appears in `_getPayload` (line 175) and `hasChanged` (line 128). Additionally, the guard on line 48 (`if (!self._changed.includes(key))`) is necessary only because `_changed` is an array — if it were a `Set`, duplicates would be rejected automatically.

**Location**: `lib/record.js:5, 48, 128, 166, 175`

**Refactoring**: Replace the `_changed` Array with a `Set`. `Set.has()` is O(1), `Set.add()` deduplicates automatically (eliminating the `includes()` guard on line 48), and `Set` iterates cleanly. The `_reset()` method becomes `this._changed = new Set()`. This simplifies all three impacted methods and improves performance.

---

## Low Severity Issues (Readability / Maintenance)

### L1 — Inconsistent Object Definition Styles

**Category**: Lexical Abuser
**Smell**: Inconsistent Style

Three distinct object-definition styles coexist in the codebase:
- ES6 `class`: `lib/connection.js`, `lib/fdcstream.js` (Client, Subscription)
- Prototype-based constructor functions: `index.js` (Connection, Plugin), `lib/record.js` (Record — 18 prototype methods)
- Plain object factory: `lib/optionhelper.js` (OptionHelper returning a frozen object)

`lib/record.js` in particular is entirely prototype-based at 186 lines and would benefit from ES6 class syntax for readability, consistent with `lib/fdcstream.js`.

**Location**: `lib/record.js:1–186`, `index.js:24–54`, `index.js:932–948`

---

### L2 — `hasChanged` Overly Complex Control Flow

**Category**: Obfuscator
**Smell**: Conditional Complexity

`Record.prototype.hasChanged` (record.js lines 122–133) uses a nested if/else-if/else chain with a trailing `return false` that adds visual complexity to what is a simple predicate. The logic can be expressed in three flat lines:

```javascript
// Current: 12 lines
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

// Simplified: 4 lines
Record.prototype.hasChanged = function (field) {
  if (!this._changed || this._changed.length === 0) return false;
  if (!field) return true;
  return this._changed.includes(field.toLowerCase());
};
```

**Location**: `lib/record.js:122–133`

---

### L3 — `_getOpts` Callback Parameter is Vestigial Dead Code

**Category**: Dispensable
**Smell**: Dead Code, Speculative Generality

`Connection.prototype._getOpts(d, c, opts)` (index.js lines 96–125) has a second parameter `c` that is captured as a `callback` (line 105) and stored at `data.callback` (line 115). The comment on line 759 states "internal api methods - Promises based, no callbacks." No call site in the entire file passes a callback — all invocations use `this._getOpts(data)`, `this._getOpts(data, null, {...})`, or similar with explicit `null` for the second argument. The entire callback-handling branch (`if (util.isFunction(d))`, the `c`/`callback` variable, and `data.callback`) is unreachable code.

**Location**: `index.js:96–125` — specifically the `c` parameter, `callback` variable, and `data.callback` assignment

**Refactoring**: Remove the `c` parameter and the associated dead branches. Simplify `_getOpts` to a single branch that always treats the first argument as data.

---

### L4 — `previous()` Returns `undefined` for Falsy Previous Values

**Category**: Obfuscator
**Smell**: Obscured Intent, Truthiness Bug

`Record.prototype.previous` (record.js lines 144–155) uses a truthiness check to decide whether to return a previous value:

```javascript
if (this._previous[field]) {
  return this._previous[field];
} else {
  return;
}
```

This incorrectly returns `undefined` when the previous value was a falsy value such as `0`, `''`, `false`, or `null`. A field previously set to `0` that is then changed to `1` would have `previous('fieldname')` return `undefined` instead of `0`. This is a subtle correctness bug masked by the fact that most Salesforce field values are strings or objects.

**Location**: `lib/record.js:147–151`

**Refactoring**: Replace the truthiness check with an explicit presence check:
```javascript
if (field in this._previous) {
  return this._previous[field];
}
```

---

### L5 — `_extensionEnabled` Set on Wrong `this` in `fdcstream.js`

**Category**: Data Dealer
**Smells**: Status Variable, Hidden Dependency

In `fdcstream.js` lines 66–72, `replayExtension.incoming` is a regular `function` expression. When Faye calls it as a method of `replayExtension`, `this` inside the handler refers to `replayExtension` itself, not the `Client` instance. So `this._extensionEnabled = true` (line 70) sets the property on the `replayExtension` plain object. This property is never read anywhere in the codebase — not in `Client`, `Subscription`, any test, or any other file. It is either a feature stub for replay extension state detection that was never completed, or an accidental write to the wrong object.

**Location**: `lib/fdcstream.js:70`

**Refactoring**: If replay detection is not yet needed, remove the dead assignment. If it is intended, store the state on the `Client` instance via the captured `self` reference (`self._extensionEnabled = true`), and add the consuming logic.

---

### L6 — Unnecessary `url` Module Require

**Category**: Dispensable
**Smell**: Dead Code (unnecessary import)

`lib/optionhelper.js` line 4 imports `const url = require('url')` and uses it as `new url.URL(opts.uri)` on line 89. In Node.js 22, `URL` is a global — available without any import, exactly like `fetch` and `AbortSignal`. The `require('url')` serves no purpose.

**Location**: `lib/optionhelper.js:4, 89`

**Refactoring**: Remove `const url = require('url')` and change `new url.URL(opts.uri)` to `new URL(opts.uri)`.

---

### L7 — `'use strict'` Applied Inconsistently

**Category**: Lexical Abuser
**Smell**: Inconsistent Style

`'use strict'` appears in `index.js` (line 1), `lib/constants.js` (line 2), and `lib/optionhelper.js` (line 1), but is absent from `lib/record.js`, `lib/util.js`, `lib/errors.js`, `lib/fdcstream.js`, and `lib/multipart.js`. In Node.js CommonJS modules, strict mode is not automatic. While unlikely to cause bugs in this well-structured code, the inconsistency creates an uneven baseline.

**Location**: Missing from `lib/record.js:1`, `lib/util.js:1`, `lib/errors.js:1`, `lib/fdcstream.js:1`, `lib/multipart.js:1`

**Refactoring**: Add `'use strict'` to all five CommonJS files for consistency. Alternatively, migrate the project to ESM (`"type": "module"` in `package.json`), where strict mode is automatic and `require` is replaced with `import`.

---

## SOLID Principle Violations

| Principle | Score (0–10) | Assessment |
|-----------|-------------|------------|
| **S** — Single Responsibility | 4 | `index.js` handles 7 distinct concerns (H1). `lib/connection.js` has a duplicate constructor that adds confusion (H2). |
| **O** — Open/Closed | 7 | `getBody()` uses an if/else type-dispatch chain (index.js:483–491) that requires modification to add a new blob type. The plugin system demonstrates good OCP thinking. |
| **L** — Liskov Substitution | 10 | No inheritance hierarchy with substitutability concerns. |
| **I** — Interface Segregation | 8 | No formal interfaces (JavaScript). The overloaded `opts` bag passed to `_getOpts` is a mild violation — callers must know which fields are relevant for each call. |
| **D** — Dependency Inversion | 7 | `index.js` directly imports concrete modules. Acceptable for a library at this scale; would matter more if unit-testing individual request methods in isolation became a priority. |

### OCP Detail: `getBody` Type Dispatch

`Connection.prototype.getBody` (index.js lines 477–492) uses an if/else chain to dispatch to `getDocumentBody`, `getAttachmentBody`, or `getContentVersionData` based on a string type. Adding a new blob type requires modifying `getBody`. A registration-based dispatch map (similar to the plugin system) would be more extensible:

```javascript
const BODY_GETTERS = {
  document: 'getDocumentBody',
  attachment: 'getAttachmentBody',
  contentversion: 'getContentVersionData'
};
```

---

## GRASP Principle Assessment

| Principle | Assessment |
|-----------|------------|
| **Information Expert** | Partially violated — `getApiRequestOptions` (M1) reads 13 fields from a foreign object. |
| **Creator** | Compliant — `createConnection`, `createSObject` are appropriate factory functions. |
| **Controller** | Partially violated — `index.js` is an oversized controller (H1). |
| **Low Coupling** | Partially violated — `index.js` imports 8 modules; H3 (broken multipart) is silent coupling to request-library conventions. |
| **High Cohesion** | Violated — `index.js` has 7 distinct responsibilities (H1). |
| **Polymorphism** | Minor violation — `getBody` type dispatch (see OCP detail). |
| **Pure Fabrication** | Compliant — `optionhelper`, `util`, `errors` are appropriate service abstractions. |
| **Indirection** | Compliant — `optionhelper` provides indirection for request building. |
| **Protected Variations** | Partially violated — `gzip` (M7) and multipart (H3) are unprotected variation points that silently do nothing. |

---

## Impact Assessment

**Total Issues Found**: 18
- High Severity: 3 (architectural/functional)
- Medium Severity: 8 (design/correctness)
- Low Severity: 7 (readability/maintenance)

**Breakdown by Category**:

| Category | Count | Issues |
|----------|-------|--------|
| Bloaters | 2 | H1 (Large Class), M6 (Flag Argument) |
| Change Preventers | 1 | H1 (Divergent Change) |
| Couplers | 1 | M1 (Feature Envy) |
| Functional Abusers | 2 | H3 (broken multipart side-effect), M8 (O(n) loops) |
| Dispensables | 4 | H2 (orphaned stub class), L3 (dead callback), L6 (unnecessary require), M4 (deprecated module) |
| Lexical Abusers | 4 | M3 (inconsistent self), M4 (deprecated module), M5 (magic URL), L7 (inconsistent strict) |
| Object-Oriented Abusers | 1 | H2 (split class definition) |
| Obfuscators | 3 | L2 (complex conditional), L4 (obscured return), M2 (timeout inconsistency) |
| Other | 2 | M7 (gzip without decompression), L5 (dead state assignment) |

---

## Recommendations and Refactoring Roadmap

### Phase 1 — Fix Broken Functionality (Immediate Priority)

**H3 — Multipart Upload**
Rewrite `lib/multipart.js` to return a `FormData` object. Update `optionhelper.js` to assign `opts.multipart` to `ropts.body` when multipart is present. Remove the manual `Content-Type` header override (let `fetch` set it with the auto-generated boundary). Add a unit/integration test specifically for `insert` with a Document or Attachment.

**M2 — Timeout in `_apiRequest`**
Apply `AbortSignal.timeout(this.timeout)` in `_apiRequest` identically to how it is applied in `_apiAuthRequest`. Remove `ropts.timeout` from `optionhelper.js`. Every request type will then respect the configured timeout.

### Phase 2 — High-Value Quick Wins (Short-term, Low Risk)

**M4 — Deprecated `querystring`**
Replace `require('querystring')` and all three `qs.stringify()` calls with `new URLSearchParams(obj).toString()`. Mechanical change, no behavior change.

**L6 — Unnecessary `url` require**
Remove `const url = require('url')`, change `new url.URL(...)` to `new URL(...)`. One-line change.

**L4 — `previous()` falsy value bug**
Replace `if (this._previous[field])` with `if (field in this._previous)` to correctly return falsy previous values.

**M8 — `_changed` Set refactor**
Replace `_changed` Array with `Set` in `record.js`. Simplifies `set()`, `_reset()`, `hasChanged()`, and `_getPayload()` while improving correctness and performance.

**M7 — `gzip` option**
Implement decompression using `DecompressionStream` or remove the option entirely with a changelog entry.

### Phase 3 — Architecture (Medium-term)

**H1 + H2 — Complete ES6 class migration and decompose `index.js`**
This is the highest-leverage change. Move all Connection prototype methods into the ES6 class in `lib/connection.js`. Extract `lib/auth.js`, `lib/http.js`, and `lib/plugin.js`. Reduce `index.js` to a composition root. This eliminates the duplicate constructor (H2), resolves the Divergent Change (H1), and makes individual concerns independently testable.

**M3 — `self` alias cleanup**
Systematically convert `function` callbacks to arrow functions in `record.js` and `index.js`. Remove all `self` aliases that are not genuinely needed.

**L3 — Remove dead callback scaffolding**
Remove the `c` parameter and dead branches from `_getOpts`.

**L7 — `'use strict'` consistency**
Add to the five files that lack it, or migrate to ESM.

### Phase 4 — Design Improvements (Long-term)

**OCP `getBody` dispatch** — Replace if/else chain with a registration map object.

**L5 `_extensionEnabled`** — Implement replay extension detection properly or remove the dead `this._extensionEnabled = true` assignment from the `replayExtension` plain object.

**L1 Style consistency** — Migrate `lib/record.js` and `index.js` Plugin to ES6 class syntax.

**M6 Flag argument** — Split `_getPayload(bool)` into `_getFullPayload()` and `_getChangedPayload()`.

---

## Appendix: Analyzed Files

| File | Lines | Issues |
|------|-------|--------|
| `index.js` | 994 | H1, H2, H3 (partial), M2, M3, M4, M5, M6, L3, OCP |
| `lib/connection.js` | 93 | H2 (parallel stub) |
| `lib/record.js` | 186 | M3, M6, M8, L1, L2, L4 |
| `lib/optionhelper.js` | 102 | M1, M2, M7, H3 (partial), L6 |
| `lib/fdcstream.js` | 104 | M3, L1, L5 |
| `lib/multipart.js` | 27 | H3 (broken format) |
| `lib/util.js` | 63 | L7 (missing strict) |
| `lib/constants.js` | 47 | M7 (gzip default) |
| `lib/errors.js` | 11 | L7 (missing strict) |

## Appendix: Detection Methodology

All source files were read in full. Targeted grep patterns verified call-site counts, data flows (tracing `opts.multipart` end-to-end), import chains, and naming patterns. Node.js API deprecation status was verified against Node.js v25 documentation. No source files were modified. The analysis covers only what remains to be improved; issues resolved in the preceding refactoring sprint are explicitly excluded per the analysis brief.

**Sources**: Martin Fowler (1999/2018) "Refactoring", Robert C. Martin (2008) "Clean Code", Marcel Jerzyk (2022) "Code Smells: A Comprehensive Online Catalog and Taxonomy".
