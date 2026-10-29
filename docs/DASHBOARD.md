# Dashboard

`pnpm dashboard` serves a read-only, local dashboard for the workspace: every feature proposal across
`repos/*`, its status, and the health of the checkouts it belongs to. It is a **view** of the data the
workspace already owns — it never replaces the feature files, `BACKLOG.md`, `pnpm feature:list` or
`pnpm doctor`.

## Quick start

```bash
pnpm dashboard                 # http://127.0.0.1:4173 (first free port from 4173)
pnpm dashboard --open          # also opens the default browser
pnpm dashboard --json          # print the aggregated payload and exit
pnpm dashboard --out           # write a static snapshot to .dashboard/
pnpm dashboard --out docs-preview
pnpm dashboard --port 4180
```

The server binds to loopback only by default and has no authentication. Do not expose it on a public
interface: it includes local absolute paths and Git metadata.

## Where the data comes from

| Source | Used for |
|---|---|
| `features/NNNN-*.md` (workspace and every manifest repo) | Feature rows, status, area, priority, target, owners, related links, dependencies (`depends_on` / `blocks`) and the Markdown spec. |
| `workspace.config.json` | Repos, roles, packages, remotes, consumers and local links. |
| `scripts/lib/features.mjs` | Shared frontmatter parser and feature collector, also used by `pnpm feature:list`. |
| `scripts/lib/health.mjs` | Git state and local link/version checks (the same rules as `pnpm doctor`). |
| `scripts/lib/markdown.mjs` | Escape-first Markdown rendering for the spec viewer. |

The feature frontmatter remains the source of truth for status (see [`FEATURES.md`](./FEATURES.md)).
The dashboard does not write, promote or create features; use `pnpm feature:new` and edit the file.

## Views

- **Summary cards** — counts by status, stale features, repo health and link health. Clicking a
  status card filters the table.
- **Features** — status, repo, area, priority, target, last update and a validation badge. Filters:
  status, area, repo, priority and free text (title, id, repo, area, target and spec body).
- **Spec viewer** — click a row to open the full spec. It renders the Markdown (headings, nested
  lists, tables, fenced code, task lists) with a table of contents and has a **Markdown** source
  tab, copy-spec and copy-path actions, and an `Open in editor` link (`vscode://`). The open spec
  is reflected in the URL (`#/feature/<repo>%3A<id>`) so it can be linked or reloaded.
- **Repositories** — branch vs expected branch, dirty files, ahead/behind, last commit, package
  version and validation issues. Clicking a card filters the features by that repo.
- **Local links** — per consumer/package resolution and version-skew findings.

Validation badges are advisory: unknown status/area/priority, `id`/filename mismatch, frontmatter
`repo`/folder mismatch, missing dates, `updated` before `created`, and specs not updated in more than
30 days while still `proposed`/`planned`/`in-progress`/`blocked`.

## Design notes

The dashboard is a light **ledger**: a quiet lavender-paper surface, a fixed repository rail, one
large count and a status distribution bar instead of a grid of summary cards, and a table-first
spec list. The accent is Slice.js Components violet; typography uses a condensed system display
face for headings, the system UI face for reading, and a monospace face only for paths, IDs and
versions. There are no decorative gradients or a card for every number.

The same rules apply to the spec sheet: a right-side sheet rather than a floating card, concentric
radii, structural rules instead of shadows on every surface, visible `:focus-visible` rings,
`prefers-reduced-motion` support, tabular numbers for counts and dates, and a `0.96` scale on press.
The viewer is escape-first: raw HTML in a spec is rendered as text, and links are limited to
http(s), mailto, anchors and relative paths.

The visual and testing guidance comes from the vendored `frontend-design`,
`make-interfaces-feel-better` and `tdd` skills (see [`README.md`](../README.md#bundled-agent-skills)).

## Static export

`pnpm dashboard --out [dir]` writes a self-contained snapshot:

```text
.dashboard/
├── index.html   # data embedded inline
├── data.json    # same payload, for scripts
├── app.css
└── app.js
```

The default output directory is gitignored. Do not commit generated snapshots; they go stale the
moment a feature file changes. For a shareable artifact, regenerate it from the commit you want to
show.

## Payload

`pnpm dashboard --json` and `GET /api/data` return the same object:

```jsonc
{
  "generatedAt": "2026-10-28T...",
  "root": "C:/.../slice-workspace",
  "summary": {
    "features": { "total": 6, "byStatus": {}, "byArea": {}, "byPriority": {}, "stale": 0, "warnings": 0 },
    "repos": { "total": 7, "ok": 3, "warn": 4, "error": 0 },
    "links": { "total": 9, "ok": 6, "warn": 3, "error": 0 }
  },
  "features": [/* frontmatter + body + bodyHtml + warnings + paths */],
  "repos": [/* Git/package state + issues */],
  "links": [/* consumer/package resolution + version skew */]
}
```

The shape is intentionally additive: new fields may appear, existing feature-list fields do not
change. `pnpm feature:list --json` keeps its stable seven-field shape.

## HTTP endpoints

| Path | Response |
|---|---|
| `/` | Dashboard HTML (data embedded). |
| `/api/data` | JSON payload. |
| `/app.css`, `/app.js` | Static dashboard assets. |
| `/healthz` | `ok`; useful when scripting the server lifecycle. |

## What it does not do

- No editing or promoting features from the UI (the CLI owns that).
- No GitHub API, authentication, multi-user hosting or deployment.
- No parsing of `BACKLOG.md` or Conclave's `docs/FEATURES.md` as feature sources.
- No history, metrics or burndown.
- No framework/CLI/product behavior changes.

## Limits and troubleshooting

- **`pnpm doctor` is authoritative.** The dashboard mirrors the link, version and repo checks; if a
  rule changes, change both. A green dashboard is not a substitute for `pnpm doctor`.
- **Port in use:** the default port starts at 4173 and walks forward up to 20 ports. Pass `--port` to
  fail fast on a specific port instead.
- **Missing repo:** an optional checkout shows as `skipped` for links and a repo card with an error.
  Run `pnpm bootstrap`.
- **Data looks stale:** the server rebuilds the payload on every request; reload the page. The
  static export is a snapshot by definition.
- **No Git:** repo cards show a missing/not-a-git error. The dashboard still lists feature files.

## Tests

`pnpm test:workspace` covers the shared feature parser, the Markdown renderer (including HTML
escaping and unsafe links), payload serialization and health summaries. The full gate is
`pnpm test`.

## Related

The **Slice.js lab** (`pnpm dev:lab`) is a separate app that consumes this dashboard's JSON contract
as a feature workbench (ledger, component requests, health) and measures UI fluidity. See
[`LAB.md`](./LAB.md). It is additive: the monitor here stays dependency-free and keeps working when
the framework is broken.
