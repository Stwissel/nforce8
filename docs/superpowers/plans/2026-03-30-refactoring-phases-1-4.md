# Refactoring Phases 1-4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 18 refactoring recommendations (R01-R18) across 4 phases, committing after each recommendation with tests passing.

**Architecture:** Sequential phase execution — Phase 1 fixes bugs, Phase 2 applies quick-win cleanups, Phase 3 improves design, Phase 4 adds features and restructures test infrastructure. Each recommendation is a discrete commit.

**Tech Stack:** Node.js >=22.4.0, Mocha + should.js, ESLint (flat config, single quotes)

---

## File Map

| File | Changes |
|------|---------|
| `test/mock/cometd-server.js` | R01: already fixed (crypto). R08: hoist inline `require('events')` |
| `lib/api.js` | R03: fix upsert to use `applyBody`. R04: fix spacing |
| `test/crud.js` | R02: fix error-swallowing pattern (4 tests). R03: add upsert multipart test |
| `test/query.js` | R02: fix error-swallowing pattern (9 tests) |
| `lib/cometd.js` | R05: extract `_resubscribeAll()`. R07: fix quote style. R16: propagate errors |
| `lib/auth.js` | R06: remove `Promise.resolve()`. R09: modernize onRefresh. R10: refactor getAuthUri |
| `index.js` | R11: inline temp variable |
| `lib/util.js` | R12: named constant. R13: rename function |
| `lib/optionhelper.js` | R14: let->const. R15: rename function |
| `lib/http.js` | R15: update caller of renamed function |
| `test/integration.js` | R17: dead code cleanup |
| `test/mock/sfdc-rest-api.js` | R18: convert to class-based instance |
| `test/connection.js` | R09: add async onRefresh test |

---

## Phase 1 — Critical Bug Fixes

### Task 1: R01 — Verify `require('crypto')` Fix (Already Applied)

R01 was already fixed in a prior session. The inline `require('crypto')` was removed and the file now uses Node 22's built-in `crypto` global.

**Files:**
- Verify: `test/mock/cometd-server.js`

- [ ] **Step 1: Verify the fix is in place**

Run: `grep -n 'require.*crypto' test/mock/cometd-server.js`
Expected: No output (no require calls for crypto)

- [ ] **Step 2: Run tests to confirm**

Run: `npm test`
Expected: 143 passing

- [ ] **Step 3: Skip commit — already committed**

---

### Task 2: R03 — Fix `upsert()` to Use `applyBody` Helper

**Files:**
- Modify: `lib/api.js:253-261`
- Test: `test/crud.js` (add upsert multipart test)

- [ ] **Step 1: Write the failing test for multipart upsert**

Add to `test/crud.js` inside the `#upsert` describe block, after the existing test:

```js
it('should send multipart/form-data for ContentVersion upsert', (done) => {
  let upsertResponse = {
    code: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '068DEADBEEF', success: true })
  };
  let obj = nforce.createSObject('ContentVersion', {
    Title: 'TestFile',
    PathOnClient: 'test.txt'
  });
  obj.setAttachment('test.txt', Buffer.from('binary content'));
  obj.setExternalId('My_Ext_Id__c', 'ext123');
  api
    .getGoodServerInstance(upsertResponse)
    .then(() => org.upsert({ sobject: obj, oauth: oauth }))
    .then((res) => {
      should.exist(res);
      res.id.should.equal('068DEADBEEF');
      let ct = api.getLastRequest().headers['content-type'];
      ct.should.startWith('multipart/form-data');
      ct.should.containEql('boundary');
      api.getLastRequest().method.should.equal('PATCH');
    })
    .then(() => done())
    .catch((err) => done(err));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx mocha test/crud.js --grep "multipart/form-data for ContentVersion upsert"`
Expected: FAIL — request body is JSON, not multipart

- [ ] **Step 3: Fix `upsert()` in `lib/api.js`**

Replace line 260:
```js
opts.body = JSON.stringify(opts.sobject.toPayload());
```
with:
```js
applyBody(opts, type, () => opts.sobject.toPayload());
```

- [ ] **Step 4: Run tests to verify the fix**

Run: `npm test`
Expected: All tests passing (including new multipart upsert test)

- [ ] **Step 5: Commit**

```bash
git add lib/api.js test/crud.js
git commit -m "fix: upsert() now uses applyBody for multipart support (R03)"
```

---

### Task 3: R02 — Fix Silent Error Swallowing in Test Promise Chains

**Files:**
- Modify: `test/crud.js` (4 occurrences)
- Modify: `test/query.js` (9 occurrences)

