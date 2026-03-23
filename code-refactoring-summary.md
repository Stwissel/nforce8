# Code Refactoring Summary — nforce8

**Generated**: 2026-03-23
**Based on**: code-smell-detector-report.md (18 issues) and code-refactoring-report.md (20 recommendations)
**Codebase state**: 91 tests passing, Node 22+, 2 runtime dependencies

---

## Overview

The codebase has one broken feature, one correctness bug, one silent misconfiguration, and a collection of mechanical and architectural improvements. 20 recommendations are organized across four phases.

---

## Priority Matrix

| ID | Recommendation | Impact | Complexity | Risk |
|----|---------------|--------|------------|------|
| **R01** | Rewrite multipart upload to use FormData | H | M | M |
| **R02** | Apply AbortSignal.timeout to _apiRequest | H | L | L |
| **R03** | Fix previous() falsy value bug | H | L | L |
| **R04** | Replace deprecated querystring with URLSearchParams | M | L | L |
| **R05** | Remove unnecessary url module import | L | L | L |
| **R06** | Replace _changed Array with Set | M | L | L |
| **R07** | Simplify hasChanged control flow | L | L | L |
| **R08** | Fix getVersions magic HTTP URL | M | L | L |
| **R09** | Remove dead callback scaffolding from _getOpts | M | L | L |
| **R10** | Add 'use strict' to five files | L | L | L |
| **R11** | Remove unnecessary self = this aliases | L | M | L |
| **R12** | Split _getPayload into _getFullPayload / _getChangedPayload | M | L | L |
| **R13** | Replace getBody if/else chain with dispatch map | L | L | L |
| **R14** | Fix _extensionEnabled dead assignment in fdcstream.js | L | L | L |
| **R15** | Implement or remove the gzip option | M | M | M |
| **R17** | Complete ES6 class migration into lib/connection.js | H | H | H |
| **R18** | Extract lib/plugin.js | M | L | L |
| **R19** | Split index.js by responsibility domain | H | H | M |

Impact, Complexity, Risk: H = High, M = Medium, L = Low

---

## Recommended Implementation Sequence

### Phase 1 — Fix Broken or Incorrect Behavior (do first)

| Order | ID | What | Why First |
|-------|----|------|-----------|
| 1 | R01 | Rewrite multipart to FormData | Multipart upload sends no body — feature is broken |
| 2 | R02 | Add AbortSignal.timeout to _apiRequest | All non-auth API calls are unbounded; timeout config silently ignored |
| 3 | R03 | Fix previous() falsy value bug | Returns undefined for 0, '', false, null — correctness bug |

### Phase 2 — Mechanical Quick Wins (any order, single session)

| Order | ID | What | Effort |
|-------|----|------|--------|
| 4 | R04 | Replace querystring with URLSearchParams | 20 min |
| 5 | R05 | Remove url module import | 5 min |
| 6 | R06 | Replace _changed Array with Set | 30 min |
| 7 | R07 | Simplify hasChanged control flow | 5 min |
| 8 | R08 | Fix getVersions magic HTTP URL | 10 min |
| 9 | R09 | Remove dead callback from _getOpts | 20 min |
| 10 | R10 | Add 'use strict' to five files | 5 min |

### Phase 3 — Design and Consistency

| Order | ID | What | Effort |
|-------|----|------|--------|
| 11 | R11 | Remove self = this where arrow functions suffice | 1-2 h |
| 12 | R12 | Split _getPayload into two named methods | 30 min |
| 13 | R13 | Replace getBody if/else with dispatch map | 15 min |
| 14 | R14 | Fix _extensionEnabled dead assignment | 10 min |
| 15 | R15 | Implement or remove gzip option | 1-2 h |

### Phase 4 — Architectural Decomposition (feature branch, code review)

| Order | ID | What | Effort | Depends on |
|-------|----|------|--------|-----------|
| 16 | R18 | Extract lib/plugin.js | 1 h | — |
| 17 | R17 | Complete ES6 class migration | 3-5 h | R11 (self cleanup), R09 (_getOpts cleanup) |
| 18 | R19 | Split index.js by responsibility | 4-6 h | R17 |

