# Code Smell Detection Report

## Executive Summary

**Project**: nforce8 — Node.js REST API wrapper for Salesforce
**Analysis Date**: 2026-03-28
**Languages**: JavaScript (Node.js, CommonJS modules)
**Files Analyzed**: 13 source files, 8 test files (22 total)

The codebase is in good shape overall. A previous refactoring campaign has clearly reduced complexity; the monolithic `index.js` has been broken into domain modules and the prototype-mixin architecture is clean for its pattern. Most remaining findings are low-to-medium severity, concentrated in a few recurring themes: a pervasive "opts bag" pattern that acts as Primitive Obsession / Data Clump, internal methods exposed on public surfaces (Indecent Exposure), duplicated timeout-signal setup logic, and test files that repeat connection boilerplate exhaustively.

**Total Issues Found**: 30
| Severity | Count |
|---|---|
| High | 3 |
| Medium | 13 |
| Low | 14 |

**Code Quality Grade**: C (16–30 total issues, 3 high-severity)

---

## Project Analysis

### Languages and Frameworks Detected
- **JavaScript** (Node.js >= 22, CommonJS `require`)
- **Faye** streaming library (`lib/fdcstream.js`)
- **Test stack**: Mocha + should.js + NYC coverage

### Project Structure
```
index.js            — Entry point, Connection constructor, exports (77 lines)
lib/api.js          — All Salesforce API methods (503 lines)
lib/auth.js         — OAuth/authentication methods (267 lines)
lib/connection.js   — Connection options validation (88 lines)
lib/constants.js    — Endpoints, API version, defaults (52 lines)
lib/errors.js       — Custom error factories (13 lines)
lib/fdcstream.js    — Faye-based streaming API client (99 lines)
lib/http.js         — Fetch-based request engine (189 lines)
lib/multipart.js    — Multipart form-data builder (56 lines)
lib/optionhelper.js — HTTP request option builder (98 lines)
lib/plugin.js       — Plugin extension system (52 lines)
lib/record.js       — SObject record class (183 lines)
lib/util.js         — Type utilities, ID resolution (77 lines)
```

---

## High Severity Issues (Architectural Impact)

### 1. Indecent Exposure — Private Implementation Methods on the Public API Surface

**Category**: Object-Oriented Abusers / Obfuscators
**Severity**: High
**Principle Violated**: Interface Segregation Principle (ISP), Information Hiding

**Files and Lines**:
- `lib/auth.js`, lines 248–267 (exports block)
- `lib/api.js`, lines 472–503 (exports block)
- `lib/http.js`, lines 186–189 (exports block)

**Description**: Implementation-private helpers are exported and thereby mixed into the public `Connection` prototype. A caller can invoke `org._authEndpoint()`, `org._loginEndpoint()`, `org._revokeEndpoint()`, `org._getOpts()`, `org._apiRequest()`, `org._apiAuthRequest()`, `org._notifyAndResolve()`, and `org._resolveOAuth()` directly. The leading underscore signals intent-to-be-private, but the mixin architecture (`Object.assign(Connection.prototype, ...)`) makes these genuinely public.

```js
// lib/auth.js
module.exports = {
  _authEndpoint,      // private — should not be public
  _loginEndpoint,     // private — should not be public
  _revokeEndpoint,    // private — should not be public
  _notifyAndResolve,  // private — should not be public
  _resolveOAuth,      // private — should not be public
  ...
};

// lib/api.js
module.exports = {
  _getOpts,           // private — should not be public
  ...
};
```

**Impact**: Callers depending on private methods create hidden coupling; internal refactoring becomes impossible without breaking external consumers. Tests currently exercise `org._notifyAndResolve` and `org._resolveOAuth` directly (test/connection.js, lines 377–443), cementing this coupling.

**Recommendation**: Use a module-internal map for private methods and expose only the public API surface in `module.exports`. The `Connection` constructor can install private helpers via a non-enumerable property bag rather than through the shared prototype.

---

### 2. Primitive Obsession / Data Clump — Pervasive Opts Bag Pattern

**Category**: Bloaters / Data Dealers
**Severity**: High
**Principle Violated**: Single Responsibility Principle (SRP), Information Expert (GRASP)

**Files and Lines**:
- `lib/api.js`, lines 10–27 (`_getOpts` function), and every API method (~27 call sites)
- `lib/auth.js`, lines 124–172 (`authenticate`), 174–219 (`refreshToken`)
- `lib/http.js`, lines 95–131 (`_apiAuthRequest`), 136–184 (`_apiRequest`)
- `lib/optionhelper.js`, lines 27–78 (`getApiRequestOptions`)

