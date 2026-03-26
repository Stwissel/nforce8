# Code Smell Detection Report: nforce8

## Executive Summary

**nforce8** is a Node.js REST API wrapper for Salesforce (~1,100 lines of production code, 13 source files). The codebase recently underwent a significant architectural refactoring that split a monolithic `index.js` (~1,089 lines) into domain-focused modules (`lib/auth.js`, `lib/api.js`, `lib/http.js`). That refactoring eliminated the largest prior issues. What remains is a well-structured, focused library with a small number of specific, addressable issues.

- **Total issues found**: 28
- **High Severity**: 4
- **Medium Severity**: 12
- **Low Severity**: 12
- **Overall Grade**: B

---

## Project Analysis

### Languages and Frameworks
- **Primary language**: JavaScript (ES2022, CommonJS modules, `'use strict'`)
- **Runtime**: Node.js >= 22.0
- **Testing**: Mocha + should.js + NYC (coverage)
- **Linting**: ESLint 10 (flat config)
- **Key dependencies**: `faye` (Streaming API), `mime-types` (multipart uploads)

### Project Structure
```
index.js              (77 lines)   - Composition root / public API
lib/api.js            (509 lines)  - CRUD, query, search, streaming
lib/auth.js           (265 lines)  - OAuth authentication flows
lib/http.js           (195 lines)  - HTTP fetch infrastructure
lib/record.js         (181 lines)  - SObject record with change tracking
lib/connection.js     (105 lines)  - ES6 Connection class + option validation
lib/optionhelper.js   (140 lines)  - Request option builder
lib/fdcstream.js      (101 lines)  - Faye streaming client
lib/plugin.js         (52 lines)   - Plugin extension system
lib/util.js           (65 lines)   - Type-checking utilities
lib/errors.js         (13 lines)   - Error factories
lib/constants.js      (46 lines)   - Constants + defaults
test/                               - Mocha test suite (mock-based)
```

### Baseline Quality Observations
The post-refactoring codebase is substantially cleaner than the original 1,089-line monolith. The module split follows clear domain boundaries. Most standard anti-patterns (global state, deeply nested callbacks, magic numbers in business logic) have been eliminated or are minimal. The remaining issues are concentrated in four areas: quote-style inconsistency (an active lint failure), two dead classes/artifacts of the refactoring, structural design trade-offs in the mixin-based Connection pattern, and a handful of specific method-level concerns.

---

## High Severity Issues (Architectural Impact)

### H1 — Inconsistent Style / Active Lint Failure (182 errors)
**Category**: Lexical Abusers — Inconsistent Style
**Files affected**: `index.js`, `lib/api.js`, `lib/auth.js`, `lib/http.js`, `lib/multipart.js`, `lib/plugin.js`
**SOLID violation**: None directly, but CI will fail on lint.

**Description**: Running `npm run lint` produces **182 ESLint errors**, all of the form `Strings must use singlequote`. The project's ESLint configuration (`eslint.config.js`) mandates single-quoted strings, but the six files listed above were written using double quotes throughout. The files that were *not* part of the recent refactoring (`lib/record.js`, `lib/connection.js`, `lib/constants.js`, `lib/util.js`, `lib/fdcstream.js`, `lib/errors.js`) all use single quotes correctly.

**Impact**: This is a CI-blocking issue. No pull request or automated pipeline that runs `npm run lint` will pass. It also makes the codebase stylistically incoherent: two incompatible quoting styles are used in the same project.

**Evidence** (sample):
```
/Users/stw/Code/nforce8/index.js
   1:1   error  Strings must use singlequote  quotes
/Users/stw/Code/nforce8/lib/api.js
   1:1   error  Strings must use singlequote  quotes
... (182 total across 6 files)
```

**Refactoring**: Run `npx eslint . --fix` to auto-correct all 182 violations in one pass. Enforce via pre-commit hook so it cannot reoccur.

---

### H2 — Dead Class (Lazy Element / Dispensable)
**Category**: Dispensables — Lazy Element
**File**: `lib/connection.js` (lines 7–19)
**SOLID violation**: SRP — the file exports two things with different purposes: a class that is never used and a validation function that is used.

**Description**: `lib/connection.js` exports both a `Connection` class (an ES6 class) and the standalone function `validateConnectionOptions`. In `index.js`, **only** `validateConnectionOptions` is imported:

```javascript
// index.js line 6
const { validateConnectionOptions } = require("./lib/connection");
```

The `Connection` class itself is never imported or used anywhere in the codebase. The Connection used at runtime is the constructor function defined inside `index.js` itself (lines 16–47). The `Connection` class in `lib/connection.js` is an unused artifact — likely a remnant of an intended but incomplete migration to ES6 classes during the refactoring.

