# Code Refactoring Summary — nforce8

## Overview

**Project**: nforce8 — Salesforce REST API wrapper for Node.js
**Date**: 2026-03-23
**Total Recommendations**: 20
**Already Fixed**: 3 runtime bugs (BUG-1, BUG-2, MD-6 `for...in` on array)
**Remaining Runtime Defect**: ARCH-1 — broken auto-refresh promise chain (R-04)

---

## Priority Matrix

| Recommendation | Impact | Complexity | Risk |
|---|---|---|---|
| R-04 Fix broken auto-refresh promise chain | H | M | M |
| R-01 Fix `search()` dead code / logic bug | H | L | L |
| R-02 Use `Record.setId()` not `_fields.id` | H | L | L |
| R-05 Eliminate 8 Promise constructor anti-patterns | H | L | L |
| R-20 Decompose the God Object (44 methods) | H | H | H |
| R-03 Extract `MULTIPART_TYPES` constant | M | L | L |
| R-06 Extract `_resolveWithRefresh` helper | M | L | L |
| R-07 Parameterize four URL helper methods | M | L | L |
| R-08 Parameterize four blob retrieval methods | M | L | L |
| R-09 Fix `apexRest` data vs opts access | M | L | L |
| R-13 Fix `getVersions` hardcoded URL | M | L | L |
| R-19 Resolve dead ES6 Connection class | M | L | L |
| R-10 Fix `_queryHandler` double `_getOpts` | L | L | L |
| R-11 Normalize `==` to `===` | L | L | L |
| R-12 Standardize `let` / `const` for opts | L | L | L |
| R-14 Remove redundant `toLowerCase()` | L | L | L |
| R-15 Remove unused `self` variables | L | L | L |
| R-16 Fix boolean ternary in `multipart.js` | L | L | L |
| R-17 Tighten `apiMatch` validation regex | L | L | L |
| R-18 Remove dead error factory functions | L | L | L |

**Impact**: H = High / M = Medium / L = Low
**Complexity**: H = High / M = Medium / L = Low
**Risk**: H = High / M = Medium / L = Low

---

## Quick Reference — Refactoring Techniques Applied

| Recommendation | Technique(s) from Refactoring Catalog |
|---|---|
| R-01 Fix search() | Substitute Algorithm, Remove Dead Code |
| R-02 Use setId() | Encapsulate Field (use existing API) |
| R-03 MULTIPART_TYPES constant | Replace Magic Number with Symbolic Constant |
| R-04 Fix auto-refresh | Replace Error Code with Exception, Separate Query from Modifier |
| R-05 Promise anti-patterns | Inline Method, Replace Temp with Query |
| R-06 Extract _resolveWithRefresh | Extract Method |
| R-07 URL methods parameterization | Parameterize Method |
| R-08 Blob methods parameterization | Parameterize Method |
| R-09 Fix apexRest access | Inline Temp |
| R-10 Double _getOpts | Inline Temp |
| R-11 Equality operators | Substitute Algorithm |
| R-12 let vs const | Substitute Algorithm |
| R-13 Fix getVersions | Replace Magic Number with Symbolic Constant |
| R-14 Double toLowerCase | Inline Temp |
| R-15 Unused self | Remove Assignments to Parameters, Inline Temp |
| R-16 Boolean ternary | Substitute Algorithm |
| R-17 apiMatch regex | Substitute Algorithm |
| R-18 Dead error factories | Remove Dead Code |
| R-19 Dead Connection class | Inline Class |
| R-20 God Object decomposition | Extract Class, Extract Superclass, Move Method |

---

## Code Smell Categories Addressed

| Smell Category | Recommendations | Count |
|---|---|---|
| Composing Methods | R-05, R-06, R-09, R-10, R-14, R-15 | 6 |
| Moving Features | R-02, R-20 | 2 |
| Organizing Data | R-03, R-12, R-13, R-17 | 4 |
| Simplifying Conditionals | R-11, R-16 | 2 |
| Simplifying Method Calls | R-07, R-08 | 2 |
| Dealing with Generalization | R-18, R-19, R-20 | 3 |
| Bug / Correctness | R-01, R-04 | 2 |
| Style / Cleanup | R-12, R-15, R-16 | (overlapping) |

---

## Expected Benefits by Phase

### Phase 1 — Correctness (immediate)