**Description**: The entire system is organized around a single plain-object "opts bag" that accumulates properties as it flows through the call stack. Each layer reads from and writes to the same mutable object:

```js
// A single opts object grows across multiple boundaries:
const opts = this._getOpts(data);       // step 1: populate from caller
opts.resource = sobjectPath(type, id);  // step 2: mutate resource
opts.method = 'PATCH';                  // step 3: mutate method
opts.body = JSON.stringify(...);        // step 4: mutate body
return this._apiRequest(opts);          // step 5: pass mutable bag down
```

The same object carries OAuth credentials, HTTP verbs, URL fragments, serialized payloads, retry counters, feature flags (`blob`, `raw`, `fetchAll`, `includeDeleted`), and query parameters all at once. There is no type that communicates which properties are required at which layer.

**Impact**: Every function touching `opts` is implicitly coupled to its entire schema. Adding a new property risks silent conflicts. Testing is harder because callers must understand the full bag contract. `opts._retryCount` and `opts._refreshResult` are state variables grafted onto the request bag at runtime (`lib/http.js`, lines 177–178), making the retry state invisible and surprising.

**Recommendation**: Define typed request objects — even lightweight ones — for the major boundaries: `AuthRequest`, `ApiRequest`, `QueryOptions`. Separate what the caller provides from what the HTTP layer needs. Remove in-band state flags (`_retryCount`, `_refreshResult`) from the request bag; track retry state separately.

---

### 3. God Module — `lib/api.js` as Monolithic API Surface

**Category**: Bloaters
**Severity**: High
**Principle Violated**: Single Responsibility Principle (SRP), High Cohesion (GRASP)

**File**: `lib/api.js` (503 lines, 30 exported symbols)

**Description**: `lib/api.js` combines several conceptually independent concerns into one module:
- **System metadata**: getVersions, getResources, getSObjects, getMetadata, getDescribe, getLimits
- **CRUD operations**: insert, update, upsert, delete, getRecord
- **Binary/blob access**: getBody, getAttachmentBody, getDocumentBody, getContentVersionData
- **Query and search**: query, queryAll, search, internal `_queryHandler`, `respToJson`
- **URL access**: getUrl, putUrl, postUrl, deleteUrl, internal `_urlRequest`
- **Apex REST**: apexRest
- **Streaming**: createStreamClient, subscribe, deprecated stream
- **Internal utilities**: `_getOpts`, `sobjectPath`, `resolveId`, `resolveType`, `requireForwardSlash`

While each individual function is small and well-written, lumping 30 exports into one file creates a single massive change surface. Adding a streaming feature, modifying CRUD behavior, and patching a query pagination bug all touch the same file.

**Recommendation**: Sub-divide by domain: `lib/crud.js`, `lib/query.js`, `lib/streaming.js`, `lib/metadata.js`. The shared helpers (`_getOpts`, `sobjectPath`, `resolveId`, `resolveType`) should live in a shared utilities module rather than being buried inside api.js and exported from there.

---

## Medium Severity Issues (Design Problems)

### 4. Duplicated Code — Timeout/AbortSignal Setup Block

**Category**: Dispensables
**Severity**: Medium
**Principle Violated**: DRY

**File**: `lib/http.js`, lines 100–106 and lines 139–145

**Description**: An identical pattern for merging an `AbortSignal.timeout` with an optional existing signal appears twice — once in `_apiAuthRequest` and once in `_apiRequest`:

```js
// Lines 100-106 (_apiAuthRequest):
if (this.timeout) {
  const timeoutSignal = AbortSignal.timeout(this.timeout);
  opts.signal =
    opts.signal !== undefined
      ? AbortSignal.any([timeoutSignal, opts.signal])
      : timeoutSignal;
}

// Lines 139-145 (_apiRequest):
if (this.timeout) {
  const timeoutSignal = AbortSignal.timeout(this.timeout);
  ropts.signal =
    ropts.signal !== undefined
      ? AbortSignal.any([timeoutSignal, ropts.signal])
      : timeoutSignal;
}
```

**Recommendation**: Extract a `buildSignal(existingSignal, timeout)` helper function and call it from both locations.

---

### 5. Duplicated Code — Multipart Type Check in `insert` and `update`

**Category**: Dispensables
**Severity**: Medium
**Principle Violated**: DRY

**File**: `lib/api.js`, lines 153–157 and lines 167–171

**Description**: The `insert` and `update` functions each duplicate the same conditional multipart-or-JSON body selection:

