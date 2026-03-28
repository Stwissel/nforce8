# Code Smell Detection Report — nforce8

**Analysis Date:** 2026-03-27
**Codebase:** nforce8 (Node.js Salesforce REST API wrapper)
**Primary Language:** JavaScript (CommonJS, Node.js ≥22)
**Frameworks / Libraries:** Faye (streaming), mime-types, Mocha + should.js (tests)
**Total Source Lines Analyzed:** ~3,291 (lib + index + test)

---

## Executive Summary

The codebase has undergone a recent refactoring that split the original monolithic `index.js` (~1,089 lines) into several smaller modules. That effort resolved the most severe architectural smell (God Object). What remains is a well-functioning but still imperfect codebase. Fourteen distinct code smells are identified across three severity tiers. The most impactful remaining issues center on an **untyped, unconstrained options bag** that is mutated and passed everywhere, **duplicated patterns** within `lib/api.js`, **indecent exposure** of private Record internals, and a **Flag Argument** controlling refresh behavior. None of the remaining smells constitute architectural disasters, but several increase maintenance cost noticeably.

| Severity | Count |
|----------|-------|
| High     | 3     |
| Medium   | 7     |
| Low      | 4     |
| **Total**| **14**|

---

## Project Structure

```
nforce8/
  index.js          (77 lines)   — entry point, Connection constructor
  lib/
    api.js          (493 lines)  — all Salesforce API methods
    auth.js         (263 lines)  — OAuth flows
    http.js         (189 lines)  — fetch wrappers, retry logic
    connection.js   (88 lines)   — options validation
    record.js       (177 lines)  — SObject record class
    fdcstream.js    (99 lines)   — Faye streaming client
    optionhelper.js (106 lines)  — URI and header builder
    multipart.js    (56 lines)   — multipart/form-data builder
    util.js         (77 lines)   — type checkers, header helpers
    constants.js    (52 lines)   — URLs and default config
    errors.js       (13 lines)   — error factories
    plugin.js       (52 lines)   — plugin registration
  test/
    connection.js   (451 lines)
    record.js       (361 lines)
    crud.js         (242 lines)
    query.js        (204 lines)
    errors.js       (68 lines)
    integration.js  (68 lines)
    plugin.js       (108 lines)
    util.js         (47 lines)
    mock/sfdc-rest-api.js (131 lines)
```

---

## High Severity Issues (Architectural Impact)

### HS-1: Primitive Obsession — The Unconstrained `opts` Property Bag

**Category:** Data Dealers / Primitive Obsession / Mutable Data
**Files:** `lib/api.js` (all 26 API functions), `lib/http.js`, `lib/auth.js`, `lib/optionhelper.js`
**Violated Principles:** Single Responsibility, Dependency Inversion, Information Hiding

**Description:**
Every API function in `lib/api.js` receives a plain object (`data`), passes it through `_getOpts()`, then **mutates** that same object by assigning properties like `opts.resource`, `opts.method`, `opts.body`, `opts.uri`, and `opts.multipart` before passing it downstream to `_apiRequest`. The same object eventually reaches `optionhelper.getApiRequestOptions()`, which reads these mutated properties to build the final HTTP request.

This plain object acts as a global, mutable context bag with no declared schema. Its shape is implicit and only discoverable by reading every function that touches it. The `_retryCount` and `_refreshResult` properties are even injected into it at runtime by `http.js` as out-of-band control signals.

**Evidence (selected lines):**

`lib/api.js:34–41` — `getPasswordStatus` mutates `opts.resource` and `opts.method`.
`lib/api.js:125–138` — `insert` adds `opts.multipart` or `opts.body` depending on type.
`lib/http.js:174–178` — retry logic injects `opts._retryCount` and `opts._refreshResult` into the same opts bag.

```javascript
// lib/http.js lines 174-178
opts._refreshResult = res;
opts._retryCount = 1;
return this._apiRequest(opts);
```

**Impact:**
- No static analysis can verify what shape `opts` must have for any given call.
- Downstream changes to any function touching `opts` can silently break other functions.
- The `_retryCount` and `_refreshResult` sentinel properties are Temporary Fields.
- Increases cognitive load; every maintainer must trace the full mutation chain.

