# Code Refactoring Report — nforce8

## Executive Summary

**Project**: nforce8 — Salesforce REST API wrapper for Node.js
**Report Date**: 2026-03-23
**Based on**: code-smell-detector-report.md + direct source validation
**Source Files Examined**: 9 files (1,737 lines)
**Test Coverage**: 82 tests, all passing

Three runtime bugs identified by the smell detector have already been applied to the codebase:
- `util.js:3` — `key.toLowerCase` corrected to `key.toLowerCase()`
- `util.js:42` — `for...in` corrected to `for...of` on the flavors array
- `index.js:971` — `res.txt()` corrected to `res.text()`

**One confirmed runtime defect remains unpatched**: the broken auto-refresh promise chain in `unsucessfullResponseCheck` (ARCH-1 below).

This report covers **20 refactoring recommendations** across four phases, ordered from safest/highest-impact to most complex/highest-payoff. Each recommendation maps precisely to one or more techniques from the refactoring catalog and includes before/after guidance, risk assessment, and sequencing rationale.

---

## Validated Findings by Severity

The smell detector identified 29 issues. Validation against the current source confirms:

| Issue | Status | Action |
|---|---|---|
| BUG-1 util.js toLowerCase() | Fixed | Confirmed — no action needed |
| BUG-2 res.txt() | Fixed | Confirmed — no action needed |
| MD-6 for...in on array | Fixed | Confirmed — no action needed |
| ARCH-1 Broken auto-refresh | **OPEN** | Refactoring R-04 required |
| All other smells | Open | Addressed by R-01 through R-20 |

---

## Refactoring Recommendations

---

### R-01 — Fix Dead Code and Logic Bug in `search()`

**Smell**: MD-7 — Dead Code / Logic Bug
**File**: `index.js`, lines 680–697
**Technique**: Substitute Algorithm + Remove Dead Code
**Priority**: High
**Effort**: 30 minutes
**Risk**: Low — change is isolated, covered by existing tests

**Problem**: The `search()` method builds a `recs` array of `Record` instances but resolves with the original raw `resp` instead. The Record-wrapping work is entirely wasted. This is simultaneously dead code (the array is built but never returned) and a behavior bug (the `raw: false` path never returns `Record` objects as documented).

```javascript
// BEFORE: index.js lines 685-694
const result = new Promise((resolve, reject) => {
  this._apiRequest(opts)
    .then((resp) => {
      if (opts.raw || !resp.length) {
        resolve(resp);
      } else {
        let recs = [];
        resp.forEach(function (r) {
          recs.push(new Record(r));
        });
        resolve(resp);  // BUG: resolves resp, not recs
      }
    })
    .catch((err) => reject(err));
});
```

**After (combined with R-05 promise anti-pattern fix)**:
```javascript
// AFTER: direct chain, correct resolve target
Connection.prototype.search = function (data) {
  const opts = this._getOpts(data, null, {
    singleProp: 'search',
    defaults: { raw: false }
  });
  opts.resource = '/search';
  opts.method = 'GET';
  opts.qs = { q: opts.search };

  return this._apiRequest(opts).then((resp) => {
    if (opts.raw || !resp.length) return resp;
    return resp.map((r) => new Record(r));
  });
};
```

**Sequencing note**: Combine this with R-05 (Promise anti-pattern elimination) to avoid touching the same method twice.

---

### R-02 — Use `Record.setId()` Instead of Bypassing Encapsulation

**Smell**: GRASP-1 — Information Expert Violation / Feature Envy
**File**: `index.js`, lines 949–961 (`addSObjectAndId` function)
**Technique**: Move Method (use existing API) + Encapsulate Field
**Priority**: High
**Effort**: 15 minutes
**Risk**: Low

**Problem**: `addSObjectAndId` reaches into `sobject._fields.id` directly, bypassing the `Record.setId()` method that already exists. This violates the Information Expert principle and skips the change-tracking system — after an insert, the `id` field is not reflected in `_changed`.

```javascript
// BEFORE: index.js:956-957
if (body && typeof body === 'object' && body.id) {
  sobject._fields.id = body.id;  // direct field access, bypasses setId()
}
```

```javascript
// AFTER: use the public API
if (body && typeof body === 'object' && body.id) {
  sobject.setId(body.id);  // respects encapsulation and change tracking
}
```

**Mechanics**:
1. Open `index.js` and locate the `addSObjectAndId` function (line 949)
2. Replace `sobject._fields.id = body.id` with `sobject.setId(body.id)`
3. Run tests to confirm no regression

---

### R-03 — Extract Multipart Type Set to a Named Constant

**Smell**: LOW-3 — Magic String Literals (duplicated type comparison)
**File**: `index.js` lines 433–437 and 451–455; `lib/constants.js`
**Technique**: Replace Magic Number with Symbolic Constant + Consolidate Duplicate Conditional Fragments
**Priority**: High
**Effort**: 20 minutes
**Risk**: Low

**Problem**: The multipart-eligible type check is duplicated identically in `insert()` and `update()`. Adding a new binary-capable SObject type requires finding and updating both places, and any inconsistency creates a latent bug.

