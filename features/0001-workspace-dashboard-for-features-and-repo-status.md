---
id: "0001"
title: "Workspace dashboard for features and repo status"
repo: "workspace"
status: done
area: workspace
priority: medium
created: 2026-10-28
updated: 2026-10-28
target: "workspace"
owners: []
related:
  - "scripts/feature.mjs (feature:list aggregator)"
  - "scripts/lib/features.mjs (shared parser and collector)"
  - "scripts/lib/health.mjs (repo and link health)"
  - "scripts/lib/markdown.mjs (escape-first spec renderer)"
  - "scripts/dashboard.mjs + scripts/dashboard/ (server, UI, static export)"
  - "scripts/status.mjs (per-repo Git state)"
  - "scripts/doctor.mjs (link and version health)"
  - "docs/DASHBOARD.md (command, data contract, limits)"
  - "docs/DECISIONS.md (ADR-013)"
  - "docs/FEATURES.md (statuses, areas, file contract)"
  - ".opencode/skills/tdd, frontend-design, make-interfaces-feel-better (UI/test guidance)"
  - "BACKLOG.md (workspace index)"
---

# Workspace dashboard for features and repo status

## Summary

A read-only local dashboard for the workspace: one page that shows every feature proposal across
`repos/*` (status, area, priority, target, owning repo, spec body) next to the health of each
checkout (branch, dirty state, ahead/behind, last commit, link resolution and version skew). It
includes a rendered Markdown viewer for the spec (with table of contents and a raw-source tab) and
is served by a new `pnpm dashboard` command. It reads the data that already exists — it does not
introduce a second backlog or a new status source.

## Problem / motivation

The per-repo `features/` model (ADR-010) is working: the workspace now has five feature files in
`slice.js`, `slicejs-cli` and `slicejs-components`, and more proposals will arrive. But the only
cross-repo views are terminal tables (`pnpm feature:list`, `pnpm status`, `pnpm doctor`) and they are
disconnected:

- `feature:list` shows frontmatter only; it cannot open the spec, filter interactively, or show the
  relationship between a feature and the health of its repo.
- `status` and `doctor` know about branches, links and version skew, but nothing about features.
- Understanding "what is in progress, where, and in what state is that repo" currently means running
  two commands and opening several Markdown files by hand.
- A human (or an agent resuming work) has no quick way to spot stale specs (`updated` old), invalid
  frontmatter (unknown status/area, missing fields) or a feature whose repo is dirty/diverged.

The dashboard is a presentation layer over the documented model, not a replacement for it.

## Proposed direction

- **Command:** `pnpm dashboard` starts a local-only server (default `127.0.0.1`, port from `--port`
  or the first free port; never 3001, which belongs to the apps). Flags: `--out <dir>` writes a
  static snapshot instead of serving, `--json` prints the aggregated payload and exits, `--port`.
- **Shared data layer:** extract the frontmatter parser and feature discovery from
  `scripts/feature.mjs` into `scripts/lib/features.mjs`, and make `feature:list` consume it. One
  parser, one set of status/area constants, so the dashboard cannot drift from the CLI.
- **Sources (all existing):**
  - `features/NNNN-*.md` in the workspace and in every `workspace.config.json` repo: frontmatter +
    body + file path.
  - `workspace.config.json`: repos, roles, packages, remotes, links, consumers.
  - Repo `package.json` versions and `pnpm status`-style Git data (branch, dirty count, ahead/behind,
    last commit) through the existing helpers in `scripts/lib/workspace.mjs`.
  - Link/version health from the same checks `doctor` performs (in-process, not by spawning it).
  - `BACKLOG.md` links, surfaced as context, not parsed as a second feature list.
- **View:**
  - Summary counters per status (`proposed`, `planned`, `in-progress`, `blocked`, `done`,
    `rejected`) and per area.
  - Feature table with filters (status, area, repo, priority, free text), sortable by `updated`.
  - Detail panel with the rendered spec, frontmatter and a link to the owning file.
  - Repo cards: role, version, branch, dirty/ahead-behind, link target and version-skew warning.
  - Validation badges: unknown status/area, missing required frontmatter, `id` not matching the file
    name, `updated` older than a configurable threshold, `repo` frontmatter not matching the folder.
- **Output policy:** generated HTML goes to a gitignored directory (for example `.dashboard/`); no
  generated page is committed. The dashboard is read-only: no editing features, no writing to repos,
  no `git` mutations.
- **No new runtime dependencies:** Node built-ins only, plain HTML/CSS/JS, consistent with `scripts/`.
  Markdown is rendered with a small escape-first renderer (or `<pre>` for v1) — never `innerHTML` with
  unescaped spec text.

## Alternatives considered

- **Extend `feature:list` only (terminal UI):** cheapest, but does not show spec bodies, repo health or
  filters; still requires two commands to answer one question.
- **GitHub Issues / Projects as the dashboard:** adds network/auth, splits the durable record from the
  feature file, and fails for standalone/local work; the file remains the source of truth (ADR-010).
- **Static docs page in `slice.js_docs`:** adds a publishing surface and a generated artifact that goes
  stale; the dashboard is a local developer tool, not public documentation.
- **Build it with Slice.js Components:** dogfooding is attractive, but it couples workspace tooling to
  a framework under development and adds a build step; revisit only if the dashboard needs real
  interactivity beyond filters.

## Scope

### In scope

- `scripts/lib/features.mjs` shared parser/collector, with `feature:list` refactored onto it.
- `scripts/dashboard.mjs` server, static export and `--json`.
- Feature aggregation across the workspace and all manifest repos, including missing repos.
- Repo health (Git + link/version) in the same payload.
- Filterable single-page UI with spec detail and validation badges.
- Docs, command registration and a small `node --test` suite for the parser/collector.