---

## Quick Reference — Refactoring Techniques Applied

| Technique | IDs |
|-----------|-----|
| Substitute Algorithm | R01, R02, R04, R11, R15 |
| Replace Data Value with Object | R06 |
| Replace Parameter with Explicit Methods | R12 |
| Remove Parameter | R09 |
| Replace Nested Conditional with Guard Clauses | R03, R07 |
| Replace Conditional with Polymorphism (dispatch map) | R13 |
| Replace Magic Number with Symbolic Constant | R08 |
| Inline Method | R05 |
| Move Method / Move Field | R14, R18 |
| Extract Class | R18, R19 |
| Pull Up Method / Pull Up Constructor Body | R17 |
| Introduce Assertion (strict mode) | R10 |

---

## Key Issues Being Fixed

### Broken Feature
**R01 — Multipart Upload** (`lib/multipart.js`, `lib/optionhelper.js`)
Document, Attachment, and ContentVersion insert/update calls send a request with a `Content-Type: multipart/form-data` header and no body. The fix rewrites `multipart.js` to return a `FormData` instance and updates `optionhelper.js` to assign it to `ropts.body`.

### Silent Misconfiguration
**R02 — Timeout** (`index.js`, `lib/optionhelper.js`)
Authentication calls respect the configured `timeout` via `AbortSignal.timeout`. All other API calls (CRUD, query, search, etc.) do not — `ropts.timeout` is set but `fetch` ignores it. Fix: apply the identical `AbortSignal.timeout` block from `_apiAuthRequest` to `_apiRequest`.

### Correctness Bug
**R03 — previous() Falsy Values** (`lib/record.js`)
`Record.prototype.previous('field')` returns `undefined` when the previous value was `0`, `''`, `false`, or `null`. Fix: change truthiness check `if (this._previous[field])` to presence check `if (field in this._previous)`.

### Deprecated Module
**R04 — querystring** (`index.js`)
The `querystring` module is deprecated in Node.js. Four call sites can be directly replaced with `new URLSearchParams(obj).toString()`.

### Performance and Data Structure
**R06 — _changed Array** (`lib/record.js`)
`_changed` is maintained as an `Array` but used exclusively for membership testing. `Array.includes()` is O(n); `Set.has()` is O(1). Converting to `Set` also removes the need for the `includes()` guard in `set()` since `Set.add()` is idempotent.

### Architectural
**R17 — ES6 Class Migration** (`index.js`, `lib/connection.js`)
`index.js` has a `// TODO turn into ES6 class` comment on line 23 and contains a `Connection` function constructor with 46 prototype methods. `lib/connection.js` has an ES6 `class Connection` stub that is never used as a class. Completing the migration eliminates the duplicate definition and makes individual concerns independently testable.

---

## Expected Benefits by Phase

| Phase | Primary Benefits |
|-------|-----------------|
| Phase 1 | Multipart upload works; timeout enforced on all requests; previous() returns correct values |
| Phase 2 | No deprecated modules; codebase consistent with Node 22+ idioms; dead code removed |
| Phase 3 | Clearer method names; consistent patterns; no misleading dead state; gzip option honest |
| Phase 4 | Single canonical Connection class; plugin system independently maintainable; index.js is a thin composition root; each concern independently testable |

---

## Files Affected

| File | Recommendations |
|------|----------------|
| `index.js` | R02, R04, R08, R09, R11, R13, R17, R18, R19 |
| `lib/record.js` | R03, R06, R07, R11, R12 |
| `lib/multipart.js` | R01, R10 |
| `lib/optionhelper.js` | R01, R02, R05 |
| `lib/connection.js` | R15 (gzip validation), R17 |
| `lib/constants.js` | R15 (gzip default) |
| `lib/fdcstream.js` | R10, R14 |
| `lib/util.js` | R10 |
| `lib/errors.js` | R10 |
| `lib/plugin.js` (new) | R18 |
