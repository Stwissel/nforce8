# Publishing to npm from GitHub Actions

The workflow [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) runs on **release: created**.

## If publish fails with `E404` / `Not found`

npm often returns **404** when publish is **unauthorized** (it does not mean the package name is wrong).

### 1. `NODE_AUTH_TOKEN` must exist for `setup-node`

`actions/setup-node` writes `~/.npmrc` using `NODE_AUTH_TOKEN` **when that step runs**. The token must be set at **job** level (not only on the `npm publish` step), or publish will hit the registry without credentials → **E404**.

### 2. Token type and permissions

Create a token at [npmjs.com → Access Tokens](https://www.npmjs.com/settings/~tokens):

- **Granular token**: enable **Read and write** for the **`nforce8`** package (or all packages), with permission to publish.
- **Classic token**: use an **Automation** token (or a user token with publish rights).

Add it as repository secret **`NPM_TOKEN`** (Settings → Secrets and variables → Actions).

### 3. Maintainer on npm

The npm user that owns the token must be a **maintainer** of [`nforce8` on npm](https://www.npmjs.com/package/nforce8). If the package is new, the same user must run the first publish once from a trusted machine, or add your bot user as maintainer.

### 4. Check auth in CI

The workflow runs `npm whoami` before `npm publish`. If that step fails, the token or secret name is wrong.