```js
// insert (lines 153-157):
if (CONST.MULTIPART_TYPES.includes(type)) {
  opts.multipart = multipart(opts);
} else {
  opts.body = JSON.stringify(opts.sobject.toPayload());
}

// update (lines 167-171):
if (CONST.MULTIPART_TYPES.includes(type)) {
  opts.multipart = multipart(opts);
} else {
  opts.body = JSON.stringify(opts.sobject.toChangedPayload());
}
```

The only difference is `toPayload()` vs `toChangedPayload()`. The multipart detection logic is expressed twice.

**Recommendation**: Extract a helper such as `applyBody(opts, type, payloadFn)` that selects multipart or JSON, where the caller provides the payload function.

---

### 6. Duplicated Code — Environment-Conditional Endpoint Selection

**Category**: Dispensables
**Severity**: Medium
**Principle Violated**: DRY, Open/Closed Principle (OCP)

**File**: `lib/auth.js`, lines 37–48

**Description**: Three helper functions apply the same sandbox/production conditional to different URL properties:

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

**Recommendation**: Extract a single `_resolveEndpoint(prod, test)` helper: `return this.environment === 'sandbox' ? test : prod`. Each named function then becomes a one-liner calling the shared helper.

---

### 7. Duplicated Code — `package.json` Read for API Version

**Category**: Dispensables
**Severity**: Medium
**Principle Violated**: DRY

**Files**:
- `lib/constants.js`, line 15: `require('../package.json').sfdx.api`
- `index.js`, line 68: `require('./package.json').sfdx.api`

**Description**: `package.json` is loaded separately in two files to extract `sfdx.api`. `index.js` already imports `CONST` from `lib/constants`, which exposes `CONST.API` from the same value.

**Recommendation**: Remove the redundant `require('./package.json').sfdx.api` in `index.js` and re-export `API_VERSION` from the already-imported `CONST`:

```js
// index.js — after fix
const API_VERSION = CONST.API;
```

---

### 8. Temporary Field / Status Variable — `_retryCount` and `_refreshResult` on the opts bag

**Category**: Data Dealers / Object-Oriented Abusers
**Severity**: Medium
**Principle Violated**: Mutable Data, Separation of Concerns

**File**: `lib/http.js`, lines 167–182

**Description**: The retry logic in `_apiRequest` writes state directly onto the opts bag that was originally owned by the caller:

```js
opts._refreshResult = res;   // line 177 — internal state on caller's object
opts._retryCount = 1;        // line 178 — sentinel to prevent infinite recursion
return this._apiRequest(opts);
```

`_retryCount` acts as a Status Variable — flow control encoded in a data structure rather than in program structure. `_refreshResult` is a dead write; it is assigned but never read anywhere in the codebase.

**Recommendation**: Represent retry logic as a standalone function with its own local retry state rather than piggybacking on the caller's opts. Alternatively, pass an explicit `{ maxRetries, retryCount }` context object through the retry boundary. Remove `_refreshResult`.

---

### 9. Dead Write — `opts._refreshResult` Never Read

**Category**: Dispensables (Dead Code)
**Severity**: Medium
**Principle Violated**: YAGNI

**File**: `lib/http.js`, line 177

**Description**: `opts._refreshResult = res` is assigned within the retry path but is never read anywhere in the codebase. A search across all source files and tests confirms no consumer of `_refreshResult` exists.

**Recommendation**: Remove the dead assignment.

---

### 10. Magic Strings — Salesforce Content Type Identifiers

**Category**: Lexical Abusers
**Severity**: Medium
**Principle Violated**: DRY, Single Source of Truth

**Files**:
- `lib/constants.js`, line 13: `MULTIPART_TYPES = ['document', 'attachment', 'contentversion']`
- `lib/multipart.js`, lines 17–18: inline `'contentversion'` comparisons
- `lib/api.js`, line 228: type compared against `BODY_GETTER_MAP` string keys

**Description**: The string `'contentversion'` appears in multiple files in hardcoded comparisons that must all agree. `multipart.js` compares the type against `'contentversion'` independently, without referencing `CONST.MULTIPART_TYPES`:

```js
// multipart.js — independent magic strings
const entity = type === 'contentversion' ? 'content' : type;
const name   = type === 'contentversion' ? 'VersionData' : 'Body';
```

If the type string changes, or a new special type is added, `multipart.js` will not automatically stay in sync with `constants.js`.

**Recommendation**: Define the content-type names as named constants and import them where needed. Use a lookup map in `multipart.js` keyed on the same constants.

---

### 11. Inconsistent Style — Missing Spaces Around Assignment Operators

**Category**: Lexical Abusers
**Severity**: Medium

**File**: `lib/api.js`, lines 150, 163–164, 177–179, 188–189