```javascript
// BEFORE: duplicated in both insert() and update()
if (
  type === 'document' ||
  type === 'attachment' ||
  type === 'contentversion'
) {
  opts.multipart = multipart(opts);
}
```

**After**:

Step 1 — Add to `lib/constants.js`:
```javascript
// Add after existing constants
const MULTIPART_TYPES = ['document', 'attachment', 'contentversion'];
```

And add to the `constants` export object:
```javascript
MULTIPART_TYPES: MULTIPART_TYPES,
```

Step 2 — Update `index.js` (import already brings in `CONST`):
```javascript
// In both insert() and update():
if (CONST.MULTIPART_TYPES.includes(type)) {
  opts.multipart = multipart(opts);
}
```

---

### R-04 — Fix Broken Auto-Refresh Promise Chain

**Smell**: ARCH-1 — Broken Promise Chain / Functional Abuser
**File**: `index.js`, lines 963–1014 (`unsucessfullResponseCheck`)
**Technique**: Replace Error Code with Exception + Separate Query from Modifier
**Priority**: High
**Effort**: 2–3 hours
**Risk**: Medium — touches the core HTTP dispatch path; requires integration test

**Problem**: `unsucessfullResponseCheck` is a synchronous function in a `.then()` chain. When auto-refresh is needed, it launches an async promise but does not return it — the outer chain cannot await it. The function then falls through and returns the original failed `res`, so the request "succeeds" with a failure response. The `autoRefresh: true` feature is silently non-functional.

```javascript
// BEFORE: index.js:963-1014 — auto-refresh fires and forgets
function unsucessfullResponseCheck(res, self, opts) {
  if (res.ok) return res;
  // ...error construction...
  if (e.errorCode === 'INVALID_SESSION_ID' && self.autoRefresh === true && ...) {
    // NOT returned — this promise is fire-and-forget
    Connection.prototype.autoRefreshToken.call(self, opts).then(...);
  } else {
    throw e;
  }
  return res;  // always returns original failed response
}
```

**After** — restructure `_apiRequest` to handle auto-refresh at the call site:

```javascript
// Rename the check function to be purely a guard (no async side effects)
function handleFailedResponse(res, self, opts) {
  if (res.ok) return res;

  const e = new Error();
  e.statusCode = res.status;

  return (util.isJsonResponse(res) ? res.json() : res.text()).then((body) => {
    if (Array.isArray(body) && body.length > 0) {
      e.message = body[0].message;
      e.errorCode = body[0].errorCode;
      e.body = body;
    } else if (typeof body === 'string') {
      e.message = body;
      e.errorCode = body;
      e.body = body;
    } else {
      e.message = 'Salesforce returned an unrecognized error ' + res.status;
      e.body = body;
    }

    const canAutoRefresh =
      e.errorCode &&
      (e.errorCode === 'INVALID_SESSION_ID' || e.errorCode === 'Bad_OAuth_Token') &&
      self.autoRefresh === true &&
      (opts.oauth.refresh_token || (self.getUsername() && self.getPassword())) &&
      !opts._retryCount;

    if (canAutoRefresh) {
      return Connection.prototype.autoRefreshToken.call(self, opts).then((refreshResult) => {
        opts._refreshResult = refreshResult;
        opts._retryCount = 1;
        return Connection.prototype._apiRequest.call(self, opts);
      });
    }

    throw e;
  });
}

// In _apiRequest — chain becomes fully async:
Connection.prototype._apiRequest = function (opts) {
  const self = this;
  const ropts = optionHelper.getApiRequestOptions(opts);
  const uri = optionHelper.getFullUri(ropts);
  const sobject = opts.sobject;

  return fetch(uri, ropts)
    .then((res) => responseFailureCheck(res))
    .then((res) => handleFailedResponse(res, self, ropts))
    .then((res) => (util.isJsonResponse(res) ? res.json() : res.text()))
    .then((body) => addSObjectAndId(body, sobject));
};
```

**Mechanics**:
1. Rename `unsucessfullResponseCheck` to `handleFailedResponse` (fixes the typo, rename method)
2. Rewrite it to return a Promise by calling `res.json()` / `res.text()` and chaining
3. Update `_apiRequest` to remove the `new Promise` wrapper and chain directly
4. Remove the outer `try/catch` wrapper — the native promise chain propagates errors correctly
5. Add an integration test that exercises the `INVALID_SESSION_ID` auto-refresh path

**Sequencing note**: This subsumes R-05 for the `_apiRequest` method. Do R-04 first for that method.

---

### R-05 — Eliminate All Eight Promise Constructor Anti-Patterns

**Smell**: MD-1 — Promise Constructor Anti-Pattern (Deferred Anti-Pattern)
**Files**: `index.js`, lines 233, 300, 498, 614, 680, 822, 860, 906
**Technique**: Inline Method + Replace Temp with Query
**Priority**: High
**Effort**: 2–3 hours (across all occurrences)
**Risk**: Low — mechanical transformation with no behavior change