### Out of scope

- Editing, promoting or creating features from the UI (the CLI keeps that role).
- GitHub API, authentication, multi-user hosting or deployment.
- Parsing `BACKLOG.md` or Conclave's `docs/FEATURES.md` as feature sources.
- Metrics, time tracking, burndown charts or historical snapshots.
- Changing the feature file contract, statuses or areas.

## Compatibility and risk

- **Public API impact:** none. Workspace-only script and docs; no framework, CLI, component or
  published package changes.
- **Existing apps affected:** none. The dashboard only reads files and Git metadata; it never writes to
  `repos/`.
- **Migration / breaking change:** none. `pnpm feature:list` output must stay byte-compatible for the
  default table and `--json` shape; the refactor is covered by tests.
- **Security / performance:** bind to loopback only; escape all spec text; no secrets in feature files
  (already a rule). Reading ~10 repos and running a few `git` commands per request is negligible, but
  the payload should be cached for the lifetime of a request rather than per cell. The dashboard must
  not spawn `doctor`/`status` subprocesses on every keystroke.

## Validation plan

- **Unit tests:** `node --test` over fixtures for the shared parser: quoted titles, CRLF, missing or
  malformed frontmatter, unknown status/area, `id`/filename mismatch, empty `features/`, missing repo
  directory; assert the aggregated `--json` shape and that `feature:list` uses the same collector.
- **Browser/e2e tests:** manual smoke over the served page with the real repos (filters, detail panel,
  repo cards, empty state); no Playwright suite required for a loopback dev tool in v1.
- **Product check (Conclave):** not applicable; the dashboard does not touch the product. Confirm
  `pnpm doctor` and `pnpm status` still work and remain the CLI source of truth.
- **Artifact/release check:** none; nothing is published. `pnpm dashboard --json` must work with zero
  features and with a missing optional repo (`portfolio`, `slice.js_docs`).

## Documentation impact

- **Framework docs pages:** none.
- **Component docs:** none.
- **Skill / agent guidance:** no change expected; if `AGENTS.md` gains the command, the skill is still
  about Slice development, not workspace tooling. Record "no skill impact" explicitly.
- **Workspace docs:** add `docs/DASHBOARD.md` (data sources, command, output policy, limitations),
  add the command to the `README.md` and `AGENTS.md` command tables, add a short "other presentation"
  note to `docs/FEATURES.md`, add ADR-013 ("the dashboard is a view of the feature files, never a
  second source of truth"), and link the feature from `BACKLOG.md`.

## Open questions

- [x] Default port and `--watch`: 4173 with the next free port; no watcher in v1 — the server rebuilds
      the payload per request, so a page reload is enough.
- [x] Markdown rendering: escape-first renderer (`scripts/lib/markdown.mjs`) with a rendered/raw tab
      and a table of contents; no third-party parser.
- [x] Link/version health: kept in `scripts/lib/health.mjs` for the dashboard, with `doctor` remaining
      authoritative. `doctor.mjs` is still a presentation-heavy script; the duplication is recorded
      in ADR-013.
- [x] `BACKLOG.md`: linked as context only, never parsed as a second feature index.
- [x] Recent commits: `last commit` per repo card is enough for v1; no history panel.

## Decision log

- 2026-10-28 - Created as `proposed` from the user's request for a workspace dashboard that follows
  the documented per-repo feature model. Not approved for implementation yet.
- 2026-10-28 - Approved and promoted to `in-progress`. Decisions taken while implementing:
  - The frontmatter parser moved to `scripts/lib/features.mjs` and `feature:list` now consumes it, so
    the CLI and the dashboard cannot disagree about status, area or IDs. `--json` keeps its stable
    seven-field shape.
  - The dashboard serves from Node built-ins only (no dependencies), binds to loopback, and rebuilds
    the payload per request. `--json` and `--out` cover scripting and snapshots; `.dashboard/` is
    gitignored.
  - The spec viewer renders Markdown server-side with an escape-first renderer, adds a table of
    contents, a raw-source tab, copy actions and a deep link (`#/feature/<repo>%3A<id>`).
  - Health is a read-only summary in `scripts/lib/health.mjs` that mirrors `doctor`; `doctor` remains
    authoritative. The duplication is recorded as a trade-off in ADR-013.
  - Validation is advisory: unknown status/area/priority, ID and repo mismatches, missing/invalid
    dates, `updated` before `created`, and stale open specs (>30 days).
- 2026-10-28 - Done. Implemented `pnpm dashboard`, `--json`, `--out`, `--port`, `--open`, the
  Markdown viewer and the health panels; added `pnpm test:workspace` (14 tests) and documented the
  command in `README.md`, `AGENTS.md`, `docs/FEATURES.md`, `docs/DASHBOARD.md` and ADR-013. Verified
  against the live workspace (6 features, 7 repos, 9 links) with no browser console errors.
- 2026-10-28 - Visual pass. Vendored the `tdd`, `frontend-design` and
  `make-interfaces-feel-better` skills (ADR-014) and replaced the dark card dashboard with a light
  ledger: fixed repository rail, large count + distribution bar, table-first spec list, and a
  right-side spec sheet. Improved the Markdown renderer (nested lists, continuation lines) and added
  `prefers-reduced-motion`, visible focus rings, tabular numbers and `0.96` press feedback. Re-verified
  the filters, spec viewer, raw tab, TOC and deep links in Chromium.