**Description**: Several consecutive local variable assignments in the CRUD methods omit the space before the `=` operator:

```js
const type =opts.sobject.getType();   // line 150 — missing space before opts
const id =opts.sobject.getId();       // line 164 — missing space before opts
const extId =opts.sobject...          // line 179
```

This is inconsistent with the rest of the file and with standard ESLint `space-infix-ops` expectations.

**Recommendation**: Apply `eslint --fix` to normalize spacing. Consider adding `space-infix-ops: error` to the ESLint config if not already enforced.

---

### 12. Feature Envy — `multipart.js` Reaching Deep into SObject

**Category**: Couplers
**Severity**: Medium
**Principle Violated**: Information Expert (GRASP), Law of Demeter

**File**: `lib/multipart.js`, lines 16–43

**Description**: The `multipart()` function interrogates many facets of an `opts.sobject` to build the form:

```js
const type     = opts.sobject.getType();
const fileName = opts.sobject.getFileName();
// ...
isPatch ? opts.sobject.toChangedPayload() : opts.sobject.toPayload()
// ...
opts.sobject.getBody()
```

The function's knowledge of SObject internals (that it has a body, a filename, a payload, and a type) makes `multipart.js` tightly coupled to the `Record` class. Any change to how `Record` exposes these concerns requires changes in `multipart.js`.

**Recommendation**: Move the logic for building a multipart representation into `Record` itself (or a helper it owns), and expose a single `record.toMultipartForm(isPatch)` method. `multipart.js` then becomes a thin adapter.

---

### 13. Lazy Element — `_resolveOAuth` in `lib/auth.js`

**Category**: Dispensables
**Severity**: Medium
**Principle Violated**: YAGNI

**File**: `lib/auth.js`, lines 120–122

**Description**: `_resolveOAuth` is a one-liner that wraps `Promise.resolve`:

```js
const _resolveOAuth = function (newOauth) {
  return Promise.resolve(newOauth);
};
```

This function exists solely to be the symmetrical counterpart to `_notifyAndResolve`, but it adds no behavior, no documentation value, and no abstraction value. It is exported publicly and exercised by tests (`test/connection.js`, lines 426–443), which deepens the coupling.

**Recommendation**: Replace calls to `this._resolveOAuth(newOauth)` with `Promise.resolve(newOauth)` directly in `authenticate`. Remove the function from the exports and update the one test that exercises it.

---

### 14. Speculative Generality — `opts.requestOpts` Passthrough

**Category**: Dispensables
**Severity**: Medium
**Principle Violated**: YAGNI

**Files**:
- `lib/optionhelper.js`, lines 73–75
- `lib/http.js`, lines 96–98

**Description**: Both `_apiAuthRequest` and `getApiRequestOptions` apply `Object.assign(opts, opts.requestOpts)` / `Object.assign(ropts, opts.requestOpts)`, providing an open-ended escape hatch for callers to inject arbitrary Fetch options. This is undocumented in user-facing docs, creates an implicit contract surface that is hard to test, and has no known current consumer in the test suite or examples.

**Recommendation**: If `requestOpts` is intentional for power users, document it explicitly in the README. If it is unused in practice, remove it. A principled alternative is to expose specific typed options: `signal` for abort control and `headers` for header injection.

---

### 15. Inappropriate Intimacy — Tests Accessing Internal `_fields`, `_changed`, `_previous`

**Category**: Couplers
**Severity**: Medium
**Principle Violated**: Information Hiding, Encapsulation

**File**: `test/record.js`, lines 41, 49, 55, 102, 109, 117, 160–161, 195–200, 217–218, 243–245

**Description**: The `Record` test suite routinely reaches into private state to set it up and assert against it:

```js
acc._changed = new Set();         // line 217 — bypassing reset()
acc._previous = {};               // line 218
acc._fields.id.should.equal(...)  // line 160 — bypassing getId()
Object.keys(acc._fields)          // line 41  — bypassing public API
acc._getPayload(true)             // line 220 — testing private method
```

`_getPayload` is also accessed directly in `test/connection.js` (line 198) and multiple places in `test/record.js` (lines 347–378). Tests coupled to private internals break whenever internals are refactored, even if observable behaviour is unchanged.

**Recommendation**: Test only the public contract: `get()`, `set()`, `changed()`, `previous()`, `hasChanged()`, `toPayload()`, `toChangedPayload()`. Introduce `reset()` setup patterns rather than direct field mutation. Refactor tests of `_getPayload` to test the public `toPayload` / `toChangedPayload` equivalents.

---

### 16. Required Setup or Teardown Code — Repeated Connection Boilerplate in Tests

**Category**: Other
**Severity**: Medium
**Principle Violated**: DRY, Test Readability