**Refactoring Suggestion:**
Introduce a typed request builder pattern. Create a `RequestBuilder` or a `buildRequest(opts)` function that takes well-defined inputs and returns an immutable `RequestOptions` object. Do not mutate the caller's `opts` in transit.

---

### HS-2: Indecent Exposure — Record Internal State Accessed from Outside

**Category:** Object-Oriented Abusers / Indecent Exposure
**Files:** `lib/api.js`, `lib/http.js`, `test/record.js`, `test/connection.js`
**Violated Principles:** Encapsulation, Information Hiding (OOP)

**Description:**
`Record` uses conventional underscore-prefixed names (`_fields`, `_changed`, `_previous`, `_attachment`, `_getFullPayload`, `_getChangedPayload`, `_reset`) to signal private intent. However, these are accessed directly by multiple external callers:

- `lib/api.js:135` — `opts.sobject._getFullPayload()`
- `lib/api.js:149` — `opts.sobject._getChangedPayload()`
- `lib/http.js:82–83` — `sobject._reset` existence check and call
- `test/record.js:41` — `acc._fields` read directly
- `test/record.js:48–55` — `acc._changed`, `acc._previous` direct access
- `test/record.js:160` — `acc._fields.id` verified directly
- `test/record.js:217–218, 244–245, etc.` — direct mutation of `acc._changed` and `acc._previous`
- `test/connection.js:191–193` — `obj._fields` property inspection

The test files' direct mutations of `_changed` and `_previous` indicate that the public API does not provide sufficient observability for tests, which forces them to reach inside.

**Impact:**
- The `Record` internal data representation cannot be changed without updating callers in `lib/api.js`, `lib/http.js`, and test files.
- Tests that mutate `_changed = new Set()` directly are coupling themselves to the implementation, making them brittle.

**Refactoring Suggestion:**
Add a `reset()` public method (the underscore prefix is the only signal; make it truly public if it is part of the API). Add a `clearChanges()` or use `_reset()` publicly. Expose `toPayload(changedOnly)` as the single public serialization method used by `api.js`. Provide a `resetForTest()` or `clearState()` method usable by tests instead of direct property assignment.

---

### HS-3: Duplicated Code — Repeated `opts.sobject ? opts.sobject.X : opts.X` Pattern

**Category:** Dispensables / Duplicated Code
**File:** `lib/api.js` (lines 38, 46, 176–177, 212–213, 223, 232, 241)
**Violated Principles:** DRY

**Description:**
The pattern of resolving an ID or type from either an sobject or a plain opts property is repeated five times across `lib/api.js`:

```javascript
// Lines 38, 46
let id = opts.sobject ? opts.sobject.getId() : opts.id;

// Lines 176-177
const type = opts.sobject ? opts.sobject.getType() : opts.type;
const id = opts.sobject ? opts.sobject.getId() : opts.id;

// Lines 212-213
const type = (opts.sobject ? opts.sobject.getType() : opts.type).toLowerCase();

// Lines 223, 232, 241
let id = opts.sobject ? util.findId(opts.sobject) : opts.id;
```

Three different approaches are used: `sobject.getId()`, `sobject.getId()`, and `util.findId(opts.sobject)`. This is an Oddball Solution: the same intent resolved three different ways.

**Impact:**
- A change to how IDs or types are resolved (e.g., supporting a new ID field) must be replicated in multiple places.
- The inconsistency between `sobject.getId()` and `util.findId(opts.sobject)` in otherwise identical functions is a latent bug risk.

**Refactoring Suggestion:**
Extract helper functions: `resolveId(opts)` and `resolveType(opts)`. Centralize the resolution in `_getOpts()` or as standalone utility functions. Apply consistently.

---

## Medium Severity Issues (Design Problems)

### MS-1: Duplicated Environment Selection Logic

**Category:** Change Preventers / Duplicated Code
**File:** `lib/auth.js` (lines 86–89, 113, 167, 219–221)
**Violated Principles:** DRY, Open/Closed Principle

**Description:**
The sandbox/production URL selection is repeated three times in `auth.js`:

```javascript
// Line 113
opts.uri = this.environment === 'sandbox' ? this.testLoginUri : this.loginUri;

// Line 167
opts.uri = this.environment === 'sandbox' ? this.testLoginUri : this.loginUri;

// Lines 219-221
opts.uri = this.environment === 'sandbox'
  ? this.testRevokeUri
  : this.revokeUri;
```

Additionally, `getAuthUri()` (lines 84–89) has its own if/else block for the same selection. A new environment type (e.g., a government cloud requiring its own endpoints) would require changes in four separate locations.

**Impact:**
- Adding a third environment (e.g., government sandbox) would require modifying `constants.js`, `connection.js` validation, and four places in `auth.js`.
- Copy-paste error risk is high when similar ternary expressions are maintained separately.

**Refactoring Suggestion:**
Introduce a helper method on the Connection prototype:
```javascript
_loginEndpoint() { return this.environment === 'sandbox' ? this.testLoginUri : this.loginUri; }
_authEndpoint()  { return this.environment === 'sandbox' ? this.testAuthEndpoint : this.authEndpoint; }
_revokeEndpoint(){ return this.environment === 'sandbox' ? this.testRevokeUri : this.revokeUri; }
```
Or encapsulate endpoint selection in `constants.js` with a lookup map keyed by environment name.

---

### MS-2: Duplicated SAML Assertion Type Magic String

**Category:** Lexical Abusers / Magic Number (String variant) / Duplicated Code
**File:** `lib/auth.js` (lines 130 and 182)
**Violated Principles:** DRY

**Description:**
The SAML assertion type URN string is duplicated in `authenticate()` and `refreshToken()`:

```javascript
// Line 130 (in authenticate)
bopts.assertion_type = 'urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser';

// Line 182 (in refreshToken)
refreshOpts.assertion_type = 'urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser';
```

This is a verbose, opaque string with no local explanation. A typo in either location would produce a silent authentication failure.

**Refactoring Suggestion:**
Define `const SAML_ASSERTION_TYPE = 'urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser';` at the top of `auth.js` or in `constants.js`, and reference it in both places.

---

### MS-3: Flag Argument — `executeOnRefresh` Boolean

**Category:** Functional Abusers / Flag Argument
**File:** `lib/auth.js` (lines 96, 109, 163, 233, 239)
**Violated Principles:** Single Responsibility Principle, method clarity

**Description:**
The `executeOnRefresh` flag is passed through `opts` to control whether `_resolveWithRefresh` calls the `onRefresh` callback. This is a classic Flag Argument anti-pattern (Robert C. Martin, 2008): a boolean that changes the function's behavior in a way that should instead be two distinct methods or a clearly named parameter.

```javascript
// lib/auth.js:96
if (this.onRefresh && opts.executeOnRefresh === true) {
```

The flag is set to `false` in `authenticate()` (line 109), `true` in `refreshToken()` (line 163) and `autoRefreshToken()` (line 233), and threaded through the opts chain making it invisible to callers.

**Impact:**
- Callers cannot tell from a call site whether the refresh callback will be invoked.
- The flag value is easily lost or incorrectly set when introducing new auth flows.

**Refactoring Suggestion:**
Replace with two explicit methods or pass an options object with a descriptive key like `{ notifyOnRefresh: true }`, and rename the method to reflect its purpose clearly.

---

### MS-4: Mutated Options Bag in `authenticate()` — Mutable Data / Side Effects

**Category:** Data Dealers / Mutable Data / Side Effects
**File:** `lib/auth.js` (lines 108–157)
**Violated Principles:** Principle of Least Surprise, Command-Query Separation

**Description:**
`authenticate()` receives `data`, calls `_getOpts()`, then mutates `opts.oauth` by merging the server response directly into it (`Object.assign(opts.oauth, res)`). Since `_getOpts()` can return a reference to the caller's own data object, this mutation propagates back to the caller's OAuth object silently.

```javascript
// lib/auth.js:151-153
return this._apiAuthRequest(opts).then((res) => {
  let old = { ...opts.oauth };
  Object.assign(opts.oauth, res);  // mutates caller's object
```

The same pattern occurs in `refreshToken()` (lines 204–208).

**Impact:**
- The caller's OAuth object is silently modified; this is an unannounced side effect.
- In multi-user mode, if the caller reuses an OAuth object reference, it becomes stale in hard-to-diagnose ways.

