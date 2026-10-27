# AGENTS.md — slice-workspace

This repository is an **orchestration layer**, not a product. The real code lives in
`repos/<name>/`, and each of those directories is an independent Git repository. Read this file,
then `CONTEXT.md`, then the `AGENTS.md` of the repo that owns the files you are about to touch.

## 1. Non-negotiables

1. **Never edit `node_modules`, `.pnpm`, or a pnpm store copy.** Under this workspace
   `node_modules/slicejs-web-framework` must resolve to `repos/slice.js`. If it does not, fix the
   link (`pnpm install` from the workspace root, then `pnpm doctor`); do not "apply the change to
   the store too".
2. **Never run `pnpm install` inside `repos/<name>`.** Conclave has its own
   `pnpm-workspace.yaml`; installing there can replace the direct links with registry copies.
   Installs happen at the workspace root only.
3. **Never change dependency specs in subrepos to `file:`, `link:` or `workspace:`.** The
   subrepos must stay publishable/standalone. The local wiring belongs in the root
   `pnpm-workspace.yaml` overrides.
4. **Make the change in the owning repo, not here.** Workspace commits are only for manifest,
   scripts, and context docs.
5. **Do not publish, bump versions, tag, or create releases** unless the task explicitly asks for
   a release. The whole point of the workspace is to avoid that loop.
6. **Do not edit generated files.** Examples: `conclave/src/Components/components.js` (generated
   by the CLI), `slicejs-components` `icons.generated.js` / generated docs pages, docs site
   `src/Components/AppComponents/*` (generated from `markdown/`). Read the owning repo's AGENTS.md.
7. **Conclave is a production product.** Treat any change that affects it as a potential
   regression; run its tests/build before calling the work done.
8. **Documentation is part of the change.** Every change needs a docs decision: a docs commit, or an
   explicit "no docs impact" reason. Framework/CLI behavior changes require the matching pages in
   `repos/slice.js_docs`; component changes require `repos/slicejs-components/src/markdown`.
   See [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md). A change without a docs check is not done.
9. `repos/` is gitignored. Never force-add it, vendor it, or copy subrepo code into this repo.

## 2. Read order (and context budget)

Always:

1. This file.
2. `CONTEXT.md` (ecosystem map, runtime paths, current version skew).
3. The owning repo's `AGENTS.md`.
4. For any Slice.js framework or app code task, load the **`slice-js-developer`** skill. It is
   vendored at `.opencode/skills/slice-js-developer` (v1.12.0) so OpenCode can use it offline. Its
   canonical source is `repos/slice.js_docs/skill/slice-js-developer`; update that and run
   `pnpm sync:skill` rather than editing the vendored copy.

Only when the task needs it:

| Task | Read |
|---|---|
| Framework runtime, components, router, destroy/lifecycle | `repos/slice.js/AGENTS.md`, `repos/slice.js/Slice/tests/` |
| CLI, dev server, bundler, build, types | `repos/slicejs-cli/AGENTS.md`, `repos/slicejs-cli/CHANGELOG.md` |
| UI components, registry, DOM/e2e behavior | `repos/slicejs-components/AGENTS.md`, `COMPONENT_API_STANDARDS.md` |
| Component lifecycle/refresh patterns in Conclave | `repos/conclave/docs/COMPONENT-PATTERNS.md` |
| Conclave architecture/data/features/design | `repos/conclave/docs/ARCHITECTURE.md`, `DATA.md`, `FEATURES.md`, `DESIGN.md` |
| Conclave pitfalls (42 numbered gotchas) | `repos/conclave/docs/GOTCHAS.md` |
| Docs site content | `repos/slice.js_docs/AGENTS.md`, `repos/slice.js_docs/markdown/` |
| Documentation policy and framework→docs mapping | `docs/DOCUMENTATION.md` |
| Skill guidance / vendored skill | `repos/slice.js_docs/skill/slice-js-developer/`, `.opencode/skills/slice-js-developer/` |
| Release / compatibility | `docs/RELEASE.md` |

Do not read `repos/slice.js_docs/llm.txt`, build output, Playwright reports, or generated
catalogs unless the task is specifically about them. They are large and low-signal.

## 3. Commands

Run from the workspace root.