Furthermore, the `Connection` class in `lib/connection.js` duplicates initialization logic that already exists in `index.js`: both apply `defaultOptions`, call `validateConnectionOptions`, and normalize `environment`/`mode`. This is a subtle form of **Duplicated Code** and **Speculative Generality** (the class exists "for future use" but serves no current purpose).

**Impact**: Confusion for maintainers reading the file; risk that someone modifies `lib/connection.js`'s `Connection` class believing it is the real one; maintenance burden of keeping both in sync.

**Refactoring**: Either (a) complete the migration — replace the constructor function in `index.js` with the ES6 class from `lib/connection.js` and add the mixin assignment there — or (b) remove the unused `Connection` class from `lib/connection.js` and rename the file to `lib/validation.js` to match its actual single export.

---

### H3 — Global Mutable Module-Level State (Global Data)
**Category**: Data Dealers — Global Data
**File**: `lib/plugin.js` (line 5)
**SOLID violation**: DIP — callers cannot inject a plugin registry; they depend on a module-level singleton.

**Description**:
```javascript
const plugins = Object.create(null);
```
This object is a module-level singleton that accumulates all registered plugins for the lifetime of the process. Because Node.js caches `require()` results, this means:

1. Any test that registers a plugin affects all subsequent tests (the test suite in `test/plugin.js` relies on this implicitly).
2. There is no way to reset or isolate the plugin registry between test runs without re-requiring the module.
3. In multi-tenant or serverless environments where the module cache persists across requests, plugins leak between tenants.

The `plugin()` function throws if a duplicate namespace is registered without `override: true`, which partially mitigates production impact, but the underlying design remains a global singleton.

**Impact**: Testing fragility (tests register plugins that persist); limited reusability; hidden coupling between calling code and module-level state.

**Refactoring**: Encapsulate the plugin registry inside a `PluginRegistry` class or accept a registry instance as a constructor parameter to `createConnection`. This is a larger change but would align with the DIP.

---

### H4 — Primitive Obsession: Untyped OAuth Object
**Category**: Data Dealers — Primitive Obsession
**Files**: `lib/auth.js`, `lib/api.js`, `lib/http.js`, `lib/fdcstream.js`, `lib/optionhelper.js`

**Description**: The OAuth token object (`{ access_token, instance_url, refresh_token, id, ... }`) is a plain, unvalidated JavaScript object that flows through every method in the codebase. There is no `OAuth` class, no type guard, and no schema. The only validation point is `util.validateOAuth()` which checks for two fields:

```javascript
const validateOAuth = (oauth) => {
  return oauth && oauth.instance_url && oauth.access_token;
};
```

But `validateOAuth` is not called before most API operations — it is only available as a utility. In practice:

- `lib/http.js` accesses `opts.oauth?.refresh_token` (line 178) with optional chaining, implying it may be absent.
- `lib/fdcstream.js` accesses `opts.oauth.instance_url` (line 49) without any null check — a crash if `oauth` is undefined.
- `lib/optionhelper.js` accesses `opts.oauth.instance_url` (line 72) without null check.
- `lib/api.js` builds URIs from `opts.oauth.instance_url` in six places without guards.
- `lib/auth.js` mutates the oauth object directly via `Object.assign(opts.oauth, res)` (lines 151–152, 205–206).

The absence of an `OAuth` value type means that any misspelling, missing field, or partial token object fails at runtime with an obscure `TypeError: Cannot read property 'instance_url' of undefined` rather than a clear domain error.

**Impact**: Fragile runtime behavior; hard-to-debug errors; inability to refactor oauth handling safely; violates Fail Fast principle.

**Refactoring**: Create an `OAuth` class or at minimum a factory function `createOAuth(data)` that validates required fields on construction. Replace scattered access patterns with method calls. Use `validateOAuth()` consistently before API calls, or enforce it in `_getOpts()`.

---

## Medium Severity Issues (Design Problems)

### M1 — Constructor Function vs. ES6 Class Inconsistency
**Category**: Object-Oriented Abusers — Inconsistent Style
**File**: `index.js` (lines 16–47), `lib/connection.js`

**Description**: `index.js` defines `Connection` as a traditional constructor function:
```javascript
const Connection = function (opts) { ... };
Object.assign(Connection.prototype, httpMethods, authMethods, apiMethods);
```
Meanwhile `lib/connection.js` defines `Connection` as an ES6 class:
```javascript
class Connection {
  oauth; username; password; securityToken;
  constructor(opts) { ... }
}
```

These two definitions coexist in the codebase without any relationship to each other. The constructor function style is what actually runs. The codebase convention is mixed: `Record`, `Plugin`, `Subscription`, and `Client` are all ES6 classes, but the primary `Connection` type is a constructor function. This violates the principle of consistent idioms and creates cognitive dissonance.