**Refactoring Suggestion:**
Return a new OAuth object: `return { ...opts.oauth, ...res }`. The caller should be responsible for updating their stored OAuth reference using the return value, which is already the expected API contract.

---

### MS-5: Lazy Element — Trivial Getter/Setter Methods in `auth.js`

**Category:** Dispensables / Lazy Element
**File:** `lib/auth.js` (lines 3–33)
**Violated Principles:** YAGNI

**Description:**
Eight functions (`getOAuth`, `setOAuth`, `getUsername`, `setUsername`, `getPassword`, `setPassword`, `getSecurityToken`, `setSecurityToken`) are simple one-line property accessors that add no transformation, validation, or encapsulation:

```javascript
const getOAuth = function () { return this.oauth; };
const setOAuth = function (oauth) { this.oauth = oauth; };
const getUsername = function () { return this.username; };
// etc.
```

These functions exist purely to provide a formal API for properties that are already public on the Connection prototype. They do not enforce types, validate inputs, or hide implementation details. They are ceremonial wrappers.

**Impact:**
- Adds 30 lines of boilerplate that reads as complex but adds no value.
- Inflates the exported method count on Connection.

**Refactoring Suggestion:**
Either remove them (direct property access is idiomatic in Node.js for simple config data) or consolidate into a single `getConfig(key)` / `setConfig(key, value)` pattern if controlled access is desired.

---

### MS-6: String Concatenation URL Building — Magic Path Fragments

**Category:** Lexical Abusers / Magic Number (path strings)
**File:** `lib/api.js` (lines 39, 47, 99, 108, 130, 144, 159, 169, 179, 224, 233, 242)
**Violated Principles:** DRY, Avoid Magic Literals

**Description:**
All twelve API resource paths are constructed by string concatenation with literal path segments:

```javascript
opts.resource = '/sobjects/user/' + id + '/password';
opts.resource = '/sobjects/' + type;
opts.resource = '/sobjects/' + type + '/describe';
opts.resource = '/sobjects/' + type + '/' + id;
opts.resource = '/sobjects/' + type + '/' + extIdField + '/' + extId;
opts.resource = '/sobjects/attachment/' + id + '/body';
opts.resource = '/sobjects/document/' + id + '/body';
opts.resource = '/sobjects/contentversion/' + id + '/versiondata';
```

The prefix `/sobjects/` appears eight times as a literal string. If Salesforce changes the API path structure (it does not, but a version migration might), all eight occurrences must be found and updated.

Additionally, `lib/api.js:75` uses `this.loginUri.replace('/oauth2/token', '')` to derive the base URI for `getVersions`. This relies on knowing the internal structure of the stored URI — a fragile assumption.

```javascript
opts.uri = this.loginUri.replace('/oauth2/token', '') + '/services/data/';
```

**Refactoring Suggestion:**
Introduce path-building helpers such as:
```javascript
const sobjectPath = (type, ...segments) => ['/sobjects', type, ...segments].join('/');
```
Store the base services data URL as a constant or derive it from `instance_url` rather than string-replacing `loginUri`.

---

### MS-7: Inconsistent `let` vs `const` Usage

**Category:** Lexical Abusers / Inconsistent Style
**File:** `lib/api.js` (throughout), `lib/auth.js`
**Violated Principles:** Consistency

**Description:**
`lib/api.js` uses `let opts` for all but 5 of its 26 `opts` variable declarations, even though in most cases `opts` is not reassigned after `_getOpts()`. This is inconsistent with JavaScript best practice (use `const` when not reassigning) and inconsistent with the handful of functions that do use `const opts`.

Count: 21 occurrences of `let opts` vs. 5 occurrences of `const opts` in `lib/api.js`.

In `lib/auth.js`, the pattern is reversed with a mix of `const opts` and `let opts` across the four exported functions.

**Impact:**
- Reduces readability; a `const` declaration communicates intent that the binding will not change.
- Makes linters unable to catch accidental reassignment.

**Refactoring Suggestion:**
Audit all `let opts` declarations. Where `opts` is never reassigned (the majority of cases), convert to `const opts`.

---

## Low Severity Issues (Readability / Maintenance)

