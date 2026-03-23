# Code Smell Detection Report — nforce8

## Executive Summary

nforce8 is a Node.js REST API wrapper for Salesforce (Promise-based, Node 22+). The codebase spans 9 source files totalling approximately 1,660 lines. All 89 tests pass; the project is functionally sound. The smells catalogued below represent remaining structural, design, and readability debt — not runtime defects.

- **Total issues found**: 31
- **High Severity (Architectural)**: 7
- **Medium Severity (Design)**: 14
- **Low Severity (Readability/Maintenance)**: 10
- **Overall Grade**: C

---

## Project Analysis

| File | Lines | Role |
|---|---|---|
| `index.js` | 995 | Main entry point — Connection prototype, all API methods |
| `lib/record.js` | 187 | SObject record wrapper |
| `lib/connection.js` | 93 | ES6 Connection class + option validation |
| `lib/fdcstream.js` | 105 | Streaming (Faye/CometD) client |
| `lib/optionhelper.js` | 113 | Request option assembly |
| `lib/multipart.js` | 28 | Multipart body builder |
| `lib/util.js` | 71 | Header and type utilities |
| `lib/constants.js` | 47 | Named constants and default options |
| `lib/errors.js` | 21 | Error factory functions |

**Languages**: JavaScript (CommonJS modules), Node 22+
**Frameworks/Libraries**: Faye (streaming), mime-types, native Fetch API
**Project type**: Library / API wrapper

---

## High Severity Issues (Architectural Impact)

### H1 — Large Class / God Object: `index.js` Connection (995 lines, 49 prototype methods)

**Category**: Bloater — Large Class
**Source**: Fowler (1999), Jerzyk (2022)

`index.js` defines 49 prototype methods on `Connection` spanning OAuth lifecycle, CRUD operations, query pagination, search, blob retrieval, streaming setup, URL operations, Apex REST, plugin management, and internal HTTP plumbing. This is a textbook God Object.

**Violated Principles**:
- **SRP**: The module simultaneously owns authentication, all REST verb wrappers, pagination, streaming, multipart upload, plugin binding, and error recovery.
- **OCP**: Adding any new API surface requires modifying this single 995-line file.
- **GRASP High Cohesion**: Methods from unrelated domains share one prototype and one file.

**Locations**:
- `index.js:24–54` — constructor
- `index.js:60–90` — auth getters/setters (8 trivial accessors)
- `index.js:404–449` — CRUD methods
- `index.js:479–530` — blob/binary methods
- `index.js:536–599` — query handling
- `index.js:621–639` — search
- `index.js:649–709` — URL and Apex REST
- `index.js:715–744` — streaming
- `index.js:772–846` — internal HTTP layer
- `index.js:929–970` — plugin system

**Refactoring**: Extract `AuthClient`, `CrudClient`, `QueryClient`, `BlobClient`, and `PluginRegistry` as separate modules that the main Connection delegates to. The module boundary already exists for streaming (`fdcstream.js`) — the same pattern should be applied throughout.

---

### H2 — Divergent Change: `index.js` must change for unrelated reasons

**Category**: Change Preventer — Divergent Change
**Source**: Fowler (1999)

`index.js` must be edited whenever: an OAuth flow changes, a new CRUD verb is added, query pagination logic changes, blob handling changes, a streaming option changes, or the plugin system changes. Every distinct domain drives changes into one file.

**Location**: `index.js` (entire file)

**Refactoring**: Same split as H1. Divergent Change and Large Class are coupled here — resolving H1 eliminates H2.

---

### H3 — Parallel Architecture: Two Connection definitions that cannot be reconciled

**Category**: Object-Oriented Abuser — Alternative Classes with Different Interfaces
**Source**: Fowler (1999), Jerzyk (2022)

`lib/connection.js` defines a proper ES6 `class Connection` (lines 5–18) with a constructor that mirrors `index.js`. However, `index.js` defines its own `Connection` constructor function (line 24) using the pre-ES6 prototype pattern and imports only `validateConnectionOptions` from `lib/connection.js`. The ES6 class is never instantiated anywhere in the runtime path. The TODO comment at `index.js:23` acknowledges this: `// TODO turn into ES6 class`.

