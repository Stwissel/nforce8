# Refactoring Summary — nforce8

**Analysis Date:** 2026-03-27
**Total Recommendations:** 15
**Full Report:** `refactoring-expert-report.md`

---

## High-Level Overview

The nforce8 codebase is structurally sound after its recent module split. The remaining issues are concentrated in three areas:

1. **Record encapsulation breach** — underscore-prefixed "private" methods called by external modules (R02, R03, R04)
2. **Mutable opts bag and duplicated patterns in `api.js`** — no schema, repeated conditionals, magic strings (R01, R12, R14)
3. **Auth layer design issues** — flag argument, mutation side effects, duplicated environment logic (R09, R10, R11)

---

## Priority Matrix

| Impact | Low Complexity | Medium Complexity | High Complexity |
|--------|---------------|-------------------|-----------------|
| **High** | R01 resolveId/resolveType, R02 Record.fromResponse(), R03 Rename payload methods | — | R14 RequestContext |
| **Medium** | R04 Public reset(), R12 sobjectPath() | R09 Endpoint helpers, R10 Flag removal, R11 OAuth immutability | — |
| **Low** | R05 SAML constant, R06 const opts, R07 Comments, R08 stream() warning, R15 Test constant | R13 Trivial getters | — |

---

## Quick Reference: All 15 Refactorings

| ID  | What | Technique | File(s) | Phase |
|-----|------|-----------|---------|-------|
| R01 | Extract `resolveId` / `resolveType` helpers | Extract Method | `lib/api.js` | 1 |
| R02 | `Record.fromResponse()` static factory | Replace Constructor with Factory Method | `lib/record.js`, `lib/api.js` | 1 |
| R03 | Rename `_getFullPayload` → `toPayload`, `_getChangedPayload` → `toChangedPayload` | Rename Method | `lib/record.js`, `lib/api.js` | 1 |
| R04 | Promote `_reset()` → public `reset()` | Rename Method | `lib/record.js`, `lib/http.js` | 1 |
| R05 | Extract `SAML_ASSERTION_TYPE` constant | Replace Magic Number with Symbolic Constant | `lib/auth.js` | 1 |
| R06 | Replace `let opts` with `const opts` throughout | (Style normalization) | `lib/api.js`, `lib/auth.js` | 1 |
| R07 | Remove what-comments in `optionhelper.js` | (Comment cleanup) | `lib/optionhelper.js` | 1 |
| R08 | Add runtime deprecation warning to `stream()` | (Operational deprecation) | `lib/api.js` | 1 |
| R09 | Introduce endpoint-selection helpers on Connection | Extract Method, Consolidate Conditional | `lib/auth.js` | 2 |
| R10 | Replace `executeOnRefresh` flag with explicit methods | Replace Parameter with Explicit Methods | `lib/auth.js` | 2 |
| R11 | Return new OAuth object instead of mutating caller's | Separate Query from Modifier | `lib/auth.js` | 2 |
| R12 | Introduce `sobjectPath()` path-builder helper | Extract Method, Replace Magic Literal | `lib/api.js` | 2 |
| R13 | Evaluate/remove trivial getter/setter delegation | Remove Middle Man, Inline Method | `lib/auth.js`, `lib/api.js` | 2 |
| R14 | Introduce typed `RequestContext` to replace mutable opts bag | Introduce Parameter Object | `lib/api.js`, `lib/http.js` | 3 |
| R15 | Extract `FAKE_CLIENT_ID` test constant | Replace Magic Number with Symbolic Constant | `test/connection.js` | 1 |

---

## Key Benefits Expected

**Record public API (R02–R04)**
- No external module needs to access underscore-prefixed methods.
- Factory method `Record.fromResponse()` makes post-fetch Record construction ceremony impossible to forget.
- Tests can use `acc.reset()` instead of directly assigning `acc._changed = new Set()`.

**Opts bag cleanup (R01, R12, R14)**
- `resolveId()` and `resolveType()` eliminate the inconsistency between `sobject.getId()` and `util.findId(sobject)` — a latent correctness risk.
- `sobjectPath()` replaces 8 occurrences of string-concatenated `/sobjects/...` paths with a single helper.
- `RequestContext` gives the opts bag a declared schema, making `_retryCount`/`_refreshResult` sentinel mutations unnecessary.

**Auth layer (R09–R11)**
- Endpoint selection in one place: adding a new Salesforce environment touches one function, not four.
- Eliminating the `executeOnRefresh` flag makes call sites self-documenting.
- Non-mutating OAuth return prevents silent corruption of the caller's credential object.

---

## Recommended Implementation Sequence

```
Phase 1 (Quick Wins — ~2 hours total)
  Batch 1: R05, R06, R07, R08, R15    <- no dependencies, safe to parallelize
  Batch 2: R04 -> R03 -> R02          <- Record: reset first, then payload, then factory
  Batch 3: R01, R12                   <- api.js helpers (foundation for R14)

Phase 2 (Design — ~5 hours total)
  Batch 4: R09 -> R10+R11 -> R13      <- auth.js: endpoints first, then flag+mutation, then getters

Phase 3 (Architecture — ~6 hours total)
  Batch 5: R14 (incremental)          <- one API function per commit
```

---

## Risk Summary

| Risk | Count | IDs |
|------|-------|-----|
| Low | 10 | R01, R02, R03, R04, R05, R06, R07, R08, R12, R15 |
| Medium | 4 | R09, R10, R11, R13 |
| High | 1 | R14 |

R14 (RequestContext) is the only high-risk item. It can be applied incrementally — one API function per commit — with no external API changes required. The existing mock-server test suite provides regression coverage after each converted function.

---

*Full implementation details, before/after code examples, and dependency notes: `refactoring-expert-report.md`*
*Machine-readable data: `refactoring-expert-data.json`*