**Problem**: Eight methods wrap already-Promise-returning functions inside `new Promise()`. This is the "explicit promise construction anti-pattern" (also known as the deferred anti-pattern). It swallows synchronous exceptions thrown inside `.then()` handlers and adds an unnecessary microtask tick. It also prevents proper error propagation from async operations.

**Pattern to eliminate**:
```javascript
// BEFORE — anti-pattern
const result = new Promise((resolve, reject) => {
  this._apiRequest(opts)
    .then((resp) => { resolve(resp); })
    .catch((err) => reject(err));
});
return result;
```

```javascript
// AFTER — direct chain
return this._apiRequest(opts)
  .then((resp) => resp);  // or inline transform if needed
```

**Affected methods and their specific transforms**:

**`authenticate` (line 233)** — also has a `try/catch` wrapper that was needed for the anti-pattern but is unnecessary with native chaining:
```javascript
// AFTER
return this._apiAuthRequest(opts).then((res) => {
  const old = { ...opts.oauth };
  Object.assign(opts.oauth, res);
  if (opts.assertion) opts.oauth.assertion = opts.assertion;
  return this._resolveWithRefresh(opts, old);  // see R-06
});
```

**`refreshToken` (line 300)**:
```javascript
// AFTER
return this._apiAuthRequest(opts).then((res) => {
  const old = { ...opts.oauth };
  Object.assign(opts.oauth, res);
  if (opts.assertion) opts.oauth.assertion = opts.assertion;
  return this._resolveWithRefresh(opts, old);  // see R-06
});
```

**`getRecord` (line 498)**:
```javascript
// AFTER
return this._apiRequest(opts).then((resp) => {
  if (!opts.raw) {
    resp = new Record(resp);
    resp._reset();
  }
  return resp;
});
```

**`_queryHandler` (line 614)**:
```javascript
// AFTER — self is already available via closure
return this._apiRequest(opts).then(function handleResponse(respCandidate) {
  const resp = respToJson(respCandidate);
  if (resp.records && resp.records.length > 0) {
    resp.records.forEach((r) => {
      recs.push(opts.raw ? r : (() => { const rec = new Record(r); rec._reset(); return rec; })());
    });
  }
  if (opts.fetchAll && resp.nextRecordsUrl) {
    return self.getUrl({ url: resp.nextRecordsUrl, oauth: opts.oauth })
      .then(handleResponse);
  }
  resp.records = recs;
  return resp;
});
```

**`search` (line 680)**: Covered by R-01.

**`autoRefreshToken` (line 822)**:
```javascript
// AFTER
Connection.prototype.autoRefreshToken = function (data) {
  const opts = this._getOpts(data, null, { defaults: { executeOnRefresh: true } });
  const refreshOpts = { oauth: opts.oauth, executeOnRefresh: opts.executeOnRefresh };

  if (opts.oauth.refresh_token) {
    return Connection.prototype.refreshToken.call(this, refreshOpts);
  }
  return Connection.prototype.authenticate.call(this, refreshOpts);
};
```

**`_apiAuthRequest` (line 860)**: Keep the `try/catch` wrapper only if you need to catch synchronous `fetch` throws — but since Node 22 `fetch` is a global Promise-based API that does not throw synchronously, it can be simplified:
```javascript
// AFTER
Connection.prototype._apiAuthRequest = function (opts) {
  if (this.timeout) opts.timeout = this.timeout;
  if (opts.requestOpts) Object.assign(opts, opts.requestOpts);
  const uri = opts.uri;

  return fetch(uri, opts)
    .then((res) => {
      if (!res) throw errors.emptyResponse();
      if (!res.ok) {
        const err = new Error('Fetch failed: ' + res.statusText);
        err.statusCode = res.status;
        throw err;
      }
      return res.json();
    })
    .then((jBody) => {
      if (jBody.access_token && this.mode === 'single') {
        this.oauth = jBody;
      }
      return jBody;
    });
};
```

**`_apiRequest` (line 906)**: Covered by R-04.

**Mechanics (apply per method)**:
1. Remove the `new Promise((resolve, reject) => {` wrapper and closing `})`
2. Replace `resolve(x)` calls with `return x`
3. Replace `.catch((err) => reject(err))` by letting errors propagate naturally
4. Remove any enclosing `try/catch` added specifically to catch errors for `reject()`
5. Run tests after each method transformation

---

### R-06 — Extract `_resolveWithRefresh` to Eliminate Duplicated onRefresh Block

**Smell**: MD-4 — Duplicated Code (onRefresh callback block)
**File**: `index.js`, lines 242–257 and 308–320
**Technique**: Extract Method
**Priority**: High
**Effort**: 45 minutes
**Risk**: Low

**Problem**: The block that calls `self.onRefresh` is copy-pasted identically in both `authenticate()` and `refreshToken()`. The existing `// TODO: remove callback from onRefresh call` comment in the source acknowledges this as design debt. Any change to the onRefresh callback contract requires updating two places.

```javascript
// BEFORE: identical block in both methods
if (self.onRefresh && opts.executeOnRefresh === true) {
  self.onRefresh.call(self, opts.oauth, old, function (err3) {
    if (err3) {
      reject(err3);
    } else {
      resolve(opts.oauth);
    }
  });
} else {
  resolve(opts.oauth);
}
```