**Violated Principles**:
- **DRY**: Constructor logic (`Object.assign({}, CONST.defaultOptions, opts)`, `opts.environment.toLowerCase()`, `opts.mode.toLowerCase()`) is duplicated between `lib/connection.js:11–17` and `index.js:27–33`.
- **OCP**: The ES6 class cannot be extended or composed because the running codebase ignores it.

**Locations**:
- `lib/connection.js:5–18` — unused ES6 class definition
- `index.js:23–54` — active prototype-based constructor with the TODO comment

**Refactoring**: Complete the migration flagged by the TODO. Move all prototype methods into the ES6 class in `lib/connection.js`, export the completed class, and have `index.js` import and re-export it. Delete the duplicate constructor logic.

---

### H4 — Global Mutable Data: `plugins` object in module scope

**Category**: Data Dealer — Global Data / Mutable Data
**Source**: Martin (2008), Jerzyk (2022)

`const plugins = {}` at `index.js:17` is a module-level mutable registry. Any code that imports `index.js` shares this singleton state across the entire Node.js process. Registering a plugin with the same name in one consumer affects all consumers. This makes test isolation impossible without process restarts, and the shared state is invisible to callers.

**Violated Principles**:
- **GRASP Low Coupling**: Hidden shared mutable state creates invisible coupling between plugin consumers.
- **DIP**: Consumers depend on a hidden concrete global rather than an injected registry.

**Location**: `index.js:17`

**Refactoring**: Move the plugin registry into the `Connection` instance so each connection owns its plugin set. Alternatively, expose an explicit `PluginRegistry` class that can be injected or reset in tests.

---

### H5 — Shotgun Surgery: Sandbox/production endpoint selection duplicated across methods

**Category**: Change Preventer — Shotgun Surgery
**Source**: Fowler (1999)

The sandbox/production endpoint selection is performed with an inline conditional in four separate methods. Changing the condition — for example, adding a third environment — requires editing each site independently. Additionally, three of the four sites use loose equality (`==`) while one uses strict equality (`===`), creating an inconsistency noted separately.

**Locations**:
- `index.js:184` — `getAuthUri`: `self.environment == 'sandbox'` (loose equality)
- `index.js:209` — `authenticate`: `self.environment == 'sandbox'`
- `index.js:264` — `refreshToken`: `this.environment == 'sandbox'`
- `index.js:308` — `revokeToken`: `this.environment === 'sandbox'` (strict equality)

**Refactoring**: Extract a single `_getLoginUri()` and `_getAuthEndpoint()` helper method on the Connection prototype. All four callers delegate to it.

---

### H6 — Dead Exported Symbol: `isChunkedEncoding` defined but never called

**Category**: Dispensable — Dead Code
**Source**: Martin (2008), Jerzyk (2022)

`lib/util.js:22–27` defines and exports `isChunkedEncoding`. A search across the entire codebase (source, tests, examples) shows it is exported at line 63 but never imported or invoked anywhere.

**Violated Principle**: YAGNI — the function exists speculatively.

**Location**: `lib/util.js:22–27, 63`

**Refactoring**: Remove the function and its export entry. If streaming chunked transfer detection is needed in the future, add it at that time.

---

### H7 — Dead Exported Symbol: `nonJsonResponse` error factory never called

**Category**: Dispensable — Dead Code
**Source**: Martin (2008)

`lib/errors.js:2–4` defines `nonJsonResponse` and exports it at line 18. No file in the codebase calls `errors.nonJsonResponse()`. The `_apiRequest` path uses `errors.invalidJson()` for all JSON parse failures.

**Location**: `lib/errors.js:2–4, 18`

**Refactoring**: Remove the function and its export. If distinct non-JSON error signalling is later needed, add it then.

---

## Medium Severity Issues (Design Problems)

### M1 — Magic Number / Insecure Hardcoded URL in `getVersions`

**Category**: Lexical Abuser — Magic Number
**Source**: Fowler (1999), Martin (2008)