**File**: `test/connection.js`, lines 8–168 (30 occurrences of `nforce.createConnection(...)`)

**Description**: Every individual test creates a full `nforce.createConnection({...})` inline with `FAKE_CLIENT_ID`, `FAKE_REDIRECT_URI`, and various option permutations. The constants `FAKE_CLIENT_ID` and `FAKE_REDIRECT_URI` are referenced 88 times combined in the file. A baseline valid connection configuration is recreated from scratch in 17 `it` blocks:

```js
// Repeated ~17 times verbatim or near-verbatim:
let org = nforce.createConnection({
  clientId: FAKE_CLIENT_ID,
  clientSecret: FAKE_CLIENT_ID,
  redirectUri: FAKE_REDIRECT_URI,
  environment: 'production'
});
```

**Recommendation**: Extract a shared `makeOrg(overrides = {})` helper at the top of the test file. Individual tests pass only the options that differ from the baseline.

---

## Low Severity Issues (Readability / Maintenance)

### 17. Trivial Getter/Setter Proliferation — auth.js

**Category**: Dispensables (Lazy Element)
**Severity**: Low
**Principle Violated**: YAGNI

**File**: `lib/auth.js`, lines 5–35

**Description**: Eight trivial getter/setter pairs expose raw properties with no validation, transformation, or documentation value:

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

These provide no encapsulation: the underlying fields are directly accessible on `this` via `Connection`. `setOAuth` is used in tests (`orgSingle.setOAuth(oauth)`) and `getOAuth()` in one example, but none perform validation or trigger side effects.

**Recommendation**: Keep `setOAuth` since it is part of the documented public API. Consider removing the password/token setters or consolidating into a single `setCredentials({ username, password, securityToken })` method with validation. The trivial getters for username/password/securityToken add no value over direct property access.

---

### 18. What Comment — Inline Comments Restating Obvious Code

**Category**: Other
**Severity**: Low
**Principle Violated**: Communication (comments should explain why, not what)

**Files**:
- `lib/constants.js`, line 14: `// This needs update for each SFDC release!` — describes manual maintenance burden rather than automating it
- `lib/http.js`, line 92–93: `// Auth request — used for OAuth token endpoints` — repeats what the function name communicates
- `lib/http.js`, line 133–134: `// API request — used for all Salesforce REST API calls`
- `test/mock/sfdc-rest-api.js`, line 13–14: `// Default answer, when none provided`

**Description**: Several comments explain what the code does (which is evident from reading it) rather than the non-obvious "why" — the tradeoffs, constraints, or invariants being maintained.

**Recommendation**: Remove obvious what-comments. For `constants.js` line 14, consider replacing the manual note with a reference to the Salesforce release schedule or a CI check.

---

### 19. Fallacious Comment — `test/record.js` `#getUrl` Test Description

**Category**: Lexical Abusers
**Severity**: Low

**File**: `test/record.js`, line 202

**Description**: The describe block `'#getUrl'` contains a test with the description `'should let me get the id'`, but the test actually exercises `getUrl()`, not `getId()`:

```js
describe('#getUrl', function () {
  it('should let me get the id', function () {   // wrong description
    acc.getUrl().should.equal('http://www.salesforce.com');
  });
});
```

**Recommendation**: Change the test description to `'should let me get the url'`.

---

### 20. Dead Code — Commented-Out Object Literal in `test/integration.js`

**Category**: Dispensables
**Severity**: Low
**Principle Violated**: YAGNI

**File**: `test/integration.js`, lines 56–67

**Description**: A large commented-out object literal with hardcoded credential placeholders has been left in the integration test, alongside a `TODO: fix the creds` marker (line 18):

```js
/*
  let x = {
      clientId: "ADFJSD234ADF765SFG55FD54S",
      clientSecret: "adsfkdsalfajdskfa",
      ...
  }
  */
```

This block serves no purpose and represents abandoned work superseded by the mock API approach.

**Recommendation**: Remove the commented-out block and the `TODO` comment on line 18.

---

### 21. Temporary Field — `let client = undefined` in Integration Test

**Category**: Data Dealers
**Severity**: Low

**File**: `test/integration.js`, line 7

**Description**: `let client = undefined` is a mutable Temporary Field initialized to undefined, then conditionally assigned in `before()`. Defensive null-checks scatter across the test:

```js
let client = undefined;       // nullable init
before(() => {
  client = nforce.createConnection(creds);  // maybe assigned
});
after(() => {
  if (client != null && ...) { ... }  // defensive check
});
```

