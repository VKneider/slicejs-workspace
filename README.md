# slice-workspace

A local workspace for developing **Slice.js** and its real consumers without publishing to npm or
cloning/updating repositories by hand.

The workspace does not contain the framework code: it contains the orchestration (manifest, scripts
and context) and links the independent checkouts that live under `repos/`. Every repo keeps its own
remote, branches, history and lockfile.

```
slice-workspace/
├── AGENTS.md                 # operating contract for agents
├── CONTEXT.md                # mental model of the ecosystem
├── workspace.config.json     # repo and link manifest
├── pnpm-workspace.yaml       # packages: repos/* + link: overrides
├── docs/                     # development, testing, release and troubleshooting guides
├── scripts/                  # bootstrap, doctor, status, sync, verify
└── repos/                    # individual checkouts (ignored by Git)
```

## Requirements

- Node.js **>= 20** (the ecosystem targets 20+; this workspace was verified on Node 22).
- pnpm **11.x** (`corepack enable` or the official installer).
- Git.
- Playwright + Chromium only for e2e. Install them with `pnpm setup:browsers` (Slice.js Components
  uses project-local browsers; Conclave uses the machine cache).
- On Windows, enable **Developer Mode** (or use an elevated shell) for the CLI test suite: some
  tests create directory symlinks and fail with `EPERM` otherwise. `pnpm doctor` reports this.

## Getting started

```bash
# 1. Clone this workspace
git clone <slice-workspace-url>
cd slice-workspace

# 2. Clone the ecosystem repos and install everything (from workspace.config.json)
pnpm bootstrap

# 3. Verify that the links point at the local source
pnpm doctor

# 4. Exercise Conclave against the local framework (boots the server, compares the served runtime
#    with repos/slice.js/Slice/Slice.js, then shuts it down)
pnpm verify:conclave
```

If the repos already exist elsewhere, move them into `repos/` (each one is a complete Git
checkout) or clone them manually; `pnpm bootstrap` only clones what is missing and never deletes
work.

## Commands

| Command | What it does |
|---|---|
| `pnpm bootstrap` | Clones missing repos and installs dependencies. `--no-install` skips the install. |
| `pnpm bootstrap --pull` | Also fetches and fast-forwards clean repos. |
| `pnpm setup:browsers` | Installs Playwright Chromium for Slice.js Components and Conclave. |
| `pnpm sync:skill` | Copies the canonical `slice-js-developer` skill from the docs repo. |
| `pnpm check:skill` | Fails if the vendored skill drifted from the docs source. |
| `pnpm docs:generate` | Regenerates the framework docs pages and routes. |
| `pnpm docs:llm` | Rebuilds the docs LLM dump (`llm.txt`). |
| `pnpm docs:lint:components` | Validates Slice.js Components component Markdown. |
| `pnpm docs:generate:components` | Regenerates component docs pages/routes and the agent catalog manifest. |
| `pnpm docs:agent:components` | Regenerates only the Components agent catalog manifest. |
| `pnpm doctor` | Checks repos, branches, `slicejs-web-framework`/`slicejs-cli` resolution and version drift. |
| `pnpm status` | Aggregated Git status for every repo. |
| `pnpm sync` | Fetches all remotes and reports ahead/behind. `sync:pull` performs a safe fast-forward. |
| `pnpm dev:conclave` | Starts Conclave (the real product) against the local framework. |
| `pnpm dev:components` | Starts Slice.js Components. |
| `pnpm dev:docs` | Starts the documentation site. |
| `pnpm dev:framework` | Starts the `slice.js` demo with the local CLI and a runtime self-link. |
| `pnpm verify:conclave` | End-to-end smoke test of the local link (boot + served runtime + HTTP). |
| `pnpm test:framework` | Framework unit tests (`node --test`). |
| `pnpm test:cli` | CLI tests (`node --test`). |
| `pnpm test:components` | Slice.js Components unit/parser tests. |
| `pnpm test:components:e2e` | Slice.js Components Playwright component specs. |
| `pnpm test:components:gate` | Full components gate: unit + icons + e2e + build. |
| `pnpm test:conclave` | Conclave e2e (Playwright, both projects). |
| `pnpm build:conclave` | Conclave production build (copies the local runtime into `dist/`). |
| `pnpm start:conclave` | Serve Conclave's production build locally. |
| `pnpm lint:conclave` | Conclave ESLint. |
| `pnpm build:framework` | Builds the framework demo with the local CLI. |
| `pnpm test` | Framework + CLI + components unit suites (no e2e). |

## How local linking works