### LS-1: What Comment — Comments Explaining the Obvious

**Category:** Other / What Comment
**Files:** `lib/optionhelper.js`, `lib/http.js`, `lib/api.js`

**Description:**
Several comments describe what the following line does rather than why it exists or what business rule it encodes:

```javascript
// lib/optionhelper.js:33
// Define the URI to call
if (opts.uri) {

// lib/optionhelper.js:47
ropts.method = opts.method || 'GET';

// lib/optionhelper.js:50-51
// set accept headers
ropts.headers = { Accept: 'application/json;charset=UTF-8' };

// lib/optionhelper.js:55-56
// set oauth header
if (opts.oauth) {

// lib/optionhelper.js:60-61
// set content-type and body

// lib/optionhelper.js:75
// process qs

// lib/optionhelper.js:80
// process request opts
```

These comments are noise that adds length without adding information — the code is already self-explanatory at this level.

**Refactoring Suggestion:**
Remove what-comments. Retain only why-comments that explain non-obvious decisions, such as the `// set oauth header` block (which is not explained — why is it conditional on `opts.oauth` if all API calls require OAuth?).

---

### LS-2: Speculative Generality — `getUrl`, `putUrl`, `postUrl`, `deleteUrl` via `_urlRequest` Abstraction

**Category:** Dispensables / Speculative Generality
**File:** `lib/api.js` (lines 381–406)
**Violated Principles:** YAGNI

**Description:**
A private `_urlRequest(data, method)` function is introduced purely to share the implementation of four methods (`getUrl`, `putUrl`, `postUrl`, `deleteUrl`). Each of those four methods is exactly one line delegating to `_urlRequest`. While this is a reasonable DRY extraction, the four public methods each have only one calling pattern and the private function is not referenced anywhere else. The indirection adds a level of abstraction that slows reading without meaningful benefit.

```javascript
const _urlRequest = function (data, method) { ... };
const getUrl    = function (data) { return _urlRequest.call(this, data, 'GET'); };
const putUrl    = function (data) { return _urlRequest.call(this, data, 'PUT'); };
const postUrl   = function (data) { return _urlRequest.call(this, data, 'POST'); };
const deleteUrl = function (data) { return _urlRequest.call(this, data, 'DELETE'); };
```

This smell is minor; the extraction is a legitimate refactoring. It is flagged primarily because the body of `_urlRequest` is simple enough that the extraction adds more cognitive overhead (finding the private function) than it saves.

**Note:** This is a judgment call. If `_urlRequest` grows, the abstraction is valuable. Currently it is borderline.

---

### LS-3: Deprecated Method with No Removal Timeline — `stream()`

**Category:** Dispensables / Dead Code (in spirit)
**File:** `lib/api.js` (lines 458–460)
**Violated Principles:** YAGNI, Clean API surface

**Description:**
`stream()` is marked `@deprecated` and simply calls `subscribe()`:

```javascript
/**
 * @deprecated Use subscribe() instead. Will be removed in the next major version.
 */
const stream = function (data) {
  return this.subscribe(data);
};
```

The deprecation comment says "Will be removed in the next major version" but does not specify which version that is, and there is no mechanism enforcing this (no warning emitted at call time). In the current major version (3.1.1), there is nothing preventing `stream()` from remaining forever.

**Refactoring Suggestion:**
Either emit a `process.emitWarning` or `console.warn` at call time to actively push callers toward migrating, or add a concrete version target to the JSDoc. Set a calendar-based removal milestone.

---

### LS-4: Required Setup / Teardown — `_reset()` Called Manually After Reads

**Category:** Other / Required Setup or Teardown Code
**File:** `lib/api.js` (lines 192–196, 314–316, 356–362)
**Violated Principles:** Principle of Least Surprise

**Description:**
After a record is returned from `getRecord()`, `_queryHandler()`, and `search()`, `_reset()` must be explicitly called on each new Record to mark it as unmodified. This is a required teardown ceremony that callers cannot forget to do on their own — instead, `api.js` does it internally, but it is fragile: if a developer adds a new API method that returns Records and forgets to call `_reset()`, the Record will falsely report all fields as changed.

