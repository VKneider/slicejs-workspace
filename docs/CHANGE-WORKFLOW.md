# Change workflow — framework and CLI

This is the single end-to-end strategy for changing `slice.js` or `slicejs-cli` and proving the
change. `AGENTS.md` is the short contract, `docs/TESTING.md` is the suite reference, and this page
is the recipe to follow.

## 1. Principles

1. **Start from a consumer scenario.** A framework or CLI change exists to fix/improve a real app.
   Reproduce it in Conclave (production) or Slice.js Components (DOM) before editing.
2. **Test at the lowest level that can express the bug**, then prove it at the product level.
   A unit test alone does not prove the dev server serves it; a manual reload alone does not protect
   the next change.
3. **Dev is not build.** The dev server transforms on request and can hide bundler errors. Any
   change in the build/bundler path needs a production build.
4. **Link sanity before code debugging.** `pnpm doctor` and `pnpm verify:conclave` rule out the
   workspace before you inspect application code.
5. **One owner per commit.** Framework changes go to `repos/slice.js`; CLI changes go to
   `repos/slicejs-cli`. Test-only updates in consumers are separate commits.
6. **Never publish in the inner loop.** Local links replace npm. Publishing is a release activity,
   not a testing step.
7. **Documentation is part of the change.** Every change needs a docs decision. User-facing changes
   require a docs commit in `repos/slice.js_docs` (or `repos/slicejs-components` for component docs);
   internal-only changes must record why no docs change was needed. See
   [`DOCUMENTATION.md`](./DOCUMENTATION.md).

## 2. The test ladder

Run the lowest level that can fail, then climb only as far as the change warrants.

| Level | Question it answers | Command |
|---|---|---|
| 0 — Link | Is the app actually using the local source? | `pnpm doctor` / `pnpm verify:conclave` |
| 1 — Unit/contract | Does the logic behave correctly in isolation? | `pnpm test:framework` / `pnpm test:cli` |
| 2 — Integration | Does it work in a real Slice app? | `pnpm dev:framework` / `pnpm dev:conclave` / targeted Playwright |
| 3 — Product | Did the real product regress? | `pnpm test:conclave`, `pnpm build:conclave`, `pnpm start:conclave` |
| 4 — Artifact | Does the published package work? | `pnpm pack` + clean install (release only) |

A change is not "tested" because level 2 worked. Pick the levels from the matrices below.

Before running e2e, install the browsers once:

```bash
pnpm setup:browsers
```

## 3. Route the change first

| If the change is in... | Edit here | Primary tests |
|---|---|---|
| Browser runtime, components, router, lifecycle | `repos/slice.js/Slice/` | `pnpm test:framework` + visual DOM/e2e |
| Express server, security, env, dev optimizer | `repos/slice.js/api/framework/` | `pnpm test:framework` + `pnpm verify:conclave` + build |
| CLI command wiring, options, help | `repos/slicejs-cli/client.js` | `pnpm test:cli` + run the command |
| Dev server, watcher, HMR | `repos/slicejs-cli/commands/startServer/` | `pnpm test:cli` + `pnpm dev:framework` + `pnpm dev:conclave` |
| Build, bundling, minification | `repos/slicejs-cli/commands/build*/`, `commands/bundle/`, `utils/bundling/` | `pnpm test:cli` + `pnpm build:framework` + `pnpm build:conclave` |
| Init/scaffold, component registry | `repos/slicejs-cli/commands/init/`, `getComponent/`, `createComponent/` | `pnpm test:cli` + scratch project |
| Types generation | `repos/slicejs-cli/commands/types/` | `pnpm test:cli` + `slice:types` in a consumer |
| Official components | `repos/slicejs-components/` | `pnpm test:components` + targeted e2e + `pnpm build:components` |
| Component docs | `repos/slicejs-components/src/markdown/` | `pnpm docs:lint:components` + `pnpm docs:generate:components` |
| Docs content | `repos/slice.js_docs/markdown/` | `pnpm docs:generate` + `pnpm docs:llm` + `pnpm dev:docs` |
| Skill guidance | `repos/slice.js_docs/skill/slice-js-developer/` | edit source + bump version + `pnpm sync:skill` + `pnpm check:skill` |