The pattern `.catch((err) => should.not.exist(err)).finally(() => done())` silently passes when assertions throw. Replace with returning the promise (Mocha handles rejections natively).

- [ ] **Step 1: Fix `test/crud.js` — 4 occurrences**

In `test/crud.js`, find all instances of this pattern:

```js
// Pattern 1 (insert test ~line 68-71):
.catch((err) => {
  should.not.exist(err);
})
.finally(() => done());

// Pattern 2 (update test ~line 93-96):
.catch((err) => {
  should.not.exist(err);
})
.finally(() => done());

// Pattern 3 (upsert test ~line 123):
.catch((err) => should.not.exist(err))
.finally(() => done());

// Pattern 4 (delete test ~line 146-147):
.catch((err) => should.not.exist(err))
.finally(() => done());
```

For each, replace with returning the promise and remove the `done` callback parameter:

**crud.js insert test (~line 43):** Change `it('should create a proper request on insert', (done) => {` to `it('should create a proper request on insert', () => {`, add `return` before `org`, remove the `.catch(...)` and `.finally(...)`.

**crud.js update test (~line 76):** Same transformation.

**crud.js upsert test (~line 101):** Same transformation.

**crud.js delete test (~line 128):** Same transformation.

- [ ] **Step 2: Fix `test/query.js` — 9 occurrences**

Apply the same transformation to all 9 tests in `test/query.js` that use the `.catch((err) => should.not.exist(err)).finally(() => done())` pattern:

- `#query` "multi-user mode" (~line 35)
- `#query` "single-user mode" (~line 52)
- `#query` "string query single-user" (~line 64)
- `#queryAll` "multi-user mode" (~line 82)
- `#queryAll` "single-user mode" (~line 94)
- `#queryAll` "string query single-user" (~line 106)
- `#search` "Record instances" (~line 120)
- `#search` "raw results" (~line 149)
- `#search` "empty searchRecords" (~line 175)

Each test: remove `(done)` parameter, add `return` before the promise chain, remove `.catch(...)` and `.finally(...)`.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests passing. If any test newly fails, that reveals a previously-masked bug — investigate and fix.

- [ ] **Step 4: Commit**

```bash
git add test/crud.js test/query.js
git commit -m "fix: replace error-swallowing test patterns with promise returns (R02)"
```

---

## Phase 2 — Code Quality Quick Wins

### Task 4: R04 + R07 + R14 — ESLint Auto-Fixes

**Files:**
- Modify: `lib/api.js` (spacing)
- Modify: `lib/cometd.js` (quote style)
- Modify: `lib/optionhelper.js` (let->const)

- [ ] **Step 1: Run ESLint auto-fix on all three files**

Run: `npx eslint --fix lib/api.js lib/cometd.js lib/optionhelper.js`

- [ ] **Step 2: Verify only style changes**

Run: `git diff lib/api.js lib/cometd.js lib/optionhelper.js`
Confirm: Only whitespace, quote, and let->const changes.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All passing

- [ ] **Step 4: Commit**

```bash
git add lib/api.js lib/cometd.js lib/optionhelper.js
git commit -m "style: fix spacing, quotes, and let->const via ESLint (R04, R07, R14)"
```

---

### Task 5: R05 — Extract `_resubscribeAll()` in `lib/cometd.js`

**Files:**
- Modify: `lib/cometd.js`

- [ ] **Step 1: Add `_resubscribeAll()` method**

Add this method to the CometDClient class, just before `_sendSubscribe`:

```js
/**
 * Re-subscribe all active topics after a handshake.
 */
async _resubscribeAll() {
  for (const topic of this._subscriptions.keys()) {
    await this._sendSubscribe(topic);
  }
}
```

- [ ] **Step 2: Replace inline loops in `_rehandshake()` and `_scheduleReconnect()`**

In `_rehandshake()`, replace:
```js
for (const topic of this._subscriptions.keys()) {
  await this._sendSubscribe(topic);
}
```
with:
```js
await this._resubscribeAll();
```

In `_scheduleReconnect()`, replace the same loop with:
```js
await this._resubscribeAll();
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All passing

- [ ] **Step 4: Commit**

```bash
git add lib/cometd.js
git commit -m "refactor: extract _resubscribeAll() to deduplicate reconnect logic (R05)"
```

---

### Task 6: R06 — Remove Redundant `Promise.resolve()` Wrappers

**Files:**
- Modify: `lib/auth.js`

- [ ] **Step 1: Fix `_notifyAndResolve` (line 133)**

Change:
```js
return Promise.resolve(newOauth);
```
to:
```js
return newOauth;
```

- [ ] **Step 2: Fix `authenticate` (line 187)**

Change:
```js
return Promise.resolve(newOauth);
```
to:
```js
return newOauth;
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All passing