`pnpm-workspace.yaml` declares `repos/*` as workspace projects and uses `overrides` to force
**every** dependency on `slicejs-web-framework` or `slicejs-cli` — including transitive ones from
the CLI or Slice.js Components — to resolve to `repos/slice.js` and `repos/slicejs-cli` through
`link:`.

Practical consequences:

- `conclave/node_modules/slicejs-web-framework` is a direct junction/symlink to `repos/slice.js`,
  not a copy inside the `.pnpm` store.
- The dev server reads `/Slice/Slice.js` from that path, so **editing `repos/slice.js/Slice/` is
  reflected on reload**.
- The production build resolves the framework entry from the project and copies the local runtime
  into `dist/Slice/Slice.js`.
- No version bump or publish is required to test a change.
- Subrepo `package.json` files stay untouched and remain publishable.

> **Golden rule:** always run `pnpm install` from the workspace root. Running `pnpm install` inside
> `repos/conclave` (which has its own `pnpm-workspace.yaml` for pnpm settings) can resolve packages
> from the registry again and break the direct links. `pnpm doctor` detects that state.

## Bundled Slice.js skill

The workspace vendors the canonical **`slice-js-developer`** skill from
`repos/slice.js_docs/skill/slice-js-developer` into `.opencode/skills/slice-js-developer`. OpenCode
loads it automatically, so agents get the Slice.js mental model, decision rules and references
without network access.

- Current version: **1.12.0** (targets `slicejs-web-framework ^4.0.x`).
- The docs repo is the source of truth. Edit the skill there, bump `VERSION` and
  `skill/manifest.json`, then run `pnpm sync:skill`.
- `pnpm check:skill` and `pnpm doctor` detect drift between the vendored copy and the docs source.
- Never edit the vendored copy by hand.

`opencode.jsonc` also enables the optional `slicemcp` server for live, authoritative documentation
queries. The vendored skill remains fully usable offline via its `references/` directory.

## Documentation is part of the change

A framework or CLI change is not complete until its documentation is checked. User-facing changes
require a docs commit in `repos/slice.js_docs` (or `repos/slicejs-components/src/markdown` for
component docs). Internal-only changes still require a docs check and a recorded "no docs impact"
reason.

See [`docs/DOCUMENTATION.md`](./docs/DOCUMENTATION.md) for the mandatory workflow and the mapping
from framework area to documentation pages. The short version:

```bash
pnpm docs:generate
pnpm docs:llm
pnpm docs:lint:components && pnpm docs:generate:components   # component docs
pnpm sync:skill                                      # if the skill changed
```

## Repositories

| Directory | Package | Role |
|---|---|---|
| `repos/slice.js` | `slicejs-web-framework` | Runtime, router, component system, server factory, browser runtime/build. |
| `repos/slicejs-cli` | `slicejs-cli` | `slice dev/build/start/init/component/...`, bundler, watcher, types. |
| `repos/slicejs-components` | `slicejs-components` | Official visual/service components, registry, component docs and DOM e2e. |
| `repos/slice.js_docs` | `slicedocs` | Markdown-generated documentation site. |
| `repos/conclave` | `teams-organizer` | Real production product used as the proving ground. |

> The former `slice.js_visual_library` repository is now **`slicejs-components`** (Slice.js
> Components), matching `components.slicejs.com`. Old GitHub URLs redirect to the new name.

## Documentation

- [`CONTEXT.md`](./CONTEXT.md) — how everything fits together, runtime architecture and current state.
- [`AGENTS.md`](./AGENTS.md) — rules for agents and for any change.
- [`docs/CHANGE-WORKFLOW.md`](./docs/CHANGE-WORKFLOW.md) — end-to-end strategy for changing the framework or CLI and testing it.
- [`docs/DOCUMENTATION.md`](./docs/DOCUMENTATION.md) — mandatory docs policy and framework→docs page mapping.
- [`docs/LOCAL-DEVELOPMENT.md`](./docs/LOCAL-DEVELOPMENT.md) — linking model, recipes and escape hatches.
- [`docs/TESTING.md`](./docs/TESTING.md) — test matrix and what to run for each change.
- [`docs/RELEASE.md`](./docs/RELEASE.md) — release order, versioning and compatibility.
- [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md) — common symptoms and fixes.
- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — why the workspace is built this way (short ADRs).

## What this repo is not

- It is not a publishable monorepo: nothing is published from here.
- It does not replace the repos: changes are committed in the repo that owns each file.
- It does not pin subrepo commits: each repo advances on its branch (see `pnpm status` /
  `pnpm sync`).
- It does not reproduce the Vercel deployment: Vercel installs from the registry. To validate the
  exact npm artifact, see `docs/RELEASE.md`.