If a change spans repos, implement in dependency order (framework → CLI → visual → product) and
commit each repo separately.

Load the **`slice-js-developer`** skill for any Slice.js framework/app code task. It is vendored at
`.opencode/skills/slice-js-developer` (v1.12.0) from `repos/slice.js_docs/skill/`. If the change
alters guidance an agent relies on, update the skill source, bump its version, and run
`pnpm sync:skill`.

## 4. Framework change playbook

### Phase 0 — Reproduce and define

1. `pnpm doctor` (links must be green).
2. Run the consumer: `pnpm dev:conclave` (product) or `pnpm dev:components` (DOM/components).
3. Write down the exact route, component, action and expected/actual result.
4. Read the relevant invariants first:
   - `repos/slice.js/AGENTS.md` (destroy model, reserved directives, bare imports).
   - `repos/conclave/docs/GOTCHAS.md` when the bug touches a known area.
5. Decide whether this changes a public contract. If yes, plan the compatibility/major-version
   impact before writing code (see `docs/RELEASE.md`).
6. Load the `slice-js-developer` skill and read the relevant framework docs from
   [`DOCUMENTATION.md`](./DOCUMENTATION.md).

### Phase 1 — Write the failing test

- **No DOM:** add a test under `repos/slice.js/Slice/tests/`.
- **Real DOM/lifecycle:** add a spec under `repos/slicejs-components/` (the framework repo only
  has node:test).
- Use the real runtime. For browser-absolute imports, use
  `Slice/tests/fixtures/real-runtime-loader.mjs`; do not mock the logic under test.

Targeted run:

```bash
node scripts/run-in-repo.mjs slice.js node --test "Slice/tests/<file>.test.js"
```

The test must fail for the right reason before the fix.

### Phase 2 — Implement

- Runtime: `repos/slice.js/Slice/` — plain ESM, no build step, no new runtime dependency.
- Server: `repos/slice.js/api/framework/` — keep the factory contract (`createSliceServer`).
- Respect reserved directives (`id`, `sliceId`, `singleton`), the destroy cascade and the
  `childrenIndex` semantics.
- Do not edit generated files or `node_modules`.

### Phase 3 — Climb the ladder

| Touched area | Commands |
|---|---|
| Runtime, no DOM | `pnpm test:framework` → `pnpm verify:conclave` |
| Lifecycle/DOM | `pnpm test:framework` → `pnpm test:components:e2e -- <spec>` → `pnpm verify:conclave` |
| Router/loading | `pnpm test:framework` → affected Conclave navigation spec → `pnpm verify:conclave` |
| Server/security/env | `pnpm test:framework` → `pnpm verify:conclave` → `pnpm build:conclave` → `pnpm start:conclave` |
| Build/runtime packaging | `pnpm test:framework` → `pnpm build:framework` → `pnpm build:conclave` |

`pnpm verify:conclave` is mandatory for runtime/server changes: it compares the served
`/Slice/Slice.js` byte-for-byte with `repos/slice.js/Slice/Slice.js`.

### Phase 4 — Prove it in the product

1. Run the affected Conclave spec:
   ```bash
   pnpm test:conclave -- src/Components/<Area>/<Spec>.spec.js
   ```
2. For broad/runtime changes, run the full suite:
   ```bash
   pnpm test:conclave
   ```
3. For product-affecting changes:
   ```bash
   pnpm lint:conclave
   pnpm build:conclave
   ```
4. If the change affects production serving, smoke it:
   ```bash
   pnpm start:conclave
   # check / and /Slice/Slice.js, then stop it
   ```

Known flakes: the Conclave touch drag-and-drop specs and the QR canvas assertion can fail under the
full parallel run. Rerun the single spec before calling it a regression.

### Phase 5 — Documentation pass

1. Use [`DOCUMENTATION.md`](./DOCUMENTATION.md) to find the pages for the area you touched.
2. Update the Markdown source (never generated pages).
3. Run:
   ```bash
   pnpm docs:generate
   pnpm docs:llm          # when the page belongs to the LLM corpus
   pnpm dev:docs          # preview, when the docs app runs
   ```