**Recommendation**: Use `describe.skip` (already partially implemented in the file) to skip the entire suite when credentials are absent, eliminating the nullable client variable and defensive checks entirely.

---

### 22. Inconsistent Null Checks — `== null` vs `=== undefined` vs `!x`

**Category**: Lexical Abusers
**Severity**: Low

**Files**:
- `test/integration.js`, lines 14, 24: `== null`, `!= null`
- `lib/util.js`, line 32: `candidate !== null`
- `lib/optionhelper.js`, line 34: `!opts.resource`
- `lib/http.js`, lines 24–28: mix of `!== undefined`, `!== null`, string comparison

**Description**: At least four different idioms for checking absent values are used across the codebase. This is not a bug, but it increases cognitive load when reading unfamiliar code paths.

**Recommendation**: Establish a project convention in CLAUDE.md or ESLint config. Use strict `=== null` / `=== undefined` when the distinction matters, and optional chaining / nullish coalescing where idiomatic.

---

### 23. Boolean Blindness — `raw` Flag in Query, Search, and getRecord

**Category**: Lexical Abusers
**Severity**: Low

**File**: `lib/api.js`, lines 203–213, 267–276, 357–370

**Description**: A boolean `raw` flag controls whether results are hydrated as `Record` instances or returned as plain objects:

```js
org.query({ query: q, raw: false });  // raw=false means Records
org.query({ query: q, raw: true });   // raw=true means plain objects
```

A reader encountering `raw: true` must look up the convention to understand its meaning. The boolean loses the semantic context of what "raw" means in this domain.

**Recommendation**: Consider a string discriminant such as `{ responseType: 'records' }` vs `{ responseType: 'raw' }`, or provide explicit `queryRaw()` / `searchRaw()` variants so the intent is self-documenting at the call site.

---

### 24. Uncommunicative Name — `d` Parameter in `_getOpts`

**Category**: Lexical Abusers
**Severity**: Low

**File**: `lib/api.js`, line 10

**Description**: The parameter `d` in `_getOpts(d, opts = {})` is a single-letter name with no communicated meaning:

```js
const _getOpts = function (d, opts = {}) {
  let data = {};
  if (opts.singleProp && d && !util.isObject(d)) {
    data[opts.singleProp] = d;
  } else if (util.isObject(d)) {
    data = d;
  }
  ...
}
```

The variable represents "the raw caller-provided input, which may be a string, number, or object."

**Recommendation**: Rename `d` to `input` or `callerArg` to communicate its role.

---

### 25. Speculative API Version Stripping — `apiVersion.substring(1)` in `fdcstream.js`

**Category**: Obfuscators
**Severity**: Low

**File**: `lib/fdcstream.js`, line 47

**Description**: The streaming endpoint is built by stripping the leading `'v'` from the version string:

```js
this._endpoint =
  opts.oauth.instance_url + '/cometd/' + opts.apiVersion.substring(1);
```

This assumes the API version always starts with `'v'` (enforced by `API_VERSION_RE` in `connection.js`), but the dependency between the regex in one module and the string manipulation in another is implicit.

**Recommendation**: Extract a `stripVersionPrefix(v)` helper that documents the invariant, or add a comment referencing the format constraint.

---

### 26. Missing Fail-Fast Guard — Single Mode Without OAuth

**Category**: Obfuscators
**Severity**: Low

**File**: `lib/api.js`, lines 18–21

**Description**: In single mode, `_getOpts` silently injects `this.oauth` into the data bag:

```js
if (this.mode === 'single' && !data.oauth) {
  data.oauth = this.oauth;
}
```

If `this.oauth` is undefined (connection created but never authenticated), the injected value will be undefined. This causes a silent failure deep in `optionhelper.js` when attempting `opts.oauth.instance_url` (property access on undefined). There is no fail-fast guard.

**Recommendation**: Add an explicit guard with a descriptive error: if `this.mode === 'single'` and `this.oauth` is falsy, throw `"Connection is in single-user mode but no OAuth token has been set. Call authenticate() first."`.

---

### 27. Magic Strings — Mode and Environment Literals

**Category**: Lexical Abusers
**Severity**: Low
**Principle Violated**: DRY, Single Source of Truth

**Files**:
- `lib/auth.js`: `'sandbox'` at lines 39, 43, 47; `'single'` at line 156
- `lib/http.js`: `'single'` at line 126
- `lib/constants.js`: defines `CONST.ENVS` and `CONST.MODES`

**Description**: The string literals `'sandbox'`, `'single'`, and `'multi'` appear as direct comparisons throughout multiple files even though they are defined in `constants.js`. The constants exist but are not used for comparisons.