`index.js:353` hardcodes `'http://na1.salesforce.com/services/data/'`. This URL is: (a) HTTP not HTTPS, introducing a protocol downgrade, (b) tied to the NA1 pod which Salesforce can retire or redirect, and (c) inconsistent with the pattern used everywhere else in the codebase, which derives the URL from `opts.oauth.instance_url`.

**Location**: `index.js:353`

**Refactoring**: Derive the URL from `instance_url` as all other methods do, or at minimum move it to a named constant in `constants.js` and change `http://` to `https://`.

---

### M2 — Loose Equality Operator: `==` used in environment and extension comparisons

**Category**: Obfuscator — Complicated Boolean Expression
**Source**: Martin (2008)

Three of the four environment comparisons use `==` (loose equality) while one uses `===`. Additionally, `lib/fdcstream.js:69` compares `message.ext['replay'] == true` with loose equality. In `'use strict'` modules this is a style inconsistency, but it signals inattention and creates subtle risks when value types are unexpected.

**Locations**:
- `index.js:184` — `self.environment == 'sandbox'`
- `index.js:209` — `self.environment == 'sandbox'`
- `index.js:264` — `this.environment == 'sandbox'`
- `lib/fdcstream.js:69` — `message.ext['replay'] == true`

**Refactoring**: Replace all `==` with `===` throughout source files.

---

### M3 — Inconsistent `let`/`const` Usage

**Category**: Lexical Abuser — Inconsistent Style
**Source**: Martin (2008)

Many variables declared with `let` are never reassigned and should be `const`. Mixed use obscures which bindings truly vary and makes intent harder to read.

**Representative Locations**:
- `lib/multipart.js:4–9` — `let type`, `let entity`, `let name`, `let fileName`, `let isPatch`, `let multipart` — none are reassigned; all should be `const`.
- `index.js:215–216` — `let bopts = { ... }` — never reassigned after initial assignment.
- `lib/record.js:136–137` — `let self = this; let changed = {}` — `self` never reassigned; `changed` is mutated but the binding itself is not.
- `lib/fdcstream.js:7` — `let self = this` — never reassigned.

**Refactoring**: Audit all `let` declarations and convert to `const` where the binding is not reassigned.

---

### M4 — Primitive Obsession: OAuth token as an untyped plain object

**Category**: Data Dealer — Primitive Obsession
**Source**: Fowler (1999), Jerzyk (2022)

The OAuth token is passed throughout the system as an untyped plain object `{ access_token, refresh_token, instance_url, ... }`. There is no validation of its shape at entry points, no encapsulation of token-related operations, and callers must know internal field names directly. `util.validateOAuth` exists (util.js:57) but is not enforced at API call sites.

**Representative Locations**:
- `index.js:117` — `data.oauth` used without shape validation
- `index.js:653` — `opts.oauth.instance_url` accessed directly
- `lib/fdcstream.js:47` — `opts.oauth.instance_url` accessed directly
- `lib/fdcstream.js:54` — `opts.oauth.access_token` accessed directly
- `lib/optionhelper.js:50` — `opts.oauth.access_token` accessed directly

**Refactoring**: Introduce an `OAuthToken` class or value object that enforces the required shape. Call `util.validateOAuth` defensively at the entry points of `_apiRequest` and `_apiAuthRequest`.

---

### M5 — Feature Envy: `optionhelper.js` deeply reads the caller's internal data

**Category**: Coupler — Feature Envy
**Source**: Fowler (1999)

`getApiRequestOptions` in `lib/optionhelper.js` (lines 15–97) makes over 14 decisions driven entirely by fields from the caller's `opts` object: `opts.uri`, `opts.resource`, `opts.blob`, `opts.method`, `opts.gzip`, `opts.multipart`, `opts.headers`, `opts.body`, `opts.qs`, `opts.requestOpts`, `opts.timeout`, `opts.oauth`, `opts.apiVersion`. The function is more interested in the Connection's data than in its own.

**Location**: `lib/optionhelper.js:15–97`

**Refactoring**: This is a legitimate transformation function, but it should receive a more structured input type (see M4). Alternatively, move it into the Connection class where the data lives — consistent with the GRASP Information Expert principle.

---

### M6 — `for...in` Loop on Object Headers

