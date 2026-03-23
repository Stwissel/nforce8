# Code Quality Summary — nforce8

## Critical Issues

**3 High-severity issues found — Immediate attention required for one broken feature**

### Top 3 Problems

1. **Broken Multipart Upload (H3)** — Document, Attachment, and ContentVersion inserts/updates send malformed HTTP requests. The multipart payload builder produces an array in the format of the now-removed `request` library; native `fetch` requires a `FormData` object. The body is never attached to the request. **Priority: High**

2. **God Object / Divergent Change (H1)** — `index.js` at 994 lines handles 7 unrelated concerns: configuration, authentication, CRUD, query, streaming, HTTP infrastructure, and the plugin system. Every change to any part of the library requires navigating this file. **Priority: High**

3. **Split Connection Definition (H2)** — Two `Connection` definitions coexist: a complete prototype-based one in `index.js` and an ES6 class stub in `lib/connection.js`. They are out of sync. A `// TODO turn into ES6 class` comment documents the acknowledged but incomplete migration. **Priority: Medium**

---

## Overall Assessment

- **Project Size**: 9 source files, 1,627 lines, JavaScript (Node.js 22+)
- **Code Quality Grade**: B
- **Total Issues**: 18 — High: 3 | Medium: 8 | Low: 7
- **Overall Complexity**: Medium — one broken feature, one large file, remaining issues are well-scoped

---

## Business Impact

- **Technical Debt**: Medium — the `index.js` size and split Connection definition slow down feature work and onboarding
- **Maintenance Risk**: Medium — the broken multipart feature and non-functional timeout on API requests (M2) are silent failures with no error thrown
- **Development Velocity Impact**: Medium — the 994-line `index.js` creates friction for every change; decomposing it would materially speed up development
- **Recommended Priority**: High for H3 (broken feature) and M2 (broken timeout), Medium for everything else

---

## Quick Wins

These are low-risk changes with immediate benefit:

- **Replace deprecated `querystring` module (M4)**: Replace 3 `qs.stringify()` calls with `new URLSearchParams(obj).toString()`. No behavior change, eliminates use of a legacy Node.js API. **Priority: Low**
- **Remove unused `url` require (L6)**: `const url = require('url')` is unnecessary in Node 22 where `URL` is global. One-line deletion. **Priority: Low**
- **Fix `previous()` falsy bug (L4)**: `record.previous('field')` incorrectly returns `undefined` when the previous value was `0`, `''`, or `false`. Fix with an `in` operator check instead of a truthiness check. **Priority: Medium**
- **Replace `_changed` Array with Set (M8)**: Improves correctness and performance of the Record model. Simplifies four methods. **Priority: Medium**
- **Fix timeout for API requests (M2)**: Apply `AbortSignal.timeout()` to `_apiRequest` — currently only auth requests respect the configured timeout; all CRUD/query/search requests silently ignore it. **Priority: High**

---

## Major Refactoring Needed

- **`index.js` Decomposition (H1 + H2)**: **Priority: Medium** — Split the 994-line file into focused modules (`lib/auth.js`, `lib/http.js`, `lib/plugin.js`) and complete the ES6 class migration in `lib/connection.js`. This is the highest-leverage long-term improvement: it makes individual concerns independently testable, reduces merge conflicts, and makes the codebase navigable for new contributors.

- **Multipart Upload Rewrite (H3)**: **Priority: High** — Rewrite `lib/multipart.js` to produce a `FormData` object instead of a request-library array, and wire it into the fetch call body. Without this, Document, Attachment, and ContentVersion operations silently send empty-body requests.

- **`gzip` Option (M7)**: **Priority: Low** — The `gzip: true` connection option sets the `Accept-Encoding` header but does not decompress responses. It appears to work but will break JSON parsing if a server honours the header. Either implement `DecompressionStream` handling or remove the option.

---

## Recommended Action Plan

### Phase 1 — Immediate (Fix Broken Behavior)
- Rewrite multipart upload to use `FormData` (H3) — affects Document/Attachment/ContentVersion operations
- Apply `AbortSignal.timeout()` to `_apiRequest` to make timeout work for all requests, not just auth (M2)
- Fix `previous()` falsy value bug in Record (L4)

### Phase 2 — Short-term (Low-Risk Improvements)
- Replace deprecated `querystring` module with `URLSearchParams` (M4)
- Remove unnecessary `url` require (L6)
- Replace `_changed` Array with `Set` in Record (M8)
- Address or remove the non-functional `gzip` option (M7)
- Remove dead callback parameter scaffolding from `_getOpts` (L3)

### Phase 3 — Medium-term (Architecture)
- Complete ES6 class migration and decompose `index.js` into focused modules (H1 + H2)
- Clean up `self = this` aliases — convert callbacks to arrow functions in `record.js` (M3)
- Add `'use strict'` to the 5 files that lack it, or migrate to ESM (L7)

### Phase 4 — Long-term (Polish)
- Convert `lib/record.js` from prototype syntax to ES6 class (L1)
- Replace `_getPayload(bool)` flag argument with two named methods (M6)
- Replace `getBody()` if/else chain with a dispatch map (OCP)
- Remove or implement the `_extensionEnabled` replay detection stub (L5)

---

## Key Takeaways

- The recent refactoring sprint removed substantial debt. The remaining issues are well-contained and most have clear, low-risk fixes.
- The most urgent issue is the broken multipart upload — it silently sends malformed requests without throwing an error, making it hard to diagnose.
- The second most urgent issue is that the configured `timeout` has no effect on any request except authentication. Users who set `timeout` on their connection will not be protected from hung CRUD or query requests.
- The 994-line `index.js` is the dominant maintainability risk. The infrastructure for decomposition already exists (`lib/connection.js` has the class stub), and completing the migration would be the most impactful single investment.

---

*Detailed technical analysis with exact file and line references available in `code-smell-detector-report.md`*
