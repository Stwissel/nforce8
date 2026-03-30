# Code Quality Summary — nforce8

## Critical Issues
**3 high-severity issues found — immediate attention recommended**

### Top 3 Problems

1. **Missing `crypto` import in mock server** — `test/mock/cometd-server.js` uses `crypto.createHash()` without importing it, causing a `ReferenceError` when WebSocket upgrade code runs. **Priority: High**

2. **Silent test failures from flawed error-catch pattern** — 13 tests in `test/crud.js` and `test/query.js` use `.catch((err) => should.not.exist(err)).finally(done)` which calls `done()` unconditionally, masking assertion failures. **Priority: High**

3. **`upsert()` bypasses multipart body helper** — The upsert method in `lib/api.js` directly serializes to JSON instead of calling the `applyBody` helper, silently producing incorrect requests when upserting binary SObjects (Document, ContentVersion). **Priority: High**

---

## Overall Assessment

- **Project Size**: 25 files analyzed, ~4,500 lines, 1 language (JavaScript/Node.js)
- **Code Quality Grade**: B
- **Total Issues**: 30 (High: 3 | Medium: 11 | Low: 16)
- **Overall Complexity**: Low-to-Medium

## Business Impact

- **Technical Debt**: Low — the codebase is modern, well-structured, and well-commented
- **Maintenance Risk**: Low — clear module boundaries, consistent patterns
- **Development Velocity Impact**: Low — the issues found are contained and well-scoped
- **Recommended Priority**: High for the 3 critical items; Medium for remainder

---

## Quick Wins

- **Add `require('crypto')` to `test/mock/cometd-server.js`**: Priority: High — prevents a latent test crash with one line
- **Fix formatting in `lib/api.js` (missing spaces after `=`)**: Priority: Low — ESLint auto-fixable, no logic change
- **Remove redundant `Promise.resolve()` wrappers in `lib/auth.js`**: Priority: Low — simplification with zero risk
- **Replace `let` with `const` in `lib/optionhelper.js`**: Priority: Low — communicates immutability, ESLint auto-fixable
- **Extract `_resubscribeAll()` method in `lib/cometd.js`**: Priority: Medium — eliminates duplicated loop in 2 places

## Major Refactoring Needed

- **`api.js` (649 lines) — consider splitting by concern**: Priority: Low — CRUD, query/search, streaming, and URL utilities are independent concerns that could be separate modules without changing the public API. This would improve long-term maintainability.
- **Test mock server — eliminate global mutable state**: Priority: Medium — `test/mock/sfdc-rest-api.js` uses module-level arrays shared across all tests. Converting to a class-based instance would prevent cross-test contamination.

---

## Recommended Action Plan

### Phase 1 (Immediate — Days)
- Add missing `crypto` import to `test/mock/cometd-server.js`
- Fix `upsert()` to use `applyBody` helper in `lib/api.js`
- Replace the `.catch(should.not.exist).finally(done)` anti-pattern in test files

### Phase 2 (Short-term — Weeks)
- Run `eslint --fix` to resolve quote style in `cometd.js` and spacing in `api.js`
- Extract `_resubscribeAll()` method in `cometd.js`
- Remove redundant intermediate variables and `Promise.resolve()` wrappers

### Phase 3 (Long-term — Next major version)
- Evaluate splitting `api.js` into cohesive sub-modules
- Migrate `onRefresh` callback to accept Promises for consistency with the rest of the API
- Convert mock server to class-based isolation to remove shared state between tests

---

## Key Takeaways

- The codebase is in good health overall — no god objects, no sprawling class hierarchies, no deep callback nesting in production code
- The highest-impact issue is a latent bug in test infrastructure (`crypto` not imported) that could cause confusing test failures
- The test error-handling pattern is the most widespread quality issue: 13 tests silently swallow assertion failures
- Style inconsistencies (quote style in `cometd.js`, spacing in `api.js`) are mechanical fixes that ESLint can auto-resolve

---

*Detailed technical analysis with file-by-file findings available in `code-smell-detector-report.md`*
