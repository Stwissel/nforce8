# Code Quality Summary — nforce8

## Critical Issues

**7 High-severity issues found — Immediate attention recommended**

### Top 3 Problems

1. **God Object / Large Class** — `index.js` is a 995-line file with 49 methods covering authentication, CRUD, search, streaming, blob handling, plugins, and internal HTTP plumbing. Every domain change touches this single file. **Priority: High**

2. **Parallel Architecture — Two Conflicting Connection Definitions** — `lib/connection.js` contains a complete ES6 class that is never used. `index.js` runs an older pre-ES6 prototype version that duplicates the constructor logic. A TODO comment in the code acknowledges this but it has not been completed. **Priority: High**

3. **Global Mutable State in Plugin Registry** — The plugin registry lives as a module-level variable shared across the entire Node.js process. Plugins registered in one context silently affect all other contexts, making isolation in tests and multi-tenant scenarios fragile. **Priority: High**

---

## Overall Assessment

- **Project Size**: 9 source files, ~1,660 lines, JavaScript (CommonJS, Node 22+)
- **Code Quality Grade**: C
- **Total Issues**: 31 — High: 7 | Medium: 14 | Low: 10
- **Overall Complexity**: Medium-High (concentrated in `index.js`)
- **Test Coverage**: 89 tests passing — functional correctness is good

---

## Business Impact

- **Technical Debt**: High — the God Object in `index.js` is the dominant concern. Every new Salesforce API feature or behaviour change requires navigating and modifying a nearly 1,000-line file.
- **Maintenance Risk**: High — the unfinished ES6 migration creates two partially-maintained code paths. The dead `request`-library options and unreachable methods create false confidence that features (multipart upload, gzip) are working when they silently do nothing.
- **Development Velocity Impact**: Medium — the codebase is otherwise well-structured at the module level. Adding a new API method is straightforward; the risk is accumulating more into the already overloaded `index.js`.
- **Recommended Priority**: High — Phase 1 quick wins carry near-zero regression risk and can be completed quickly.

---

## Quick Wins

The following issues can each be fixed in minutes with no functional risk:

- **Remove 3 dead exported functions** (H6, H7, M10): `isChunkedEncoding`, `nonJsonResponse`, `getContentVersionBody` — none are called anywhere. **Priority: High** — reduces confusion about what the library actually does.
- **Fix `apexRest` data access bug** (M11): Line 703 of `index.js` accesses `data.uri` directly after running it through `_getOpts`, bypassing the option-processing step. **Priority: High** — this is a latent inconsistency that could mask bugs.
- **Fix `search()` response shape** (M9): The response check `!resp.length` is applied to an object (not an array), so it never fires correctly. The mapping `resp.map(...)` will throw at runtime if the API returns the standard `{ searchRecords: [...] }` shape. **Priority: High** — functional correctness risk.
- **Replace `for...in` with safe iteration** (M6): `optionhelper.js:71` uses `for...in` on a plain object without `hasOwnProperty` guard. **Priority: Medium** — replace with `Object.assign`.
- **Remove `request`-library dead options** (M7): `preambleCRLF`, `postambleCRLF`, `encoding: null`, and `multipart` are silently ignored by native `fetch`. **Priority: Medium** — removes misleading code that implies multipart/gzip are working.
- **Replace deprecated `querystring`** (M14): Node 22 ships `URLSearchParams`; the pattern is already used in `optionhelper.js`. **Priority: Medium** — forward compatibility.

---

## Major Refactoring Needed

- **`index.js` — God Object decomposition**: **Priority: High** — Split into `AuthClient`, `CrudClient`, `QueryClient`, `BlobClient`, and a thin facade. This is the single highest-impact structural improvement. The streaming module (`fdcstream.js`) demonstrates exactly the right pattern to follow.

- **Complete ES6 class migration**: **Priority: High** — The TODO at `index.js:23` has been there since the ES6 class was partially written in `lib/connection.js`. Completing this migration eliminates duplicated constructor logic and makes the codebase consistent. It is a prerequisite for the God Object decomposition.

- **Plugin registry scoping**: **Priority: Medium** — Moving the registry from module-level to instance-level removes hidden shared state and makes the library safe for multi-connection use cases.

---

## Recommended Action Plan

### Phase 1 — Immediate (Days)

- Remove the three dead exported symbols (`isChunkedEncoding`, `nonJsonResponse`, `getContentVersionBody`)
- Fix `apexRest` to use `opts.uri` instead of `data.uri`
- Fix `search()` to use `resp.searchRecords`
- Replace `for...in` with `Object.assign` in `optionhelper.js`
- Fix the redundant ternary `opts.method === 'PATCH' ? true : false` in `multipart.js`
- Remove stale `// Require syntax for Node < 10` comments
- Replace `==` with `===` throughout `index.js` and `fdcstream.js`
- Extract `safeJsonParse()` helper to remove duplicated JSON error handling
- Fix all `let` declarations that should be `const` in `multipart.js`

### Phase 2 — Short-Term (Weeks)

- Replace deprecated `querystring` with `URLSearchParams`
- Remove dead `request`-library options from `optionhelper.js`; implement Fetch-native multipart via `FormData`
- Remove the dead callback parameter from `_getOpts` and simplify its signature
- Fix `_queryHandler` to avoid double option processing
- Export `getHeader` from `util.js` to eliminate duplicated header access logic
- Convert `self = this` patterns to arrow functions throughout
- Convert `Plugin` constructor function to an ES6 class

### Phase 3 — Long-Term (Sprints)

- Complete the ES6 class migration: move all 49 prototype methods into `lib/connection.js`
- Decompose `index.js` into focused modules by domain
- Move the plugin registry to instance scope
- Introduce an `OAuthToken` value object to replace the untyped plain object pattern

---

## Key Takeaways

- The codebase is functionally reliable (89 tests pass) and has seen good recent improvements to promise handling and Fetch API compatibility.
- The primary risk is architectural: one file doing too much, making future changes harder than they need to be.
- Several features that appear to be supported (multipart upload, gzip response handling) are using dead options that `fetch` silently ignores — this should be investigated to confirm whether these features actually work end-to-end.
- The quick wins in Phase 1 carry essentially no regression risk and will immediately improve clarity for contributors.

---

*Detailed technical analysis with file:line references available in `code-smell-detector-report.md`*