**Recommendation**: Export named string constants from `constants.js` (e.g., `CONST.SANDBOX = 'sandbox'`, `CONST.SINGLE_MODE = 'single'`) and use them in comparisons rather than raw strings.

---

### 28. Ambiguous Method Name — `getBody` Conflicts with `Record.prototype.getBody`

**Category**: Lexical Abusers
**Severity**: Low

**File**: `lib/api.js`, lines 226–234

**Description**: The API method `getBody` (a dispatcher routing to `getDocumentBody`, `getAttachmentBody`, or `getContentVersionData`) shares its name with `Record.prototype.getBody` (which retrieves the binary attachment body from a record object). Both names appear in the same domain (Salesforce SObjects), creating conceptual ambiguity.

**Recommendation**: Rename the API dispatcher to `getBinaryContent` or `getFileBody`, which more accurately signals that it retrieves binary file content from Salesforce storage.

---

### 29. Incomplete Error Factory — `emptyResponse` Missing `type` Property

**Category**: Dispensables
**Severity**: Low

**File**: `lib/errors.js`, lines 9–11

**Description**: `invalidJson()` sets `err.type = 'invalid-json'` (line 5–7), allowing callers to programmatically distinguish the error. `emptyResponse()` does not set a corresponding `type` property, making the API asymmetric:

```js
const invalidJson = () => {
  const err = new Error('...');
  err.type = 'invalid-json';  // type is set
  return err;
};

const emptyResponse = () => {
  return new Error('Unexpected empty response');  // no type
};
```

The test in `test/errors.js` checks `err.type` for invalid-JSON errors, but `emptyResponse` cannot be caught by type in the same way.

**Recommendation**: Add `err.type = 'empty-response'` to `emptyResponse()` for symmetry.

---

### 30. Inconsistent Module Pattern — Constructor Functions vs. ES6 Classes

**Category**: Inconsistent Style
**Severity**: Low

**Files**:
- `index.js`, line 16: `const Connection = function (opts) { ... }` — ES5 constructor function
- `lib/fdcstream.js`, lines 6–37, 41–94: `class Subscription` / `class Client` — ES6 classes
- `lib/record.js`, line 3: `const Record = function (data) { ... }` — ES5 constructor function

**Description**: The codebase mixes two OOP patterns. `fdcstream.js` uses ES6 class syntax while `index.js` and `record.js` use the older constructor-function-with-prototype pattern. This is not a correctness issue but creates stylistic inconsistency that increases cognitive load for contributors.

**Recommendation**: Standardize on ES6 class syntax. Convert `Connection` and `Record` to ES6 classes. The prototype-mixin pattern for `Connection` (`Object.assign(Connection.prototype, ...)`) can be replaced with explicit method definitions in the class body or a deliberate mixin pattern using a shared base.

---

## SOLID Principle Violation Summary

| Principle | Compliance Score (0–10) | Key Violations |
|---|---|---|
| **S** — Single Responsibility | 6/10 | `lib/api.js` handles 8 distinct concerns; Connection prototype mixes HTTP, auth, and API |
| **O** — Open/Closed | 7/10 | New Salesforce object types require editing `CONST.MULTIPART_TYPES` and `BODY_GETTER_MAP` |
| **L** — Liskov Substitution | 9/10 | No inheritance hierarchies; no violations found |
| **I** — Interface Segregation | 5/10 | Public API surface includes private methods; no interface contracts |
| **D** — Dependency Inversion | 7/10 | `_apiRequest` uses global `fetch`; `fdcstream.js` hardcodes Faye |

## GRASP Principle Violation Summary

| Principle | Assessment |
|---|---|
| **Information Expert** | Partially violated: `multipart.js` reaches into `Record` instead of `Record` owning its own representation |
| **Creator** | Adequate: `api.js` creates `Record` instances from response data, which is appropriate |
| **Controller** | Adequate: `Connection` acts as controller; not bloated beyond existing description |
| **Low Coupling** | Partially violated: the opts bag creates implicit coupling across all layers |
| **High Cohesion** | Partially violated: `lib/api.js` is low-cohesion, mixing 8 concerns |
| **Polymorphism** | Adequate: `BODY_GETTER_MAP` dispatch is a reasonable OCP-friendly dispatch approach |
| **Pure Fabrication** | Adequate: `util.js`, `errors.js`, `optionhelper.js` are appropriate fabrications |
| **Indirection** | Adequate: layers are reasonably separated |
| **Protected Variations** | Partially violated: endpoint URLs hardcoded without abstraction for environments beyond sandbox/production |

---

## Impact Assessment

**Total Issues Found**: 30 issues
- **High Severity**: 3 (architectural impact)
- **Medium Severity**: 13 (design impact)
- **Low Severity**: 14 (readability/maintenance)

