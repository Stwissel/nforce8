# Refactoring Expert Report — nforce8

**Analysis Date:** 2026-03-27
**Based On:** code-smell-detector-report.md + full source analysis
**Codebase:** nforce8 (Node.js Salesforce REST API wrapper, CommonJS)
**Refactoring Catalog Reference:** Fowler (1999/2018), refactoring.guru — all 66 techniques

---

## Executive Summary

The nforce8 codebase completed a major structural refactoring that split a monolithic 1,089-line `index.js` into focused domain modules. That work resolved the God Object smell. What remains are fourteen code smells distributed across three severity tiers, all of which are solvable with well-established refactoring techniques.

The three highest-impact problems are:

1. **An untyped, mutated `opts` property bag** that flows through every API function, carrying both configuration and in-flight state (`_retryCount`, `_refreshResult`) with no schema. This is the single largest maintainability hazard.
2. **Underscore-prefixed "private" methods on `Record`** are called directly from `lib/api.js` and `lib/http.js`, meaning the Record's internal layout cannot change without updating callers in two other modules.
3. **Five copies of the same id/type resolution conditional** (`opts.sobject ? opts.sobject.X : opts.X`) scattered across `lib/api.js`, including inconsistent use of `sobject.getId()` vs `util.findId(opts.sobject)` for the same intent.

All remaining smells are correctness-neutral: the codebase functions correctly. The refactorings below reduce future change cost, improve testability, and remove silent-failure paths.

**Recommendation count: 15**
**Recommended implementation: 3 phases (Quick Wins → Design → Architecture)**

---

## Table of Contents