**Refactoring**: Consolidate to ES6 class syntax for `Connection` in `index.js` (or in `lib/connection.js`) to match the style of all other classes.

---

### M2 — Mixin-Based Prototype Pollution (Indecent Exposure)
**Category**: Object-Oriented Abusers — Inappropriate Static / Indecent Exposure
**File**: `index.js` (line 50)

**Description**:
```javascript
Object.assign(Connection.prototype, httpMethods, authMethods, apiMethods);
```
All methods from three modules are mixed directly onto `Connection.prototype`. This creates several issues:

1. **Name collision risk**: If two modules export a function with the same name, the last one silently wins. There is no conflict detection.
2. **Indecent Exposure**: Internal implementation methods (`_apiRequest`, `_apiAuthRequest`, `_getOpts`, `_queryHandler`, `_resolveWithRefresh`) become publicly accessible members on every `Connection` instance, even though they are intended as private.
3. **Naming convention as access control**: The underscore prefix convention is used to signal "private" but does not enforce it. Test files directly call `org._resolveWithRefresh()` and `acc._getPayload()`, which couples tests to internals.

**Impact**: Fragile interface; no encapsulation; any caller can invoke internal methods and disrupt state.

**Refactoring**: Keep the mixin pattern but use ES6 private class fields (`#`) when migrating to a class. At minimum, document which exports are public API vs. internal.

---

### M3 — `OptionHelper` Factory with Unnecessary Constructor
**Category**: Obfuscators — Clever Code; Dispensables — Lazy Element
**File**: `lib/optionhelper.js` (lines 33–140)

**Description**: `OptionHelper` is a constructor function that takes no arguments, has no state (the comment `// Defaults if needed` alludes to a removed feature), and returns an immutable object via `Object.freeze`. It is instantiated immediately at module load:

```javascript
// lib/http.js line 5
const optionHelper = require('./optionhelper')();
```

The constructor serves no purpose — there is nothing to initialize, no instance state, no defaults. The two functions `getApiRequestOptions` and `getFullUri` are pure functions. They should simply be exported as module-level functions:

```javascript
module.exports = { getApiRequestOptions, getFullUri };
```

The current pattern requires callers to know to invoke `require('./optionhelper')()` (with the trailing `()` call), which is surprising and undocumented.

**Refactoring**: Remove the `OptionHelper` constructor. Export the two functions directly from the module. Update `lib/http.js` accordingly.

---

### M4 — `revokeToken` Contains Hardcoded URLs (Magic Number)
**Category**: Lexical Abusers — Magic Number; Data Dealers — Global Data
**File**: `lib/auth.js` (lines 219–222)

**Description**: The `revokeToken` function hardcodes the Salesforce OAuth revoke endpoint URLs directly in the function body, bypassing the constants module entirely:

```javascript
if (this.environment === 'sandbox') {
  opts.uri = 'https://test.salesforce.com/services/oauth2/revoke';
} else {
  opts.uri = 'https://login.salesforce.com/services/oauth2/revoke';
}
```

All other auth methods use `this.testLoginUri` or `this.loginUri` (which are configurable connection options). The revoke endpoint is structurally parallel to the token endpoint (same subdomain structure), yet it hardcodes the domain rather than deriving it from `this.loginUri`. This creates a discrepancy: if a user customizes `loginUri` for a private Salesforce instance (common in enterprise deployments), `revokeToken` will still call the wrong endpoint.

**Refactoring**: Add `revokeUri` and `testRevokeUri` to the `defaultOptions` in `lib/constants.js` and use `this.revokeUri`/`this.testRevokeUri` in `revokeToken()`, consistent with how the other auth methods work.

---

### M5 — Duplicated URL Construction Pattern (Duplicated Code)
**Category**: Dispensables — Duplicated Code
**File**: `lib/api.js` (lines 386–425)

**Description**: The same pattern for building a URL from `opts.oauth.instance_url + requireForwardSlash(opts.url)` appears four consecutive times across `getUrl`, `putUrl`, `postUrl`, and `deleteUrl`:

```javascript
// getUrl (line 390)
opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
opts.method = 'GET';

// putUrl (lines 399-403)
opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
opts.method = 'PUT';
if (opts.body && typeof opts.body !== 'string') {
  opts.body = JSON.stringify(opts.body);
}
// postUrl and deleteUrl follow the same pattern
```

Additionally, the body JSON serialization check `if (opts.body && typeof opts.body !== 'string') { opts.body = JSON.stringify(opts.body); }` is duplicated in both `putUrl` and `postUrl`.

**Refactoring**: Extract a private `_buildUrlOpts(data, method)` helper that sets the common fields, then handle body serialization once. Or consolidate into a single `_urlRequest(data, method)` method that all four delegate to.

---