**After** — extract to a private helper that returns a Promise (fully compatible with R-05):

```javascript
// New private method on Connection.prototype
Connection.prototype._resolveWithRefresh = function (opts, oldOauth) {
  if (this.onRefresh && opts.executeOnRefresh === true) {
    return new Promise((resolve, reject) => {
      this.onRefresh.call(this, opts.oauth, oldOauth, (err) => {
        if (err) reject(err);
        else resolve(opts.oauth);
      });
    });
  }
  return Promise.resolve(opts.oauth);
};
```

Both `authenticate` and `refreshToken` then call:
```javascript
return this._resolveWithRefresh(opts, old);
```

**Note**: This is the one location where `new Promise()` remains justified — it wraps a legacy callback API (`onRefresh`) that the TODO comment acknowledges should eventually be promisified. Once `onRefresh` is updated to return a Promise, this wrapper can be removed.

---

### R-07 — Parameterize the Four URL Helper Methods

**Smell**: MD-2 — Duplicated Code (URL construction pattern)
**File**: `index.js`, lines 707–747
**Technique**: Parameterize Method
**Priority**: Medium
**Effort**: 45 minutes
**Risk**: Low — all four methods delegate to `_apiRequest`; public API preserved

**Problem**: `getUrl`, `putUrl`, `postUrl`, and `deleteUrl` are structurally identical, differing only in the HTTP method and whether the body is serialized.

```javascript
// BEFORE: four nearly-identical methods
Connection.prototype.getUrl = function (data) {
  let opts = this._getOpts(data, null, { singleProp: 'url' });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = 'GET';
  return this._apiRequest(opts);
};
// putUrl, postUrl, deleteUrl follow the same pattern
```

**After** — extract a private helper, keep public API unchanged:

```javascript
// Private helper
Connection.prototype._urlRequest = function (data, method) {
  const opts = this._getOpts(data, null, { singleProp: 'url' });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = method;
  if (opts.body && (method === 'PUT' || method === 'POST')) {
    opts.body = JSON.stringify(opts.body);
  }
  return this._apiRequest(opts);
};

// Public methods become thin wrappers — same external interface
Connection.prototype.getUrl = function (data) { return this._urlRequest(data, 'GET'); };
Connection.prototype.putUrl = function (data) { return this._urlRequest(data, 'PUT'); };
Connection.prototype.postUrl = function (data) { return this._urlRequest(data, 'POST'); };
Connection.prototype.deleteUrl = function (data) { return this._urlRequest(data, 'DELETE'); };
```

**Mechanics**:
1. Write the `_urlRequest` helper
2. Replace each public method body with the one-liner delegation
3. Run tests — the public interface is identical so all existing tests pass unchanged

---

### R-08 — Parameterize the Four Blob Retrieval Methods

**Smell**: MD-3 — Duplicated Code (blob method pattern)
**File**: `index.js`, lines 534–568
**Technique**: Parameterize Method
**Priority**: Medium
**Effort**: 30 minutes
**Risk**: Low

**Problem**: `getAttachmentBody`, `getDocumentBody`, `getContentVersionBody`, and `getContentVersionData` are structurally identical — only the resource path differs.

```javascript
// BEFORE: pattern repeated four times
Connection.prototype.getAttachmentBody = function (data) {
  let opts = this._getOpts(data);
  let id = opts.sobject ? util.findId(opts.sobject) : opts.id;
  opts.resource = '/sobjects/attachment/' + id + '/body';
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};
```

**After**:

```javascript
// Private helper
Connection.prototype._getBlobResource = function (data, sobjectType, suffix) {
  const opts = this._getOpts(data);
  const id = opts.sobject ? util.findId(opts.sobject) : opts.id;
  opts.resource = '/sobjects/' + sobjectType + '/' + id + '/' + suffix;
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};

// Public methods delegate
Connection.prototype.getAttachmentBody = function (data) {
  return this._getBlobResource(data, 'attachment', 'body');
};
Connection.prototype.getDocumentBody = function (data) {
  return this._getBlobResource(data, 'document', 'body');
};
Connection.prototype.getContentVersionBody = function (data) {
  return this._getBlobResource(data, 'contentversion', 'body');
};
Connection.prototype.getContentVersionData = function (data) {
  return this._getBlobResource(data, 'contentversion', 'versiondata');
};
```

---

### R-09 — Replace `apexRest` Direct `data` Access with `opts`

**Smell**: MD-9 — Inconsistent Style / Potential Null Dereference
**File**: `index.js`, line 761
**Technique**: Rename Method (use correct variable) + Inline Temp
**Priority**: Medium
**Effort**: 10 minutes
**Risk**: Low

**Problem**: `apexRest` calls `this._getOpts(data, null, { singleProp: 'uri' })` which normalizes input into `opts`, but then accesses `data.uri` directly instead of `opts.uri`. If `data` is passed as a plain string (which `singleProp` is designed to support), `data.uri` is `undefined` and `.substring()` throws.