**Category**: Object-Oriented Abuser — Inappropriate Iteration
**Source**: Martin (2008)

`lib/optionhelper.js:71` uses `for (let item in opts.headers)` to copy user-supplied headers. `for...in` iterates over inherited prototype properties unless guarded with `hasOwnProperty`. This is a well-documented JavaScript hazard and is inconsistent with the `for...of Object.keys()` pattern used everywhere else in the codebase.

**Location**: `lib/optionhelper.js:71`

**Refactoring**: Replace with `Object.assign(ropts.headers, opts.headers)` or `Object.keys(opts.headers).forEach(...)`.

---

### M7 — Orphaned `request`-Library Options Still Set in `optionhelper.js`

**Category**: Dispensable — Dead Code
**Source**: Jerzyk (2022)

`lib/optionhelper.js` sets `ropts.encoding = null` (lines 38, 56), `ropts.preambleCRLF = true` (line 63), `ropts.postambleCRLF = true` (line 64), and `ropts.multipart` (line 62) on the options object passed to native `fetch()`. These are options from the deprecated `request` npm library. The native Fetch API silently ignores all of them. As a result, multipart uploads and gzip handling are set up but have no effect.

**Violated Principle**: YAGNI — the options do nothing and mislead readers into thinking multipart and gzip are functional via `fetch`.

**Locations**:
- `lib/optionhelper.js:38` — `ropts.encoding = null` (blob path)
- `lib/optionhelper.js:55–56` — `ropts.encoding = null` (gzip path)
- `lib/optionhelper.js:62–64` — `ropts.multipart`, `ropts.preambleCRLF`, `ropts.postambleCRLF`

**Refactoring**: Remove the dead `request`-library options. Implement multipart support using `FormData` and gzip using `Accept-Encoding` with native Node 22 decompression.

---

### M8 — `_getOpts` Has an Overloaded, Dead Callback Parameter

**Category**: Bloater — Long Parameter List / Obfuscator
**Source**: Fowler (1999), Martin (2008)

`Connection.prototype._getOpts` at `index.js:96` accepts `(d, c, opts)` where `d` can be either a function (callback) or a data object, and `c` is the callback when `d` is data. In every single call site visible in the codebase, `c` is always passed as `null` (e.g., `index.js:258, 304, 321, 374, 383, 392`). The callback pathway appears to be legacy code from a pre-Promise API and is now dead.

**Locations**:
- `index.js:96–125` — method definition with the `if (util.isFunction(d))` type dispatch
- Every call site: `null` is passed as the second argument throughout

**Refactoring**: Remove the `c` (callback) parameter and the type-dispatch logic on `d`. Simplify to `_getOpts(data, opts = {})`.

---

### M9 — `search()` Response Shape Does Not Match Salesforce API Contract

**Category**: Obfuscator — Obscured Intent / Dubious Abstraction
**Source**: Jerzyk (2022)

`index.js:634` checks `!resp.length` to detect an empty search result. The Salesforce SOSL Search API returns `{ searchRecords: [...] }`, not a bare array. Checking `.length` on a plain object returns `undefined` (falsy), meaning the guard never fires on an empty result set as intended — it would only accidentally fire on a non-object response. The subsequent `resp.map(...)` at line 637 would also fail because the response object has no `map` method.

**Location**: `index.js:633–638`

**Refactoring**: Align with the actual Salesforce REST Search API response shape. Access `resp.searchRecords`, check `resp.searchRecords.length === 0`, and map over `resp.searchRecords`.

---

### M10 — `getContentVersionBody` is Unreachable Dead Code

**Category**: Dispensable — Dead Code
**Source**: Martin (2008)

`index.js:514–521` defines `Connection.prototype.getContentVersionBody`. However, `getBody()` at `index.js:479–494` routes `contentversion` types to `getContentVersionData` (line 490), not `getContentVersionBody`. `getContentVersionBody` is never called anywhere in the codebase — the public router bypasses it entirely.

**Location**: `index.js:514–521`

**Refactoring**: Either remove `getContentVersionBody` if it is truly dead, or correct the routing in `getBody` to call it where appropriate. The naming difference (`body` vs `versiondata`) suggests the distinction is intentional, making the routing likely a bug.