```bash
pnpm bootstrap             # clone missing repos + install
pnpm doctor                # health check: repos, links, version drift, vendored skill
pnpm status                # aggregated git status
pnpm sync                  # fetch all; sync:pull = safe fast-forward only
pnpm sync:skill            # copy the canonical skill from repos/slice.js_docs
pnpm check:skill           # fail if the vendored skill drifted
pnpm verify:conclave       # boot Conclave and prove the local runtime is what it serves

pnpm dev:conclave          # Conclave, port 3001 (product)
pnpm dev:components        # Slice.js Components, port 3001
pnpm dev:docs              # docs site, port 3001
pnpm dev:framework         # slice.js demo, port 3001, with a self-link to the local runtime
```

Only one app can use port 3001 at a time. `verify:conclave` picks a free port.

Tests and builds:

```bash
pnpm test:framework        # node --test Slice/tests
pnpm test:cli              # node --test
pnpm test:components       # unit/parser tests
pnpm test:components:e2e   # Slice.js Components Playwright specs
pnpm test:components:gate  # unit + icons lint + Playwright e2e + build (heavy)
pnpm test:conclave         # Conclave Playwright e2e (both projects)
pnpm lint:conclave
pnpm build:conclave
pnpm start:conclave
pnpm build:framework
pnpm test                  # framework + CLI + components unit suites (no e2e)

# Documentation and skill
pnpm docs:generate         # framework docs pages + routes
pnpm docs:llm              # rebuild the docs LLM dump
pnpm docs:lint:components  # component Markdown contract
pnpm docs:generate:components # component pages/routes + agent manifest
pnpm docs:agent:components  # agent manifest only
```

`pnpm test:conclave` runs both projects (`components` and `visual`). Filtering with
`--project=components` silently skips screenshot tests; do not report that subset as the full
suite.

## 4. Change playbook

The full end-to-end strategy — test ladder, targeted commands, acceptance criteria and the CLI
integration proof — lives in [`docs/CHANGE-WORKFLOW.md`](docs/CHANGE-WORKFLOW.md). The summaries
below are the short form.

### A. Framework change (runtime, router, lifecycle, server, build contract)

1. **Reproduce / define the behavior in a consumer**, preferably Conclave (production) or the
   Slice.js Components (DOM). Write down the failing scenario.
2. Add a regression test in `repos/slice.js/Slice/tests/` (node:test). Use the real runtime; the
   loader in `Slice/tests/fixtures/real-runtime-loader.mjs` exists for browser-absolute imports.
   Do not mock the logic under test.
3. Implement in `repos/slice.js/Slice/` (runtime) or `repos/slice.js/api/framework/` (server).
   Keep browser runtime plain ESM with no build step.
4. `pnpm test:framework`.
5. If the change touches DOM/lifecycle, add or update the browser counterpart in
   `repos/slicejs-components` and run `pnpm test:components:gate` (or at minimum
   `pnpm test:components` + the affected Playwright spec).
6. `pnpm verify:conclave` — this proves the app is actually running the edited source.
7. `pnpm lint:conclave && pnpm build:conclave` if the change can affect the product.
8. **Documentation pass (mandatory).** Use [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md) to find
   the matching framework pages, update the Markdown source, and run `pnpm docs:generate` (plus
   `pnpm docs:llm` when the page belongs to the LLM corpus). If the change alters agent guidance,
   update the canonical skill in `repos/slice.js_docs/skill/slice-js-developer`, bump its
   `VERSION`/manifest, and run `pnpm sync:skill`.
9. Commit **in `repos/slice.js`**; commit the docs in `repos/slice.js_docs`; commit the synced skill
   in this workspace. Separate commits per repo.

### B. CLI change (dev server, bundler, build, init, types)

1. Read `repos/slicejs-cli/AGENTS.md` (PathHelper rules, test temp dirs, ESM only, no eval).
2. Add/extend a contract or unit test under `repos/slicejs-cli/tests/`.
3. Implement in `commands/` or `client.js`.
4. `pnpm test:cli`.
5. Exercise it against Conclave: `pnpm dev:conclave` and/or `pnpm build:conclave`.
6. **Documentation pass (mandatory).** Update `markdown/cli-commands.md` and/or
   `markdown/getting-started/development-workflow.md`; run `pnpm docs:generate` and `pnpm docs:llm`.
   If the CLI guidance in the skill changed, update the skill and `pnpm sync:skill`.
7. Commit in `repos/slicejs-cli`; commit docs in `repos/slice.js_docs`.

### C. Visual component / registry change

1. Read `repos/slicejs-components/AGENTS.md` and `COMPONENT_API_STANDARDS.md`.
2. Keep public props/aliases backward compatible; visual components are consumed by Conclave and
   external users.