4. If the change alters agent guidance, update
   `repos/slice.js_docs/skill/slice-js-developer/`, bump `VERSION`/`skill/manifest.json`, then run:
   ```bash
   pnpm sync:skill
   pnpm check:skill
   ```
5. Record the docs decision in the task/commit. If there is no user-facing impact, say why.

### Phase 6 — Commit and close

1. Commit in `repos/slice.js` (framework + unit test).
2. If you added/changed a DOM test, commit in `repos/slicejs-components`.
3. Commit the docs in `repos/slice.js_docs` (or `repos/slicejs-components` for component docs).
4. If you added a product regression test, commit in `repos/conclave`.
5. Commit the synced skill in this workspace.
6. Update `CHANGELOG.md` only when preparing a release, following that repo's rules.

### Framework acceptance checklist

- [ ] A failing test existed first (or a documented reason it cannot exist).
- [ ] `pnpm test:framework` passes.
- [ ] DOM/lifecycle changes have browser coverage and the affected spec passes.
- [ ] `pnpm verify:conclave` passes.
- [ ] Build/server changes pass `pnpm build:conclave` (and `pnpm start:conclave` when serving).
- [ ] `pnpm doctor` is green.
- [ ] Docs decision recorded; matching framework pages updated; `pnpm docs:generate` ran.
- [ ] Skill updated + `pnpm sync:skill` if guidance changed.
- [ ] Commit lives in the owning repo; no generated files or `node_modules` changes.

## 5. CLI change playbook

The CLI can break tools without failing a unit test. Always exercise the affected command against a
real app.

### Phase 0 — Classify the surface

| Surface | Examples | Extra proof required |
|---|---|---|
| Command wiring | options, aliases, help, exit codes | run the command |
| Dev server/watcher | HMR, port resolution, static serving | `dev:framework` + `dev:conclave` |
| Build/bundler | bundles, externals, minify, runtime copy | `build:framework` + `build:conclave` |
| Init/scaffold | project structure, registry, starter components | scratch project |
| Types | `.d.ts` generation | generate in a consumer and inspect |
| Update/version | notifications, delegation | run against a local project |

### Phase 1 — Test first

Add or extend a contract/unit test under `repos/slicejs-cli/tests/`.

- Contract tests parse `client.js` and assert command/option wiring.
- Unit tests use `tests/helpers/setup.js`; temp dirs must be cleaned in `finally`.
- `INIT_CWD` must be saved/restored by the test.

Targeted run:

```bash
node scripts/run-in-repo.mjs slicejs-cli node --test "tests/<file>.test.js"
```

### Phase 2 — Implement

- `client.js` for command registration/wiring.
- `commands/` for behavior.
- Use `PathHelper`; pass `import.meta.url` where required.
- No `eval`, ESM only, contextual error messages via `Print`.
- Do not change dependency specs to local paths.

### Phase 3 — Unit suite

```bash
pnpm test:cli
```

**Windows:** this suite creates directory symlinks for temp projects and needs Developer Mode (or
an elevated shell). Without it, ~36 tests fail with `EPERM ... symlink`. That is an environment
failure, not a workspace link failure; `pnpm doctor` reports it. Do not "fix" it by editing tests
unless the task is that fix.

### Phase 4 — Integration proof

Run the narrowest real command plus the affected surface:

```bash
# command wiring / version / doctor
node scripts/run-app-script.mjs conclave slice:version
node scripts/run-app-script.mjs conclave slice:doctor

# dev server, watcher, serving
pnpm dev:framework
pnpm dev:conclave
pnpm verify:conclave

# build/bundler/runtime copy
pnpm build:framework
pnpm build:conclave
pnpm start:conclave

# types
node scripts/run-app-script.mjs conclave slice:types
git -C repos/conclave status --short   # inspect generated type changes
```

For init/scaffold changes, create a disposable project outside the repos (or under the temp dir),
run `init`, then `dev`/`build`, and delete it. Do not scaffold inside `repos/`.