---

### M11 — `apexRest` Accesses Raw `data` Parameter After Processing Through `_getOpts`

**Category**: Obfuscator — Inconsistent Intent
**Source**: Martin (2008)

`apexRest` at `index.js:695–709` calls `this._getOpts(data, null, { singleProp: 'uri' })` to produce `opts`, but then accesses `data.uri` directly at line 703 instead of `opts.uri`. The `singleProp: 'uri'` option that `_getOpts` was supposed to apply is therefore never used for its stated purpose. This is inconsistent with every other method in the file, which only accesses `opts` after calling `_getOpts`.

**Location**: `index.js:703` — `data.uri.substring(0, 1)` should be `opts.uri.substring(0, 1)`

**Refactoring**: Replace `data.uri` with `opts.uri` at line 703.

---

### M12 — `_queryHandler` Re-processes Already-Processed `opts` via `_getOpts`

**Category**: Obfuscator — Obscured Intent
**Source**: Fowler (1999)

`query` (line 536) and `queryAll` (line 548) each call `this._getOpts(data, ...)` to produce an `opts` object, then pass it directly to `_queryHandler`. Inside `_queryHandler` (line 563), `this._getOpts(data)` is called again on the same already-processed object, running the option-processing logic twice. This is confusing and fragile.

**Location**: `index.js:560–565`

**Refactoring**: Remove the `_getOpts` call inside `_queryHandler`. Rename the parameter from `data` to `opts` to make the intent clear that a processed object is expected.

---

### M13 — `responseFailureCheck` Duplicates Header Access Logic Already in `util.js`

**Category**: Dispensable — Duplicated Code
**Source**: Fowler (1999)

`responseFailureCheck` at `index.js:856–868` manually implements the `typeof res.headers.get === 'function' ? res.headers.get(...) : res.headers[...]` pattern twice — once for the `error` header and once for `content-length`. This is exactly the dual-path header access logic that `util.checkHeaderCaseInsensitive` was written to encapsulate, but `checkHeaderCaseInsensitive` is not exported from `util.js`.

**Location**: `index.js:856–868`

**Refactoring**: Export a `getHeader(headers, key)` function from `util.js` and use it in `responseFailureCheck` to eliminate the inline ternary duplication.

---

### M14 — Deprecated `querystring` Module Still Imported

**Category**: Other — Incomplete Library / Deprecated Dependency
**Source**: Node.js docs

`index.js:3` imports `const qs = require('querystring')`. Node.js marked `querystring` as a legacy module in v16 and recommends `URLSearchParams` instead. The project requires Node 22+. `optionhelper.js` already uses `url.URL` with `result.searchParams.append`, establishing the modern pattern.

**Location**: `index.js:3` — used at lines 190, 243, 288

**Refactoring**: Replace `qs.stringify(...)` calls with `new URLSearchParams({...}).toString()`. Align with the idiom already established in `optionhelper.js`.

---

## Low Severity Issues (Readability / Maintenance)

### L1 — `self = this` Anti-Pattern Throughout

**Category**: Lexical Abuser — Unnecessary Variable
**Source**: Martin (2008)

The `let self = this` pattern appears 14 times across the source files. This was a pre-ES6 workaround for `this` binding loss inside `function()` callbacks. All of these inner functions can use arrow functions instead, which lexically bind `this` and eliminate the need for `self`.

**Locations** (all occurrences):
- `lib/record.js:2, 30, 136, 171`
- `lib/fdcstream.js:7, 43`
- `index.js:25, 132, 206, 256, 561, 716, 781, 808`

**Refactoring**: Convert inner `function()` callbacks that reference `self` to arrow functions and delete the `self` variable declaration.

---

### L2 — Three Open TODO Comments Representing Unaddressed Design Debt

**Category**: Other — Technical Debt Marker
**Source**: Martin (2008)

Three TODO comments indicate acknowledged but unaddressed design debt:

- `index.js:23` — `// TODO turn into ES6 class` (this is H3 — the primary remaining design debt)
- `index.js:220` — `//TODO: Add JWT authentication`
- `index.js:366` — `//TODO: fix me! let self = this;` — this is stale; the `let self` alias no longer appears on this line, making the comment itself orphaned dead comment

