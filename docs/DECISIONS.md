# Decisions

Short architecture decision records for the workspace. Date them in the commit history rather than
here; update or supersede them when the model changes.

## ADR-001 — Independent repos with a manifest, not submodules

**Decision:** keep every project as a standalone Git checkout under `repos/<name>` and describe them
in `workspace.config.json`; `repos/` is gitignored and restored by `pnpm bootstrap`.

**Why:**

- Each repo releases on its own cadence and branch; submodules would pin detached commits and add a
  second commit layer for every change.
- Agents and contributors work with normal Git commands in the repo that owns the change.
- The workspace repo stays small and contains only orchestration and context.
- No accidental vendoring of product code.

**Trade-off:** the workspace does not pin exact commits. `pnpm status` / `pnpm sync` make drift
visible; reproducibility of a given investigation is the responsibility of the person/agent, who can
record commit hashes in the task.

## ADR-002 — pnpm `overrides` with `link:`, not `workspace:*`

**Decision:** force `slicejs-web-framework` and `slicejs-cli` to the local checkouts through
`overrides` in `pnpm-workspace.yaml`.

**Why:**

- A single override rewrites the whole graph, including transitive dependencies (for example the
  CLI's own framework dependency).
- It does not require changing subrepo `package.json` files, so they remain publishable and
  standalone.
- `link:` bypasses semver, which is exactly what the workspace needs to test unreleased versions.
- It produces a direct junction to the source tree, not a `.pnpm` copy, so editing source is enough.

**Trade-off:** the workspace can run combinations npm would never resolve. `pnpm doctor` reports
declared ranges vs local versions; releases must re-validate with the real artifact
(see ADR-005).

## ADR-003 — Root-only installs and `INIT_CWD` wrappers

**Decision:** all installs happen at the workspace root. App scripts are launched through
`scripts/run-app-script.mjs`, which sets `cwd` and `INIT_CWD` to the app directory.

**Why:**

- Running `pnpm install` inside a subrepo can make pnpm treat that subrepo as its own workspace root
  and re-resolve packages from the registry.
- The Slice CLI prioritises `INIT_CWD` over `cwd`; pnpm resets `INIT_CWD` to the invocation
  directory, so `pnpm --filter ... run dev` from the root resolves the wrong project root.
- Pinning both values makes dev/build/test behave the same whether launched by a human or a script.

**Trade-off:** the root scripts are slightly more custom than plain pnpm filters. The behaviour is
documented here and in `docs/LOCAL-DEVELOPMENT.md`.

## ADR-004 — No npm publication in the inner loop

**Decision:** develop and test against linked source; publish only through the documented release
process.

**Why:**

- The feedback loop becomes seconds instead of a publish/install cycle.
- It avoids polluting npm with development versions.
- It allows testing framework changes against the real product (Conclave) immediately.

**Trade-off:** some failure modes only appear with a real registry install (package `files` array,
serverless bundling, symlink tracing). The release checklist therefore includes a packed-artifact
smoke test.

## ADR-005 — Local validation does not replace deploy validation

**Decision:** `pnpm verify:conclave` proves the local link; it does not reproduce Vercel.

**Why:**

- Vercel installs from the registry and uses Conclave's custom `api/index.js` +
  `scripts/copy-slice.js` path.
- Those constraints (file tracing, `includeFiles`, pruned `node_modules`) are invisible locally.
- Claiming a deploy is safe based only on the workspace would be misleading.

**Trade-off:** releases need one additional check against the packed artifact and, for Conclave, a
preview deployment when the server/runtime packaging changes.

## ADR-006 — Subrepo AGENTS remain authoritative, with workspace overrides

**Decision:** keep each repo's `AGENTS.md`; the root `AGENTS.md` only supersedes instructions that
are specific to the old standalone-clone workflow (notably "editing the source does nothing until
published" and "patch the pnpm store").

**Why:**

- The subrepo docs contain deep, task-specific knowledge that should not be duplicated or stale.
- The link model changes a few foundational assumptions; those must be corrected at the workspace
  level.

**Trade-off:** two documents can disagree. `AGENTS.md` §6 lists the known obsolete statements; when
updating a subrepo doc, keep the standalone context in mind.

## ADR-007 — Vendor the skill, keep docs as the source of truth

**Decision:** commit the canonical `slice-js-developer` skill from
`repos/slice.js_docs/skill/slice-js-developer` into `.opencode/skills/slice-js-developer`, with a
sync script and a doctor/check parity check.

**Why:**

- OpenCode loads project skills from `.opencode/skills` automatically; agents get the Slice.js
  mental model without relying on an MCP or network.
- The docs repo already publishes and versions the skill; keeping the canonical source there avoids
  a second authoring location.
- A vendored copy is inspectable, diffable and available offline.
- The sync/check commands prevent the copy from silently drifting.

**Trade-off:** two copies exist. They must be synced with `pnpm sync:skill` and the version bumped
in the docs repo; `pnpm doctor` / `pnpm check:skill` fail on drift.

## ADR-008 — Documentation is a gate, not a follow-up

**Decision:** every change needs a documentation decision. User-facing framework/CLI/component
changes require a docs commit in the owning docs repo; internal-only changes require a recorded
"no docs impact" reason. Framework changes must be checked against the page map in
`docs/DOCUMENTATION.md`.

**Why:**

- Local linking makes code changes easy; without a docs gate the published documentation drifts
  faster than before.
- The skill and generated docs are easy to forget; making them part of the definition of done keeps
  agents and humans aligned.
- Docs are versioned with code, so a behavior change and its explanation should land together.

**Trade-off:** small internal changes still pay a short docs-check cost. That is intentional: the
check is cheap, and the recorded decision prevents silent documentation debt.

## ADR-009 — Rename the components repo to `slicejs-components`

**Decision:** rename the GitHub repository and npm package from `slice.js_visual_library` /
`slicejs-webframework-visual-components-library` to **`slicejs-components`**. The public product
name stays **Slice.js Components**, matching `components.slicejs.com`.

**Why:**

- The old repository name described an implementation detail ("visual library") that no longer
  matches the product: it now documents both Visual and Service components.
- The catalog identifier was already `slicejs-components`, and the domain is
  `components.slicejs.com`; the repo/package name should match.
- A single name reduces confusion in the CLI registry, MCP catalog, docs and workspace manifest.

**Trade-off:** this is a breaking rename for repository/package consumers. GitHub redirects old
URLs, but the CLI, MCP, docs, skill and workspace URLs were updated explicitly. The package version
moved to `2.0.0`; the old repository name remains only as a compatibility identifier in historical
notes and redirects.

## ADR-010 — Per-repo `features/` with a workspace aggregator

**Decision:** feature proposals live in each repo's `features/` folder (one Markdown file per
feature, `NNNN-slug.md`). `BACKLOG.md` remains the short ordered list and links to the detailed file.
The workspace keeps only workspace/ecosystem features and exposes `pnpm feature:new` /
`pnpm feature:list` to create and aggregate across all repos.

**Why:**

- The proposal travels with the code, branch and release it belongs to.
- Standalone repo contributors can see it without cloning the workspace.
- A workspace-only backlog drifts as soon as someone works outside the workspace.
- Structured frontmatter makes the workspace CLI reliable; free-form `BACKLOG.md` alone does not.
- GitHub Issues can still be the discussion/execution layer; the feature file is the durable record.

**Trade-off:** two artefacts (`BACKLOG.md` and `features/`) must not duplicate each other. The rule is:
`BACKLOG.md` = one-line index/order; `features/` = the spec for anything that needs detail. The status
lives in the feature frontmatter; `BACKLOG.md` only links to it.