### M6 — `_queryHandler` Exposed as Public API (Indecent Exposure)
**Category**: Object-Oriented Abusers — Indecent Exposure
**File**: `lib/api.js` (line 499)

**Description**: `_queryHandler` (conventionally prefixed with `_` to indicate private) is included in `module.exports` and therefore becomes a method on every `Connection` instance via the prototype mixin. The method is an implementation detail of `query()` and `queryAll()` — callers have no legitimate reason to call it directly. Tests do not call it directly either.

Exposing it creates a public API surface that the library must maintain as stable, limits future refactoring freedom, and violates the principle of minimal public interface.

**Refactoring**: Remove `_queryHandler` from the `module.exports` object. Callers within `api.js` can continue to call it as a local function since it is defined in the same module scope. Add `respToJson` (line 326) to the same cleanup.

---

### M7 — `stream` Is a Transparent Alias (Middle Man)
**Category**: Dispensables — Lazy Element; Couplers — Middle Man
**File**: `lib/api.js` (lines 473–475)

**Description**:
```javascript
const stream = function (data) {
  return this.subscribe(data);
};
```
`stream` is a single-line function that does nothing but call `subscribe`. It adds no logic, no parameter transformation, no error handling. This inflates the public API surface without adding value and could confuse users who wonder whether `stream` and `subscribe` are semantically different.

**Refactoring**: Either remove `stream` entirely (breaking change) and document the migration to `subscribe`, or add a JSDoc `@deprecated` tag with a migration note.

---

### M8 — `isObject` Has a Null Bug (Side Effects)
**Category**: Functional Abusers — Side Effects; Object-Oriented Abusers — Primitive Obsession
**File**: `lib/util.js` (line 32), used in `lib/api.js` (lines 13–23)

**Description**:
```javascript
const isObject = (candidate) => typeof candidate === 'object';
```

In JavaScript, `typeof null === 'object'` is `true`. Therefore `isObject(null)` returns `true`. In `_getOpts` (line 15), this means `null` would be treated as an object:

```javascript
} else if (util.isObject(d)) {
  data = d;   // data becomes null
}
```

The check at line 13 (`d && !util.isObject(d)`) uses `d` as a truthiness guard, so `null` would not reach this branch. But the semantic is fragile: `isObject` advertises one behavior and delivers another for `null`. This is a well-known JavaScript footgun. The current version has not caused a reported bug because callers pass `undefined` rather than `null`, but it is a latent defect.

**Refactoring**: Fix `isObject` to exclude `null`:
```javascript
const isObject = (candidate) => candidate !== null && typeof candidate === 'object';
```
Add a unit test for `isObject(null)`.

---

### M9 — `let self = this` Anti-Pattern
**Category**: Object-Oriented Abusers — Inappropriate Static
**File**: `lib/fdcstream.js` (lines 9, 45)

**Description**:
```javascript
constructor(opts, client) {
  super();
  let self = this;   // line 9
  ...
  this._sub = client._fayeClient.subscribe(this._topic, function (d) {
    self.emit('data', d);   // uses self instead of this
  });
```

The `let self = this` pattern was needed pre-ES6 to capture `this` in regular function expressions. Since the codebase uses ES6 classes and targets Node.js >= 22, arrow functions (`(d) => this.emit('data', d)`) are the idiomatic replacement. The `self` variable adds unnecessary indirection.

Both `Subscription` (line 9) and `Client` (line 45) contain this pattern.

**Refactoring**: Replace all `function(...) { self.emit(...) }` callbacks in `fdcstream.js` with arrow functions. Remove the `let self = this` declarations.

---

### M10 — `arguments.length` Dispatch in `Record.set`
**Category**: Obfuscators — Conditional Complexity
**File**: `lib/record.js` (lines 29–53)

**Description**: The `set` method uses `arguments.length` to dispatch between two calling conventions:

```javascript
Record.prototype.set = function (field, value) {
  let data = {};
  if (arguments.length === 2) {
    data[field.toLowerCase()] = value;
  } else {
    data = Object.entries(field).reduce(...);
  }
```

Using `arguments.length` is an older JavaScript pattern. A cleaner approach detects whether `field` is a string or an object, which is more expressive and does not rely on the implicit `arguments` object (which should be avoided in modern ES6 code). This is an **Oddball Solution** — the rest of the codebase uses modern JavaScript but relies on `arguments` here.

**Refactoring**:
```javascript
const data = (typeof field === 'object' && field !== null)
  ? Object.fromEntries(Object.entries(field).map(([k, v]) => [k.toLowerCase(), v]))
  : { [field.toLowerCase()]: value };
```

---

### M11 — Duplicated Header Access Pattern in `responseFailureCheck`
**Category**: Dispensables — Duplicated Code
**File**: `lib/http.js` (lines 19–31)