**Locations**: `index.js:23, 220, 366`

**Refactoring**: Address the ES6 class migration (H3). Remove the stale orphaned TODO at line 366. For JWT, either implement it or track it as a GitHub issue and remove the in-code comment.

---

### L3 — Redundant Boolean Ternary in `multipart.js`

**Category**: Obfuscator — Clever Code
**Source**: Martin (2008)

`lib/multipart.js:8` writes `let isPatch = opts.method === 'PATCH' ? true : false;`. The ternary is entirely unnecessary: the comparison `opts.method === 'PATCH'` already evaluates to a boolean.

**Location**: `lib/multipart.js:8`

**Refactoring**: `const isPatch = opts.method === 'PATCH';`

---

### L4 — `Record` Constructor Uses Inverted Conditional Logic

**Category**: Obfuscator — Conditional Complexity
**Source**: Martin (2008)

`lib/record.js:10–18` has the structure: first branch guards against `'attributes'` and `'attachment'` combined, then two subsequent `else if` branches handle them individually. A reader must verify that the three branches are exhaustive and mutually exclusive, which adds cognitive load.

```js
if (key !== 'attributes' && key !== 'attachment') { ... }
else if (key === 'attributes') { ... }
else if (key === 'attachment') { ... }
```

**Location**: `lib/record.js:10–18`

**Refactoring**: Lead with the named special cases and fall through to the default:
```js
if (key === 'attributes') { ... }
else if (key === 'attachment') { ... }
else { ... }
```

---

### L5 — `Record.prototype.set` Uses `arguments.length` for Method Overloading

**Category**: Object-Oriented Abuser — Inappropriate Use of `arguments`
**Source**: Martin (2008)

`lib/record.js:32` checks `arguments.length === 2` to detect whether the caller passed `(field, value)` vs `(objectMap)`. Using `arguments.length` for overloading is opaque, incompatible with rest parameters, and creates an implicit API contract invisible in the function signature.

**Location**: `lib/record.js:32`

**Refactoring**: Use `typeof field === 'object'` as the discriminator (clearer and already the idiom used elsewhere in the codebase), or split into two distinct named methods.

---

### L6 — `Record.prototype.previous` Has Obscured Return Paths

**Category**: Obfuscator — Obscured Intent
**Source**: Martin (2008)

`lib/record.js:144–155` has a nested if/else where one branch executes `return;` (implicit `undefined`) and another falls off the end without a return statement. The two-level nesting (`if (field)` then `if (typeof field === 'string')`) adds indirection when the type check subsumes the existence check.

**Location**: `lib/record.js:144–155`

**Refactoring**: Flatten: if `field` is a non-empty string, return `this._previous[field] ?? undefined`; otherwise return `this._previous || {}`. Remove the redundant `if (field)` outer check since `typeof field === 'string'` already handles the falsy case.

---

### L7 — `getAuthUri` Is a Long Method with Repetitive Conditional Pattern

**Category**: Bloater — Long Method
**Source**: Fowler (1999)

`getAuthUri` at `index.js:131–191` is 61 lines consisting of 8 sequential `if` blocks that conditionally append optional URL parameters. The repeated guard-and-assign pattern is verbose and obscures the intent of constructing a URL options object.

**Location**: `index.js:131–191`

**Refactoring**: Extract the URL option construction into a `_buildAuthUrlParams(opts)` helper. Use an explicit mapping of optional parameter names to reduce repetition.

---

### L8 — `Plugin` Constructor Function Is Pre-ES6 Style

**Category**: Object-Oriented Abuser — Inconsistent Style
**Source**: Martin (2008)

`index.js:933–948` defines a `Plugin` constructor function with a prototype method. This is the pre-ES6 pattern. The rest of the project uses ES6 classes (`lib/fdcstream.js`, `lib/connection.js`). The `Plugin` definition is inconsistent with the modern patterns already present.

**Location**: `index.js:933–948`

**Refactoring**: Convert to `class Plugin { constructor(opts) { ... } fn(fnName, fn) { ... } }`.

---

### L9 — Fallacious Comments: `// Require syntax for Node < 10`