```javascript
// lib/api.js:192-196 (getRecord)
return this._apiRequest(opts).then((resp) => {
  if (!opts.raw) {
    resp = new Record(resp);
    resp._reset();   // required ceremony
  }
  return resp;
});

// lib/api.js:314-316 (_queryHandler)
let rec = new Record(r);
rec._reset();        // required ceremony
recs.push(rec);
```

**Refactoring Suggestion:**
Add a static factory method `Record.fromResponse(data)` that constructs the Record and calls `_reset()` internally, making the ceremony impossible to forget:

```javascript
Record.fromResponse = function(data) {
  const rec = new Record(data);
  rec._reset();
  return rec;
};
```

---

## Cross-File Pattern Analysis

### Integration Test Incompleteness

**File:** `test/integration.js`
**Issue:** Dead setup code / TODO

The integration test contains a `TODO: fix the creds` comment at line 18 inside a `before()` block that also contains a dead code path (`if (creds == null) { // Can't run integration tests }` with the body commented out). There is also a commented-out object literal (lines 57–66) that was clearly a prior attempt at credentials setup and was never removed.

```javascript
// test/integration.js:18
// TODO: fix the creds
client = nforce.createConnection(creds);
// ...
/*
  let x = {
      clientId: "ADFJSD234ADF765SFG55FD54S",
      // ...
  }
*/
```

### Test Coupling to Internals (Amplification of HS-2)

**File:** `test/record.js` (lines 217–218, 244–245, 332–348)

Tests directly assign `acc._changed = new Set()` and `acc._previous = {}` to reset state, bypassing the public `_reset()` method. This means that if `_changed` is changed from a `Set` to a different data structure, or if `_previous` is renamed, all of these test lines must be updated independently. The tests are testing implementation rather than behavior.

### Mock Server Uses Module-Level Mutable State

**File:** `test/mock/sfdc-rest-api.js`

`serverStack` and `requestStack` are module-level mutable arrays (Global Data smell within the test utility):

```javascript
let serverStack = [];
let requestStack = [];
```

Also, `port` is a module-level variable that is mutated by `start()`. This means test files cannot safely run in parallel because they share this mutable module state. The pattern is common in older Node.js test setups but is worth noting.

### Hardcoded Test Credential Repeated in `test/connection.js`

The fake client ID string `'ADFJSD234ADF765SFG55FD54S'` appears 58 times in `test/connection.js`. Extracting this to a module-level constant would make the file easier to read and update.

---

## SOLID Principle Compliance

| Principle | Score (0-10) | Notes |
|-----------|-------------|-------|
| S — Single Responsibility | 7 | After refactoring: `api.js` handles all API methods (one responsibility: Salesforce API). `auth.js` mixes getter/setter convenience methods with OAuth logic. |
| O — Open/Closed | 6 | Plugin system is excellent OCP. But `authenticate()` uses if/else-if chains for grant types; a new grant type requires modifying this method. |
| L — Liskov Substitution | 9 | No inheritance hierarchy issues. |
| I — Interface Segregation | 8 | Modules export only what is needed. `util.js` is cohesive. Plugin system is clean. |
| D — Dependency Inversion | 6 | `lib/api.js` directly requires `Record`, `multipart`, `FDCStream`, `util`, `errors`, and `constants` with no abstractions. All dependencies are concrete. Testable only via mock server. |

---

## GRASP Principle Analysis

| Principle | Compliance | Notes |
|-----------|-----------|-------|
| Information Expert | Partial | `api.js` functions reach into `opts.sobject._getFullPayload()` rather than asking the sobject to serialize itself for a given operation. |
| Creator | Good | `api.js` creates `Record` instances after API calls, which is appropriate. |
| Controller | Good | `index.js` / Connection is a clean system facade. |
| Low Coupling | Moderate | The `opts` bag creates implicit coupling between all api functions and the downstream http layer. |
| High Cohesion | Good | After refactoring, most modules have clear single-domain focus. |
| Polymorphism | Moderate | `getBody()` uses a lookup map (`BODY_GETTER_MAP`) which is a good approach, but `authenticate()` still uses if/else-if chains for grant types. |
| Protected Variations | Moderate | Plugin system protects against extension coupling well. OAuth endpoint selection is not protected — four separate ternary expressions exist. |

---

## Detailed Findings by File