```javascript
// BEFORE
Connection.prototype.apexRest = function (data) {
  let opts = this._getOpts(data, null, { singleProp: 'uri' });
  opts.uri =
    opts.oauth.instance_url +
    '/services/apexrest/' +
    (data.uri.substring(0, 1) === '/'   // accesses 'data', not 'opts'
      ? data.uri.substring(1)
      : data.uri);
```

```javascript
// AFTER
Connection.prototype.apexRest = function (data) {
  const opts = this._getOpts(data, null, { singleProp: 'uri' });
  const relativeUri = opts.uri.startsWith('/') ? opts.uri.slice(1) : opts.uri;
  opts.uri = opts.oauth.instance_url + '/services/apexrest/' + relativeUri;
  opts.method = opts.method || 'GET';
  if (opts.urlParams) opts.qs = opts.urlParams;
  return this._apiRequest(opts);
};
```

---

### R-10 — Fix `_queryHandler` Double `_getOpts` Call

**Smell**: MD-8 — Redundant Processing
**File**: `index.js`, lines 598–601
**Technique**: Inline Temp
**Priority**: Medium
**Effort**: 15 minutes
**Risk**: Low

**Problem**: `query()` and `queryAll()` both call `this._getOpts(data, ...)` and pass the result as `data` to `_queryHandler`. `_queryHandler` then calls `this._getOpts(data)` again on the already-processed opts object. This is wasteful and creates a maintenance trap.

```javascript
// BEFORE: _queryHandler re-processes already-processed opts
Connection.prototype._queryHandler = function (data) {
  const opts = this._getOpts(data);  // data is already an opts object
```

**After** — remove the redundant call:

```javascript
// AFTER: _queryHandler receives opts directly
Connection.prototype._queryHandler = function (opts) {
  const self = this;
  const recs = [];

  opts.method = 'GET';
  opts.resource = '/query';
  if (opts.includeDeleted) opts.resource += 'All';
  opts.qs = { q: opts.query };

  return this._apiRequest(opts).then(function handleResponse(respCandidate) {
    // ... (see R-05 for promise chain)
  });
};
```

Callers (`query()` and `queryAll()`) are already passing `opts`, so no change needed there.

---

### R-11 — Normalize `==` to `===` for Environment Comparisons

**Smell**: MD-5 — Inconsistent Style / Obfuscator
**File**: `index.js`, lines 184, 197, 271; `lib/fdcstream.js`, line 69
**Technique**: Substitute Algorithm (style normalization)
**Priority**: Medium
**Effort**: 10 minutes
**Risk**: Low — validated strings; no runtime difference, but avoids future surprises

```javascript
// BEFORE: index.js:184
} else if (self.environment == 'sandbox') {

// AFTER
} else if (self.environment === 'sandbox') {
```

Same pattern for lines 197 and 271 in `index.js`, and line 69 in `lib/fdcstream.js`:
```javascript
// BEFORE: fdcstream.js:69
if (message.ext && message.ext['replay'] == true) {

// AFTER
if (message.ext && message.ext['replay'] === true) {
```

---

### R-12 — Standardize `opts` Variable Declaration to `const`

**Smell**: MD-10 — Inconsistent Style
**File**: `index.js`, throughout
**Technique**: Substitute Algorithm (style normalization)
**Priority**: Low
**Effort**: 30 minutes
**Risk**: Low

**Problem**: Approximately half the methods use `let opts` and half use `const opts`. Since `opts` is never reassigned (only mutated via property addition), `const` is semantically correct everywhere. Inconsistency makes the codebase harder to read and creates false impressions about reassignment intent.

**Mechanics**: Replace all `let opts = this._getOpts(...)` with `const opts = this._getOpts(...)` throughout `index.js`. This is a safe, mechanical change that IDEs can perform automatically.

---

### R-13 — Fix `getVersions` Hardcoded URL

**Smell**: MD-11 — Magic Number / Hardcoded URL / Wrong Protocol
**File**: `index.js`, line 377
**Technique**: Replace Magic Number with Symbolic Constant + Move Method
**Priority**: Medium
**Effort**: 20 minutes
**Risk**: Low — currently broken for most orgs anyway

**Problem**: `getVersions` uses `http://na1.salesforce.com/services/data/` — an insecure protocol pointing to a specific legacy pod. This method is effectively non-functional for most Salesforce orgs.

```javascript
// BEFORE
Connection.prototype.getVersions = function () {
  let opts = this._getOpts(null);
  opts.uri = 'http://na1.salesforce.com/services/data/';  // HTTP, hardcoded pod
  opts.method = 'GET';
  return this._apiAuthRequest(opts);
};
```

```javascript
// AFTER: use instance_url from connection options (requires oauth to be set)
Connection.prototype.getVersions = function (data) {
  const opts = this._getOpts(data);
  opts.uri = opts.oauth.instance_url + '/services/data/';
  opts.method = 'GET';
  return this._apiAuthRequest(opts);
};
```

