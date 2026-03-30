# Code Refactoring Summary — nforce8

**Date**: 2026-03-30
**Input**: code-smell-detector-report.md (30 smells)
**Output**: 18 refactoring recommendations

---

## Quick Reference

| ID | Refactoring | File | Technique | Impact | Complexity | Risk | Phase |
|----|------------|------|-----------|--------|------------|------|-------|
| R01 | Add missing `require('crypto')` | `test/mock/cometd-server.js` | Introduce Foreign Method | H | L | None | 1 |
| R02 | Fix silent error swallowing in tests | `test/crud.js`, `test/query.js` | Substitute Algorithm | H | L | L | 1 |
| R03 | Fix `upsert()` to use `applyBody` | `lib/api.js` | Substitute Algorithm | H | L | L | 1 |
| R04 | Fix spacing after `=` in api.js | `lib/api.js` | Style fix (ESLint) | L | L | None | 2 |
| R05 | Extract `_resubscribeAll()` method | `lib/cometd.js` | Extract Method | M | L | L | 2 |
| R06 | Remove redundant `Promise.resolve()` | `lib/auth.js` | Inline Temp | L | L | None | 2 |
| R07 | Fix double-quote style in cometd.js | `lib/cometd.js` | Style fix (ESLint) | L | L | None | 2 |
| R08 | Hoist inline `require` to top | `test/mock/cometd-server.js` | Inline Method analogue | L | L | None | 2 |
| R09 | `onRefresh` support for Promises | `lib/auth.js` | Replace Parameter with Method Call | M | M | M | 4 |
| R10 | Decompose `getAuthUri` conditionals | `lib/auth.js` | Substitute Algorithm + Extract Method | M | L | L | 3 |
| R11 | Inline redundant `rec` variable | `index.js` | Inline Temp | L | L | None | 2 |
| R12 | Named constant for ID field variants | `lib/util.js` | Replace Magic Number with Symbolic Constant | L | L | None | 3 |
| R13 | Rename `checkHeaderCaseInsensitive` | `lib/util.js` | Rename Method | L | L | None | 3 |
| R14 | Replace `let` with `const` | `lib/optionhelper.js` | Style fix | L | L | None | 2 |
| R15 | Rename `getFullUri` → `buildUrl` | `lib/optionhelper.js` | Rename Method | L | L | L | 3 |
| R16 | Propagate errors in `_connectLoop` | `lib/cometd.js` | Introduce Assertion | M | L | L | 3 |
| R17 | Remove dead code in integration.js | `test/integration.js` | Dead code removal | L | L | None | 3 |
| R18 | Convert mock to class-based instance | `test/mock/sfdc-rest-api.js` | Extract Class | M | M | M | 4 |

---

## Priority Matrix

### High Impact

| Recommendation | Complexity | Risk |
|----------------|------------|------|
| R01 — Add `require('crypto')` | Low | None |
| R02 — Fix test error swallowing | Low | Low |
| R03 — Fix `upsert()` applyBody | Low | Low |

### Medium Impact

| Recommendation | Complexity | Risk |
|----------------|------------|------|
| R05 — Extract `_resubscribeAll()` | Low | Low |
| R09 — `onRefresh` Promise support | Medium | Medium |
| R10 — Decompose `getAuthUri` | Low | Low |
| R16 — Propagate connect errors | Low | Low |
| R18 — Class-based mock server | Medium | Medium |

### Low Impact (Hygiene)

| Recommendation | Complexity | Risk |
|----------------|------------|------|
| R04 — Spacing fix (ESLint auto) | Low | None |
| R06 — Remove Promise.resolve() | Low | None |
| R07 — Fix quote style (ESLint auto) | Low | None |
| R08 — Hoist inline require | Low | None |
| R11 — Inline rec temp | Low | None |
| R12 — Named ID constant | Low | None |
| R13 — Rename checkHeaderCaseInsensitive | Low | None |
| R14 — let → const | Low | None |
| R15 — Rename getFullUri | Low | Low |
| R17 — Dead code cleanup | Low | None |