3. Update the component Markdown in `repos/slicejs-components/src/markdown/<component>.md`.
   Never edit generated pages.
4. `pnpm docs:lint:components && pnpm docs:generate:components`.
5. `pnpm test:components`, then the affected Playwright specs; `pnpm build:components` must pass
   (the dev server can hide bundler errors).
6. Commit in `repos/slicejs-components`.

### D. Docs site / skill change

1. Edit `repos/slice.js_docs/markdown/**/*.md` (framework docs) or
   `repos/slicejs-components/src/markdown/` (component docs).
2. Run `pnpm docs:generate` and `pnpm docs:llm` from the workspace root; for component docs run
   `pnpm docs:lint:components` and `pnpm docs:generate:components`.
3. Preview with `pnpm dev:docs` when the docs app can run; otherwise validate the generated output.
4. If the skill changed, edit `repos/slice.js_docs/skill/slice-js-developer/`, bump its version and
   manifest, then `pnpm sync:skill`.
5. Commit in `repos/slice.js_docs` (or `repos/slicejs-components`), and commit the synced skill here.

## 5. Verifying the local link

`pnpm doctor` is the source of truth. It checks, for each consumer:

- `slicejs-web-framework` resolves under `repos/slice.js`
- `slicejs-cli` resolves under `repos/slicejs-cli`
- the CLI itself resolves the local framework
- declared semver ranges vs local versions (warnings are expected for known skew)
- repo remotes/branches/dirty state
- the vendored `slice-js-developer` skill version/files against the docs source

Expected resolution from Conclave:

```text
repos/conclave/node_modules/slicejs-web-framework -> repos/slice.js
repos/conclave/node_modules/slicejs-cli           -> repos/slicejs-cli
```

If a change "does not appear", follow this order **before** debugging the code:

1. `pnpm doctor` — link/store problem?
2. `pnpm verify:conclave` — is the server serving the local `Slice/Slice.js`?
3. Are you running in production mode / serving a stale `dist/`? Rebuild.
4. Browser cache / hard reload.
5. Only then inspect the code path.

## 6. Obsolete instructions in subrepo AGENTS files

Some subrepo docs were written before this workspace existed. Under the workspace these are
**false**:

- `repos/slice.js/AGENTS.md`: "editing `Slice/` does not change runtime behavior in any app until
  published". That is true for standalone clones, not for linked consumers here.
- `repos/slicejs-components/AGENTS.md` §"pnpm store architecture": it says
  `node_modules/slicejs-web-framework` is a junction to `.pnpm` and that you must patch the store
  copy. **Do not do that here.** It must point directly to `repos/slice.js`; if it doesn't,
  `pnpm doctor` will fail and the fix is a root install.
- `repos/slice.js_docs/AGENTS.md`: "framework source edits are not reflected until published".
  Same as above.

These notes remain valid when working in a standalone clone outside this workspace. If you update
them upstream, keep both contexts in mind.

## 7. Git workflow

- One logical change = one commit in the owning repo, conventional message
  (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- Do not combine unrelated subrepo changes into one commit; they have independent histories.
- `repos/*` is ignored here; commit from inside the subrepo (`git -C repos/slice.js ...`).
- Workspace commits are only for `workspace.config.json`, scripts, `AGENTS.md`, `CONTEXT.md`,
  `docs/`, and root config.
- Before finishing, `pnpm status` must show only the repos you intentionally touched.

## 8. Definition of done

A change is done when:

- [ ] It lives in the owning repo and has a focused commit.
- [ ] The relevant unit suite passes (`test:framework` / `test:cli` / `test:components`).
- [ ] DOM/lifecycle changes have a browser test or a documented reason why not.
- [ ] `pnpm doctor` is green.
- [ ] For runtime/server changes: `pnpm verify:conclave` passes.
- [ ] For product-affecting changes: `pnpm lint:conclave` and `pnpm build:conclave` pass.
- [ ] Documentation decision recorded; user-facing changes have a docs commit in
      `repos/slice.js_docs` (or `repos/slicejs-components` for component docs).
- [ ] `pnpm docs:generate` (and `pnpm docs:llm` when relevant) ran; no generated file was hand-edited.
- [ ] Skill updated and `pnpm sync:skill` run if guidance changed; `pnpm check:skill` is green.
- [ ] No `node_modules`, `.pnpm`, generated files, or `repos/` content were added to this repo.
- [ ] Workspace docs updated only if the architecture or workflow actually changed.