**Description**: The response header access pattern — which handles both Fetch API `Headers` objects (with `.get()`) and plain objects — is implemented inline twice within the same function `responseFailureCheck`:

```javascript
// First copy (lines 19-22): accessing 'error' header
const headerError =
  res.headers && typeof res.headers.get === 'function'
    ? res.headers.get('error')
    : res.headers && res.headers.error;

// Second copy (lines 27-30): accessing 'content-length' header
const contentLength =
  res.headers && typeof res.headers.get === 'function'
    ? res.headers.get('content-length')
    : res.headers && res.headers['content-length'];
```

The `checkHeaderCaseInsensitive` utility already exists in `lib/util.js` and handles exactly this dual-access pattern. However, it is not used in `responseFailureCheck` — only in `isJsonResponse`. A `getHeader(headers, key)` utility would DRY up this function.

**Refactoring**: Add a `getHeader(headers, key)` helper to `lib/util.js` (or extract from `checkHeaderCaseInsensitive`) and use it for both lookups in `responseFailureCheck`.

---

### M12 — `respToJson` Defined After Its Usage Site
**Category**: Obfuscators — Obscured Intent
**File**: `lib/api.js` (lines 297 and 326)

**Description**: `respToJson` is called at line 297 inside `handleResponse`, which is a closure within `_queryHandler`. It is defined at line 326 — after the call site. `const` declarations are not hoisted in the way `function` declarations are; they are in the temporal dead zone until their declaration line executes. The call at line 297 is inside a callback that resolves after module initialization, so there is no runtime error — but the code ordering is misleading and relies on a subtle timing dependency that a reader must reason through.

**Refactoring**: Move `respToJson` above `_queryHandler` to follow the convention of defining before use.

---

## Low Severity Issues (Readability / Maintenance)

### L1 — `"use strict"` with Double Quotes in Strict-Quote Files
**Category**: Lexical Abusers — Inconsistent Style
**Files**: `index.js`, `lib/api.js`, `lib/auth.js`, `lib/http.js`, `lib/multipart.js`, `lib/plugin.js`

**Description**: These files use `"use strict"` (double quotes) while the project convention is `'use strict'` (single quotes). This is a trivial variant of H1. Fixed by the same `eslint --fix` pass.

---

### L2 — `getUrl` Method Name Semantically Overloaded (Fallacious Method Name)
**Category**: Lexical Abusers — Fallacious Method Name
**File**: `lib/api.js` (lines 386–392), `lib/record.js` (line 68)

**Description**: `Record.prototype.getUrl` returns the SObject's URL from `this.attributes.url` (a string attribute). The `Connection` mixin also has a `getUrl` method (from `lib/api.js`) that makes an HTTP GET request to an arbitrary URL. Both are in the `Connection` ecosystem — `Record` is the data type, `Connection` is the operation host — but the naming is semantically overloaded when both are discussed in documentation or examples.

**Refactoring**: Consider renaming `Record.prototype.getUrl` to `Record.prototype.getSobjectUrl` to distinguish it from the HTTP-fetching `Connection.getUrl`.

---

### L3 — No-Op `beforeEach` in Test (Dead Code)
**Category**: Dispensables — Dead Code
**File**: `test/record.js` (lines 16–18)

**Description**:
```javascript
beforeEach(function (done) {
  done();
});
```
This `beforeEach` hook does nothing and has always done nothing. It is dead code that adds noise to the test file.

**Refactoring**: Remove the empty `beforeEach`.

---

### L4 — Empty Test Bodies (Dead Code / Speculative Generality)
**Category**: Dispensables — Dead Code; Dispensables — Speculative Generality
**Files**: `test/record.js` (line 62), `test/plugin.js` (line 35)

**Description**:
```javascript
// test/record.js line 62
it('should allow me to set properties', function () {});

// test/plugin.js line 35
it('should not allow non-functions when calling fn', function () {});
```
Two test cases have been declared as placeholders but never implemented. They pass vacuously (a test with no assertions always passes), which can mask the absence of actual coverage.

**Refactoring**: Either implement the tests or replace with `it.skip(...)` to make the omission explicit.

---

### L5 — `client.logout()` Calls Non-Existent Method (Fallacious Method Name)
**Category**: Lexical Abusers — Fallacious Method Name; Dispensables — Dead Code
**File**: `test/integration.js` (line 25)

**Description**:
```javascript
after(() => {
  if (client != undefined) {
    client.logout();   // No such method exists on Connection
  }
});
```
There is no `logout` method in `lib/api.js`, `lib/auth.js`, or anywhere in the Connection prototype chain. This code would throw `TypeError: client.logout is not a function` if the integration test ever ran with valid credentials. The integration test is currently always skipped for lack of credentials, but this is a latent bug.

