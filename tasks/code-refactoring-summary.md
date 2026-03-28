# Code Refactoring Summary — nforce8 (Phase 3)

**Generated:** 2026-03-28
**Phase:** 3 (post R01–R14)
**Total Recommendations:** 15 (R15–R29)
**Current Quality Grade:** B → Target: A-

---

## High-Level Overview

Two prior refactoring phases have already decomposed the original monolithic `index.js`, eliminated trivial getter/setter delegation, replaced a boolean flag with explicit methods, and made OAuth token mutation non-mutating. The codebase is well-structured. Phase 3 focuses on the 32 remaining issues: two high-severity architectural problems, seventeen medium-severity design issues, and thirteen low-severity readability concerns.

The 15 Phase 3 recommendations address:
- **Architectural correctness:** Removing a hidden mutation sentinel on caller-owned objects and eliminating a transport-layer side-effect that secretly manages credential state.
- **Test isolation:** Encapsulating shared mutable mock server state into an instantiable class.
- **Duplication elimination:** Extracting repeated patterns in `api.js` (GET dispatch, blob getters) and `cometd.js` (re-subscribe loop).
- **API contract clarity:** Migrating the sole callback-style hook to Promise-based convention and adding JSDoc typedefs for the `opts` parameter bag.
- **Readability:** Naming magic WebSocket frame constants, standardizing optional-argument style, and removing dead/redundant code.

---

## Priority Matrix

| Recommendation | Impact | Complexity | Risk |
|----------------|--------|------------|------|
| R15 — Replace `opts._retryCount` with closure parameter | H | L | L |
| R16 — Remove side-effect from `_apiAuthRequest` | H | L | L |
| R17 — Encapsulate mock server state in class | H | M | L |
| R18 — Extract `_resubscribeAll()` in `cometd.js` | H | L | L |
| R19 — Extract `_blobGetter` factory in `api.js` | H | L | L |
| R20 — Extract `_get()` helper for GET methods | M | L | L |
| R21 — Replace `onRefresh` callback with Promise hook | M | M | M |
| R22 — Name WebSocket frame constants (test mock) | M | L | L |
| R23 — Name `WS_RESPONSE_TIMEOUT_MS` in `cometd.js` | M | L | L |
| R24 — Standardize default-param style in `fdcstream.js` | M | L | L |
| R25 — Add JSDoc `@typedef` shapes for `opts` | M | M | L |
| R26 — Remove section-divider comments in `api.js` | L | L | L |
| R27 — Fix `getLastRequest` semantics in mock | M | L | L |
| R28 — Eliminate dead code and redundant constructs | L | L | L |
| R29 — Extract WS frame parse/build helpers | L | M | L |

**Impact:** H = High, M = Medium, L = Low
**Complexity:** H = High, M = Medium, L = Low
**Risk:** H = High, M = Medium, L = Low

---

## Quick Reference: Refactoring Techniques Applied

| Recommendation | Primary Technique(s) | Category |
|----------------|---------------------|----------|
| R15 | Remove Assignments to Parameters + Extract Method | Composing Methods |
| R16 | Separate Query from Modifier | Simplifying Method Calls |
| R17 | Extract Class | Moving Features Between Objects |
| R18 | Extract Method | Composing Methods |
| R19 | Extract Method + Parameterize Method | Composing Methods |
| R20 | Extract Method + Parameterize Method | Composing Methods |
| R21 | Replace Error Code with Exception (async variant) | Simplifying Method Calls |
| R22 | Replace Magic Number with Symbolic Constant | Organizing Data |
| R23 | Replace Magic Number with Symbolic Constant | Organizing Data |
| R24 | Substitute Algorithm (style normalization) | Composing Methods |
| R25 | Introduce Parameter Object (documentation tier) | Simplifying Method Calls |
| R26 | Remove Comments (Extract Method not needed — names suffice) | Composing Methods |
| R27 | Rename Method + Substitute Algorithm | Simplifying Method Calls |
| R28 | Inline Temp + Remove Dead Code | Composing Methods |
| R29 | Extract Method | Composing Methods |

---

## Key Benefits by Area

### Correctness and Safety

- **R15** eliminates a hidden mutation of the caller's `opts` object in the retry path. The `_retryCount` sentinel is invisible to callers and can silently suppress auto-refresh on reused opts objects. Replacing it with a closure parameter is both safer and more readable.
- **R16** removes an overlapping credential-write side-effect from a transport method. The credential merge already happens in `auth.js`; the double-write in `_apiAuthRequest` creates confusion about which write "wins."
- **R17** eliminates global mutable state shared across all test files in the mock server, ending the risk of test suite cross-contamination and making the test infrastructure predictable and deterministic.

