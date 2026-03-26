# Code Quality Summary: nforce8

## Critical Issues
**4 High-severity issues found — includes 1 CI-blocking issue requiring immediate attention**

### Top 3 Problems
1. **182 Active Lint Errors** — All string quotes in 6 recently refactored files violate the project's own ESLint rule. CI will fail on every lint check. — **Priority: Immediate**
2. **Dead `Connection` Class** — A complete ES6 `Connection` class sits unused in `lib/connection.js` while `index.js` uses a separate constructor function. This is a confusing refactoring artifact. — **Priority: High**
3. **Untyped OAuth Object** — The OAuth token (`{ access_token, instance_url, ... }`) flows through the entire codebase as a plain object with no validation at call sites. Missing or malformed tokens produce obscure crashes. — **Priority: High**

---

## Overall Assessment
- **Project Size**: 13 source files, ~1,100 lines of production code, 1 primary language (JavaScript)
- **Code Quality Grade**: B
- **Total Issues**: High: 4 | Medium: 12 | Low: 12
- **Overall Complexity**: Low-Medium (the recent architectural refactoring successfully reduced complexity; remaining issues are contained and addressable)

---

## Business Impact
- **Technical Debt**: Medium — focused in specific areas, not systemic
- **Maintenance Risk**: Low-Medium — the codebase is readable and well-organized; risks are concentrated in the OAuth handling and the CI lint failure
- **Development Velocity Impact**: Low — the library is largely feature-complete; new feature additions are not blocked, but developers writing new code may copy the double-quote style and worsen the lint situation
- **Recommended Priority**: Immediate (for H1 and L11 — fixes take minutes); High (for remaining issues)

---

## Quick Wins
These issues take under 30 minutes total to fix and have outsized impact:

- **Fix lint errors (H1)**: Run `npx eslint . --fix` — 182 errors disappear in one automated command. Unblocks CI. **Priority: Immediate**
- **Fix test URL bug (L11)**: Remove one stray `'` character from `test/query.js` line 33. Activates a previously broken test assertion. **Priority: Immediate**
- **Fix `revokeToken` hardcoded URLs (M4)**: Replace two hardcoded Salesforce domain strings with configurable connection options. Fixes a real bug for enterprise users with custom domains. **Priority: High**
- **Fix `isObject(null)` (M8)**: Add `candidate !== null &&` to one line in `lib/util.js`. Eliminates a latent JavaScript footgun. **Priority: High**
- **Replace `let self = this` (M9)**: Convert two old-style closures in `fdcstream.js` to arrow functions. Modernizes the idiom with no behavior change. **Priority: Medium**

---

## Major Refactoring Needed
- **Dead `Connection` class in `lib/connection.js`** — **Priority: High** — Resolve the architectural ambiguity between the constructor function in `index.js` and the unused ES6 class. This decision unlocks proper encapsulation (private fields) for the whole library.
- **Untyped OAuth object (H4)** — **Priority: High** — Creating an `OAuth` value type would prevent a category of runtime crash and make the library significantly more robust for callers. This is the most impactful single structural improvement available.
- **Plugin registry as global singleton (H3)** — **Priority: Medium** — The module-level plugin store causes test isolation issues and limits use in serverless/multi-tenant environments. Refactoring to an injectable registry is a larger effort but enables proper testing.

---

## Recommended Action Plan

### Phase 1 (Immediate — minutes of work)
- Run `npx eslint . --fix` to resolve all 182 quote-style errors
- Fix the stray `'` in `test/query.js` line 33
- Add a pre-commit lint hook to prevent recurrence

### Phase 2 (Short-term — 1-2 days)
- Add revoke URI constants and fix `revokeToken` in `lib/auth.js`
- Fix `isObject` null exclusion in `lib/util.js`
- Replace `let self = this` with arrow functions in `lib/fdcstream.js`
- Fix the integration test teardown (`client.logout()` does not exist)
- Remove empty test bodies and dead commented-out code
- Remove unused `singleProp: 'type'` from `getLimits`

### Phase 3 (Long-term — architectural decisions)
- Consolidate the `Connection` definition (ES6 class vs. constructor function)
- Create an `OAuth` value type to replace the untyped plain object
- Make the plugin registry injectable rather than a global singleton

---

## Key Takeaways
- The recent architectural split of the monolithic `index.js` into `auth/api/http` was successful and significantly improved the codebase. The remaining issues are residual from that migration (quote style, dead class) or pre-existing structural choices (OAuth typing, plugin singleton).
- The most dangerous issue for end users is H4 (untyped OAuth) — passing a malformed OAuth object produces runtime crashes with no clear error message. A single `validateOAuth()` call in `_getOpts()` would provide an immediate partial mitigation.
- The codebase has zero security vulnerabilities detected, clean error factories, good test coverage of core flows, and a thoughtful plugin system. The foundation is strong.

---

*Detailed technical analysis (28 issues with file/line references and refactoring guidance) is available in `code-smell-detector-report.md`.*

*Analysis performed: 2026-03-26.*
