# Code Refactoring Summary: nforce8

**Date**: 2026-03-26
**Source**: code-smell-detector-report.md (28 issues) → code-refactoring-report.md (18 recommendations)
**Codebase**: 96 tests passing, Node.js >= 22, 2 runtime dependencies (faye, mime-types)

---

## Overview

The nforce8 codebase is in good health following a recent architectural split. The 18 refactoring recommendations in this summary address the remaining issues in four priority tiers. All recommendations are low risk and none break the public API. Expected outcomes: 182 ESLint errors eliminated, 1 null bug fixed, 1 silent test assertion bug exposed, ~47 lines of production code removed, and the codebase brought into full consistency with its own conventions.

---

## Priority Matrix

### High Impact

| ID  | Recommendation                          | Impact | Complexity | Risk | Smell IDs |
|-----|-----------------------------------------|--------|------------|------|-----------|
| R01 | Fix 182 quote-style lint errors         | H      | L          | L    | H1, L1    |
| R02 | Remove dead `Connection` class          | H      | L          | L    | H2, M1    |
| R03 | Fix `isObject(null)` null bug           | H      | L          | L    | M8        |
| R04 | Fix stray quote in query test URL       | H      | L          | L    | L11       |

### Medium Impact

| ID  | Recommendation                               | Impact | Complexity | Risk | Smell IDs |
|-----|----------------------------------------------|--------|------------|------|-----------|
| R05 | Remove `OptionHelper` constructor wrapper    | M      | L          | L    | M3        |
| R06 | Extract `getHeader` utility                  | M      | L          | L    | M11       |
| R07 | Consolidate URL methods via `_urlRequest`    | M      | M          | L    | M5        |
| R08 | Remove `_queryHandler` from public exports   | M      | L          | L    | M6        |
| R09 | Replace hardcoded OAuth revoke URLs          | M      | L          | L    | M4, L6    |
| R10 | Replace `let self = this` with arrow fns     | M      | L          | L    | M9        |
| R11 | Replace `arguments.length` in `Record.set`  | M      | L          | L    | M10       |

### Low Impact (Readability / Maintenance)

| ID  | Recommendation                               | Impact | Complexity | Risk | Smell IDs |
|-----|----------------------------------------------|--------|------------|------|-----------|
| R12 | Move `respToJson` above its call site        | L      | L          | L    | M12       |
| R13 | Remove unused `singleProp` from `getLimits`  | L      | L          | L    | L9        |
| R14 | Deprecate `stream` alias method              | L      | L          | L    | M7        |
| R15 | Remove empty test hooks and stub bodies      | L      | L          | L    | L3, L4    |
| R16 | Fix `client.logout()` non-existent call      | L      | L          | L    | L5        |
| R17 | Remove stale `'v54.0'` fallback constant     | L      | L          | L    | L6        |
| R18 | Consolidate `getIdentity` null-guard chain   | L      | L          | L    | L8        |

---

## Quick Reference: Refactoring Techniques Used

| Technique                              | Applied In      |
|----------------------------------------|-----------------|
| Substitute Algorithm                   | R01, R10, R11   |
| Inline Class                           | R02, R05        |
| Remove Dead Code                       | R02, R15        |
| Introduce Assertion                    | R03             |
| Extract Method                         | R06, R07, R12   |
| Parameterize Method                    | R07             |
| Hide Method                            | R08             |
| Replace Magic Number w/ Symbolic Const | R09, R17        |
| Remove Parameter                       | R13             |
| Inline Method (deprecation)            | R14             |
| Rename Method                          | R16             |
| Consolidate Conditional Expression     | R18             |

---

## Implementation Sequence

Apply in this order to minimize risk. Each phase can be a single commit or PR.

### Phase 1 — CI Fix (apply immediately, zero semantic risk)

```
R01  npx eslint . --fix  →  npm run lint passes  →  182 errors → 0
R04  Remove stray ' from test/query.js  →  silent false-pass becomes real assertion
R03  Fix isObject null bug + add unit test  →  isObject(null) returns false
```

### Phase 2 — Dead Code Removal