### Maintainability

- **R18** ensures re-subscribe logic is defined in one place. Currently, any change to how topics are re-subscribed after reconnect requires identical edits in `_rehandshake` and `_scheduleReconnect`.
- **R19** collapses three structurally identical six-line blob-getter functions into a single factory. Adding a new binary content type (e.g., a fourth SObject) requires one line instead of duplicating an entire function.
- **R20** eliminates the three-line `opts.resource / opts.method / return _apiRequest` boilerplate repeated across six GET-only methods. A future change to all read paths (e.g., adding a tracing header) requires one edit instead of six.

### API Contract Clarity

- **R21** eliminates the single callback-style hook in an otherwise fully Promise-based library. After migration, `onRefresh` follows the same async contract as every other extensibility hook in the system.
- **R25** adds JSDoc `@typedef` declarations that surface the `opts` parameter bag contract to IDE tooling and human readers, without requiring a TypeScript migration.

### Readability

- **R22 and R23** replace raw RFC 6455 byte constants and inline timeout values with named constants that document intent.
- **R24** standardizes the three legacy `opts = opts || {}` guards in `fdcstream.js` to match the ES6 default parameter style used everywhere else.
- **R26 and R28** remove redundant section-divider comments, dead code blocks, and unnecessary `Promise.resolve` wrappers.

---

## Recommended Implementation Sequence

Run `npm test` after each step to catch regressions immediately.

```
Step 1  R26  Remove section-divider comments in api.js            (cosmetic baseline)
Step 2  R28  Eliminate dead code + redundant Promise.resolve       (clean up noise)
Step 3  R23  Name WS_RESPONSE_TIMEOUT_MS in cometd.js             (one-line constant)
Step 4  R24  Standardize default-param style in fdcstream.js       (isolated module)
Step 5  R15  Replace opts._retryCount with closure parameter       (high-impact fix)
Step 6  R16  Remove _apiAuthRequest side-effect                    (follows from R15)
Step 7  R18  Extract _resubscribeAll() + emit error on catch       (isolated to cometd.js)
Step 8  R19  Extract _blobGetter factory                           (isolated to api.js)
Step 9  R20  Extract _get() helper for GET methods                 (api.js, after R19)
Step 10 R22  Name WS frame constants in cometd-server.js           (prereq for R29)
Step 11 R29  Extract _parseWsFrames / _buildWsFrame helpers        (build on R22)
Step 12 R17  Encapsulate mock server in class (+ R27 fix included) (larger test refactor)
Step 13 R25  Add JSDoc @typedef shapes for opts                    (documentation pass)
Step 14 R21  Replace onRefresh callback with Promise hook          (breaking change last)
```

**R27** (fix `getLastRequest` semantics) is subsumed into **R17** and does not need a separate step.

---

## Breaking Changes

Only **R21** introduces a breaking change to the public API:

| Change | Nature | Migration |
|--------|--------|-----------|
| `onRefresh` signature changes from `(newOauth, oldOauth, cb)` to `(newOauth, oldOauth) => Promise\|void` | Breaking | Callers must remove the `cb` parameter and return a Promise (or nothing) to signal errors. A backward-compat shim is available for the transition period (see full report R21). |

All other recommendations are either internal implementation changes, test infrastructure changes, documentation additions, or cosmetic cleanups.

---

## Files Affected

| File | Recommendations |
|------|----------------|
| `lib/http.js` | R15, R16 |
| `lib/auth.js` | R16, R21, R28 |
| `lib/api.js` | R19, R20, R25, R26 |
| `lib/cometd.js` | R18, R23 |
| `lib/fdcstream.js` | R24 |
| `lib/util.js` | R28 |
| `test/mock/sfdc-rest-api.js` | R17, R27 |
| `test/mock/cometd-server.js` | R22, R29 |
| `test/integration.js` | R28 |
| `test/crud.js` | R17 (consumer update) |
| `test/query.js` | R17 (consumer update) |
| `test/errors.js` | R17 (consumer update) |
| `test/connection.js` | R17 (consumer update), R21 |

---

## Risk Distribution Summary

| Risk Level | Count | Recommendations |
|------------|-------|----------------|
| Low | 14 | R15, R16, R17, R18, R19, R20, R22, R23, R24, R25, R26, R27, R28, R29 |
| Medium | 1 | R21 |
| High | 0 | — |

The absence of high-risk recommendations reflects that Phase 1 and Phase 2 already addressed the most structurally disruptive changes. All Phase 3 recommendations are additive or confined to specific modules and can be implemented incrementally with continuous test verification.