### `lib/api.js` — 493 lines — 7 issues

- **HS-1 (Primitive Obsession / Mutable Data):** Opts bag mutated throughout (all functions)
- **HS-3 (Duplicated Code):** `opts.sobject ? opts.sobject.X : opts.X` pattern repeated 5 times (lines 38, 46, 176–177, 212–213, 223, 232, 241)
- **MS-6 (Magic Path Strings):** `/sobjects/` prefix repeated 8 times in string concatenation
- **MS-7 (Inconsistent Style):** 21 `let opts` vs. 5 `const opts`
- **LS-3 (Deprecated Method):** `stream()` (lines 458–460) with no active deprecation signal
- **LS-4 (Required Setup):** `_reset()` ceremony after every Record creation (lines 192–196, 314–316, 356–362)
- **MS-6 note:** `this.loginUri.replace('/oauth2/token', '')` in `getVersions()` (line 75)

### `lib/auth.js` — 263 lines — 5 issues

- **MS-1 (Duplicated Code):** Environment selection ternary in `authenticate()`, `refreshToken()`, `revokeToken()`, `getAuthUri()` (lines 86–89, 113, 167, 219–221)
- **MS-2 (Magic String):** SAML URN duplicated (lines 130, 182)
- **MS-3 (Flag Argument):** `executeOnRefresh` flag (lines 96, 109, 163, 233, 239)
- **MS-4 (Side Effects):** `Object.assign(opts.oauth, res)` mutates caller's OAuth object (lines 152, 207)
- **MS-5 (Lazy Element):** 8 trivial getter/setter functions (lines 3–33)

### `lib/http.js` — 189 lines — 2 issues

- **HS-1 (Temporary Fields):** `opts._retryCount` and `opts._refreshResult` injected into opts bag (lines 174–178)
- **HS-2 (Indecent Exposure):** `sobject._reset` duck-typed check at lines 82–83

### `lib/record.js` — 177 lines — 2 issues

- **HS-2 (Indecent Exposure):** Underscore-prefixed internals (`_fields`, `_changed`, `_previous`, `_getFullPayload`, `_getChangedPayload`, `_reset`) are not protected from external access and are actively used from `lib/api.js` and `lib/http.js`
- **LS-4 (Required Setup):** `_reset()` must be called after construction for "clean" records; no factory method guards this

### `lib/fdcstream.js` — 99 lines — 1 issue

- **MS-6 note:** `opts.apiVersion.substring(1)` at line 47 to strip the `v` prefix from the version string. This is a fragile string operation that assumes the format `"v63.0"`. A helper function or a numeric version constant would be more robust.

### `lib/optionhelper.js` — 106 lines — 1 issue

- **LS-1 (What Comments):** Multiple comments describe the obvious (lines 33, 47, 50–51, 55–56, 60–61, 75, 80)

### `test/integration.js` — 68 lines — 2 issues

- **Dead Code:** Commented-out credentials object (lines 57–66)
- **TODO unresolved:** `// TODO: fix the creds` (line 18) — dead code in `if (creds == null)` branch

### `test/record.js` — 361 lines — 1 issue

- **HS-2 (Indecent Exposure amplified):** Direct mutation of `_changed`, `_previous`, `_fields` in test setup (lines 41, 48–55, 109–110, 117, 160, 217–218, 244–245, 332–348)

### `test/connection.js` — 451 lines — 1 issue

- **Duplicated Test Data:** The string `'ADFJSD234ADF765SFG55FD54S'` appears 58 times as a hardcoded fake client ID. A shared constant at the top of the file would improve readability.

---

## Impact Assessment

**Total Issues Found:** 14 distinct smells (plus amplifications in tests)
- High Severity: 3 (architectural / encapsulation impact)
- Medium Severity: 7 (design / maintainability impact)
- Low Severity: 4 (readability / minor maintenance)

**Breakdown by Category:**
- Bloaters: 1 (HS-1 / Primitive Obsession)
- Dispensables: 4 (HS-3, MS-5, LS-2, LS-3)
- Data Dealers: 2 (HS-1 Mutable Data, MS-4 Side Effects)
- Change Preventers: 2 (MS-1 Duplicated Code, HS-3 Duplicated Code)
- Object-Oriented Abusers: 1 (HS-2 Indecent Exposure)
- Lexical Abusers: 2 (MS-2 Magic String, MS-6 Magic Paths, MS-7 Inconsistent Style)
- Functional Abusers: 1 (MS-3 Flag Argument)
- Other: 1 (LS-1 What Comment, LS-4 Required Setup)