**Note**: If the intent is to get versions without authentication (a public endpoint), the correct URL is `https://login.salesforce.com/services/data/` (production) or `https://test.salesforce.com/services/data/` (sandbox). Add a constant to `constants.js`:
```javascript
const VERSIONS_URI = 'https://login.salesforce.com/services/data/';
const TEST_VERSIONS_URI = 'https://test.salesforce.com/services/data/';
```

---

### R-14 — Remove Redundant `toLowerCase()` in `Record` Constructor

**Smell**: LOW-6 — Redundant Code
**File**: `lib/record.js`, lines 9 and 11
**Technique**: Inline Temp
**Priority**: Low
**Effort**: 5 minutes
**Risk**: Low

```javascript
// BEFORE: key.toLowerCase() called twice
this._fields = Object.entries(data).reduce(function (result, [key, val]) {
  key = key.toLowerCase();           // line 9: lowercased here
  if (key !== 'attributes' && key !== 'attachment') {
    result[key.toLowerCase()] = val; // line 11: lowercased AGAIN — redundant
```

```javascript
// AFTER: single toLowerCase call
this._fields = Object.entries(data).reduce(function (result, [key, val]) {
  key = key.toLowerCase();
  if (key !== 'attributes' && key !== 'attachment') {
    result[key] = val;  // key is already lowercase
```

---

### R-15 — Remove Unused `self` Variables

**Smell**: LOW-7 — Dead Code / Unnecessary ES5 Closure Pattern
**File**: `index.js`, lines 773 and 785; `lib/record.js` line 2, `lib/fdcstream.js` line 7
**Technique**: Inline Temp + Remove Assignments to Parameters
**Priority**: Low
**Effort**: 15 minutes
**Risk**: Low

In `createStreamClient` and `subscribe`, `let self = this` is assigned but `this` is never reassigned — these are not nested callbacks that require a closure over `this`. Arrow functions or direct `this` access suffice.

```javascript
// BEFORE: index.js:773-774
Connection.prototype.createStreamClient = function (data) {
  let self = this;
  let opts = this._getOpts(data, null, {
    defaults: {
      apiVersion: self.apiVersion,  // self.apiVersion === this.apiVersion
```

```javascript
// AFTER
Connection.prototype.createStreamClient = function (data) {
  const opts = this._getOpts(data, null, {
    defaults: {
      apiVersion: this.apiVersion,
```

Same pattern in `subscribe` at line 785: remove `let self = this`, replace `self.apiVersion` with `this.apiVersion`.

**Note**: `self` in `lib/record.js` is legitimately needed for the `forEach` callback closure. `self` in `lib/fdcstream.js` is needed for Faye event handler callbacks. Only the `createStreamClient` and `subscribe` occurrences in `index.js` are unnecessary.

---

### R-16 — Fix Boolean Simplification in `multipart.js`

**Smell**: LOW — Unnecessary Ternary for Boolean Assignment
**File**: `lib/multipart.js`, line 8
**Technique**: Substitute Algorithm
**Priority**: Low
**Effort**: 5 minutes
**Risk**: Low

```javascript
// BEFORE
let isPatch = opts.method === 'PATCH' ? true : false;

// AFTER
const isPatch = opts.method === 'PATCH';
```

---

### R-17 — Tighten API Version Validation Regex

**Smell**: LOW-9 — Complicated Boolean Expression / Incorrect Validation
**File**: `lib/connection.js`, lines 41–43
**Technique**: Substitute Algorithm
**Priority**: Low
**Effort**: 10 minutes
**Risk**: Low

**Problem**: The current `apiMatch` function accepts both `v54` and `v54.0` as valid API versions, but the Salesforce convention is always `vNN.0`. The numeric check via `Number.isInteger(Number(...))` has this gap.

```javascript
// BEFORE
const apiMatch = (apiVersion) =>
  apiVersion.substring(0, 1) === 'v' &&
  Number.isInteger(Number(apiVersion.substring(1)));
```

```javascript
// AFTER: explicit regex enforces vNN.0 format exactly
const apiMatch = (apiVersion) => /^v\d+\.0$/.test(apiVersion);
```

---

### R-18 — Remove Dead Error Factories from `errors.js`

**Smell**: LOW-8 — Dead Code / Incomplete Library Class
**File**: `lib/errors.js`
**Technique**: Remove Dead Code + Extract Subclass (future)
**Priority**: Low
**Effort**: 20 minutes (removal) / 2 hours (full subclass promotion)
**Risk**: Low

**Problem**: `nonJsonResponse` and `invalidJson` are defined in `errors.js` but never called anywhere in the source. They represent unfinished error handling.

**Immediate action** (safe):
1. Verify with a global search that `nonJsonResponse` and `invalidJson` are indeed unused
2. Remove the two dead factory functions from `errors.js`
3. Update `module.exports` accordingly

**Future improvement** (separate ticket): Convert the remaining `emptyResponse` factory and all inline `new Error()` calls to proper Error subclasses:

```javascript
// Future: proper Error subclasses enable instanceof checks and structured error data
class SalesforceError extends Error {
  constructor(message, statusCode, errorCode, body) {
    super(message);
    this.name = 'SalesforceError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.body = body;
  }
}

class EmptyResponseError extends SalesforceError {
  constructor() {
    super('Unexpected empty response', null, 'EMPTY_RESPONSE', null);
    this.name = 'EmptyResponseError';
  }
}
```

