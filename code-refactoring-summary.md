# Code Refactoring Summary

## Project: nforce8 — Node.js REST API Wrapper for Salesforce

**Date**: 2026-03-28
**Total Recommendations**: 22
**Source**: code-refactoring-report.md

---

## High-Level Overview

The 22 refactoring recommendations address three recurring themes identified in the code smell report:

| Theme | Recommendations | Risk Profile |
|---|---|---|
| Scattered duplication (identical code blocks, dead code, redundant wrappers) | R01–R09, R11 | Low |
| Missing guards and naming clarity | R10, R12–R14, R16 | Low |
| Architectural exposure and module cohesion | R15, R17–R22 | Medium–High |

The prior refactoring campaign already achieved the most impactful structural changes (decomposing the monolithic index.js into domain modules). The remaining work is refinement and hardening.

---

## Priority Matrix

| Recommendation | Description | Impact | Complexity | Risk |
|---|---|---|---|---|
| R01 | Remove dead `opts._refreshResult` write | M | L | L |
| R02 | Remove commented-out credential block | L | L | L |
| R03 | Fix fallacious `#getUrl` test description | L | L | L |
| R04 | Eliminate duplicate `package.json` read | L | L | L |
| R05 | Add `err.type = 'empty-response'` to error factory | M | L | L |
| R06 | Extract `buildSignal()` — remove duplicate AbortSignal setup | M | L | L |
| R07 | Extract `applyBody()` — unify insert/update body logic | M | L | L |
| R08 | Extract `resolveEndpoint()` — unify 3 endpoint conditionals | M | L | L |
| R09 | Inline `_resolveOAuth` — remove trivial wrapper | M | L | L |
| R10 | Add fail-fast guard for single-mode missing OAuth | H | L | L |
| R11 | Extract `makeOrg()` test helper | M | L | L |
| R12 | Replace magic strings with named constants | M | L | L |
| R13 | Rename `_getOpts` parameter `d` to `input` | L | L | L |
| R14 | Rename `getBody` to `getBinaryContent` | M | M | M |
| R15 | Apply `eslint --fix` for spacing inconsistencies | L | L | L |
| R17 | Move multipart form-building into `Record.toMultipartForm` | H | M | M |
| R18 | Separate private helpers from `module.exports` | H | H | H |
| R19 | Sub-divide `lib/api.js` into domain modules | H | H | H |
| R20 | Introduce typed request value objects | H | H | H |
| R21 | Separate retry state from opts bag | M | M | M |
| R22 | Standardize on ES6 class syntax | M | H | M |

---

## Quick Reference — Refactoring Techniques Applied

| Technique | Applied In |
|---|---|
| **Extract Method** | R06, R07, R08, R11 |
| **Inline Method** | R09 |
| **Remove Dead Code** | R01, R02 |
| **Rename Method** (incl. parameters) | R03, R13, R14 |
| **Inline Temp** | R04 |
| **Introduce Assertion** | R05, R10 |
| **Replace Magic Number with Symbolic Constant** | R12 |
| **Move Method** | R17 |
| **Hide Delegate** | R17 |
| **Hide Method** | R18 |
| **Extract Interface** | R18 |
| **Extract Class** (module-level) | R19 |
| **Introduce Parameter Object** | R20 |
| **Replace Data Value with Object** | R20 |
| **Split Temporary Variable** | R21 |
| **Remove Assignments to Parameters** | R21 |
| **Substitute Algorithm** (ES6 conversion) | R22 |
| **Consolidate Conditional Expression** | R08 |

---

## Key Benefits Expected

### Phase 1 Quick Wins
- **Dead code removal** (R01, R02): Eliminates misleading code paths and stale credential artifacts. Reduces noise during code review and grep searches.
- **Test accuracy** (R03): Removes a misleading test description that could cause developers to incorrectly diagnose test failures.
- **Constants consolidation** (R04): Ensures `API_VERSION` in `index.js` always tracks the same value as `CONST.API`, eliminating the risk of them diverging.
- **Error API symmetry** (R05): Enables programmatic error type discrimination for `emptyResponse` errors, matching the existing `invalidJson` capability.
- **Signal helper** (R06): Removes a copy-paste hazard; any future change to timeout/abort logic is made in exactly one place.

