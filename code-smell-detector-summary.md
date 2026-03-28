# Code Quality Summary — nforce8

## Critical Issues
**3 High-severity issues found — no CI-blocking bugs, but architectural patterns that increase maintenance cost**

### Top 3 Problems
1. **Indecent Exposure** — Private implementation helpers (`_authEndpoint`, `_getOpts`, `_apiRequest`, etc.) are exported onto the public `Connection` prototype — **Priority: High**
2. **Primitive Obsession / Data Clump** — A single mutable "opts bag" object carries all request state through every layer of the call stack, creating invisible coupling — **Priority: High**
3. **God Module** — `lib/api.js` (503 lines, 30 exports) combines 8 unrelated concerns: CRUD, metadata, blob retrieval, query, search, URL access, Apex REST, and streaming — **Priority: High**

---

## Overall Assessment
- **Project Size**: 22 files analyzed, 1 language (JavaScript / Node.js)
- **Code Quality Grade**: C
- **Total Issues**: High: 3 | Medium: 13 | Low: 14
- **Overall Complexity**: Medium — individual functions are well-written; architectural patterns create the majority of the debt

## Business Impact
- **Technical Debt**: Medium — the codebase is functional and well-tested; debt is structural rather than buggy
- **Maintenance Risk**: Medium — the opts-bag pattern and exposed privates make refactoring risky without broad test coverage
- **Development Velocity Impact**: Medium — new API methods are easy to add but hard to isolate, test, and reason about due to the shared opts pattern
- **Recommended Priority**: Medium — no immediate stability risk; address before the next major feature cycle

---

## Quick Wins
- **Fix spacing in `lib/api.js`**: Priority: Low — zero risk; eliminates 8 linting warnings
- **Remove `opts._refreshResult` dead write**: Priority: Medium — removes misleading code in the retry path
- **Fix mislabelled test in `test/record.js`**: Priority: Low — prevents future developer confusion
- **Remove commented-out block in `test/integration.js`**: Priority: Low — removes outdated credential placeholder
- **Add `err.type` to `emptyResponse()`**: Priority: Low — makes error factory API consistent

## Major Refactoring Needed
- **`lib/api.js`**: Priority: High — splitting into domain modules reduces change surface and improves testability
- **Private method exposure**: Priority: High — removing `_prefixed` methods from public exports prevents accidental external dependencies
- **Opts bag pattern**: Priority: Medium — introducing typed request objects reduces implicit coupling between call layers

---

## Recommended Action Plan

### Phase 1 — Immediate (Low risk, no API surface changes)
- Apply ESLint auto-fix for spacing in `lib/api.js`
- Remove the dead `opts._refreshResult` assignment in `lib/http.js` line 177
- Remove commented-out block and TODO in `test/integration.js`
- Fix mislabelled test description in `test/record.js` line 202
- Add `err.type = 'empty-response'` to `lib/errors.js`
- Extract `buildSignal()` helper in `lib/http.js` to eliminate duplicated timeout logic

### Phase 2 — Short-term (Design improvements, minimal API impact)
- Extract `applyBody()` helper in `lib/api.js` to unify the insert/update multipart logic
- Extract `_resolveEndpoint()` helper in `lib/auth.js` to unify the three endpoint functions
- Remove `_resolveOAuth` wrapper; replace with `Promise.resolve()` inline
- Add single-mode fail-fast guard in `_getOpts` for missing oauth
- Extract `makeOrg(overrides)` helper in `test/connection.js`

### Phase 3 — Long-term (Architectural, requires coordination)
- Stop exporting private `_`-prefixed methods from `auth.js`, `api.js`, `http.js`
- Sub-divide `lib/api.js` into `lib/crud.js`, `lib/query.js`, `lib/streaming.js`, `lib/metadata.js`
- Move multipart form construction into the `Record` class
- Standardize ES6 class syntax across `Connection` and `Record`

---

## Key Takeaways
- The codebase is significantly better than its starting point; the refactoring to extract domain modules was the right direction
- The largest remaining risk is the public exposure of private methods — external consumers could start depending on them, making future internal refactoring breaking changes
- The opts-bag pattern is the root cause of multiple related smells (Data Clump, Primitive Obsession, Mutable Data, Temporary Field) and is the highest-leverage thing to address long-term
- Test coverage is good, but many tests are coupled to private internals of `Record`, which will cause false test failures during future refactoring

---
*Detailed technical analysis available in `code-smell-detector-report.md`*