**Category**: Lexical Abuser — Fallacious Comment
**Source**: Jerzyk (2022)

Four files end with `// Require syntax for Node < 10` before `module.exports`. The project's `package.json` declares `"node": ">=22.0.0"`. The comment is factually wrong and misleads readers into thinking Node 10 compatibility is a concern.

**Locations**:
- `lib/record.js:186`
- `lib/fdcstream.js:101`
- `lib/multipart.js:27`
- `lib/errors.js:16`

**Refactoring**: Remove the comment, or replace with `// CommonJS module export` if the distinction from ESM is worth documenting.

---

### L10 — Duplicated JSON Parse Error Handling in Two Request Methods

**Category**: Dispensable — Duplicated Code
**Source**: Fowler (1999)

Both `_apiAuthRequest` (index.js:794–797) and `_apiRequest` (index.js:818–821) contain identical `.catch` blocks inside `.json()` calls:

```js
.catch((e) => {
  if (e instanceof SyntaxError) throw errors.invalidJson();
  throw e;
})
```

**Locations**:
- `index.js:794–797`
- `index.js:818–821`

**Refactoring**: Extract a shared `safeJsonParse(res)` function and call it from both sites.

---

## SOLID Principle Compliance

### S — Single Responsibility Principle
**Score: 4/10**

`index.js` concentrates all responsibilities into one module. Individual extracted modules (`record.js`, `fdcstream.js`, `errors.js`) are well-scoped. `optionhelper.js` handles URI assembly, header construction, and body formatting together but remains manageable.

### O — Open/Closed Principle
**Score: 6/10**

The plugin system is well-designed for extension without modification. The `getBody()` dispatch via string matching (lines 485–493) is a mild OCP violation — adding a new blob type requires modifying the method body.

### L — Liskov Substitution Principle
**Score: 9/10**

No inheritance hierarchies present that violate substitutability. `Subscription` and `Client` extend `EventEmitter` correctly and honour its contract.

### I — Interface Segregation Principle
**Score: 7/10**

No formal interfaces (JavaScript), but the exported surface of each module is reasonably focused. `util.js` exports `isChunkedEncoding` which no consumer uses (H6).

### D — Dependency Inversion Principle
**Score: 5/10**

The `fetch` global is used directly with no injection point, making HTTP-level testing require `fetch` mocking at the global level. The `faye` client is directly instantiated inside `FDCStream.Client`. The plugin system uses a module-level registry rather than injected dependencies (H4).

---

## GRASP Principle Compliance

| Principle | Status | Notes |
|---|---|---|
| Information Expert | Partial | `optionhelper.js` processes data it does not own (M5) |
| Creator | Good | Record is created at appropriate call sites |
| Controller | Partial | `index.js` acts as a bloated controller (H1) |
| Low Coupling | Poor | `index.js` couples all subsystems together (H1, H2) |
| High Cohesion | Poor | `index.js` methods span unrelated domains (H1) |
| Polymorphism | Good | Plugin system and FDCStream use inheritance correctly |
| Pure Fabrication | Good | `optionhelper.js`, `util.js`, `errors.js` are appropriate fabrications |
| Indirection | Good | `optionhelper.js` provides indirection for request assembly |
| Protected Variations | Partial | Environment endpoint logic not protected behind a single variation point (H5) |

---

## Impact Assessment

| Severity | Count | Primary Categories |
|---|---|---|
| High | 7 | Bloaters (H1), Change Preventers (H2, H5), OO Abusers (H3), Data Dealers (H4), Dispensables (H6, H7) |
| Medium | 14 | Lexical Abusers (M1, M2, M3, M14), Data Dealers (M4), Couplers (M5), OO Abusers (M6), Dispensables (M7, M10, M13), Obfuscators (M8, M9, M11, M12) |
| Low | 10 | Lexical Abusers (L1, L5, L9), Technical Debt (L2, L8), Obfuscators (L3, L4, L6), Bloaters (L7), Dispensables (L10) |

---

## Recommendations and Refactoring Roadmap

### Phase 1 — Quick Wins (Low Risk, High Immediate Value)