---

## Risk Distribution

| Risk Level | Count | Recommendations |
|------------|-------|-----------------|
| None | 10 | R01, R04, R06, R07, R08, R11, R12, R13, R14, R17 |
| Low | 6 | R02, R03, R05, R10, R15, R16 |
| Medium | 2 | R09, R18 |
| High | 0 | — |

---

## Implementation Sequence

### Phase 1 — Critical (implement this week)

1. **R01**: `const crypto = require('crypto');` at top of `test/mock/cometd-server.js` — prevents latent `TypeError` on WebSocket upgrade path
2. **R03**: `upsert()` → use `applyBody` helper — silently incorrect for binary SObjects today
3. **R02**: Replace 13 `.catch(should.not.exist).finally(done)` patterns — exposes any real assertion failures these were masking

### Phase 2 — Quick Wins (implement this sprint)

4. **R04** + **R07** + **R14**: Run `npx eslint --fix` on `lib/api.js`, `lib/cometd.js`, `lib/optionhelper.js` — zero-risk mechanical fixes
5. **R05**: Extract `_resubscribeAll()` in `lib/cometd.js` — eliminates duplicate loop in two reconnect methods
6. **R06**: Remove `Promise.resolve()` wrappers in `lib/auth.js` — two-line cleanup
7. **R11**: Inline `rec` temp in `index.js` — one-line cleanup
8. **R08**: Hoist inline `require('events')` in mock server — do alongside R01

### Phase 3 — Design Tidying (next sprint)

9. **R12**: Extract `ID_FIELD_VARIANTS` constant in `lib/util.js`
10. **R13**: Rename `checkHeaderCaseInsensitive` → `headerContains`
11. **R15**: Rename `getFullUri` → `buildUrl` in optionhelper + http
12. **R10**: Refactor `getAuthUri` conditional blocks in `lib/auth.js`
13. **R16**: Forward error to `transport:down` event in `lib/cometd.js`
14. **R17**: Clean up dead code in `test/integration.js`

### Phase 4 — Planned Improvements (next major version planning)

15. **R09**: Accept Promise-returning `onRefresh` (backward-compatible, requires documentation update)
16. **R18**: Convert `test/mock/sfdc-rest-api.js` to class-based instance (planned dedicated sprint)

---

## Key Benefits After Implementation

| Benefit | From |
|---------|------|
| WebSocket test path no longer crashes | R01 |
| Assertion failures surface correctly in 13 tests | R02 |
| Binary SObject upsert produces correct multipart requests | R03 |
| ESLint passes cleanly on all source files | R04, R07, R14 |
| Reconnection logic has single source of truth | R05 |
| `auth.js` is more idiomatic (no spurious Promise wrapping) | R06 |
| Module dependency intent clear at file top | R08 |
| `onRefresh` works with async/await handlers | R09 |
| `getAuthUri` readable without counting 8 if-blocks | R10 |
| Self-documenting ID variant handling | R12 |
| Tests isolated from cross-contamination | R18 |

---

## Refactoring Technique Distribution

| Category | Techniques Used | Count |
|----------|----------------|-------|
| Composing Methods | Extract Method (R05), Inline Temp (R06, R11), Substitute Algorithm (R02, R03, R07, R10) | 7 |
| Simplifying Method Calls | Rename Method (R13, R15), Remove Parameter / Replace Parameter with Method Call (R09) | 3 |
| Organizing Data | Replace Magic Number with Symbolic Constant (R12) | 1 |
| Moving Features | Extract Class (R18) | 1 |
| Simplifying Conditionals | Decompose Conditional / Extract Method (R10) | 1 |
| Style / Mechanical | Formatting corrections (R04, R07, R08, R14), Dead code (R01, R17) | 5 |

---

*Full technical analysis with before/after code examples: `code-refactoring-report.md`*