**SOLID Violations:** 4 (SRP partial in auth.js, OCP in authenticate grant types, DIP throughout api.js, ISP minor)
**GRASP Violations:** 3 (Information Expert partial, Low Coupling via opts bag, Protected Variations for env endpoints)

---

## Recommendations and Refactoring Roadmap

### Phase 1 — Quick Wins (Low Risk, High Clarity)

1. **Extract `SAML_ASSERTION_TYPE` constant** in `auth.js` or `constants.js` (30 minutes, zero risk, resolves MS-2)
2. **Replace `let opts` with `const opts`** in all non-reassigning declarations in `api.js` and `auth.js` (15 minutes, zero risk, resolves MS-7)
3. **Remove what-comments** in `optionhelper.js` (10 minutes, resolves LS-1)
4. **Add `process.emitWarning` to `stream()`** at call time (5 minutes, resolves LS-3)
5. **Extract `resolveId(opts)` and `resolveType(opts)` helpers** in `api.js` (30 minutes, resolves HS-3)
6. **Introduce `Record.fromResponse(data)` static factory** for post-fetch Record creation (20 minutes, resolves LS-4)
7. **Clean up `test/integration.js`** dead code and TODO (10 minutes)
8. **Extract `FAKE_CLIENT_ID` constant** in `test/connection.js` (5 minutes)

### Phase 2 — Design Improvements (Medium Risk)

9. **Introduce endpoint-selection helpers on Connection** (`_loginEndpoint()`, `_authEndpoint()`, `_revokeEndpoint()`) to deduplicate the environment ternary in `auth.js` (1 hour, resolves MS-1)
10. **Replace `executeOnRefresh` flag with explicit intent** — rename or split `_resolveWithRefresh` (2 hours, resolves MS-3)
11. **Return new OAuth object from `authenticate()`/`refreshToken()`** instead of mutating the passed-in object (1 hour, resolves MS-4; coordinate with callers)
12. **Add path-building helpers** to reduce `/sobjects/` string repetition in `api.js` (1 hour, resolves MS-6)

### Phase 3 — Architectural Improvements (Higher Risk, Higher Value)

13. **Add public serialization methods to Record** (`toFullPayload()`, `toChangedPayload()`, public `reset()`) that replace the underscore-prefixed methods accessed from `api.js` and `http.js` (2 hours, resolves HS-2 partially)
14. **Introduce typed request building** to replace the mutable opts bag pattern — either a builder class or a factory function that returns an immutable request spec (4–8 hours, resolves HS-1)
15. **Evaluate and remove trivial getters/setters** in `auth.js` (1 hour, resolves MS-5)

---

## Appendix: Detection Methodology

**Tools Used:** File system traversal (ls, glob), line counting (wc -l), grep pattern matching, manual code reading of all 22 source files

**Files Analyzed:**
- `index.js`, `lib/api.js`, `lib/auth.js`, `lib/http.js`, `lib/connection.js`, `lib/record.js`, `lib/fdcstream.js`, `lib/optionhelper.js`, `lib/multipart.js`, `lib/util.js`, `lib/constants.js`, `lib/errors.js`, `lib/plugin.js`
- `test/connection.js`, `test/crud.js`, `test/record.js`, `test/query.js`, `test/errors.js`, `test/integration.js`, `test/plugin.js`, `test/util.js`, `test/mock/sfdc-rest-api.js`
- `package.json`

**Files Excluded from Primary Analysis:** `examples/` (snippet-style scripts, not production code), `node_modules/`

**Reference Catalog:** Marcel Jerzyk (2022) "Code Smells: A Comprehensive Online Catalog and Taxonomy"; Martin Fowler (1999/2018) "Refactoring"; Robert C. Martin (2008) "Clean Code"

---

*Executive summary available in `code-smell-detector-summary.md`*
*Machine-readable data available in `code-smell-detector-data.json`*
