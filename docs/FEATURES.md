# Feature standard

Features live **with the repository that owns them**, in a `features/` folder at the repo root. The
workspace provides the standard, the template and a CLI that aggregates every repo for one view.

`BACKLOG.md` remains the short, ordered, human-readable list. A `features/` file is the durable spec
for anything that needs more than a line: problem, direction, scope, risks, validation and docs
impact.

## Why per-repo

- The feature travels with the code, branch and release it belongs to.
- Contributors of a standalone repo can see and discuss it without cloning the workspace.
- A workspace-only backlog drifts as soon as someone works outside the workspace.
- GitHub Issues remain the discussion/execution layer when a repo is public; the feature file is the
  durable record that survives issue closure and repository moves.

## Layout

Each repo may have a `features/` folder at its root:

```text
repos/slice.js/
├── BACKLOG.md              # short ordered list; links to features/ when detail exists
└── features/
    ├── 0001-streaming-data.md
    └── 0002-router-devtools.md

repos/slicejs-cli/
├── BACKLOG.md
└── features/
    └── 0001-parallel-builds.md
```

The workspace is a repo too. It keeps only **workspace/ecosystem** features in its own `features/`:

```text
slice-workspace/
├── BACKLOG.md              # short ordered list; links to features/
└── features/
    ├── _TEMPLATE.md        # canonical template used by the CLI
    └── 0001-....md
```

IDs are per repo (`0001`, `0002`, ...), not global. The CLI displays them qualified:
`slice.js:0001`, `slicejs-cli:0001`.

## File contract

One feature per file, named `NNNN-short-slug.md`, with frontmatter:

```yaml
---
id: "0001"
title: "Streaming data in slice.build"
repo: "slice.js"
status: proposed
area: framework
priority: medium
created: 2026-10-26
updated: 2026-10-26
target: TBD
owners: []
related: []
depends_on: []
blocks: []
---
```

Statuses: `proposed`, `planned`, `in-progress`, `blocked`, `done`, `rejected`.

Areas: `framework`, `cli`, `components`, `docs`, `mcp`, `conclave`, `workspace`, `ecosystem`.

### Area → owning repo

| Area | Repo |
|---|---|
| `framework` | `slice.js` (framework runtime) |
| `cli` | `slicejs-cli` |
| `components` | `slicejs-components` |
| `docs` | `slice.js_docs` |
| `mcp` | `slicejs-mcp` |
| `conclave` | `conclave` |
| `workspace` / `ecosystem` | `slice-workspace` |

`pnpm feature:new` infers the repo from the area. Use `--repo <dir>` to override.

### Dependencies

`depends_on` lists features this one needs; `blocks` is the inverse, written on the feature that
blocks another. Both use qualified ids (`slicejs-components:0004`), are optional, and are validated
for unknown references, self-references and cycles. A dependency does not move work by itself; the
editor uses it as a promotion gate (a feature should not be marked `done` with unfinished
dependencies).

## `features/` vs `BACKLOG.md` vs GitHub Issues

| Artifact | Purpose |
|---|---|
| `BACKLOG.md` | Short, ordered, narrative list. One line per item. Links to `features/NNNN-...md` when detail exists. |
| `features/NNNN-...md` | Structured spec and durable record: problem, direction, scope, risks, validation, docs impact, decision log. |
| GitHub Issue | Discussion, assignment and execution. Optional; link it in `related`. |

The feature file's frontmatter is the source of truth for **status**. `BACKLOG.md` is the human
index and ordering; it should not duplicate the full spec. When an issue closes, the feature file
still records what was decided and shipped.

## Lifecycle

1. **`proposed`** — captured, not evaluated. Writing it is not approval to implement.
2. **`planned`** — accepted for a future cycle; set `target` and update `updated`.
3. **`in-progress`** — implementation started; link the branch/issue/PR in `related`.
4. **`blocked`** — waiting on a decision/dependency; record why.
5. **`done`** — code, tests, docs and skill (if needed) are complete; add links and a decision-log
   entry.
6. **`rejected`** — decided against; keep the reasoning.

Promotion to `planned` requires the problem, direction, scope, compatibility/risk, validation and
docs impact to be filled in. Do not start code before that.

## Commands

```bash
# Create in the owning repo (inferred from --area)
pnpm feature:new "Streaming data in slice.build" --area framework --priority high

# Override the repo, or create a workspace/ecosystem feature
pnpm feature:new "Cross-repo local cache" --repo workspace --area ecosystem

# One view across every repo
pnpm feature:list
pnpm feature:list --status planned
pnpm feature:list --area cli
pnpm feature:list --repo slicejs-components
pnpm feature:list --json

# The same data in a read-only local dashboard (spec viewer + repo health)
pnpm dashboard
```

The CLI creates `<repo>/features/` on demand and copies `features/_TEMPLATE.md` from the workspace.
The feature is committed in the **owning repo**, not in the workspace.

`pnpm dashboard` is another presentation of this model, never a second source of truth. It reads the
same frontmatter through `scripts/lib/features.mjs` (shared with `feature:list`), adds a rendered
Markdown viewer for the spec and shows Git/link health next to it. See
[`DASHBOARD.md`](./DASHBOARD.md).

## Standalone repo usage

A repo without the workspace can use the same folder/file contract: create `features/` and copy the
template from this document (or from the workspace). Link it from `BACKLOG.md`. No extra per-repo
README is required; the frontmatter is the contract.

## Rules

- Do not implement a feature until it is explicitly moved to `planned`/`in-progress`.
- One feature per file; do not combine unrelated features.
- Keep the **spec** separate from the **implementation**: the owning repo contains the code.
- This workspace is public: no secrets, customer data or credentials in feature files.
- If direction changes, update the file and add a decision-log entry; don't rewrite history silently.
- When a feature ships, link the commit/PR in `related` and leave the file as the record.
- Use `BACKLOG.md` for the one-line list; use `features/` when the item earns a spec.