### Phase 5 — Documentation pass

1. Update the CLI pages: `markdown/cli-commands.md` and/or
   `markdown/getting-started/development-workflow.md` (add or change flags, behavior, output).
2. Run `pnpm docs:generate` and `pnpm docs:llm`.
3. If the CLI guidance in the skill changed (`references/config-theming-cli.md` or SKILL.md), update
   `repos/slice.js_docs/skill/slice-js-developer/`, bump its version/manifest, and run
   `pnpm sync:skill`.
4. Record the docs decision.

### Phase 6 — Commit

1. Commit in `repos/slicejs-cli`.
2. Commit the docs in `repos/slice.js_docs`.
3. Commit the synced skill in this workspace if it changed.

CLI acceptance checklist:

- [ ] Contract/unit test added or updated.
- [ ] `pnpm test:cli` passes (or the only failures are the documented Windows symlink ones).
- [ ] The affected command was run against the framework demo and/or Conclave.
- [ ] Dev-server changes went through `pnpm verify:conclave`.
- [ ] Build/bundler changes went through `pnpm build:framework` and `pnpm build:conclave`.
- [ ] CLI docs updated; `pnpm docs:generate` / `pnpm docs:llm` ran.
- [ ] Skill updated + `pnpm sync:skill` if CLI guidance changed.
- [ ] No generated files or unrelated diffs were committed.
- [ ] Commit lives in `repos/slicejs-cli`; docs commit lives in `repos/slice.js_docs`.

## 6. Targeted command cheat sheet

```bash
# Link sanity
pnpm doctor
pnpm verify:conclave --verbose

# Framework
pnpm test:framework
node scripts/run-in-repo.mjs slice.js node --test "Slice/tests/destroy-cascade.test.js"
pnpm dev:framework
pnpm build:framework
pnpm start:framework

# CLI
pnpm test:cli
node scripts/run-in-repo.mjs slicejs-cli node --test "tests/path-helper.test.js"
node scripts/run-app-script.mjs conclave slice:doctor

# Slice.js Components
pnpm test:components
pnpm test:components:e2e -- src/Components/Visual/Button/Button.spec.js
pnpm test:components:e2e:visual
pnpm test:components:gate
pnpm build:components

# Conclave (product)
pnpm test:conclave -- src/Components/Providers/DragDropService/DragDropService.spec.js
pnpm test:conclave
pnpm lint:conclave
pnpm build:conclave
pnpm start:conclave

# Documentation and skill
pnpm docs:generate
pnpm docs:llm
pnpm docs:lint:components
pnpm docs:generate:components
pnpm sync:skill
pnpm check:skill
```

## 7. Triage order when something fails

1. `pnpm doctor` — link/store/remote problem?
2. `pnpm verify:conclave` — is the product serving the local runtime?
3. Did you run the build? Dev-only success is not enough for bundler/server changes.
4. Is the failure a known flake? Rerun the single spec.
5. Is it an environment limitation (Developer Mode, missing Chromium, port busy)?
6. Only then debug the code path.

See [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) for symptoms and fixes.

## 8. Done means

| Change | Minimum evidence |
|---|---|
| Framework runtime (no DOM) | framework unit test + `verify:conclave` + docs update + green `doctor` |
| Framework DOM/lifecycle | framework unit + visual e2e + `verify:conclave` + docs update |
| Framework server/router | framework unit + `verify:conclave` + `build:conclave` + docs update |
| Framework build contract | framework unit + `build:framework` + `build:conclave` + docs update |
| CLI wiring | CLI contract test + the command actually runs + CLI docs update |
| CLI dev server | CLI test + `dev:framework` + `verify:conclave` + docs update |
| CLI build/bundler | CLI test + both builds + product start + docs update |
| Visual component | unit + affected e2e + `build:components` + component Markdown update |
| Skill guidance | skill source updated + version bumped + `pnpm sync:skill` + `pnpm check:skill` |
| Release | full pre-release checklist in `RELEASE.md`, including the packed artifact |

If a required level is skipped, record why in the commit/task. "It works on my machine" is not
evidence.