### Phase 2 Design Improvements
- **Body logic unification** (R07): Makes `insert` and `update` visually symmetric and reduces future mutation risk.
- **Endpoint helper** (R08): Reduces the three sandbox/production endpoint functions to one-liners, making the shared logic obvious and testable in isolation.
- **Remove trivial wrapper** (R09): Reduces the public surface of Connection by one private method; tests that relied on the wrapper are redirected to test observable outcomes.
- **Fail-fast guard** (R10): Converts a cryptic `TypeError` (property access on undefined) into a descriptive, actionable error message when a single-mode connection is used without authentication. High developer experience impact for low implementation cost.
- **Test helper** (R11): Cuts test boilerplate by approximately 70 lines and ensures all connection tests share a single source of truth for default options.
- **Named constants** (R12): Eliminates scattered raw string comparisons for `'sandbox'` and `'single'`; any future renaming or addition of modes/environments is a single-file change.

### Phase 3 Architectural Improvements
- **Multipart into Record** (R17): Restores the Information Expert principle — `Record` becomes the single authority for all its serialization formats (JSON payload, changed payload, multipart form). `multipart.js` is reduced to a thin adapter or eliminated.
- **Private helper segregation** (R18): The most impactful long-term change. After this, external consumers can no longer accidentally depend on internal implementation details, enabling free internal refactoring without breaking semver.
- **api.js subdivision** (R19): Reduces the change surface for individual concerns. A streaming bug fix touches only `streaming.js`; a CRUD change touches only `crud.js`. PR diffs become scoped and reviewable.
- **Typed request objects** (R20): Eliminates the implicit coupling created by the opts bag. Each layer's contract is explicit and statically verifiable. The incremental approach (starting with retry context via R21) keeps risk manageable.
- **Retry state separation** (R21): Removes the only case where runtime state is written back onto the caller's opts object, eliminating a subtle mutation side effect.
- **ES6 class unification** (R22): Stylistic but meaningful: new contributors encounter a single, consistent OOP pattern throughout the codebase.

---

## Recommended Implementation Sequence

```
PHASE 1 — Zero-risk quick wins (do in one PR)
  1.  R15  Apply eslint --fix for spacing (lib/api.js)
  2.  R01  Remove dead opts._refreshResult
  3.  R02  Remove commented-out credential block (test/integration.js)
  4.  R03  Fix fallacious test description (test/record.js)
  5.  R04  Inline CONST.API in index.js
  6.  R05  Add err.type to emptyResponse()
  7.  R06  Extract buildSignal() helper (lib/http.js)

PHASE 2 — Design improvements (can be individual PRs)
  8.  R13  Rename _getOpts 'd' -> 'input'
  9.  R11  Extract makeOrg() test helper
  10. R08  Extract resolveEndpoint() (lib/auth.js)
  11. R12  Add SANDBOX/SINGLE_MODE constants (after R08)
  12. R09  Inline _resolveOAuth
  13. R07  Extract applyBody() (lib/api.js)
  14. R10  Add fail-fast guard for single-mode OAuth
  15. R14  Rename getBody -> getBinaryContent

PHASE 3 — Architectural uplift (coordinated, breaking change window)
  16. R21  Separate retry state from opts bag
  17. R17  Move toMultipartForm into Record (after R07)
  18. R19  Sub-divide lib/api.js into domain modules (after R17)
  19. R18  Separate private helpers from module.exports (after R19)
  20. R20  Introduce typed request objects (incremental, starts alongside R21)
  21. R22  Standardize on ES6 class syntax (last — purely cosmetic)
```

---

## Effort Estimate

| Phase | Recommendations | Estimated Engineering Effort |
|---|---|---|
| Phase 1 | R01–R06, R15 | 2–4 hours |
| Phase 2 | R07–R14 | 4–8 hours |
| Phase 3 | R17–R22 | 20–40 hours |

Phase 3 effort is high because R18 and R19 require coordinated changes across all modules, careful test updates, and a communication plan for any downstream consumers of private methods.

---

## SOLID / GRASP Compliance Expected After Refactoring

| Principle | Current Score | Expected After Phase 1+2 | Expected After Phase 3 |
|---|---|---|---|
| **S** — Single Responsibility | 6/10 | 7/10 | 9/10 |
| **O** — Open/Closed | 7/10 | 7/10 | 8/10 |
| **L** — Liskov Substitution | 9/10 | 9/10 | 9/10 |
| **I** — Interface Segregation | 5/10 | 6/10 | 9/10 |
| **D** — Dependency Inversion | 7/10 | 7/10 | 8/10 |
| **Information Expert (GRASP)** | Partial | Improved (R17) | Strong |
| **Low Coupling (GRASP)** | Partial | Improved (R12, R21) | Strong |
| **High Cohesion (GRASP)** | Partial | Improved (R07, R08) | Strong (R19) |
