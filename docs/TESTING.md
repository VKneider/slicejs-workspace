# Testing

The workspace is only as useful as the confidence it gives. This page maps change types to the
suites that actually validate them. For the end-to-end change strategy (reproduce → test → implement
→ product proof), see [`CHANGE-WORKFLOW.md`](./CHANGE-WORKFLOW.md).

## 1. Quick matrix

| Change | Minimum | Recommended |
|---|---|---|
| Framework runtime (`Slice/`), no DOM | `pnpm test:framework` | + `pnpm verify:conclave` |
| Framework lifecycle / DOM behavior | `pnpm test:framework` | + `pnpm test:components:gate` + `pnpm verify:conclave` |
| Framework server / `api/framework` | `pnpm test:framework` | + `pnpm verify:conclave` + `pnpm build:conclave` |
| CLI command / PathHelper / bundler | `pnpm test:cli` | + `pnpm dev:conclave` or `pnpm build:conclave` |
| Visual component / registry | `pnpm test:components` | + affected Playwright specs + `pnpm build:components` |
| Slice.js Components full gate | `pnpm test:components:gate` | — |
| Conclave UI / domain | `pnpm lint:conclave` | + affected specs + `pnpm build:conclave` |
| Conclave full regression | `pnpm test:conclave` | + `pnpm verify:conclave` |
| Docs content | `pnpm docs:generate` | + `pnpm docs:llm` + `pnpm dev:docs` |
| Skill guidance | `pnpm check:skill` | + `pnpm sync:skill` after editing the source |
| MCP server / catalog | `pnpm build:mcp` | + restart MCP and verify list/search/get |

Before any of this, `pnpm doctor` must be green (warnings about version skew are acceptable).
`pnpm check:skill` must also pass.

## 2. Suites in detail

### `pnpm test:framework`

Runs `node --test Slice/tests` inside `repos/slice.js`. It covers the runtime without a browser:

- build orchestration and singleton behavior
- bundle/runtime contracts
- router/loading behavior
- events, context, public env
- destroy cascade and orphan detection

Some tests use `Slice/tests/fixtures/real-runtime-loader.mjs` to resolve the browser-absolute
`/Components/components.js`. Do not replace the real runtime with mocks of the logic under test.

Anything that needs a genuine DOM belongs in `repos/slicejs-components`, not here.

### `pnpm test:cli`

Runs `node --test` inside `repos/slicejs-cli`.

- contract tests parse `client.js` with Babel and assert command/option wiring
- unit tests create temporary projects via `tests/helpers/setup.js`
- temp directories must be cleaned in `finally`
- `INIT_CWD` must be saved/restored by the test, not by the runner

**Windows:** many CLI tests symlink their `node_modules` into a temp project. Creating a directory
symlink requires **Developer Mode** (or an elevated shell). Without it the suite reports
`EPERM ... symlink` and roughly 36 tests fail. This is an environment limitation, not a workspace
link failure; `pnpm doctor` detects it. Enable Developer Mode (Settings → Privacy & security → For
developers) or run the suite elevated.

**Template contract (`tests/init-e2e.test.js`):** opt-in locally with `SLICE_INIT_E2E=1`, always on in
CI. It runs a real `slice init` (network: npm + GitHub), builds the scaffolded project with the CLI
under test, boots its server, and renders it in Chromium: the starter navbar and home section must
exist, an unknown URL must render `NotFound`, and no `not found in components.js` error may appear.
That is the only check that proves the template works with the components init downloads from the
registry — a starter that builds but renders nothing passes everything else.

### `pnpm test:components`

Runs Slice.js Components unit/parser suite (`node --test` with the path-resolution hook).

### `pnpm test:components:gate`

Runs, in order:

1. `check:teardown` (hook contract)
2. unit tests
3. icon lint
4. Playwright e2e (components + visual projects)
5. production build

Use it for lifecycle, destroy, DnD, rendering or generated-icon changes. It is the closest thing to
a full framework + components regression gate.

Prerequisites:

```bash
cd repos/slicejs-components
pnpm exec playwright install chromium
```

### `pnpm test:conclave`

Runs Playwright inside `repos/conclave`. It has **two projects**:

- `components`: everything not tagged `@visual`
- `visual`: screenshot comparison (tagged `@visual`)