**Refactoring**: Replace with `client.revokeToken(...)` (the actual method for token revocation) or remove the teardown.

---

### L6 — Stale `'v54.0'` Fallback and Mismatched Default Versions (Magic Number)
**Category**: Lexical Abusers — Magic Number
**File**: `lib/constants.js` (line 14)

**Description**:
```javascript
const API = process.env.SFDC_API_VERSION || API_PACKAGE_VERSION || 'v54.0';
```
The hardcoded fallback `'v54.0'` is the third option in a three-way default chain. `API_PACKAGE_VERSION` reads from `package.json` where it is currently `'v45.0'`. The `v54.0` literal is newer than `v45.0` — which is inconsistent. Both are also stale relative to current Salesforce API versions (Spring '25 = v63.0). The comment `// This needs update for each SFDC release!` indicates intended manual maintenance that is not occurring.

**Refactoring**: Remove the `'v54.0'` hardcoded final fallback; let `API_PACKAGE_VERSION` be the single source of truth. Update `package.json`'s `sfdx.api` field to the current Salesforce API version during release preparation.

---

### L7 — Commented-Out Code Block (Dead Code)
**Category**: Dispensables — Dead Code
**File**: `test/integration.js` (lines 56–66)

**Description**:
```javascript
/*
  let x = {
      clientId: "ADFJSD234ADF765SFG55FD54S",
      ...
  }
  */
```
A multi-line comment block containing example configuration has been left in the integration test file. Version control history is the appropriate place for removed code.

**Refactoring**: Remove the commented-out block.

---

### L8 — `getIdentity` Has Redundant Null Guard Chain (Null Check)
**Category**: Bloaters — Null Check; Obfuscators — Conditional Complexity
**File**: `lib/api.js` (lines 54–70)

**Description**: `getIdentity` performs three sequential early rejections that overlap in their validation scope:

```javascript
if (!opts.oauth) {
  return Promise.reject(new Error("getIdentity requires oauth including access_token"));
}
if (!opts.oauth.access_token) {
  return Promise.reject(new Error("getIdentity requires oauth.access_token"));
}
if (!opts.oauth.id) {
  return Promise.reject(new Error("getIdentity requires oauth.id (identity URL)"));
}
```

While the separate error messages add diagnostic value, this pattern is inconsistent with every other API method that performs no pre-validation. Using `util.validateOAuth()` for the first two checks would be consistent.

**Refactoring**: Use `util.validateOAuth(opts.oauth)` for the combined first/second check, then add the `opts.oauth.id` check separately.

---

### L9 — `getLimits` Declares Unused `singleProp: 'type'` (What Comment / Dead Config)
**Category**: Lexical Abusers — What Comment; Dispensables — Dead Code
**File**: `lib/api.js` (lines 116–123)

**Description**:
```javascript
const getLimits = function (data) {
  let opts = this._getOpts(data, {
    singleProp: 'type',   // parses string arg as 'type' — never used
  });
  opts.resource = '/limits';  // ignores opts.type entirely
  opts.method = 'GET';
  return this._apiRequest(opts);
};
```

`getLimits` configures `singleProp: 'type'` in `_getOpts`, implying that if a string is passed, it will be treated as a `type` property. But the method immediately ignores `opts.type` and uses the fixed resource `/limits`. This is a copy-paste artifact from `getMetadata` or `getDescribe`, which both use `opts.type` in their resource paths.

**Refactoring**: Remove `singleProp: 'type'` from `getLimits`. The method takes an options object purely for `oauth` in multi-mode.

---

### L10 — `apiVersion.substring(1)` Magic Offset (Magic Number)
**Category**: Lexical Abusers — Magic Number
**File**: `lib/fdcstream.js` (line 49)

**Description**:
```javascript
this._endpoint = opts.oauth.instance_url + '/cometd/' + opts.apiVersion.substring(1);
```

`substring(1)` strips the leading `'v'` from the version string (e.g., `'v45.0'` becomes `'45.0'`). The literal `1` is a magic number whose meaning is not stated. A reader must know the `apiVersion` format convention to understand why `1` is used.

**Refactoring**:
```javascript
const versionNumber = opts.apiVersion.replace(/^v/, '');
this._endpoint = opts.oauth.instance_url + '/cometd/' + versionNumber;
```

---

### L11 — Malformed Template Literal in Query Test (Bug Risk)
**Category**: Dispensables — Dead Code; Lexical Abusers — Fallacious Comment
**File**: `test/query.js` (line 33)

**Description**:
```javascript
let expected = `/services/data/'${apiVersion}/query?q=SELECT+Id+FROM+Account+LIMIT+1`;
```
This template literal has a stray single-quote character before `${apiVersion}`. The resulting string is `/services/data/'v45.0/query?...` — with a literal `'` embedded. This will never equal the actual request URL `/services/data/v45.0/query?...`. The broken `expected` value means the `url.should.equal(expected)` assertion in the first `query` test will silently never fire (it gets absorbed by `.catch((err) => should.not.exist(err))`), giving false confidence that the URL check passes.

**Refactoring**: Remove the stray `'`:
```javascript
let expected = `/services/data/${apiVersion}/query?q=SELECT+Id+FROM+Account+LIMIT+1`;
```

---

### L12 — Unresolved TODO in Integration Test
**Category**: Dispensables — Dead Code
**File**: `test/integration.js` (line 18)

**Description**:
```javascript
// TODO: fix the creds
```
An unresolved `TODO` comment indicates acknowledged but deferred work. The integration test is currently permanently skipped (no credentials in CI), making this comment misleading. The test scaffold exists but is non-functional.

**Refactoring**: Either implement the integration test properly (with documented environment variable requirements) or remove the entire integration test file and track the need as a GitHub issue.

---

## SOLID Principle Assessment

| Principle | Score (0–10) | Notes |
|-----------|-------------|-------|
| **S — Single Responsibility** | 7 | Modules are generally well-scoped after the refactoring. `lib/connection.js` mixes a dead class with a live utility function. `lib/api.js` is large (509 lines) but cohesive. |
| **O — Open/Closed** | 6 | The plugin system enables extension without modification. However, `revokeToken` hardcodes URLs (fails OCP when endpoints vary). The `BODY_GETTER_MAP` dispatch is well-designed. |
| **L — Liskov Substitution** | 8 | No inheritance hierarchies to violate. `Record` does not subclass anything. |
| **I — Interface Segregation** | 7 | The `Connection` prototype mixin exposes a large surface including private methods. No formal interface contracts. |
| **D — Dependency Inversion** | 5 | Module-level singletons (`plugins`, `optionHelper`) prevent injection. `fdcstream.js` directly imports and instantiates `faye.Client` with no abstraction. |

---

## GRASP Principle Assessment

| Principle | Score (0–10) | Notes |
|-----------|-------------|-------|
| **Information Expert** | 7 | `Record` correctly owns its field/change tracking. `optionhelper` correctly owns URL construction. |
| **Creator** | 8 | `createConnection` and `createSObject` are clean factory functions. |
| **Controller** | 7 | `Connection` acts as a facade controller. No bloated controller issues. |
| **Low Coupling** | 6 | `_getOpts` is called pervasively across all API methods. OAuth object is passed as a plain object everywhere without validation. |
| **High Cohesion** | 7 | Post-refactoring modules are fairly cohesive. The mixin approach distributes responsibility in a mostly principled way. |
| **Polymorphism** | 7 | `BODY_GETTER_MAP` is a clean dispatch table replacing type-switch logic. |
| **Pure Fabrication** | 8 | `util.js`, `optionhelper.js`, `errors.js` are appropriate service modules. |
| **Indirection** | 6 | `optionHelper` and `errors` provide useful indirection. `faye` is not abstracted. |
| **Protected Variations** | 6 | `MULTIPART_TYPES` list allows variation without code change. OAuth and URL patterns are fragile to Salesforce API format changes. |

---

## Detailed Findings by File

| File | Lines | Issues |
|------|-------|--------|
| `index.js` | 77 | H1, H2 (by reference), M1, M2 |
| `lib/api.js` | 509 | H1, M5, M6, M7, M12, L2, L8, L9, L11 |
| `lib/auth.js` | 265 | H1, M4 |
| `lib/http.js` | 195 | H1, M11 |
| `lib/record.js` | 181 | M10, L2, L3, L4 |
| `lib/connection.js` | 105 | H2 |
| `lib/optionhelper.js` | 140 | M3 |
| `lib/fdcstream.js` | 101 | M9, L10 |
| `lib/plugin.js` | 52 | H1, H3 |
| `lib/util.js` | 65 | M8 |
| `lib/errors.js` | 13 | 0 (clean) |
| `lib/constants.js` | 46 | L6 |
| `lib/multipart.js` | 56 | H1 |
| `test/record.js` | 360 | L3, L4 |
| `test/plugin.js` | 103 | L4 |
| `test/integration.js` | 68 | L5, L7, L12 |
| `test/query.js` | 204 | L11 |
| `test/crud.js` | 242 | 0 (clean) |
| `test/connection.js` | 451 | 0 (clean) |
| `test/errors.js` | 68 | 0 (clean) |
| `test/mock/sfdc-rest-api.js` | 131 | 0 (clean) |

---

## Impact Assessment

- **Total Issues Found**: 28
- **Breakdown by Severity**:
  - High Severity Issues: 4 (H1–H4) — Architectural / CI-blocking impact
  - Medium Severity Issues: 12 (M1–M12) — Design / maintainability impact
  - Low Severity Issues: 12 (L1–L12) — Readability / minor correctness
- **Breakdown by Category**:
  - Lexical Abusers (naming, style): 7 issues
  - Dispensables (dead code, duplication): 7 issues
  - Object-Oriented Abusers: 4 issues
  - Data Dealers: 2 issues
  - Obfuscators: 3 issues
  - Functional Abusers: 1 issue
  - Bloaters: 1 issue
  - Couplers: 1 issue
  - SOLID violations contributing: DIP (H3), SRP (H2), OCP (M4), ISP (M2, M6)
- **Risk Factors**: H1 is a CI blocker; H4 is a latent runtime crash risk; L11 is a silent test failure

---

## Recommendations and Refactoring Roadmap

### Phase 1 — Immediate (CI Unblocking, Zero Risk)
1. **Fix H1 (Quote Style)**: Run `npx eslint . --fix` to auto-correct all 182 quote violations in seconds. Add a pre-commit hook (e.g., `husky` + `lint-staged`) to prevent future drift.
2. **Fix L11 (Test Bug)**: Remove the stray `'` from the `expected` URL in `test/query.js` line 33. This likely reveals a test assertion that has been silently inactive.

### Phase 2 — Short-term (Correctness Fixes, Low Risk)
3. **Fix M4 (Hardcoded Revoke URLs)**: Add `revokeUri`/`testRevokeUri` to constants and `defaultOptions`. Correctness fix for enterprise Salesforce deployments with custom domains.
4. **Fix M8 (isObject null bug)**: Add `null` exclusion to `isObject` in `lib/util.js`. Add a test.
5. **Fix M9 (self = this)**: Replace with arrow functions in `fdcstream.js`. Trivial, no behavioral change.
6. **Fix L5 (logout)**: Fix the integration test teardown to not call a non-existent method.
7. **Fix L3, L4, L7, L12**: Remove dead test code (no-op `beforeEach`, empty test bodies, commented-out block, TODO comment).

### Phase 3 — Medium-term (Design Improvements, Moderate Effort)
8. **Fix H2 (Dead Connection Class)**: Decide on the architectural direction and consolidate. Complete the ES6 class migration or remove the dead class.
9. **Fix M3 (OptionHelper Constructor)**: Remove the unnecessary factory wrapper. Simplifies the module and removes the surprising invocation pattern.
10. **Fix M5 (URL duplication)**: Extract the shared URL construction/body serialization pattern in `api.js`.
11. **Fix M6 + M7 (Exposed internals)**: Remove `_queryHandler` from exports; remove or deprecate `stream`.
12. **Fix L6 (Stale API versions)**: Update `package.json` `sfdx.api` to current Salesforce version; remove `'v54.0'` fallback.

### Phase 4 — Long-term (Architecture)
13. **Fix H4 (OAuth Primitive Obsession)**: Create an `OAuth` value class or enforce `validateOAuth()` at the start of every API method via `_getOpts`.
14. **Fix H3 (Plugin singleton)**: Refactor plugin registry to be injectable or per-connection.
15. **Fix M1 + M2 (Connection ES6 class)**: Migrate `Connection` to a proper ES6 class with `#private` fields.

---

## Prevention Strategies

1. **Add `lint` as a pre-commit hook** using `husky` or similar to prevent future quote-style drift. The current CI workflow runs tests on push but apparently does not gate on lint separately.
2. **Enforce `no-unused-vars` strictly for `lib/`**: The lint config disables `no-unused-vars` only for `examples/`; enable it strictly for `lib/` to catch future dead exports like the `Connection` class.
3. **Adopt `it.todo()` convention**: Replace empty placeholder test bodies with `it.todo(description)` (supported natively by Mocha) to make gaps explicit without vacuous passes.
4. **Add JSDoc `@public`/`@private` annotations**: Document the public API surface explicitly so that internal methods exposed by the mixin are clearly marked as not part of the stable API.
5. **Add TypeScript type definitions or JSDoc `@typedef`** for the OAuth object shape — this would catch H4 at development time without requiring a runtime change.

---

## Appendix: Detection Methodology

**Tools used**: Static analysis via manual file reading (Read tool), pattern searches (Grep), ESLint execution (Bash), line-count analysis.

**No code was modified** during this analysis. All findings are based on static examination of source files as they exist.

**Excluded from analysis**: `examples/` (linting suppressed by project config), `node_modules/`, `coverage/`, `docs/`.

**Reference catalog**: Jerzyk (2022) — https://luzkan.github.io/smells/, Fowler (1999/2018) "Refactoring", Martin (2008) "Clean Code".

---

*Analysis performed: 2026-03-26. Analyzer: claude-sonnet-4-6.*
