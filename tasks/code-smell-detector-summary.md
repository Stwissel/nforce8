# Code Quality Summary — nforce8

**Analysis Date:** 2026-03-28
**Scope:** `index.js`, `lib/` (14 files), `test/` (10 files + 2 mock helpers)

---

## Critical Issues

**2 High-severity issues found — Prompt attention recommended**

### Top 3 Problems

1. **Global Mutable State in Test Mock** — `test/mock/sfdc-rest-api.js` uses module-level arrays shared across all test files. If tests run in parallel or a test fails to call `stop()`, state leaks between test suites. **Priority: High**

2. **Hidden Object Mutation (Retry Sentinel)** — `lib/http.js` writes a secret `_retryCount` field onto the caller's options object to prevent retry loops. This is an invisible side-effect that makes the auto-refresh behavior hard to reason about and could silently break callers who reuse options objects. **Priority: High**

3. **Callback API in a Promise-Only Library** — The `onRefresh` hook in `lib/auth.js` uses Node.js-style error-first callbacks (`function(newOauth, oldOauth, cb)`), while every other part of the library uses Promises exclusively. This inconsistency surprises integrators and requires extra bridging code internally. **Priority: Medium**

---

## Overall Assessment

- **Project Size:** 25 files analyzed, 1 language (JavaScript/Node.js)
- **Code Quality Grade:** B
- **Total Issues:** 32 (High: 2 | Medium: 17 | Low: 13)
- **Overall Complexity:** Low-to-Medium — well-modularized, active refactoring history

---

## Business Impact

- **Technical Debt:** Low — the library has been recently and actively refactored
- **Maintenance Risk:** Low — the code is readable and well-organized
- **Development Velocity Impact:** Low — issues are mostly polish rather than blockers
- **Recommended Priority:** Medium — address during normal development cycles

---

## Quick Wins

These fixes take minutes and yield immediate improvements:

- **Remove `opts._retryCount` side-effect**: Priority High — prevents hidden mutation bug
- **Move `require('crypto')` to file top**: Priority Low — 1-line consistency fix
- **Remove redundant `Promise.resolve` wrapping**: Priority Low — removes noise in `lib/auth.js`
- **Remove dead `if (creds == null)` block** in integration test: Priority Low — cleanup
- **Extract `_resubscribeAll()` helper** in `cometd.js`: Priority Low — removes duplicated code

---

## Major Refactoring Needed

- **`onRefresh` callback to Promise**: Priority Medium — breaking API change, needs a major version bump. The entire library is Promise-based; this is the one callback-style seam remaining.
- **Test mock refactoring (shared global state)**: Priority High — encapsulate `serverStack`/`requestStack` into a class to enable parallel or isolated test execution.
- **`opts` parameter bag documentation**: Priority Medium — adding JSDoc type definitions would make the parameter contract explicit for integrators and plugin authors.

---

## Recommended Action Plan

### Phase 1 (Immediate — this sprint)
- Fix the `opts._retryCount` hidden mutation (H-2)
- Move inline `require('crypto')` to file top (L-6)
- Remove redundant `Promise.resolve` wrapper (M-15)
- Remove dead code in `test/integration.js` (L-3, L-5)

### Phase 2 (Short-term — next 2–3 sprints)
- Deduplicate the three identical blob-retrieval functions in `lib/api.js`
- Deduplicate the repeated GET-request boilerplate in `lib/api.js`
- Standardize optional parameter handling in `lib/fdcstream.js`
- Remove side-effect from `_apiAuthRequest` in `lib/http.js`

### Phase 3 (Long-term — next major version)
- Migrate `onRefresh` from callback to Promise convention (breaking change)
- Encapsulate test mock state in a class
- Add JSDoc `@typedef` declarations for the `opts` parameter shapes

---

## Key Takeaways

- The codebase is in good health overall — grade B reflects solid recent refactoring, not neglect.
- The only two high-severity findings are both in the test/HTTP layer, not the core business logic.
- The largest category of smells is code duplication in `lib/api.js` — three near-identical blob-retrieval functions and a repeated GET request pattern — which should be the first design target.
- The `onRefresh` callback convention is the one legacy seam that breaks the library's otherwise clean Promise-only contract; fixing it requires a semver major bump but would simplify the internal bridging code.

---

*Detailed technical analysis with line-by-line findings available in `tasks/code-smell-detector-report.md`*