**Breakdown by Category**:
| Category | Count |
|---|---|
| Dispensables (duplicated/dead code, YAGNI) | 9 |
| Lexical Abusers (naming, comments, magic strings) | 8 |
| Object-Oriented Abusers (exposure, style) | 4 |
| Bloaters (size, opts bag) | 4 |
| Couplers (inappropriate intimacy, feature envy) | 3 |
| Data Dealers (mutable state, temporary fields) | 2 |

---

## Recommendations and Refactoring Roadmap

### Phase 1 — Quick Wins (Low Risk, High Clarity)
1. Fix spacing inconsistencies in `lib/api.js` lines 150, 163–164, 177–179, 188–189 (`eslint --fix`)
2. Remove dead code: `opts._refreshResult` assignment (`http.js:177`) and the commented-out block in `test/integration.js` (lines 56–67)
3. Fix fallacious test description in `test/record.js` line 202: `'should let me get the id'` -> `'should let me get the url'`
4. Remove duplicate `package.json` read in `index.js` line 68; use `CONST.API` from the already-imported constants
5. Add `err.type = 'empty-response'` to `emptyResponse()` in `lib/errors.js`
6. Extract a `buildSignal(existingSignal, timeout)` helper in `lib/http.js` to eliminate the two identical timeout/signal setup blocks

### Phase 2 — Design Improvements (Medium Risk)
7. Extract `applyBody(opts, type, payloadFn)` helper in `lib/api.js` to unify the duplicated multipart/JSON body logic in `insert` and `update`
8. Extract `_resolveEndpoint(prod, test)` helper in `lib/auth.js` to unify the three environment-conditional endpoint functions
9. Remove `_resolveOAuth` — replace with `Promise.resolve(newOauth)` inline; remove from exports and update test
10. Add fail-fast guard in `_getOpts` for single-mode missing oauth
11. Extract a `makeOrg(overrides)` helper in `test/connection.js` to eliminate repeated boilerplate

### Phase 3 — Architectural Improvements (Higher Risk, Higher Value)
12. Separate private methods from `module.exports` in `auth.js`, `api.js`, and `http.js`. Expose only the public API surface on `Connection.prototype`
13. Sub-divide `lib/api.js` into domain-specific modules: `lib/crud.js`, `lib/query.js`, `lib/streaming.js`, `lib/metadata.js`
14. Move multipart representation into `Record`: expose `record.toMultipartForm(isPatch)` rather than having `multipart.js` reach into Record internals
15. Standardize on ES6 class syntax for `Connection` and `Record`
16. Introduce typed options objects or at minimum document the opts-bag schema per layer boundary to reduce Primitive Obsession impact

---

## Appendix — Files Analyzed

| File | Lines | Status |
|---|---|---|
| `index.js` | 77 | Analyzed |
| `lib/api.js` | 503 | Analyzed |
| `lib/auth.js` | 267 | Analyzed |
| `lib/connection.js` | 88 | Analyzed |
| `lib/constants.js` | 52 | Analyzed |
| `lib/errors.js` | 13 | Analyzed |
| `lib/fdcstream.js` | 99 | Analyzed |
| `lib/http.js` | 189 | Analyzed |
| `lib/multipart.js` | 56 | Analyzed |
| `lib/optionhelper.js` | 98 | Analyzed |
| `lib/plugin.js` | 52 | Analyzed |
| `lib/record.js` | 183 | Analyzed |
| `lib/util.js` | 77 | Analyzed |
| `test/connection.js` | 444 | Analyzed |
| `test/crud.js` | 242 | Analyzed |
| `test/errors.js` | 68 | Analyzed |
| `test/integration.js` | 68 | Analyzed |
| `test/mock/sfdc-rest-api.js` | 131 | Analyzed |
| `test/plugin.js` | 108 | Analyzed |
| `test/query.js` | 204 | Analyzed |
| `test/record.js` | 379 | Analyzed |
| `test/util.js` | 47 | Analyzed |

**Files Excluded**: `examples/` (snippet-style scripts, linted differently per ESLint config), `node_modules/`, `.nyc_output/`, config files.

---

## Detection Methodology

- Manual source reading of all 22 analyzed files
- Cross-file pattern analysis using grep for duplicate constructs, magic strings, and naming inconsistencies
- Verification of usage for potentially dead code (search across all source files)
- SOLID and GRASP principle assessment per module
- JavaScript/Node.js-specific thresholds: long method > 50 lines, large module > 300 lines
- Historical catalog references: Fowler (1999/2018), Martin (2008), Jerzyk (2022)