```
R02  Remove unused Connection class from lib/connection.js
R17  Remove 'v54.0' literal from lib/constants.js
R15  Remove empty beforeEach; implement/skip stub tests
R16  Fix client.logout() → client.revokeToken()
R13  Remove singleProp: 'type' from getLimits
R12  Move respToJson definition above _queryHandler
```

### Phase 3 — Structural Improvements

```
R05  Inline OptionHelper: direct exports, remove require()()
R06  Add getHeader utility; 12 lines → 2 lines in responseFailureCheck
R08  Remove _queryHandler from module.exports; use .call() internally
R09  Add revokeUri constants; use this.revokeUri in revokeToken
R07  Extract _urlRequest; 4 duplicate methods → 4 one-liners
R10  Replace let self = this with arrow functions in fdcstream.js
R11  Replace arguments.length dispatch in Record.set
```

### Phase 4 — Documentation

```
R18  Consolidate getIdentity null-guard chain
R14  Add @deprecated JSDoc to stream(); update README
```

---

## Key Benefits Expected

### Immediate (Phase 1)
- CI lint gate passes: 182 errors eliminated
- A silent test bug is exposed and fixed: `url.should.equal(expected)` in `test/query.js` will now actually verify URL construction
- Null-safety improved: `isObject(null)` returns `false` as intended

### Short-Term (Phases 2–3)
- **Reduced surface area**: `_queryHandler` removed from the public `Connection` prototype
- **Simpler module API**: `require('./optionhelper')` replaces the confusing `require('./optionhelper')()`
- **Maintainability**: Fixing one `_urlRequest` function fixes URL construction for all four HTTP verb methods
- **DRY headers**: One `getHeader()` call replaces 6-line ternary repeated twice in `responseFailureCheck`
- **Configurable revoke endpoint**: `revokeToken` works for private Salesforce instances with custom OAuth domains
- **Modern JavaScript**: No more `let self = this` or `arguments` object in ES6 class bodies

### Long-Term (Phase 4 + Future)
- `stream` deprecation sets up a clean public API for the next major version
- `isObject` null safety prevents a class of future runtime crashes

---

## Files Affected

| File | Recommendations |
|------|----------------|
| `lib/util.js` | R03 (isObject fix), R06 (getHeader) |
| `lib/api.js` | R07 (URL methods), R08 (_queryHandler), R12 (reorder), R13 (getLimits), R14 (stream), R18 (getIdentity) |
| `lib/auth.js` | R09 (revokeToken URLs) |
| `lib/http.js` | R05 (optionhelper import), R06 (getHeader usage) |
| `lib/connection.js` | R02 (remove dead Connection class) |
| `lib/constants.js` | R09 (add revokeUri), R17 (remove v54.0) |
| `lib/optionhelper.js` | R05 (remove constructor wrapper) |
| `lib/fdcstream.js` | R10 (arrow functions) |
| `lib/record.js` | R11 (arguments.length) |
| `index.js` | R01 (quote style) |
| `test/query.js` | R04 (stray quote) |
| `test/record.js` | R15 (empty hooks/tests) |
| `test/plugin.js` | R15 (empty test) |
| `test/integration.js` | R16 (logout → revokeToken) |

---

## What Was Not Recommended (Deferred to Future Major Version)

Two issues from the smell report are architecturally significant but outside the scope of incremental refactoring:

**H3 — Global Plugin Registry** (`lib/plugin.js`)
The `plugins` singleton is a module-level mutable object. Fixing this requires introducing a `PluginRegistry` class and threading an optional registry instance through `createConnection`. This is a public API change requiring a semver major bump.

**H4 — OAuth as Untyped Plain Object**
The OAuth token flows through all modules as an unvalidated `{}`. Creating an `OAuth` value class with constructor validation would eliminate obscure `TypeError: Cannot read property 'instance_url' of undefined` crashes, but requires coordinated changes across five files (`lib/auth.js`, `lib/api.js`, `lib/http.js`, `lib/fdcstream.js`, `lib/optionhelper.js`). Recommended as a dedicated future PR after test coverage is strengthened.