1. **Remove dead code** (H6, H7, M10): Delete `isChunkedEncoding`, `nonJsonResponse`, and `getContentVersionBody`. Zero regression risk.
2. **Fix `isPatch` ternary** (L3): One-line change in `multipart.js`.
3. **Replace `for...in`** (M6): One-line change in `optionhelper.js`.
4. **Remove stale comments** (L9, L2 line 366): Remove `// Require syntax for Node < 10` and the orphaned TODO.
5. **Replace `==` with `===`** (M2): Mechanical replacement in `index.js` and `fdcstream.js`.
6. **Fix `apexRest` `data.uri` reference** (M11): One-line correction to use `opts.uri`.
7. **Extract `safeJsonParse`** (L10): Eliminates duplicated JSON error catch block.
8. **Fix `isPatch` and `let`-to-`const`** in `multipart.js` (M3, L3): All six variables should be `const`.

### Phase 2 — Design Improvements (Medium Risk, Medium Impact)

9. **Replace deprecated `querystring`** (M14): Replace `qs.stringify` with `URLSearchParams`.
10. **Remove orphaned `request`-library options** (M7): Remove `encoding`, `preambleCRLF`, `postambleCRLF`, `ropts.multipart` from `optionhelper.js`. Implement Fetch-native multipart via `FormData`.
11. **Fix `_queryHandler` double `_getOpts`** (M12): Rename parameter and remove redundant call.
12. **Fix `search()` response shape** (M9): Align with Salesforce SOSL API — use `resp.searchRecords`.
13. **Export `getHeader` from `util.js`** (M13): Eliminate inline header-access ternary duplication.
14. **Consolidate `self = this` patterns** (L1): Convert inner callbacks to arrow functions throughout.
15. **Simplify `_getOpts` signature** (M8): Remove the dead callback parameter and type dispatch.
16. **Convert `Plugin` to ES6 class** (L8): Consistency with codebase direction.
17. **Extract `_getLoginUri()` helper** (H5): Centralise sandbox/production endpoint selection.

### Phase 3 — Architectural Refactoring (Higher Risk, Highest Long-Term Impact)

18. **Complete the ES6 class migration** (H3, L2 line 23): Move all prototype methods into `lib/connection.js`. This eliminates the duplicate constructor and satisfies the existing TODO.
19. **Split `index.js` by responsibility** (H1, H2): Extract `AuthClient`, `CrudClient`, `QueryClient`, `BlobClient` modules. `index.js` becomes a thin public facade.
20. **Move plugin registry to instance scope** (H4): Eliminate module-level mutable state.
21. **Introduce OAuthToken value object** (M4): Validate and encapsulate OAuth token shape at entry points.

---

## Appendix: Files Analysed

| File | Lines | Status |
|---|---|---|
| `/Users/stw/Code/nforce8/index.js` | 995 | Fully analysed |
| `/Users/stw/Code/nforce8/lib/record.js` | 187 | Fully analysed |
| `/Users/stw/Code/nforce8/lib/connection.js` | 93 | Fully analysed |
| `/Users/stw/Code/nforce8/lib/fdcstream.js` | 105 | Fully analysed |
| `/Users/stw/Code/nforce8/lib/optionhelper.js` | 113 | Fully analysed |
| `/Users/stw/Code/nforce8/lib/multipart.js` | 28 | Fully analysed |
| `/Users/stw/Code/nforce8/lib/util.js` | 71 | Fully analysed |
| `/Users/stw/Code/nforce8/lib/constants.js` | 47 | Fully analysed |
| `/Users/stw/Code/nforce8/lib/errors.js` | 21 | Fully analysed |

Test files and examples were read for cross-reference only and are not scored as production smells.

## Detection Methodology

- Full static read of all 9 source files
- Cross-file grep for: `self = this`, loose equality `==`, `for...in`, `TODO/FIXME`, `http://` URLs, dead exports, duplicated patterns, deprecated module imports
- Method count via prototype grep (49 methods on `Connection`)
- Line counting via `wc -l`
- Smell catalog: Fowler (1999/2018), Martin (2008), Jerzyk (2022)
- SOLID/GRASP compliance assessed per principle against all code paths