---

### R-19 — Resolve Dead ES6 Connection Class in `lib/connection.js`

**Smell**: SRP-2 — Dead Code / Abandoned Architectural Refactoring
**File**: `lib/connection.js`, lines 5–18
**Technique**: Inline Class (immediate) or Extract Superclass (long-term via R-20)
**Priority**: Medium
**Effort**: 30 minutes (dead code removal) / see R-20 for full migration
**Risk**: Low (removal) / High (migration)

**Problem**: `lib/connection.js` exports a `Connection` ES6 class that is never instantiated. `index.js` imports only `validateConnectionOptions` from it. The `Connection` class body (`oauth`, `username`, `password`, `securityToken` fields plus constructor) is dead code that misleads contributors.

**Immediate action**: Remove the dead class from `lib/connection.js`, retaining only the validation helpers:

```javascript
// lib/connection.js — after cleanup
'use strict';
const CONST = require('./constants');
const util = require('./util');

const optionTest = (testFunction, testVar, errorText) => { ... };
const optionTestIfPresent = (testFunction, testVar, errorText) => { ... };
const stringAndArray = (arr) => { ... };
const apiMatch = (apiVersion) => /^v\d+\.0$/.test(apiVersion);  // see R-17
const validateConnectionOptions = (con) => { ... };

module.exports = { validateConnectionOptions };
// Remove: Connection class export (it was never used)
```

**Long-term**: The class is the start of R-20's architectural migration. Rather than deleting it permanently, the preferred path is to grow it into the real `Connection` class (see R-20).

---

### R-20 — Complete ES6 Class Migration and Decompose the God Object

**Smell**: SRP-1 / GRASP-2 — God Object / Large Class / Divergent Change
**File**: `index.js` (entire file)
**Technique**: Extract Class + Extract Superclass + Move Method
**Priority**: High impact, High complexity
**Effort**: 1–2 weeks (multi-phase, feature-flag recommended)
**Risk**: High — requires comprehensive test coverage at each step

**Problem**: The `Connection` constructor function in `index.js` holds 44 prototype methods across 7 distinct functional domains. Every feature change requires editing `index.js`. Unit testing any single capability loads the entire 1,082-line file. The `TODO: turn into ES6 class` comment at line 23 confirms this has been the intended direction.

**Recommended decomposition**:

| Module | Methods | Lines (approx.) |
|---|---|---|
| `lib/http.js` | `_apiRequest`, `_apiAuthRequest`, response helpers | ~120 |
| `lib/auth.js` | `authenticate`, `refreshToken`, `revokeToken`, `autoRefreshToken`, `getAuthUri`, `getPasswordStatus`, `updatePassword`, `getIdentity` | ~200 |
| `lib/crud.js` | `insert`, `update`, `upsert`, `delete`, `getRecord` | ~80 |
| `lib/query.js` | `query`, `queryAll`, `_queryHandler`, `search` | ~100 |
| `lib/metadata.js` | `getVersions`, `getResources`, `getSObjects`, `getMetadata`, `getDescribe`, `getLimits` | ~70 |
| `lib/blob.js` | `getBody`, `getAttachmentBody`, `getDocumentBody`, `getContentVersionBody`, `getContentVersionData` | ~60 |
| `lib/streaming.js` | `createStreamClient`, `subscribe`, `stream` | ~40 |
| `lib/urlhelper.js` | `getUrl`, `putUrl`, `postUrl`, `deleteUrl`, `apexRest` | ~50 |

**Migration mechanics** (incremental, test after each step):

1. **Complete the ES6 class** in `lib/connection.js` — add the plugin loading logic and getters/setters from `index.js`. Make `index.js` import and use it.

2. **Extract HTTP layer** — move `_apiRequest`, `_apiAuthRequest`, `responseFailureCheck`, and `handleFailedResponse` (see R-04) to `lib/http.js`. The `Connection` class accepts an `HttpClient` dependency or extends/mixes in the http module.

3. **Extract Auth service** — move auth methods to `lib/auth.js`. These methods need access to `this` (Connection properties), so they become instance methods on a mixin or a dedicated `AuthService` class that holds a reference to the connection.

4. **Extract remaining domain modules** one at a time, following the table above.

5. **Update `index.js`** to be a thin entry point that wires up the modules and re-exports the public API — preserving backward compatibility.

**Pattern for service extraction** (using mixins to preserve `this` binding):

```javascript
// lib/auth.js
const authMixin = (Base) => class extends Base {
  authenticate(data) { ... }
  refreshToken(data) { ... }
  // ...
};
module.exports = authMixin;

// lib/connection.js
const authMixin = require('./auth');
const crudMixin = require('./crud');

class Connection extends authMixin(crudMixin(BaseConnection)) {
  // ...
}
```

**Alternative**: Use object composition via `Object.assign(Connection.prototype, authMethods)` to avoid the mixin inheritance chain complexity. This has the same behavioral result with lower risk.