- [ ] **Step 4: Commit**

```bash
git add lib/auth.js
git commit -m "refactor: remove redundant Promise.resolve() wrappers in auth.js (R06)"
```

---

### Task 7: R11 — Inline `rec` Temp Variable in `createSObject`

**Files:**
- Modify: `index.js:85-86`

- [ ] **Step 1: Inline the variable**

Replace:
```js
const rec = new Record(data);
return rec;
```
with:
```js
return new Record(data);
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All passing

- [ ] **Step 3: Commit**

```bash
git add index.js
git commit -m "refactor: inline temp variable in createSObject (R11)"
```

---

### Task 8: R08 — Hoist Inline `require('events')` in Mock Server

**Files:**
- Modify: `test/mock/cometd-server.js`

- [ ] **Step 1: Add top-level import**

Add after existing requires:
```js
const EventEmitter = require('events');
```

- [ ] **Step 2: Replace inline require**

Change line ~278:
```js
const emitter = new (require('events').EventEmitter)();
```
to:
```js
const emitter = new EventEmitter();
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All passing

- [ ] **Step 4: Commit**

```bash
git add test/mock/cometd-server.js
git commit -m "refactor: hoist inline require to top-level import (R08)"
```

---

## Phase 3 — Design Improvements

### Task 9: R12 — Named Constant for ID Field Variants

**Files:**
- Modify: `lib/util.js`

- [ ] **Step 1: Add constant and refactor loop**

Add near the top of the file (after the `checkHeaderCaseInsensitive` function):
```js
const ID_FIELD_VARIANTS = ['Id', 'id', 'ID'];
```