Running `--project=components` is not the full suite; it silently skips visual regression. The
suite is ~239 tests in the current checkout (the repo's own `AGENTS.md` still says 233). The web
server uses `SLICE_TEST_PORT` (default `3001 + 5 = 3006`) and starts the local CLI, which resolves
the local framework through the workspace link.

**Known flakes:** the touch drag-and-drop specs and the QR canvas assertion can fail under the full
parallel run (observed: 237 passed, 2 failed; both passed when rerun alone). Rerun a single spec
before calling it a regression:

```bash
pnpm test:conclave -- src/Components/Providers/DragDropService/DragDropService.spec.js
```

### `pnpm verify:conclave`

The cheapest end-to-end proof of the link model:

1. Resolves `slicejs-web-framework` and `slicejs-cli` from Conclave and asserts they are inside
   `repos/slice.js` / `repos/slicejs-cli`.
2. Boots Conclave on a free port with `INIT_CWD` pinned to the app.
3. Waits for `/api/status`.
4. Fetches `/Slice/Slice.js` and compares it byte-for-byte with
   `repos/slice.js/Slice/Slice.js`.
5. Fetches `/` and `/slice-env.json`.
6. Shuts the server tree down.

If this fails, do not debug application code yet. Fix the link/build first
(see [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)).

Use `pnpm verify:conclave --verbose` to stream the dev server output.

## 3. Builds as tests

Bundling bugs often do not show up in the dev server (it transforms on request), so run the build
for the layer you touched:

```bash
pnpm build:framework
pnpm build:components
pnpm build:conclave
```

`pnpm build:conclave` also proves that the production build copies the **local** runtime into
`dist/Slice/Slice.js`. `pnpm doctor` compares that copy with the source afterward and warns if it
is stale.

Builds may rewrite generated files (`src/Components/components.js`, `src/bundles/`). Treat those as
build output: review them, do not commit them accidentally, and restore the registry with
`git checkout -- src/Components/components.js` if the change was only formatting/line endings.

## 4. Playwright installation

Browsers are installed once per machine:

```bash
pnpm setup:browsers
```

That script installs Chromium for both e2e surfaces with the right storage model:

- `repos/slicejs-components` sets `PLAYWRIGHT_BROWSERS_PATH=0`, so its browsers live under the
  workspace `node_modules` and are removed with it.
- `repos/conclave` uses the machine-level Playwright cache.

Do not run `playwright install` from an arbitrary directory: a plain install without the Slice.js
Components project-local setting puts the browser where the config will not find it.

If an HTML report fails with `EACCES`, use `--reporter=line` or point
`PLAYWRIGHT_HTML_REPORT` at a writable directory.

## 5. Reading failures correctly

- **Everything fails at import/resolution**: check `pnpm doctor` first.
- **Dev works, build fails**: run the build for that repo; the bundler is stricter than the dev
  server (for example, a module with two exports).
- **Component not mounted / selector never appears**: suspect an unbooted service or a link
  problem before the component (Conclave GOTCHAS §39–40).
- **Screenshot diff only**: confirm it is a real visual change, not a font/OS difference; the
  visual project is Chromium at a fixed viewport.
- **Flaky drag/touch spec**: synthetic events skip actionability checks; wait for the
  `slice-loading` overlay to detach (GOTCHAS §42).

## 6. Documentation and skill checks

Documentation has contracts too (see [`DOCUMENTATION.md`](./DOCUMENTATION.md)):

```bash
pnpm check:skill                 # vendored skill matches repos/slice.js_docs/skill
pnpm docs:generate               # docs pages/routes regenerate without errors
pnpm docs:llm                    # llm.txt regenerates
pnpm docs:lint:components            # component Markdown contract
pnpm docs:generate:components        # component docs regenerate
```

On a clean checkout these commands must leave no diff. Locally, inspect the diff and commit the
docs in `repos/slice.js_docs` (or `repos/slicejs-components`) before calling the change done. Generated
pages under `src/Components/AppComponents/` are never edited by hand.

## 7. MCP and catalog checks

The MCP server reads the same `agent/docs-manifest.json` as the CLI:

```bash
pnpm build:mcp
```

The workspace `opencode.jsonc` points the MCP at `slicejs-components` through
`SLICE_COMPONENTS_MANIFEST_URL` and `SLICE_COMPONENTS_RAW_BASE_URL`. The MCP caches catalogs in
memory, so restart it after changing the manifest. Verify with:

- `slice_components_list_docs` includes the expected doc IDs (including nested IDs such as
  `guides/data-loading`).
- `slice_components_search_docs` finds the new page.
- `slice_components_get_doc` returns its authored Markdown.

`slicejs-mcp@1.2.1` fixes the default URLs; earlier versions need the env overrides above.

## 8. CI shape

CI runs per repo, because each one is an independent repository. What exists today:

| Repo | Workflow | Covers |
|---|---|---|
| `slice.js` | `ci.yml` | Runtime/server/SEO tests, `scripts/check-pack.mjs`, a **Conclave job** (fresh clone, install, `scripts/verify-app.mjs --replace`: build, boot, assert `/Slice/Slice.js` is the candidate) and a **template job** (packs the candidate, scaffolds a project with the CLI, swaps the tarball in, then builds/boots/renders in Chromium). Runs on PR, push and weekly. |
| `slicejs-cli` | `ci.yml` | Unit/integration tests, the template contract (`SLICE_INIT_E2E=1`), Playwright e2e, `scripts/release-check.mjs --allow-published`. |
| `slicejs-components` | `component-tests.yml` | Logic tests, icons lint, Playwright e2e, build. |
| `slice.js_docs` | `docs-render-cicd.yml` | Docs render + `slice seo sitemap` / `seo check` (gated on a framework with the SEO module). |

The workspace itself has no remote and no CI. When you need the full local picture:

```bash
pnpm bootstrap --no-install
pnpm install --frozen-lockfile
pnpm doctor
pnpm check:skill
pnpm test
pnpm verify:conclave
pnpm test:conclave        # needs Chromium
pnpm build:conclave
pnpm build:mcp
pnpm docs:generate        # then git -C repos/slice.js_docs diff --exit-code
pnpm docs:llm             # then git -C repos/slice.js_docs diff --exit-code
```

`pnpm verify:conclave` proves the *linked* workspace; the CI job proves a *fresh clone*, which is
the combination users actually install.