**Plugin system**: Move the module-level `plugins` registry into `Connection` instances:

```javascript
// BEFORE: module-level shared state
const plugins = {};

// AFTER: per-instance registry
class Connection {
  constructor(opts) {
    this._plugins = {};
    // ...
  }
}
```

Update `plugin()` and the Connection plugin loading accordingly. This eliminates cross-test contamination from the shared registry.

---

## Risk Assessment Summary

| Recommendation | Risk | Effort | Impact |
|---|---|---|---|
| R-01 Fix search() dead code | Low | 30 min | High |
| R-02 Use setId() | Low | 15 min | High |
| R-03 MULTIPART_TYPES constant | Low | 20 min | Medium |
| R-04 Fix auto-refresh promise | Medium | 2–3 h | High |
| R-05 Eliminate Promise anti-patterns | Low | 2–3 h | High |
| R-06 Extract _resolveWithRefresh | Low | 45 min | Medium |
| R-07 Parameterize URL methods | Low | 45 min | Medium |
| R-08 Parameterize blob methods | Low | 30 min | Medium |
| R-09 Fix apexRest data access | Low | 10 min | Medium |
| R-10 Fix _queryHandler double _getOpts | Low | 15 min | Low |
| R-11 Normalize == to === | Low | 10 min | Low |
| R-12 Standardize let/const | Low | 30 min | Low |
| R-13 Fix getVersions URL | Low | 20 min | Medium |
| R-14 Remove redundant toLowerCase | Low | 5 min | Low |
| R-15 Remove unused self variables | Low | 15 min | Low |
| R-16 Fix boolean ternary | Low | 5 min | Low |
| R-17 Fix apiMatch regex | Low | 10 min | Low |
| R-18 Remove dead error factories | Low | 20 min | Low |
| R-19 Resolve dead ES6 Connection class | Low | 30 min | Medium |
| R-20 God Object decomposition | High | 1–2 wks | High |

---

## Recommended Implementation Sequence

### Phase 1 — Correctness (complete before anything else)

These are behavioral fixes. They do not change the public API.

1. **R-02** — Use `setId()` (5 minutes, zero risk)
2. **R-01** — Fix `search()` dead code (30 minutes, adds correct Record wrapping)
3. **R-04** — Fix auto-refresh promise chain (2–3 hours — the only remaining runtime defect)

### Phase 2 — Code Quality Quick Wins (1 day)

4. **R-03** — Extract `MULTIPART_TYPES` constant
5. **R-09** — Fix `apexRest` `data` vs `opts` access
6. **R-11** — Normalize `==` to `===`
7. **R-12** — Standardize `let`/`const` for opts
8. **R-13** — Fix `getVersions` URL
9. **R-14** — Remove redundant `toLowerCase()`
10. **R-15** — Remove unused `self` variables
11. **R-16** — Fix boolean ternary in `multipart.js`
12. **R-17** — Fix `apiMatch` regex
13. **R-18** — Remove dead error factories
14. **R-19** — Remove dead ES6 Connection class

### Phase 3 — Structural Deduplication (2–3 days)

15. **R-05** — Eliminate all 8 Promise constructor anti-patterns (do `_apiRequest` as part of R-04 in Phase 1)
16. **R-06** — Extract `_resolveWithRefresh` helper
17. **R-07** — Parameterize URL helper methods
18. **R-08** — Parameterize blob methods
19. **R-10** — Fix `_queryHandler` double `_getOpts`

### Phase 4 — Architectural Refactoring (1–2 weeks)

20. **R-20** — God Object decomposition into domain modules

---

## Dependencies Between Refactorings

```
R-04 (fix auto-refresh) must precede R-05 (anti-pattern removal) for _apiRequest
R-05 (anti-pattern removal) enables R-06 (onRefresh extraction) — both use direct .then() chains
R-19 (remove dead Connection class) is a prerequisite for R-20 (class migration)
R-07 (URL methods) and R-08 (blob methods) are independent but logically paired
R-03 (MULTIPART_TYPES) should precede any insert/update method changes in R-20
```

---

## Prevention Strategies

### Tooling

1. **ESLint** — Add rules to prevent recurrence:
   - `eqeqeq: ["error", "always"]` — enforces `===` everywhere
   - `no-unused-vars: "error"` — catches dead code and unused `self` patterns
   - `prefer-const: "error"` — standardizes const usage
   - `no-promise-executor-return` — flags Promise constructor anti-pattern

2. **TypeScript** (or JSDoc types) — A typed `Response` type would have caught `res.txt()` at compile time. Add JSDoc `@param` and `@returns` annotations to the HTTP layer as a first step.

3. **Automated tests for auto-refresh** — The broken `autoRefresh` path went undetected because no test exercises it end-to-end with a mock that returns `INVALID_SESSION_ID` followed by a successful token refresh and retry.

### Process

- Add a PR checklist item: "Are all TODO comments addressed or converted to tracked issues?"
- Enforce `opts.xyz` not `data.xyz` after `_getOpts` in code review — a linting rule can automate this
- Any new method that duplicates the URL or blob pattern should trigger an extraction before merge