In `findId`, replace:
```js
const flavors = ['Id', 'id', 'ID'];

for (let flavor of flavors) {
  if (data[flavor]) {
    return data[flavor];
  }
}
```
with:
```js
for (const variant of ID_FIELD_VARIANTS) {
  if (data[variant] !== undefined) {
    return data[variant];
  }
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All passing

- [ ] **Step 3: Commit**

```bash
git add lib/util.js
git commit -m "refactor: extract ID_FIELD_VARIANTS constant in util.js (R12)"
```

---

### Task 10: R13 — Rename `checkHeaderCaseInsensitive` to `headerContains`

**Files:**
- Modify: `lib/util.js`

- [ ] **Step 1: Rename function and parameter**

Change:
```js
const checkHeaderCaseInsensitive = (headers, key, searchfor) => {
```
to:
```js
const headerContains = (headers, key, substring) => {
```

Update the `return` line:
```js
return headerContent ? headerContent.includes(searchfor) : false;
```
to:
```js
return headerContent ? headerContent.includes(substring) : false;
```

Update the JSDoc `@param` tag for `searchfor` to `substring`.

- [ ] **Step 2: Update caller in `isJsonResponse`**

Change:
```js
checkHeaderCaseInsensitive(res.headers, 'content-type', 'application/json')
```
to:
```js
headerContains(res.headers, 'content-type', 'application/json')
```

- [ ] **Step 3: Verify function is not exported**

Run: `grep 'checkHeaderCaseInsensitive' lib/util.js`
Expected: No remaining occurrences

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All passing

- [ ] **Step 5: Commit**

```bash
git add lib/util.js
git commit -m "refactor: rename checkHeaderCaseInsensitive to headerContains (R13)"
```

---

### Task 11: R15 — Rename `getFullUri` to `buildUrl`

**Files:**
- Modify: `lib/optionhelper.js:87,98`
- Modify: `lib/http.js:158`

- [ ] **Step 1: Rename in optionhelper.js**

Change function name:
```js
function getFullUri(opts) {
```
to:
```js
function buildUrl(opts) {
```

Update export:
```js
module.exports = { getApiRequestOptions, getFullUri };
```
to:
```js
module.exports = { getApiRequestOptions, buildUrl };
```

- [ ] **Step 2: Update caller in http.js**

Change:
```js
const uri = optionHelper.getFullUri(ropts);
```
to:
```js
const uri = optionHelper.buildUrl(ropts);
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All passing

- [ ] **Step 4: Commit**

```bash
git add lib/optionhelper.js lib/http.js
git commit -m "refactor: rename getFullUri to buildUrl (R15)"
```

---

### Task 12: R10 — Decompose `getAuthUri` Conditionals

**Files:**
- Modify: `lib/auth.js:67-115`

- [ ] **Step 1: Refactor `getAuthUri`**

Replace the body of the function (lines 68-114) with:

```js
const getAuthUri = function (opts = {}) {
  const urlOpts = {
    response_type: opts.responseType || 'code',
    client_id: this.clientId,
    redirect_uri: this.redirectUri,
  };

  if (opts.display) urlOpts.display = opts.display.toLowerCase();
  if (opts.immediate !== undefined) urlOpts.immediate = opts.immediate;
  if (opts.state !== undefined) urlOpts.state = opts.state;
  if (opts.nonce !== undefined) urlOpts.nonce = opts.nonce;
  if (opts.loginHint) urlOpts.login_hint = opts.loginHint;

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

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All passing (existing getAuthUri tests in test/connection.js cover scope, display, state, etc.)

- [ ] **Step 3: Commit**

```bash
git add lib/auth.js
git commit -m "refactor: simplify getAuthUri conditional blocks (R10)"
```

---

### Task 13: R16 — Propagate Errors from `_connectLoop` Catch

**Files:**
- Modify: `lib/cometd.js`

- [ ] **Step 1: Update the catch block in `_connectLoop`**

Change:
```js
} catch {
  if (this._disconnecting) return;
  this._connected = false;
  this.emit('transport:down');
```
to:
```js
} catch (err) {
  if (this._disconnecting) return;
  this._connected = false;
  this.emit('transport:down', err);
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All passing

- [ ] **Step 3: Commit**

```bash
git add lib/cometd.js
git commit -m "refactor: propagate error details to transport:down event (R16)"
```

---

### Task 14: R17 — Clean Up Dead Code in `test/integration.js`

**Files:**
- Modify: `test/integration.js`

- [ ] **Step 1: Clean up**

1. Change `let client = undefined;` to `let client;`
2. Remove the commented-out `// Mocha.suite.skip();` line
3. Since `describe.skip` handles the false case, simplify the `before()` block:

```js
before(() => {
  const creds = checkEnvCredentials();
  client = nforce.createConnection(creds);
});
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All passing

- [ ] **Step 3: Commit**

```bash
git add test/integration.js
git commit -m "refactor: remove dead code in integration.js (R17)"
```

---

## Phase 4 — Architectural Improvements

### Task 15: R09 — Modernize `onRefresh` to Accept Promises

**Files:**
- Modify: `lib/auth.js:124-134`
- Test: `test/connection.js` (add async onRefresh test)

- [ ] **Step 1: Write the failing test**

Add to `test/connection.js` inside the `#_notifyAndResolve` describe block:

```js
it('should accept a promise-returning onRefresh function', function () {
  let refreshCalled = false;
  let org = makeOrg({
    onRefresh: async function (newOauth, oldOauth) {
      refreshCalled = true;
      newOauth.access_token.should.equal('new_token');
      oldOauth.access_token.should.equal('old_token');
    }
  });
  let newOauth = { access_token: 'new_token' };
  let oldOauth = { access_token: 'old_token' };
  return org._notifyAndResolve(newOauth, oldOauth).then((result) => {
    refreshCalled.should.be.true();
    result.access_token.should.equal('new_token');
  });
});

it('should reject when async onRefresh throws', function () {
  let org = makeOrg({
    onRefresh: async function () {
      throw new Error('async refresh failed');
    }
  });
  return org._notifyAndResolve({ access_token: 'test' }, {}).then(
    () => { throw new Error('should have rejected'); },
    (err) => { err.message.should.equal('async refresh failed'); }
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx mocha test/connection.js --grep "promise-returning"`
Expected: FAIL — async function with arity 0 gets no `cb` argument, calls it as `undefined()`

- [ ] **Step 3: Update `_notifyAndResolve` in `lib/auth.js`**

Replace the function with:

```js
const _notifyAndResolve = function (newOauth, oldOauth) {
  if (this.onRefresh) {
    if (this.onRefresh.length >= 3) {
      // Legacy callback path
      return new Promise((resolve, reject) => {
        this.onRefresh.call(this, newOauth, oldOauth, (err) => {
          if (err) reject(err);
          else resolve(newOauth);
        });
      });
    }
    // Modern path: onRefresh returns a value or Promise
    return Promise.resolve(this.onRefresh.call(this, newOauth, oldOauth))
      .then(() => newOauth);
  }
  return newOauth;
};
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All passing (including new async tests and existing callback tests)

- [ ] **Step 5: Commit**

```bash
git add lib/auth.js test/connection.js
git commit -m "feat: onRefresh now accepts async/promise-returning functions (R09)"
```

---

### Task 16: R18 — Convert Mock Server to Class-Based Instance

**Files:**
- Modify: `test/mock/sfdc-rest-api.js`
- Modify: `test/crud.js`
- Modify: `test/query.js`
- Modify: `test/errors.js` (if it uses the mock)
- Modify: `test/plugin.js` (if it uses the mock)

- [ ] **Step 1: Identify all files using the mock**

Run: `grep -rl "sfdc-rest-api" test/`
Note which files import and use the mock module.

- [ ] **Step 2: Rewrite `test/mock/sfdc-rest-api.js` as a class**

```js
'use strict';

const http = require('http');
const CONST = require('../../lib/constants');
const apiVersion = CONST.API;

class MockSfdcApi {
  constructor() {
    this._port = process.env.PORT || 33333;
    this._serverStack = [];
    this._requestStack = [];
    this._defaultResponse = {
      code: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Status: 'OK' })
    };
  }

  reset() {
    this._requestStack.length = 0;
  }

  getLastRequest() {
    return this._requestStack[0];
  }

  clearServerStack() {
    const allPromises = [];
    let curServer = this._serverStack.pop();
    while (curServer) {
      allPromises.push(new Promise((resolve) => curServer.close(resolve)));
      curServer = this._serverStack.pop();
    }
    return Promise.all(allPromises);
  }

  getServerInstance(serverListener) {
    return new Promise((resolve, reject) => {
      this.clearServerStack()
        .then(() => {
          let server = http.createServer(serverListener);
          server.listen(this._port, (err) => {
            if (err) {
              reject(err);
            } else {
              this._serverStack.push(server);
              resolve(server);
            }
          });
        })
        .catch(reject);
    });
  }

  getGoodServerInstance(response) {
    const resp = response || this._defaultResponse;
    const self = this;
    const serverListener = (req, res) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        req.body = Buffer.concat(chunks).toString();
        self._requestStack.push(req);
        const headers = Object.assign({ Connection: 'close' }, resp.headers);
        res.writeHead(resp.code, headers);
        if (resp.body) {
          res.end(resp.body, 'utf8');
        } else {
          res.end();
        }
      });
    };
    return this.getServerInstance(serverListener);
  }

  getClosedServerInstance() {
    const serverListener = (req) => {
      const fatError = new Error('ECONNRESET');
      fatError.type = 'system';
      fatError.errno = 'ECONNRESET';
      req.destroy(fatError);
    };
    return this.getServerInstance(serverListener);
  }

  getClient(opts) {
    opts = opts || {};
    return {
      clientId: 'ADFJSD234ADF765SFG55FD54S',
      clientSecret: 'adsfkdsalfajdskfa',
      redirectUri: 'http://localhost:' + this._port + '/oauth/_callback',
      loginUri: 'http://localhost:' + this._port + '/login/uri',
      apiVersion: opts.apiVersion || apiVersion,
      mode: opts.mode || 'multi',
      autoRefresh: opts.autoRefresh || false,
      onRefresh: opts.onRefresh || undefined
    };
  }

  getOAuth() {
    return {
      id: 'http://localhost:' + this._port + '/id/00Dd0000000fOlWEAU/005d00000014XTPAA2',
      issued_at: '1362448234803',
      instance_url: 'http://localhost:' + this._port,
      signature: 'djaflkdjfdalkjfdalksjfalkfjlsdj',
      access_token: 'aflkdsjfdlashfadhfladskfjlajfalskjfldsakjf'
    };
  }

  start(incomingPort, cb) {
    this._port = incomingPort;
    this.getGoodServerInstance()
      .then(() => cb())
      .catch((err) => {
        console.error(err);
        cb(err);
      });
  }

  stop(cb) {
    this.clearServerStack()
      .catch(console.error)
      .finally(() => cb());
  }
}

module.exports = { MockSfdcApi };
```

- [ ] **Step 3: Update all test files to use class instances**

In each test file that uses `require('./mock/sfdc-rest-api')`, change from:
```js
const api = require('./mock/sfdc-rest-api');
```
to:
```js
const { MockSfdcApi } = require('./mock/sfdc-rest-api');
const api = new MockSfdcApi();
```

The rest of the code stays the same since the method names are identical.

- [ ] **Step 4: Run tests after each file update**

Run: `npm test`
Expected: All passing

- [ ] **Step 5: Commit**

```bash
git add test/mock/sfdc-rest-api.js test/crud.js test/query.js test/errors.js test/plugin.js
git commit -m "refactor: convert mock server to class-based instance (R18)"
```

---

## Final Verification

- [ ] **Run full test suite**: `npm test` — all tests passing
- [ ] **Run linter**: `npx eslint .` — no errors
- [ ] **Review all commits**: `git log --oneline` — one commit per recommendation