1. [R01 — Extract `resolveId` and `resolveType` helpers](#r01)
2. [R02 — Introduce `Record.fromResponse()` static factory](#r02)
3. [R03 — Rename `_getFullPayload` / `_getChangedPayload` to public API](#r03)
4. [R04 — Promote `_reset()` to public `reset()`](#r04)
5. [R05 — Extract `SAML_ASSERTION_TYPE` constant](#r05)
6. [R06 — Replace `let opts` with `const opts` throughout](#r06)
7. [R07 — Remove what-comments in `optionhelper.js`](#r07)
8. [R08 — Add runtime deprecation warning to `stream()`](#r08)
9. [R09 — Introduce endpoint-selection helpers on Connection](#r09)
10. [R10 — Replace `executeOnRefresh` flag argument with explicit intent](#r10)
11. [R11 — Return new OAuth object instead of mutating the caller's object](#r11)
12. [R12 — Introduce `sobjectPath()` path-builder helper](#r12)
13. [R13 — Replace trivial getter/setter delegation in `auth.js`](#r13)
14. [R14 — Introduce typed `RequestContext` to replace the mutable `opts` bag](#r14)
15. [R15 — Extract `FAKE_CLIENT_ID` test constant in `test/connection.js`](#r15)

---

## Phase 1 — Quick Wins (Zero to Low Risk)

These refactorings are mechanical, have no behavioral effect, and can be completed in an afternoon.

---

<a name="r01"></a>
### R01 — Extract `resolveId` and `resolveType` helpers

**Smell:** Duplicated Code (HS-3), Inconsistent Resolution (Oddball Solution)
**Technique:** Extract Method (1.1)
**Files:** `lib/api.js`
**Risk:** Low
**Effort:** 30 minutes

#### Problem

The ternary `opts.sobject ? opts.sobject.X : opts.X` appears five times across `lib/api.js`. More critically, the same intent is implemented three different ways:

```javascript
// Pattern A — uses sobject.getId()
let id = opts.sobject ? opts.sobject.getId() : opts.id;          // lines 38, 46, 176–177

// Pattern B — uses util.findId() (different behaviour for plain objects)
let id = opts.sobject ? util.findId(opts.sobject) : opts.id;     // lines 223, 232, 241
```

`util.findId()` searches three property name variants (`Id`, `id`, `ID`) and calls `getId()` if present, while `sobject.getId()` only reads `_fields.id`. The two approaches can silently return different values if an sobject's ID is stored under `Id` rather than `id`. This is a latent bug.

#### Solution

Extract two helper functions at the top of `lib/api.js`:

```javascript
// lib/api.js — add after the require() block

/**
 * Resolve the Salesforce record ID from either an sobject or a plain opts hash.
 * Uses util.findId so all ID casing variants (Id, id, ID) are handled uniformly.
 * @param {object} opts
 * @returns {string|undefined}
 */
function resolveId(opts) {
  return opts.sobject ? util.findId(opts.sobject) : opts.id;
}

/**
 * Resolve the Salesforce record type from either an sobject or a plain opts hash.
 * Returns lowercase type string.
 * @param {object} opts
 * @returns {string|undefined}
 */
function resolveType(opts) {
  return opts.sobject ? opts.sobject.getType() : opts.type;
}
```

Then replace all five call sites:

```javascript
// BEFORE — getPasswordStatus (line 38)
let id = opts.sobject ? opts.sobject.getId() : opts.id;

// AFTER
const id = resolveId(opts);

// BEFORE — getRecord (lines 176–177)
const type = opts.sobject ? opts.sobject.getType() : opts.type;
const id = opts.sobject ? opts.sobject.getId() : opts.id;

// AFTER
const type = resolveType(opts);
const id = resolveId(opts);

// BEFORE — getBody (lines 212–213, note the .toLowerCase())
const type = (opts.sobject ? opts.sobject.getType() : opts.type).toLowerCase();

// AFTER
const type = (resolveType(opts) || '').toLowerCase();

// BEFORE — getAttachmentBody, getDocumentBody, getContentVersionData (lines 223, 232, 241)
let id = opts.sobject ? util.findId(opts.sobject) : opts.id;

// AFTER
const id = resolveId(opts);
```

#### Benefits

- One canonical ID resolution path — no more inconsistency between `sobject.getId()` and `util.findId(sobject)`.
- Any future ID resolution changes (e.g., supporting composite keys) touch one function.
- `let` → `const` as a side effect of the rewrite.

---

<a name="r02"></a>
### R02 — Introduce `Record.fromResponse()` Static Factory

**Smell:** Required Setup/Teardown Code (LS-4)
**Technique:** Replace Constructor with Factory Method (5.12)
**Files:** `lib/record.js`, `lib/api.js`
**Risk:** Low
**Effort:** 20 minutes

#### Problem

Every place that creates a `Record` from a Salesforce API response must immediately call `_reset()` to clear the change-tracking state. This is a two-step ceremony that is easy to forget when adding new API methods:

```javascript
// lib/api.js:192–194
resp = new Record(resp);
resp._reset();             // ← required teardown; easy to forget

// lib/api.js:314–315
let rec = new Record(r);
rec._reset();              // ← required teardown again

// lib/api.js:359–360
const rec = new Record(r);
rec._reset();              // ← and again
```

The constructor marks all fields as `_changed` (correct for user-constructed records), but response records should start clean.

#### Solution

Add a static factory method to `Record` that encapsulates the construction + reset ceremony:

```javascript
// lib/record.js — add after the constructor, before prototype methods

/**
 * Create a Record from a Salesforce API response.
 * Fields are populated but change-tracking is cleared, so hasChanged() returns
 * false and only future set() calls are tracked.
 * @param {object} data - Raw response object from Salesforce.
 * @returns {Record}
 */
Record.fromResponse = function (data) {
  const rec = new Record(data);
  rec.reset();   // uses the public reset() method — see R04
  return rec;
};
```

Then update the three call sites in `lib/api.js`:

```javascript
// BEFORE
resp = new Record(resp);
resp._reset();

// AFTER
resp = Record.fromResponse(resp);

// BEFORE (in _queryHandler)
let rec = new Record(r);
rec._reset();
recs.push(rec);

// AFTER
recs.push(Record.fromResponse(r));

// BEFORE (in search)
const rec = new Record(r);
rec._reset();
return rec;

// AFTER
return Record.fromResponse(r);
```

#### Benefits

- The two-step ceremony becomes impossible to forget — factory method encapsulates it.
- Adding a new API method that returns records has a clear, discoverable factory to use.
- Pairs with R04 (public `reset()` method).

---

<a name="r03"></a>
### R03 — Rename `_getFullPayload` and `_getChangedPayload` to Public API

**Smell:** Indecent Exposure (HS-2)
**Technique:** Rename Method (5.1), Hide Method / Expose Method
**Files:** `lib/record.js`, `lib/api.js`
**Risk:** Low
**Effort:** 20 minutes

#### Problem

`_getFullPayload()` and `_getChangedPayload()` are called from `lib/api.js` — they are part of the module's public contract, not implementation details. The underscore prefix falsely signals "private, do not call." Any change to these methods requires coordinating across two modules.

```javascript
// lib/api.js:135 — external caller
opts.body = JSON.stringify(opts.sobject._getFullPayload());

// lib/api.js:149 — external caller
opts.body = JSON.stringify(opts.sobject._getChangedPayload());

// lib/api.js:161 — external caller
opts.body = JSON.stringify(opts.sobject._getFullPayload());
```

#### Solution

Rename to descriptive public names in `lib/record.js`:

```javascript
// lib/record.js

// BEFORE
Record.prototype._getFullPayload = function () {
  return this._getPayload(false);
};

Record.prototype._getChangedPayload = function () {
  return this._getPayload(true);
};

// AFTER — public names without underscore
Record.prototype.toPayload = function () {
  return this._getPayload(false);
};

Record.prototype.toChangedPayload = function () {
  return this._getPayload(true);
};

// Keep underscore aliases for backward compatibility during transition (optional):
// Record.prototype._getFullPayload    = Record.prototype.toPayload;
// Record.prototype._getChangedPayload = Record.prototype.toChangedPayload;
```

Update `lib/api.js`:

```javascript
// BEFORE
opts.body = JSON.stringify(opts.sobject._getFullPayload());

// AFTER
opts.body = JSON.stringify(opts.sobject.toPayload());

// BEFORE
opts.body = JSON.stringify(opts.sobject._getChangedPayload());

// AFTER
opts.body = JSON.stringify(opts.sobject.toChangedPayload());
```

Also update `Record.prototype.toJSON` which internally calls `_getFullPayload()`:

```javascript
// lib/record.js
Record.prototype.toJSON = function () {
  let data = this.toPayload();   // was: this._getFullPayload()
  if (!data.id && this.getId()) {
    data.id = this.getId();
  }
  return data;
};
```

#### Benefits

- Callers in `api.js` use a stable, documented public interface.
- The underscore-prefixed `_getPayload(changedOnly)` implementation detail remains internal.
- `Record` encapsulation boundary is honest rather than aspirational.

---

<a name="r04"></a>
### R04 — Promote `_reset()` to Public `reset()`

**Smell:** Indecent Exposure (HS-2), Required Setup/Teardown (LS-4)
**Technique:** Rename Method (5.1)
**Files:** `lib/record.js`, `lib/http.js`, `lib/api.js`
**Risk:** Low
**Effort:** 15 minutes

#### Problem

`_reset()` is called from three different places outside `Record`:

```javascript
// lib/http.js:82–83
if (sobject._reset) {
  sobject._reset();         // duck-type check for private method
}

// lib/api.js — three places via resp._reset() before R02 applied
resp._reset();
rec._reset();
```

The duck-type check `if (sobject._reset)` in `http.js` is telling: the caller knows the method may or may not exist, meaning it's treating an underscore-prefixed name as a capability flag.

#### Solution

Rename to public `reset()` in `lib/record.js`:

```javascript
// lib/record.js

// BEFORE
Record.prototype._reset = function () {
  this._changed = new Set();
  this._previous = {};
};

// AFTER
Record.prototype.reset = function () {
  this._changed = new Set();
  this._previous = {};
};
```

Update `lib/http.js`:

```javascript
// BEFORE
if (sobject._reset) {
  sobject._reset();
}

// AFTER
if (typeof sobject.reset === 'function') {
  sobject.reset();
}
```

After R02 is applied, the calls in `lib/api.js` will go through `Record.fromResponse()`, which calls `reset()` internally. No direct `_reset()` calls remain in `api.js`.

#### Benefits

- The reset capability is part of the honest public contract.
- The duck-type check in `http.js` uses the public method name.
- Tests that currently call `acc._reset()` directly can switch to `acc.reset()` without accessing internals.

---

<a name="r05"></a>
### R05 — Extract `SAML_ASSERTION_TYPE` Constant

**Smell:** Magic String / Duplicated Code (MS-2)
**Technique:** Replace Magic Number with Symbolic Constant (3.11)
**Files:** `lib/auth.js` or `lib/constants.js`
**Risk:** Low
**Effort:** 10 minutes

#### Problem

The SAML assertion type URN string is duplicated in two authentication flows. A typo in either location produces a silent authentication failure with no indication of what went wrong:

```javascript
// lib/auth.js:130 (authenticate)
bopts.assertion_type = 'urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser';

// lib/auth.js:182 (refreshToken)
refreshOpts.assertion_type = 'urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser';
```

#### Solution

Option A: Define at top of `lib/auth.js`:

```javascript
// lib/auth.js — add after 'use strict'

const SAML_ASSERTION_TYPE = 'urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser';
```

Option B: Add to `lib/constants.js` for shared access:

```javascript
// lib/constants.js
const SAML_ASSERTION_TYPE = 'urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser';

const constants = {
  // ...existing constants...
  SAML_ASSERTION_TYPE,
};
```

Replace both usages in `lib/auth.js`:

```javascript
// BEFORE
bopts.assertion_type = 'urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser';

// AFTER
bopts.assertion_type = SAML_ASSERTION_TYPE;

// BEFORE
refreshOpts.assertion_type = 'urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser';

// AFTER
refreshOpts.assertion_type = SAML_ASSERTION_TYPE;
```

Option A is preferred: the constant is only used in `auth.js` and localizing it avoids polluting the constants module with an implementation detail of a single flow.

#### Benefits

- Single source of truth for the URN; a future standard revision touches one line.
- The constant name documents what the string is (SAML bearer assertion type identifier).
- Typo-proof: if the string were ever incorrect, grep for `SAML_ASSERTION_TYPE` finds all uses.

---

<a name="r06"></a>
### R06 — Replace `let opts` with `const opts` Throughout

**Smell:** Inconsistent `let`/`const` Usage (MS-7)
**Technique:** (style normalization, not a named Fowler refactoring, but supports Extract Variable / intent clarity)
**Files:** `lib/api.js`, `lib/auth.js`
**Risk:** Low
**Effort:** 15 minutes

#### Problem

21 of 26 `opts` declarations in `lib/api.js` use `let` despite the binding never being reassigned. `const` communicates immutability of the binding and enables linters to catch accidental reassignments:

```javascript
// lib/api.js — all of these can be const:
let opts = this._getOpts(data, { singleProp: 'id' });    // getPasswordStatus
let opts = this._getOpts(data);                          // updatePassword
// ...19 more
```

The five that already use `const` are inconsistent islands in the file.

#### Solution

Audit-and-replace pass over `lib/api.js` and `lib/auth.js`. For each `let opts`:

1. Confirm `opts` is never re-assigned (i.e., there is no `opts = ...` after the initial declaration).
2. Change `let` to `const`.

The two exceptions where `let` is legitimate are any functions that reassign `opts` after construction. A quick search confirms none do — `opts` properties are mutated (which `const` allows) but the binding itself is not reassigned.

```javascript
// BEFORE
let opts = this._getOpts(data, { singleProp: 'id' });

// AFTER
const opts = this._getOpts(data, { singleProp: 'id' });
```

Apply the same fix to `let opts` declarations in `lib/auth.js` where applicable.

#### Benefits

- Intent is explicit: static analysis tools (ESLint `prefer-const`) will enforce this going forward.
- Linters can now flag accidental `opts = newValue` reassignments as errors.
- Consistent style reduces cognitive load when reading the file.

---

<a name="r07"></a>
### R07 — Remove What-Comments in `optionhelper.js`

**Smell:** What Comments (LS-1)
**Technique:** Rename Method / Extract Method (where comment exists because code is unclear)
**Files:** `lib/optionhelper.js`
**Risk:** Low
**Effort:** 10 minutes

#### Problem

Seven comments in `getApiRequestOptions()` describe what the following code does — redundant because the code is self-evident:

```javascript
// Define the URI to call              ← states the obvious
if (opts.uri) { ...

// set accept headers                  ← code already says ropts.headers = { Accept: ... }
ropts.headers = { Accept: ...

// set oauth header                    ← says the same as the code
if (opts.oauth) {

// set content-type and body           ← obvious from the code
if (opts.multipart) {

// process qs                          ← "process qs" adds nothing
if (opts.qs) {

// process request opts                ← equally obvious
if (opts.requestOpts) {
```

The one comment worth keeping — and converting to a *why* comment — is on the OAuth header block, since it's not obvious why the OAuth check is conditional (it should perhaps always be present):

```javascript
// set oauth header
if (opts.oauth) {
  ropts.headers.Authorization = 'Bearer ' + opts.oauth.access_token;
}
```

A *why* comment here would be: `// OAuth may be absent for pre-auth requests (e.g., getVersions)`.

#### Solution

```javascript
// lib/optionhelper.js — getApiRequestOptions() after cleanup

function getApiRequestOptions(opts) {
  const ropts = {};
  const apiVersion = opts.apiVersion || CONST.defaultOptions.apiVersion;

  if (opts.uri) {
    ropts.uri = opts.uri;
  } else {
    if (!opts.resource || opts.resource.charAt(0) !== '/') {
      opts.resource = '/' + (opts.resource || '');
    }
    ropts.uri = [
      opts.oauth.instance_url,
      '/services/data/',
      apiVersion,
      opts.resource
    ].join('');
  }

  ropts.method = opts.method || 'GET';

  ropts.headers = { Accept: 'application/json;charset=UTF-8' };

  // OAuth may be absent for unauthenticated requests (e.g., getVersions without a token)
  if (opts.oauth) {
    ropts.headers.Authorization = 'Bearer ' + opts.oauth.access_token;
  }

  if (opts.multipart) {
    ropts.body = opts.multipart;
  } else {
    ropts.headers['content-type'] = 'application/json';
    if (opts.body) {
      ropts.body = opts.body;
    }
  }

  if (opts.headers) {
    Object.assign(ropts.headers, opts.headers);
  }

  if (opts.qs) {
    ropts.qs = opts.qs;
  }

  if (opts.requestOpts) {
    Object.assign(ropts, opts.requestOpts);
  }

  return ropts;
}
```

#### Benefits

- Function is shorter with identical semantics.
- The one retained comment now conveys *why* rather than *what*.
- Noise reduction improves the signal-to-noise ratio of the file.

---

<a name="r08"></a>
### R08 — Add Runtime Deprecation Warning to `stream()`

**Smell:** Deprecated Method with No Removal Timeline (LS-3)
**Technique:** (operational: use Node's process.emitWarning API)
**Files:** `lib/api.js`
**Risk:** Low
**Effort:** 5 minutes

#### Problem

`stream()` is documented as deprecated but emits no runtime signal. Callers have no incentive to migrate to `subscribe()`:

```javascript
/**
 * @deprecated Use subscribe() instead. Will be removed in the next major version.
 */
const stream = function (data) {
  return this.subscribe(data);
};
```

#### Solution

```javascript
// lib/api.js

const stream = function (data) {
  process.emitWarning(
    'nforce8: stream() is deprecated and will be removed in the next major version. ' +
    'Use subscribe() instead.',
    {
      code: 'NFORCE8_DEPRECATED_STREAM',
      detail: 'Replace all calls to stream() with subscribe().'
    }
  );
  return this.subscribe(data);
};
```

`process.emitWarning` emits to stderr once per unique code in most runtimes and does not throw, so existing callers continue to work while receiving a migration nudge in logs.

#### Benefits

- Active deprecation: callers see the warning in development and CI logs.
- The `code` field (`NFORCE8_DEPRECATED_STREAM`) allows callers to suppress the warning if needed via `--no-deprecation` or by filtering `process.on('warning', ...)`.
- No behavioral change.

---

<a name="r15"></a>
### R15 — Extract `FAKE_CLIENT_ID` Constant in `test/connection.js`

**Smell:** Duplicated Test Data (Cross-File Analysis finding)
**Technique:** Replace Magic Number with Symbolic Constant (3.11)
**Files:** `test/connection.js`
**Risk:** Low
**Effort:** 5 minutes

#### Problem

The fake client ID string `'ADFJSD234ADF765SFG55FD54S'` appears 58 times in `test/connection.js`. If the tests ever need to change the fake ID (e.g., to test a minimum-length validation), 58 occurrences must be updated:

```javascript
nforce.createConnection({
  clientId: 'ADFJSD234ADF765SFG55FD54S',   // ← 58 occurrences
  ...
});
```

#### Solution

```javascript
// test/connection.js — top of file, after requires

const FAKE_CLIENT_ID = 'ADFJSD234ADF765SFG55FD54S';
const FAKE_REDIRECT_URI = 'http://localhost:3000/oauth/_callback';

// Then replace throughout:
nforce.createConnection({
  clientId: FAKE_CLIENT_ID,
  clientSecret: FAKE_CLIENT_ID,    // same shape, used in many tests
  redirectUri: FAKE_REDIRECT_URI,
  ...
});
```

#### Benefits

- Single update point for test fixture data.
- Communicates that the string is intentionally fake (not a real credential to scrub).

---

## Phase 2 — Design Improvements (Medium Risk)

These refactorings modify design patterns and touch more files, but are straightforward to apply incrementally.

---

<a name="r09"></a>
### R09 — Introduce Endpoint-Selection Helpers on Connection

**Smell:** Duplicated Environment Selection Logic (MS-1)
**Technique:** Extract Method (1.1), Consolidate Conditional Expression (4.2)
**Files:** `lib/auth.js`, `lib/constants.js`, `index.js` (Connection prototype)
**Risk:** Medium
**Effort:** 1 hour

#### Problem

The sandbox/production endpoint selection ternary is copy-pasted four times in `lib/auth.js`:

```javascript
// lib/auth.js:86–89 (getAuthUri)
if (opts.authEndpoint) {
  endpoint = opts.authEndpoint;
} else if (this.environment === 'sandbox') {
  endpoint = this.testAuthEndpoint;
} else {
  endpoint = this.authEndpoint;
}

// lib/auth.js:113 (authenticate)
opts.uri = this.environment === 'sandbox' ? this.testLoginUri : this.loginUri;

// lib/auth.js:167 (refreshToken)
opts.uri = this.environment === 'sandbox' ? this.testLoginUri : this.loginUri;

// lib/auth.js:219–221 (revokeToken)
opts.uri = this.environment === 'sandbox'
  ? this.testRevokeUri
  : this.revokeUri;
```

Adding a third environment (e.g., government cloud `gov.salesforce.com`) would require modifying four separate locations.

#### Solution

**Option A: Endpoint lookup map in `constants.js` (preferred)**

Replace the parallel `loginUri`/`testLoginUri` pairs with a structured endpoint map:

```javascript
// lib/constants.js

const ENDPOINTS = {
  production: {
    auth:   'https://login.salesforce.com/services/oauth2/authorize',
    login:  'https://login.salesforce.com/services/oauth2/token',
    revoke: 'https://login.salesforce.com/services/oauth2/revoke',
  },
  sandbox: {
    auth:   'https://test.salesforce.com/services/oauth2/authorize',
    login:  'https://test.salesforce.com/services/oauth2/token',
    revoke: 'https://test.salesforce.com/services/oauth2/revoke',
  },
};
```

**Option B: Private helper methods on Connection (simpler, less restructuring)**

Add three helpers to `lib/auth.js` (they will be mixed into Connection.prototype):

```javascript
// lib/auth.js — add before getAuthUri

/**
 * Returns the OAuth authorization endpoint for the current environment.
 * Respects a per-call override via opts.authEndpoint.
 * @param {object} [opts]
 * @returns {string}
 */
const _authEndpoint = function (opts = {}) {
  if (opts.authEndpoint) return opts.authEndpoint;
  return this.environment === 'sandbox' ? this.testAuthEndpoint : this.authEndpoint;
};

/**
 * Returns the OAuth token (login) endpoint for the current environment.
 * @returns {string}
 */
const _loginEndpoint = function () {
  return this.environment === 'sandbox' ? this.testLoginUri : this.loginUri;
};

/**
 * Returns the OAuth revoke endpoint for the current environment.
 * @returns {string}
 */
const _revokeEndpoint = function () {
  return this.environment === 'sandbox' ? this.testRevokeUri : this.revokeUri;
};
```

Update the four call sites:

```javascript
// getAuthUri — BEFORE
if (opts.authEndpoint) {
  endpoint = opts.authEndpoint;
} else if (this.environment === 'sandbox') {
  endpoint = this.testAuthEndpoint;
} else {
  endpoint = this.authEndpoint;
}

// getAuthUri — AFTER
const endpoint = this._authEndpoint(opts);

// authenticate — BEFORE
opts.uri = this.environment === 'sandbox' ? this.testLoginUri : this.loginUri;

// authenticate — AFTER
opts.uri = this._loginEndpoint();

// refreshToken — BEFORE  (same as authenticate)
opts.uri = this.environment === 'sandbox' ? this.testLoginUri : this.loginUri;

// refreshToken — AFTER
opts.uri = this._loginEndpoint();

// revokeToken — BEFORE
opts.uri = this.environment === 'sandbox'
  ? this.testRevokeUri
  : this.revokeUri;

// revokeToken — AFTER
opts.uri = this._revokeEndpoint();
```

Export the new helpers from `lib/auth.js` and include them in the `Object.assign(Connection.prototype, ...)` in `index.js`.

Option B is lower-risk because it does not restructure `constants.js` or the Connection constructor. Option A is the more principled long-term approach and makes adding new environments a single-file change in `constants.js`.

#### Benefits

- Adding a new environment (e.g., government sandbox) requires changing one location.
- `authenticate()`, `refreshToken()`, and `revokeToken()` no longer embed raw environment knowledge.
- Open/Closed Principle improvement: new environments extend the lookup map without modifying method bodies.

---

<a name="r10"></a>
### R10 — Replace `executeOnRefresh` Flag Argument with Explicit Intent

**Smell:** Flag Argument (MS-3)
**Technique:** Replace Parameter with Explicit Methods (5.6), Remove Parameter (5.3)
**Files:** `lib/auth.js`
**Risk:** Medium
**Effort:** 2 hours

#### Problem

`executeOnRefresh` is a boolean flag threaded through `opts` to control whether `_resolveWithRefresh` invokes the `onRefresh` callback. This is a textbook Flag Argument: a boolean whose sole purpose is to select a behavior that should have a distinct name:

```javascript
// lib/auth.js:96 — the flag consumer
const _resolveWithRefresh = function (opts, oldOauth) {
  if (this.onRefresh && opts.executeOnRefresh === true) {
    return new Promise((resolve, reject) => {
      this.onRefresh.call(this, opts.oauth, oldOauth, (err) => { ... });
    });
  }
  return Promise.resolve(opts.oauth);
};

// lib/auth.js:109 — false in authenticate (no notify)
const opts = Object.assign({ executeOnRefresh: false, oauth: {} }, this._getOpts(data));

// lib/auth.js:163 — true in refreshToken (notify)
defaults: { executeOnRefresh: true }

// lib/auth.js:232–233 — true in autoRefreshToken (notify)
defaults: { executeOnRefresh: true }
```

The flag also propagates through `autoRefreshToken` which passes it down:

```javascript
// lib/auth.js:238–239
const refreshOpts = {
  oauth: opts.oauth,
  executeOnRefresh: opts.executeOnRefresh,
};
```

#### Solution

Split `_resolveWithRefresh` into two separate expressions and eliminate the flag:

```javascript
// lib/auth.js — REMOVE the executeOnRefresh flag entirely

// Replace _resolveWithRefresh with two clear helpers:

/**
 * Notify the onRefresh callback if configured, then resolve with the updated OAuth.
 * Use this after a token refresh operation.
 * @param {object} newOauth - The updated OAuth object.
 * @param {object} oldOauth - The prior OAuth object (passed to the callback).
 * @returns {Promise<object>}
 */
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

/**
 * Resolve with OAuth without notifying the onRefresh callback.
 * Use this after initial authentication (not a refresh).
 * @param {object} newOauth
 * @returns {Promise<object>}
 */
const _resolveOAuth = function (newOauth) {
  return Promise.resolve(newOauth);
};
```

Update `authenticate()` to use `_resolveOAuth`:

```javascript
// lib/auth.js — authenticate()
// BEFORE
const opts = Object.assign({ executeOnRefresh: false, oauth: {} }, this._getOpts(data));
// ...
return this._apiAuthRequest(opts).then((res) => {
  let old = { ...opts.oauth };
  Object.assign(opts.oauth, res);
  if (opts.assertion) opts.oauth.assertion = opts.assertion;
  return this._resolveWithRefresh(opts, old);
});

// AFTER — R10 + R11 combined (see R11 for the OAuth mutation fix)
const opts = Object.assign({ oauth: {} }, this._getOpts(data));
// ...
return this._apiAuthRequest(opts).then((res) => {
  const old = { ...opts.oauth };
  const newOauth = { ...opts.oauth, ...res };
  if (opts.assertion) newOauth.assertion = opts.assertion;
  opts.oauth = newOauth;              // update local opts for single-mode side effects
  return this._resolveOAuth(newOauth);
});
```

Update `refreshToken()` and `autoRefreshToken()` to use `_notifyAndResolve`:

```javascript
// lib/auth.js — refreshToken()
// AFTER
return this._apiAuthRequest(opts).then((res) => {
  const old = { ...opts.oauth };
  const newOauth = { ...opts.oauth, ...res };
  if (opts.assertion) newOauth.assertion = opts.assertion;
  return this._notifyAndResolve(newOauth, old);
});
```

Remove `executeOnRefresh` from all `defaults` objects and from `autoRefreshToken`'s `refreshOpts`.

Update exports in `lib/auth.js`:

```javascript
module.exports = {
  // remove: _resolveWithRefresh
  // add:
  _notifyAndResolve,
  _resolveOAuth,
  // ...rest unchanged
};
```

#### Benefits

- No call site has to know or pass a flag to get the right behavior.
- `_notifyAndResolve` and `_resolveOAuth` names communicate intent clearly.
- The `executeOnRefresh: true/false` initialization in `opts` defaults blocks can be removed entirely.

---

<a name="r11"></a>
### R11 — Return New OAuth Object Instead of Mutating Caller's Object

**Smell:** Mutable Data / Side Effects (MS-4)
**Technique:** Separate Query from Modifier (5.4), Command-Query Separation
**Files:** `lib/auth.js`
**Risk:** Medium
**Effort:** 1 hour

#### Problem

Both `authenticate()` and `refreshToken()` mutate the caller's OAuth object by calling `Object.assign(opts.oauth, res)`. This is an unannounced side effect:

```javascript
// lib/auth.js:150–153
return this._apiAuthRequest(opts).then((res) => {
  let old = { ...opts.oauth };
  Object.assign(opts.oauth, res);   // mutates the CALLER'S object
  if (opts.assertion) opts.oauth.assertion = opts.assertion;
  return this._resolveWithRefresh(opts, old);
});

// lib/auth.js:204–208 (refreshToken — same pattern)
return this._apiAuthRequest(opts).then((res) => {
  let old = { ...opts.oauth };
  Object.assign(opts.oauth, res);   // mutates caller's object again
  ...
});
```

In multi-user mode, the caller passes their own OAuth object. Mutating it silently updates the caller's stored reference — but only if the caller passed an object reference, not a copy. This behavior is unpredictable and hard to audit.

The single-user mode **does** need the Connection's `this.oauth` to be updated, but that is handled separately by `_apiAuthRequest`:

```javascript
// lib/http.js:126–128
if (jBody.access_token && this.mode === 'single') {
  Object.assign(this.oauth || (this.oauth = {}), jBody);   // single-mode update
}
```

So `authenticate()` and `refreshToken()` can return a new object without affecting single-mode behavior.

#### Solution

Replace `Object.assign(opts.oauth, res)` with object spread to return a new object:

```javascript
// lib/auth.js — authenticate() — AFTER (combined with R10)
return this._apiAuthRequest(opts).then((res) => {
  const old = { ...opts.oauth };
  const newOauth = { ...opts.oauth, ...res };
  if (opts.assertion) newOauth.assertion = opts.assertion;
  // Note: single-mode update happens in _apiAuthRequest via http.js:126
  return this._resolveOAuth(newOauth);   // or _notifyAndResolve for refreshToken
});

// lib/auth.js — refreshToken() — AFTER
return this._apiAuthRequest(opts).then((res) => {
  const old = { ...opts.oauth };
  const newOauth = { ...opts.oauth, ...res };
  if (opts.assertion) newOauth.assertion = opts.assertion;
  return this._notifyAndResolve(newOauth, old);   // R10 helper
});
```

#### Caller Impact

Callers that rely on the side-effect mutation must be updated to use the returned value:

```javascript
// BEFORE (caller relied on mutation)
await conn.authenticate({ username, password });
// opts.oauth was mutated by authenticate(); caller's oauth is now updated

// AFTER (correct — use return value)
const oauth = await conn.authenticate({ username, password });
// oauth is the new OAuth object; store it explicitly
```

The vast majority of callers in the test suite and examples already capture the return value (`const oauth = await conn.authenticate(...)`), so this is a low-impact breaking change. Add a **migration note** to the changelog and a major-version semver bump if published.

#### Benefits

- Calling `authenticate()` no longer silently modifies the caller's data structure.
- The returned OAuth value is the single source of truth.
- The behavior is now testable without checking side effects on input objects.

---

<a name="r12"></a>
### R12 — Introduce `sobjectPath()` Path-Builder Helper

**Smell:** Magic Path Strings (MS-6)
**Technique:** Extract Method (1.1), Replace Magic Number with Symbolic Constant (3.11)
**Files:** `lib/api.js`
**Risk:** Low–Medium
**Effort:** 1 hour

#### Problem

The prefix `/sobjects/` appears eight times as a string literal in `lib/api.js`, and path segments are assembled by string concatenation. A second fragile string operation appears in `getVersions`:

```javascript
// lib/api.js:75 — fragile: strips internal structure of loginUri
opts.uri = this.loginUri.replace('/oauth2/token', '') + '/services/data/';
```

Full list of string-concatenated paths:
```javascript
'/sobjects/user/' + id + '/password'          // getPasswordStatus, updatePassword
'/sobjects/' + type                            // getMetadata, insert
'/sobjects/' + type + '/describe'             // getDescribe
'/sobjects/' + type + '/' + id               // update, _delete, getRecord
'/sobjects/' + type + '/' + extIdField + '/' + extId  // upsert
'/sobjects/attachment/' + id + '/body'        // getAttachmentBody
'/sobjects/document/' + id + '/body'          // getDocumentBody
'/sobjects/contentversion/' + id + '/versiondata'     // getContentVersionData
```

#### Solution

Add path-builder helpers at the top of `lib/api.js`:

```javascript
// lib/api.js — add after require() block, before first function

const SOBJECTS = '/sobjects';

/**
 * Build a /sobjects/... resource path.
 * All segments are joined with '/' and leading/trailing slashes on segments are
 * not required. Returns a path starting with '/sobjects/'.
 * @param {...string} segments
 * @returns {string}
 */
const sobjectPath = (...segments) =>
  [SOBJECTS, ...segments].filter(Boolean).join('/');
```

Replace all string concatenation:

```javascript
// BEFORE
opts.resource = '/sobjects/user/' + id + '/password';
// AFTER
opts.resource = sobjectPath('user', id, 'password');

// BEFORE
opts.resource = '/sobjects/' + opts.type;
// AFTER
opts.resource = sobjectPath(opts.type);

// BEFORE
opts.resource = '/sobjects/' + type + '/describe';
// AFTER
opts.resource = sobjectPath(type, 'describe');

// BEFORE
opts.resource = '/sobjects/' + type + '/' + id;
// AFTER
opts.resource = sobjectPath(type, id);

// BEFORE
opts.resource = '/sobjects/' + type + '/' + extIdField + '/' + extId;
// AFTER
opts.resource = sobjectPath(type, extIdField, extId);

// BEFORE
opts.resource = '/sobjects/attachment/' + id + '/body';
// AFTER
opts.resource = sobjectPath('attachment', id, 'body');

// BEFORE
opts.resource = '/sobjects/document/' + id + '/body';
// AFTER
opts.resource = sobjectPath('document', id, 'body');

// BEFORE
opts.resource = '/sobjects/contentversion/' + id + '/versiondata';
// AFTER
opts.resource = sobjectPath('contentversion', id, 'versiondata');
```

For the `getVersions` fragile string operation:

```javascript
// BEFORE
opts.uri = this.loginUri.replace('/oauth2/token', '') + '/services/data/';

// AFTER — derive base URL from the stored constant, not by string surgery
// Add to constants.js:
// const SFDC_BASE_URL = 'https://login.salesforce.com';
// const TEST_SFDC_BASE_URL = 'https://test.salesforce.com';

// Then in getVersions:
const baseUrl = this.environment === 'sandbox'
  ? CONST.TEST_SFDC_BASE_URL
  : CONST.SFDC_BASE_URL;
opts.uri = baseUrl + '/services/data/';
```

Or, since `getVersions` already uses `opts.oauth.instance_url` when available, the fallback case can be:

```javascript
// Alternative: use loginUri origin property (URL API)
opts.uri = new URL(this.loginUri).origin + '/services/data/';
```

The `new URL(this.loginUri).origin` approach is cleaner because it uses the URL's own parsed base rather than manual string surgery, and it works correctly even if the loginUri ever changes path segments.

#### Benefits

- `/sobjects/` duplication: eight occurrences become one constant.
- Path construction errors are caught at the `sobjectPath()` level.
- `getVersions` no longer has a hidden dependency on the internal structure of `loginUri`.

---

<a name="r13"></a>
### R13 — Evaluate and Remove Trivial Getter/Setter Delegation in `auth.js`

**Smell:** Lazy Element / Middle Man (MS-5)
**Technique:** Remove Middle Man (2.6), Inline Method (1.2)
**Files:** `lib/auth.js`, `lib/api.js` (the three callers)
**Risk:** Medium (public API surface change)
**Effort:** 1 hour

#### Problem

Eight functions in `lib/auth.js` are pure property accessors that add no transformation, validation, or encapsulation value:

```javascript
const getOAuth          = function () { return this.oauth; };
const setOAuth          = function (oauth) { this.oauth = oauth; };
const getUsername       = function () { return this.username; };
const setUsername       = function (username) { this.username = username; };
const getPassword       = function () { return this.password; };
const setPassword       = function (password) { this.password = password; };
const getSecurityToken  = function () { return this.securityToken; };
const setSecurityToken  = function (token) { this.securityToken = token; };
```

They are called within `lib/auth.js` itself (e.g., `this.getUsername()`, `this.setPassword()`) and occasionally in `lib/api.js` via `this.getUsername()` and `this.getPassword()`. Since Connection is a prototype-based object with plain properties, direct property access is idiomatic JavaScript.

#### Decision Criteria

This refactoring has a **public API impact**: callers outside the library who use `conn.getOAuth()` would break. The decision depends on whether these are considered public API or implementation detail:

- If they appear in the public documentation / README as the supported way to get credentials → **keep them**, but add JSDoc.
- If they are undocumented implementation details used only internally → **remove them** per the Lazy Element smell.

#### Solution (if removing)

Remove all eight functions from `lib/auth.js` and replace internal callers with direct property access:

```javascript
// lib/auth.js — authenticate() — BEFORE
bopts.username = opts.username || this.getUsername();
bopts.password = opts.password || this.getPassword();
// ...
this.setUsername(opts.username || this.getUsername());
this.setPassword(opts.password || this.getPassword());
this.setSecurityToken(opts.securityToken);

// AFTER
bopts.username = opts.username || this.username;
bopts.password = opts.password || this.password;
// ...
this.username = opts.username || this.username;
this.password = opts.password || this.password;
this.securityToken = opts.securityToken;
```

```javascript
// lib/api.js:172–173 — _apiRequest autoRefresh check — BEFORE
this.getUsername() && this.getPassword()

// AFTER
this.username && this.password
```

**If keeping as public API** (alternative solution): Add JSDoc to clarify these are intentional accessors and add minimal validation (e.g., type check on setters) so the indirection is justified:

```javascript
const setOAuth = function (oauth) {
  if (oauth !== null && typeof oauth !== 'object') {
    throw new TypeError('oauth must be an object or null');
  }
  this.oauth = oauth;
};
```

#### Benefits (removal path)

- 30 fewer lines of boilerplate.
- The module boundary between `auth.js` and the Connection prototype is cleaner.
- Direct property access is idiomatic in Node.js for simple configuration.

#### Risk

- If any external callers use these methods, they break. Check the README and examples before removing.
- The `lib/api.js` autoRefresh check uses `this.getUsername()` and `this.getPassword()` — update these.

---

## Phase 3 — Architectural Improvement (Higher Risk, Highest Value)

---

<a name="r14"></a>
### R14 — Introduce Typed `RequestContext` to Replace the Mutable `opts` Bag

**Smell:** Primitive Obsession / Mutable Data / Temporary Field (HS-1)
**Technique:** Introduce Parameter Object (5.9), Replace Data Value with Object (3.2)
**Files:** `lib/api.js`, `lib/http.js`, `lib/optionhelper.js`
**Risk:** High
**Effort:** 4–8 hours

#### Problem

The `opts` property bag is the single largest design issue in the codebase. It is an untyped, mutable plain object that accumulates properties from five different sources:

| Source | Properties Added |
|--------|-----------------|
| Caller's `data` arg | `sobject`, `oauth`, `type`, `id`, `query`, `fields`, `raw`, `fetchAll`, etc. |
| `_getOpts()` | copies caller's data, may inject `oauth` from single-mode |
| Individual API functions | `opts.resource`, `opts.method`, `opts.body`, `opts.multipart`, `opts.uri`, `opts.qs` |
| `optionhelper.js` | reads all the above to build HTTP request options |
| `http.js` retry logic | **injects** `opts._retryCount` and `opts._refreshResult` back into `opts` |

The `_retryCount` and `_refreshResult` injections are Temporary Fields: they exist only for the duration of a retry cycle and have no meaning outside that narrow context.

No static analysis tool can verify what shape `opts` must have at any call boundary.

#### Solution

Introduce a `RequestContext` class (or factory function) that provides a clear schema:

**Step 1: Define `RequestContext`**

```javascript
// lib/requestcontext.js (new file)
'use strict';

/**
 * Immutable-by-convention request context passed from API functions to _apiRequest.
 * All mutation is replaced by creating a new context for retries.
 */
class RequestContext {
  /**
   * @param {object} params
   * @param {object}  params.oauth          - OAuth credentials
   * @param {string}  params.method         - HTTP method (GET/POST/PATCH/DELETE)
   * @param {string}  [params.uri]          - Full URI (when set, resource is ignored)
   * @param {string}  [params.resource]     - Resource path (/sobjects/...)
   * @param {string}  [params.body]         - Serialized request body
   * @param {object}  [params.multipart]    - Multipart form data
   * @param {object}  [params.headers]      - Extra request headers
   * @param {object}  [params.qs]           - Query string parameters
   * @param {object}  [params.sobject]      - SObject record (for post-response update)
   * @param {boolean} [params.blob=false]   - Whether to return ArrayBuffer
   * @param {boolean} [params.raw=false]    - Whether to skip Record wrapping
   * @param {object}  [params.requestOpts]  - Extra fetch options
   * @param {number}  [params.retryCount=0] - Number of retries attempted (replaces _retryCount)
   */
  constructor(params) {
    this.oauth       = params.oauth;
    this.method      = params.method || 'GET';
    this.uri         = params.uri    || null;
    this.resource    = params.resource || null;
    this.body        = params.body   || null;
    this.multipart   = params.multipart || null;
    this.headers     = params.headers || null;
    this.qs          = params.qs     || null;
    this.sobject     = params.sobject || null;
    this.blob        = params.blob   === true;
    this.raw         = params.raw    === true;
    this.requestOpts = params.requestOpts || null;
    this.retryCount  = params.retryCount  || 0;

    // Disallow direct mutation of request context properties
    // (use withRetry() to create a new context for retries)
    Object.freeze(this);
  }

  /**
   * Create a new RequestContext for a retry, updating the oauth if a refresh occurred.
   * @param {object} [newOauth] - Refreshed OAuth object; uses existing if not provided.
   * @returns {RequestContext}
   */
  withRetry(newOauth) {
    return new RequestContext({
      ...this,
      oauth: newOauth || this.oauth,
      retryCount: this.retryCount + 1,
    });
  }
}

module.exports = RequestContext;
```

**Step 2: Update `_apiRequest` in `lib/http.js`**

Replace the `opts._retryCount` / `opts._refreshResult` sentinel mutations:

```javascript
// lib/http.js — BEFORE (retry logic)
return this.autoRefreshToken(opts).then((res) => {
  opts._refreshResult = res;
  opts._retryCount = 1;
  return this._apiRequest(opts);
});

// lib/http.js — AFTER (immutable context, new instance for retry)
return this.autoRefreshToken(opts).then((refreshedOauth) => {
  const retryContext = opts.withRetry(refreshedOauth);
  return this._apiRequest(retryContext);
});
```

The `!opts._retryCount` guard becomes `!opts.retryCount` (or `opts.retryCount === 0`).

**Step 3: Update API functions to build `RequestContext`**

This is the most extensive change. Each API function currently mutates `opts`; instead, it should build a `RequestContext`:

```javascript
// BEFORE — getPasswordStatus
const getPasswordStatus = function (data) {
  let opts = this._getOpts(data, { singleProp: 'id' });
  let id = opts.sobject ? opts.sobject.getId() : opts.id;
  opts.resource = '/sobjects/user/' + id + '/password';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

// AFTER
const getPasswordStatus = function (data) {
  const opts = this._getOpts(data, { singleProp: 'id' });
  const id = resolveId(opts);
  return this._apiRequest(new RequestContext({
    oauth:    opts.oauth,
    method:   'GET',
    resource: sobjectPath('user', id, 'password'),
  }));
};
```

**Implementation Strategy**

Given the scope, apply this incrementally:

1. Add the `RequestContext` class.
2. Update `_apiRequest` to handle both plain `opts` and `RequestContext` instances (duck-type check for `retryCount` vs `_retryCount`) during the migration.
3. Convert one API function at a time, starting with the simplest (e.g., `getPasswordStatus`, `getResources`).
4. Once all API functions are converted, remove the backward-compatibility duck-typing in `_apiRequest`.
5. Remove the `opts._retryCount` / `opts._refreshResult` mutation from `http.js`.

**Backward compatibility note:** `_getOpts()` returns a plain object today. During migration, `_getOpts()` can continue to return a plain object used for reading caller options; the API function is responsible for constructing the final `RequestContext`. Eventually, `_getOpts()` can be replaced by the specific input parsing each function needs.

#### Benefits

- **Static analyzability**: the `RequestContext` schema is discoverable from the class definition.
- **No more silent mutations**: the `Object.freeze()` ensures no code can add `_retryCount` or `_refreshResult` directly.
- **Retry logic is clean**: `opts.withRetry(newOauth)` is explicit and creates a new, independent context.
- **Testability**: API functions can be tested by inspecting the `RequestContext` they construct rather than mocking all downstream effects.

---

## Cross-File Cleanup Recommendations

### Clean Up `test/integration.js`

Remove the commented-out credentials object (lines 57–66) and resolve or remove the `// TODO: fix the creds` comment at line 18. If integration tests are not run in CI (they are not, since credentials are not available), add a clear `it.skip` with a comment explaining how to enable them:

```javascript
// test/integration.js

describe('integration tests', function () {
  // Integration tests require live Salesforce credentials.
  // Set SFDC_CLIENT_ID, SFDC_CLIENT_SECRET, SFDC_REDIRECT_URI,
  // SFDC_USERNAME, and SFDC_PASSWORD environment variables to run.
  before(function () {
    if (!process.env.SFDC_CLIENT_ID) {
      this.skip();
    }
  });
  // ... tests
});
```

### Update `test/record.js` Internal State Access

After R03 and R04 are implemented, update `test/record.js` to use the public API instead of reaching into `_changed`, `_previous`, and `_fields`:

```javascript
// BEFORE — test/record.js:41
Object.keys(acc._fields).forEach(function (key) { ... });

// AFTER — expose keys via a public method, or test via get()
// Option: add Record.prototype.fieldNames() = () => Object.keys(this._fields)

// BEFORE — test/record.js:48–49
should.exist(acc._changed);
acc._changed.size.should.equal(2);

// AFTER — use the public hasChanged() API
acc.hasChanged().should.equal(true);

// BEFORE — test/record.js:217–218 (reset state in test setup)
acc._changed = new Set();
acc._previous = {};

// AFTER — use the public reset() method (R04)
acc.reset();
```

Adding `Record.prototype.changedCount()` (returns `this._changed.size`) would support the size assertion tests without exposing the internal `Set`.

### `lib/fdcstream.js` — Version String Parsing

The `opts.apiVersion.substring(1)` call at line 47 strips the `v` prefix from the version string. This is fragile if the format ever changes:

```javascript
// BEFORE
this._endpoint = opts.oauth.instance_url + '/cometd/' + opts.apiVersion.substring(1);

// AFTER — use a named helper or regex
const stripVersionPrefix = (ver) => ver.replace(/^v/, '');
this._endpoint = opts.oauth.instance_url + '/cometd/' + stripVersionPrefix(opts.apiVersion);
```

Alternatively, store the numeric version in `constants.js` separately from the `vXX.0` string form, so consumers can use whichever format they need without string surgery.

---

## Priority Matrix

| ID  | Recommendation | Impact | Complexity | Risk | Phase |
|-----|----------------|--------|------------|------|-------|
| R01 | Extract `resolveId`/`resolveType` helpers | H | L | L | 1 |
| R02 | `Record.fromResponse()` static factory | H | L | L | 1 |
| R03 | Rename `_getFullPayload`/`_getChangedPayload` to public API | H | L | L | 1 |
| R04 | Promote `_reset()` to public `reset()` | M | L | L | 1 |
| R05 | Extract `SAML_ASSERTION_TYPE` constant | L | L | L | 1 |
| R06 | Replace `let opts` with `const opts` | L | L | L | 1 |
| R07 | Remove what-comments in `optionhelper.js` | L | L | L | 1 |
| R08 | Add runtime deprecation warning to `stream()` | L | L | L | 1 |
| R09 | Endpoint-selection helpers on Connection | M | M | M | 2 |
| R10 | Replace `executeOnRefresh` flag argument | M | M | M | 2 |
| R11 | Return new OAuth object (no mutation) | M | M | M | 2 |
| R12 | Introduce `sobjectPath()` path-builder | M | L | L | 2 |
| R13 | Evaluate/remove trivial getter/setter delegation | L | M | M | 2 |
| R14 | Introduce typed `RequestContext` | H | H | H | 3 |
| R15 | Extract `FAKE_CLIENT_ID` test constant | L | L | L | 1 |

---

## Implementation Sequence

The recommended order respects dependency constraints:

### Batch 1 (no dependencies, safe to parallelize)
- **R05** — SAML constant (constants.js only)
- **R06** — `let` → `const` sweep
- **R07** — Remove what-comments
- **R08** — Deprecation warning
- **R15** — Test constant

### Batch 2 (Record public API — R04 enables R02)
- **R04** — `_reset()` → `reset()` *(must precede R02)*
- **R03** — Rename `_getFullPayload`/`_getChangedPayload` *(can run concurrently with R04)*
- **R02** — `Record.fromResponse()` factory *(after R04)*

### Batch 3 (api.js cleanup — R01 reduces noise before further changes)
- **R01** — Extract `resolveId`/`resolveType`
- **R12** — `sobjectPath()` path builder

### Batch 4 (auth.js design)
- **R09** — Endpoint-selection helpers *(foundation for R10/R11)*
- **R10** + **R11** — Flag removal + OAuth immutability *(can be done together; they touch the same `.then()` blocks)*
- **R13** — Trivial getter/setter evaluation *(after R10/R11 since they use the getters)*

### Batch 5 (architectural)
- **R14** — `RequestContext` typed object *(requires R01, R12 to be clean first; incremental migration)*

---

## Risk Summary

| Risk Level | Count | Refactorings |
|------------|-------|-------------|
| Low | 10 | R01–R08, R12, R15 |
| Medium | 4 | R09, R10, R11, R13 |
| High | 1 | R14 |

**Mitigation for High-Risk R14:**
- Apply incrementally: one API function per commit.
- Add dual-mode support in `_apiRequest` during migration (accept both plain object and `RequestContext`).
- The existing test suite (mock server) provides regression coverage for each converted function.
- No external API surface change: callers pass `data` arguments unchanged; only internal plumbing changes.

---

## SOLID Principle Impact Assessment

| Principle | Current Score | Post-Refactoring Score | Key Changes |
|-----------|--------------|----------------------|-------------|
| S — Single Responsibility | 7/10 | 8/10 | R09, R10 separate auth concerns; R14 separates request-building from request-execution |
| O — Open/Closed | 6/10 | 8/10 | R09 endpoint map makes new environments addable without modifying auth functions |
| L — Liskov Substitution | 9/10 | 9/10 | No change |
| I — Interface Segregation | 8/10 | 8/10 | R03/R04 clarify Record's public interface |
| D — Dependency Inversion | 6/10 | 7/10 | R14 introduces `RequestContext` abstraction between api.js and http.js |

---

## Refactoring Technique Catalog Summary

| Technique | Applied In |
|-----------|-----------|
| Extract Method (1.1) | R01, R07 partial, R09, R12 |
| Replace Constructor with Factory Method (5.12) | R02 |
| Rename Method (5.1) | R03, R04 |
| Replace Magic Number with Symbolic Constant (3.11) | R05, R15 |
| (Style normalization) | R06 |
| Consolidate Conditional Expression (4.2) | R09 |
| Replace Parameter with Explicit Methods (5.6) | R10 |
| Remove Parameter (5.3) | R10 |
| Separate Query from Modifier (5.4) | R11 |
| Remove Middle Man (2.6) | R13 |
| Inline Method (1.2) | R13 |
| Introduce Parameter Object (5.9) | R14 |
| Replace Data Value with Object (3.2) | R14 |

---

*Companion files: `code-refactoring-summary.md` (high-level overview) and `refactoring-expert-data.json` (machine-readable)*