- **R-04 completed**: `autoRefresh: true` works end-to-end for the first time
- **R-01 completed**: `search()` returns `Record` instances in non-raw mode as documented
- **R-02 completed**: After an `insert()`, the SObject's change-tracking correctly reflects the assigned `id`
- Net: Three behavioral defects eliminated with minimal code change

### Phase 2 — Code Quality (1 day)

- Magic string duplication eliminated (R-03) — binary type list maintained in one place
- Three equality-consistency issues resolved (R-11)
- Hardcoded insecure URL fixed (R-13)
- Dead code removed: redundant `toLowerCase()`, unused `self`, dead error factories, dead ES6 class
- All changes are mechanical with zero behavior impact and low review cost

### Phase 3 — Structural Deduplication (2–3 days)

- Eight Promise constructor anti-patterns replaced with clean chains (R-05) — eliminates a class of swallowed exceptions
- Four URL methods consolidated into one helper — any future URL-handling change touches one place (R-07)
- Four blob methods consolidated into one helper (R-08)
- Duplicated `onRefresh` callback block extracted (R-06) — `authenticate` and `refreshToken` now share a single implementation
- Result: `index.js` shrinks by ~60–80 lines without any public API change

### Phase 4 — Architectural Refactoring (1–2 weeks)

- God Object resolved: `index.js` becomes a thin entry point; domain logic moves to focused modules
- Plugin registry scoped per-instance: cross-test contamination eliminated
- `lib/connection.js` becomes the canonical `Connection` class — the abandoned ES6 migration completed
- Each domain area (`auth`, `crud`, `query`, `metadata`, `blob`, `streaming`) can be tested and modified independently
- `autoRefresh` path testable in isolation without spinning up the full connection

---

## Recommended Implementation Sequence

```
Phase 1 — Correctness  (before any other work)
  1.  R-02  Use setId() instead of _fields.id              15 min   Low risk
  2.  R-01  Fix search() dead code / resolve recs           30 min   Low risk
  3.  R-04  Fix auto-refresh broken promise chain          2-3 hr   Medium risk

Phase 2 — Quick Wins  (1 day, all Low risk)
  4.  R-03  MULTIPART_TYPES constant                        20 min
  5.  R-09  Fix apexRest data vs opts                       10 min
  6.  R-11  Normalize == to ===                             10 min
  7.  R-12  Standardize let/const for opts                  30 min
  8.  R-13  Fix getVersions URL                             20 min
  9.  R-14  Remove redundant toLowerCase                     5 min
  10. R-15  Remove unused self variables                    15 min
  11. R-16  Fix boolean ternary in multipart.js              5 min
  12. R-17  Tighten apiMatch regex                          10 min
  13. R-18  Remove dead error factories                     20 min
  14. R-19  Remove dead ES6 Connection class                30 min

Phase 3 — Structural  (2-3 days, all Low risk except where noted)
  15. R-05  Eliminate Promise anti-patterns                2-3 hr   (do _apiRequest as part of R-04)
  16. R-06  Extract _resolveWithRefresh                    45 min
  17. R-07  Parameterize URL methods                       45 min
  18. R-08  Parameterize blob methods                      30 min
  19. R-10  Fix _queryHandler double _getOpts              15 min

Phase 4 — Architecture  (1-2 weeks, High risk — requires test expansion)
  20. R-20  Decompose God Object into domain modules        1-2 wks
```

---

## Key Dependency Rules

- R-04 (auto-refresh fix) must be done before R-05 (anti-pattern removal) for `_apiRequest` — they touch the same method
- R-05 (direct chains) is a prerequisite for R-06 (onRefresh extraction) — both assume `.then()` chain style
- R-19 (remove dead class) is a prerequisite for R-20 (class migration) — clean slate before rebuilding
- R-03 (MULTIPART_TYPES constant) should precede any insert/update changes in R-20 to avoid re-touching those methods

---

## SOLID Compliance — Current vs. Target

| Principle | Current | After Phase 1-3 | After Phase 4 |
|---|---|---|---|
| SRP | 4/10 | 5/10 | 9/10 |
| OCP | 6/10 | 7/10 | 8/10 |
| LSP | 9/10 | 9/10 | 9/10 |
| ISP | 8/10 | 8/10 | 9/10 |
| DIP | 6/10 | 6/10 | 8/10 |

The SRP score is the primary driver — resolving the God Object (R-20) delivers the largest single improvement. Phases 1–3 provide measurable correctness and maintainability gains with low risk and no architectural disruption.
