---
id: "0002"
title: "Slice.js lab: feature workbench and UI fluidity lab"
repo: "workspace"
status: in-progress
area: ecosystem
priority: medium
created: 2026-10-28
updated: 2026-10-28
target: "M0"
owners: []
related:
  - "scripts/dashboard.mjs (current zero-dependency monitor)"
  - "scripts/lib/features.mjs (shared feature payload)"
  - "docs/DASHBOARD.md (current data contract)"
  - "repos/slice.js (createSliceServer, routing, styles, ThemeManager)"
  - "repos/slicejs-components (63 component/service docs; SideMenu, ThemeSwitcher)"
  - "repos/slicejs-components/src/markdown/Sidemenu.md"
  - "repos/slicejs-components/src/markdown/theme-switcher.md"
  - "repos/slicejs-cli (dev/build/start)"
  - "repos/conclave (existing production proving ground)"
  - "repos/slicejs-lab (M0 app; manual scaffold compared with slice init)"
  - "docs/LAB.md (commands, provenance, fluidity methodology)"
  - "docs/DECISIONS.md (ADR-015: a separate lab, not the monitor)"
---

# Slice.js lab: feature workbench and UI fluidity lab

## Summary

Build a standalone **Slice.js app** that is both a **feature workbench** for the workspace and a
**repeatable lab for UI fluidity**: route transitions, component mount/update/destroy cost, table and
list rendering, overlays, theme switching and interaction latency.

It is not the only Slice.js app and it does not replace the repositories or Conclave. It is a
consumer: a real app shell with `SideMenu` navigation, blue-navy themes, a mini API for realistic data
and failure states, and instrumentation that turns "feels smooth" into numbers. Its main job is the
**feature system**: every feature file in the workspace, every wanted component, and the
states around them.

The current zero-dependency `pnpm dashboard` stays as the monitor and fallback.

## Problem / motivation

The workspace now has a feature file contract per repo, but no single app that treats those files as
work: triage, relationships, health, history and authoring. The docs site owns component API
documentation, so repeating it in the lab would be a second source of truth. Consequences:

- There is no honest answer to "what is the state of the feature system right now?": what is
  proposed, what is blocked, what is stale, what is ready to plan, and what changed.
- There is no repeatable way to measure **UI fluidity** or **component cost** on the screens that
  actually carry the data. A demo that looks fine can still drop frames on a 1,000-row table, a
  nested `SideMenu`, a modal over a long spec or a theme switch.
- Wanted components live in one growing Markdown list. Without one feature per request, the list
  drifts and there is no durable place for the API, scope, a11y, docs and validation.
- There is no small API target for realistic payloads, slow/failing responses, SSE, pagination or
  caching. Conclave is too important to use as a stress target.

## Non-goals

- Not the only Slice.js app, not a replacement for Conclave, and not a production product.
- Not a replacement for `pnpm dashboard` or its role as a diagnostic monitor.
- Not a component showcase or a second copy of the component documentation. The docs site owns the
  API reference and live demos; the lab owns the feature workbench and the measurements.
- Not a replacement for component `*.spec.js` suites or the generated component docs.
- Not a public deployment, npm package or multi-user service in the first iteration.
- Not a reason to change framework/CLI/component behavior just to make the lab look good.

## Proposed direction

### 1. A standalone app repo

Create `slicejs-lab` (working name) as a separate repository, added to `workspace.config.json` as a
consumer, linked to the local framework, CLI and components like Conclave. The workspace stays
orchestration; the app code lives in its own repo with its own `AGENTS.md`, tests and release notes.

The app consumes the workspace data through the existing **JSON contract**
(`pnpm dashboard --json` / `.dashboard/data.json`), not by importing workspace scripts. That keeps it
standalone and makes the contract itself testable.

### 2. The shell: SideMenu navigation

Use [`SideMenu`](../repos/slicejs-components/src/markdown/Sidemenu.md) as the app's main navigation:

- `mode: 'tree'` on desktop, `mode: 'auto'` with a breakpoint so narrow windows become `drill`.
- `followRoute: true` and `activePath` from the router; no hand-maintained current item.
- Groups for the top-level areas, a nested `Features` submenu, `badge` for counts (open wanted
  components, warnings), `description` for the second line, `icon` for each area.
- Lazy `items` for long lists to test the loading row and `reload(id)`.
- A `ThemeSwitcher` action in the menu footer (or a persistent topbar control) keeps every theme
  control in sync via `themeChanged`.

Proposed tree:

```
Overview
Features
  Ledger
  Board
  Wanted components
  Needs attention
  Roadmap
Fluidity
  Scenarios
  Baseline
Settings
```

`Route` / `MultiRoute` render the outlet. `Breadcrumbs` reflect the current branch. `NotFound`
handles unknown routes. The mobile layout uses the same `SideMenu` in `drill` mode inside a drawer,
so the navigation itself is part of what we test.

### 3. Blue-navy themes

Ship two app-local themes, not changes to the component library:

- `NAVY` — the primary dark blue-navy theme for the lab.
- `NAVY_DAY` — a light, navy-tinted companion for contrast and daylight readability.

Use `ThemeSwitcher` (not `ThemeSelector`, which is hardcoded to `LIGHT`/`DARK`) with
`themes: ['NAVY', 'NAVY_DAY']`, `display` labels/icons, and `slice.setTheme()`. Themes are CSS files
under the app's `src/public/Themes/`, following the semantic tokens (`--primary-background-color`,
`--primary-color`, `--font-primary-color`, status colors, shadows, surfaces). The active theme is also
exposed as `data-slice-theme` by the framework.

Proposed palette seeds (to be contrast-checked and tuned):

| Token | NAVY | NAVY_DAY |
|---|---|---|
| Background | `#081426` | `#f3f7fd` |
| Surface | `#0f2138` | `#ffffff` |
| Raised surface | `#16324f` | `#e8f0fb` |
| Primary | `#3b82f6` | `#1d4ed8` |
| Accent | `#38bdf8` | `#0369a1` |
| Text | `#e6f1ff` | `#0b1f3a` |
| Muted text | `#9fb3c8` | `#4b5f78` |
| Border | `#233554` | `#c9d8ec` |
| Success | `#2dd4a7` | `#047857` |
| Warning | `#f0b429` | `#92400e` |
| Danger | `#ff6b81` | `#b4233c` |

No app-local palette may be promoted into `slicejs-components` until it proves reusable; if it does,
it becomes a normal library theme with docs and a spec.

### 4. Feature workbench

The app's primary surface is the feature system, not a component catalog. The docs site owns the API
reference and the live component demos; the lab treats the feature files as work:

- **Ledger**: the sortable, paginated `Table` over every feature file, with `Badge`/`Chip` cells,
  filters and per-row actions.
- **Wanted components**: the wanted components from `repos/slicejs-components/features/`, grouped
  by status and priority. One wanted component is one feature; `WANTED_COMPONENTS.md` is only the index.
- **Needs attention**: stale specs, blocked items, missing owners/targets, ready-to-plan proposals,
  done items without a decision log, and repos with local changes.
- **Detail**: a full page (not only a modal) with Spec, Health, Relations, History and Edit.
- **Board and roadmap**: status columns and target/milestone grouping over the same data.
- **Authoring**: create, edit, validate and promote a spec with a diff preview, explicit save and
  no automatic commit. Read-only until the write path is proven.

The components are chosen because the workbench needs them, not to prove coverage. A component that
does not earn a place in a real screen stays in the docs.

### 5. Fluidity lab

This is the core of the request: measure the UI and the existing components, not just render them.

**Scenarios**

- Route transition (Overview → Wanted components → Fluidity).
- `SideMenu` open/close, deep level change, lazy submenu load.
- Mount/update/destroy 1, 10 and 50 cards; a table with 100, 1,000 and 10,000 rows.
- Typing in a filter over a large table; sort and paginate.
- Open/close a modal over a long spec; toast burst; tooltip hover; dropdown.
- Theme switch (`NAVY` ↔ `NAVY_DAY`) over a populated page.
- Drag & drop, file upload progress, SSE stream, infinite scroll.
- Markdown/spec render of a long document.

**Metrics**

- **INP** (Interaction to Next Paint) and event latency.
- **Long tasks** (>50 ms) and **LoAF** entries where available.
- **Frame time / FPS** during scroll and route transitions; dropped frames.
- **Route transition** p50/p95.
- **Component mount / update / destroy** p50/p95 (the lab can wrap `slice.build`/destroy and measure).
- **Memory** (`performance.memory` where available) and DOM node count after repeated cycles.
- **Bundle size per route** from the CLI build output.

**Instrumentation**

- `performance.mark()` / `performance.measure()` around route and component scenarios.
- `PerformanceObserver` for `longtask`, `event`, `long-animation-frame` and `layout-shift` when the
  browser supports them.
- A `requestAnimationFrame` sampler for a small FPS HUD.
- A `/lab/fluidity` route with a run button, scenario picker, warm-up, N repetitions, and a JSON
  export of results.
- Deep dives in Chrome DevTools Performance with CPU/network throttling; record the machine,
  browser version and viewport with every baseline.

**Proposed budgets** (environment-dependent; record, don't gate yet)

- INP < 200 ms; no long task over 50 ms during a route transition.
- Simple component mount < 16 ms; complex component < 50 ms.
- 100-row table update < 50 ms; 1,000-row first render measured and documented.
- No memory growth over 10 MB after 20 route/mount cycles.
- 60 fps while scrolling a representative table on the baseline machine.

Budgets are a starting point, not a CI gate. A stable baseline and a repeatable harness come first.

### 6. Mini API for realistic states

The app server uses `createSliceServer` and exposes read-only endpoints plus a lab surface:

| Endpoint | What it exercises |
|---|---|
| `GET /api/features` | Pagination, filtering, ETag/304, query parsing. |
| `GET /api/features/:repo/:id` | 404, validation, large body. |
| `GET /api/lab/echo` | Query/body parsing, headers. |
| `GET /api/lab/items?page=&limit=` | Pagination and stable ordering. |
| `GET /api/lab/slow?ms=` | Timeouts, aborting, loading states. |
| `GET /api/lab/fail?status=` | Error boundaries, retries, user-facing errors. |
| `GET /api/lab/large?rows=` | Large payloads and table limits. |
| `GET /api/lab/cache` | `ETag` / `Cache-Control` / `304`. |
| `GET /api/lab/stream` | SSE/streaming and progressive rendering. |

Workspace data is read-only by default. The first authoring slice writes only after an explicit save,
with a diff preview and a backup; it never commits or pushes, and mutations against the mini API use
an in-memory scratch store.

### 7. Delivery slices

- **M0 — tracer.** New repo + manifest/consumer entry; `createSliceServer`; `SideMenu` shell with
  `ThemeSwitcher`; `NAVY`/`NAVY_DAY`; one features route fed by `/api/features` over the JSON
  contract; a minimal `/lab/fluidity` HUD with route-transition and table-mount measurements.
- **M1 - feature workbench.** Ledger table, wanted-components board, needs-attention panel, feature
  detail view, saved views and URL state; no showcase.
- **M1 - measurement views.** Fluidity and Memory: route/component timings plus heap, DOM,
  component registry snapshots and mount/destroy scenarios.
- **M2 — fluidity.** Full scenario set, warm-ups/repetitions, JSON export, recorded baseline,
  DevTools methodology.
- **M3 — lab API and load.** Slow/fail/large/cache/stream endpoints, `autocannon`/`k6` scripts and a
  plain Express baseline.

Do not start M1 before M0 boots against the local links and the shell is actually usable.

## Alternatives considered

- **Convert the current dashboard in place.** Rejected: the monitor must boot when the framework is
  broken; a Slice app is the wrong dependency for a diagnostic tool. The lab is additive.
- **Keep only docs demos.** Rejected: demos are isolated and do not measure integration or fluidity.
- **Put everything in the dashboard.** Rejected: it bloats the monitor and still does not cover
  services, routing, theming or lifecycle states.
- **Use Conclave as the lab.** Rejected: it is the production proving ground; synthetic stress and a
  feature triage surface do not belong there.
- **A workspace-owned `apps/lab`.** Rejected initially: it turns orchestration into product code and
  breaks "the change lives in the owning repo". Revisit only if the standalone repo cost is too high.
- **A component showcase.** Rejected: the docs site already owns the API reference and live demos; a
  second catalog would drift. The lab uses only the components the feature workbench needs.
- **A static Markdown list of wanted components.** Rejected: one growing list drifts. Each request is
  a feature file in `slicejs-components`, with the index linking to it.

## Scope

### In scope

- New app repo, manifest consumer entry, local links and `pnpm dev:lab` / `pnpm test:lab` scripts.
- App shell with `SideMenu`, `ThemeSwitcher`, routing, breadcrumbs and a responsive drawer.
- `NAVY` and `NAVY_DAY` app-local themes.
- Feature workbench routes: ledger, wanted-components board, needs attention, feature detail.
- A memory view: heap snapshot, DOM and Slice component counts, mount/destroy scenarios, history and
  JSON export, with an explicit note on what the browser cannot measure.
- `/lab/fluidity` harness with JSON export.
- Mini API and deterministic slow/fail/large/cache/stream endpoints.
- Playwright smoke/e2e for shell, navigation, themes, feature workbench and lab routes.
- Load/measurement documentation and a recorded baseline.

### Out of scope

- Replacing `pnpm dashboard` or Conclave, or becoming the only Slice app.
- A component showcase or a second copy of the component documentation.
- Writing to workspace data, feature files, Git or `repos/` before the authoring slice is explicitly
  approved; no automatic commits ever.
- Publishing, deploying publicly, auth, multi-user or persistent storage.
- A performance CI gate before a stable baseline.
- Changing the library's public components/themes just for the lab.

## Compatibility and risk

- **Public API impact:** none in existing packages; a new consumer increases the workspace matrix.
- **Existing apps affected:** none. Conclave remains the production proving ground.
- **Contract coupling:** the lab consumes the dashboard JSON; keep the payload additive/versioned and
  update the lab when it changes.
- **Maintenance:** a new repo needs AGENTS.md, tests, docs and doctor coverage. Two UIs (monitor and
  lab) can drift; decide later whether the lab becomes canonical.
- **Measurement noise:** browser, CPU, GPU, extensions and viewport change the numbers. Record them,
  use warm-ups/repetitions, and compare runs on the same machine. Do not publish absolute claims.
- **Themes:** app-local navy themes avoid changing the library, but they can drift from the library's
  semantic tokens. Check contrast and test both themes in e2e.
- **Security/performance:** loopback only, read-only workspace data; cap large/SSE endpoints so a
  mistaken run cannot exhaust the machine.

## Validation plan

- **Unit tests:** lab server handlers (pagination, 404, ETag/304, error mapping), JSON adapter.
- **Browser/e2e tests:** SideMenu tree/drill, active route, theme switch, table/filter, modal, toast,
  empty/error/loading, wanted-components board, needs-attention panel, fluidity run smoke.
- **Product check (Conclave):** `pnpm verify:conclave` remains green; no framework/CLI/component
  behavior changes.
- **Fluidity check:** run each scenario 5–10 times on the baseline machine; record p50/p95, long tasks,
  FPS, memory and bundle size; export JSON and attach it to the feature/repo.
- **Artifact/release check:** `pnpm doctor` sees the new consumer; no publish in the first iteration.

## Documentation impact

- **Framework docs pages:** none unless the lab exposes a framework bug or a new documented pattern.
- **Component docs:** none; the docs site owns them. Wanted components live as features in
  `repos/slicejs-components/features/`; the lab only links to them.
- **Skill / agent guidance:** add the lab to the workspace mental model only if it becomes a regular
  workflow; no Slice API guidance change expected.
- **Workspace docs:** `docs/LAB.md` (app, themes, navigation, feature workbench, fluidity
  methodology), ADR-015 (two apps, two jobs), README/AGENTS/CONTEXT commands and repo table,
  `workspace.config.json`, package scripts.

## Open questions

- [ ] Standalone repo `slicejs-lab` vs workspace `apps/lab`? Recommendation: standalone repo.
- [ ] Name: `slicejs-lab`, `workspace-lab`, `slicejs-workbench`? The name should say "lab/workbench".
- [ ] SideMenu mode: `tree` desktop + `auto`/`drill` narrow? Recommendation: `tree` at ≥ 900 px,
  `auto` with a 480 px breakpoint inside the drawer.
- [ ] Theme names and final palette: `NAVY`/`NAVY_DAY`, or a three-theme set including high contrast?
  Recommendation: two themes first, contrast-checked.
- [ ] How does the lab recognize a wanted component without a new frontmatter field?
  Recommendation: the `Component: <Name>` title prefix first; add a `kind` field only if filtering
  needs it in more than one place.
- [ ] Which components belong in the shell vs only in a workbench screen? Recommendation: shell uses
  only navigation, theme, layout and feedback; the rest appears only where the feature workflow needs
  it.
- [ ] Payload source: generated `.dashboard/data.json` vs a dedicated `pnpm lab:data`. Recommendation:
  a generated, additive JSON contract.
- [ ] Detail as a modal, a full page, or both? Recommendation: modal for quick view, full page for
  health, relations, history and editing.
- [ ] Read-only vs scratch mutations? Recommendation: read-only workspace data until the authoring
  slice; in-memory store for form/optimistic/error exercises before that.
- [ ] Measurement tool: app HUD + DevTools traces first; `autocannon`/`k6` only for the API. Confirm
  the baseline machine and budgets.
- [ ] Keep both UIs indefinitely or promote the lab later? Decision after the first baseline.

## Decision log

- 2026-10-28 - Created as `proposed` from the idea of turning the dashboard into a Slice.js app with a
  mini backend and stress tests. Initial recommendation: keep the zero-dependency monitor and build a
  separate lab.
- 2026-10-28 - Scope clarified by the user: **not** the only Slice.js app and not a replacement for
  the repos; the goal is measuring **UI/component fluidity** and having a **complete app** that uses
  what Slice offers. Navigation uses `SideMenu`; themes are blue-navy. Renamed from "dashboard as a
  real app with a test API" to "full app showcase and UI fluidity lab". Added the SideMenu shell,
  `NAVY`/`NAVY_DAY` themes, the coverage matrix and the fluidity harness; kept the mini API as a
  supporting surface, not the main goal.
- 2026-10-28 - M0 implemented as `repos/slicejs-lab`. Manual scaffold (framework App shell files +
  local components, not `slice init` in place) compared against a reference `slice init` run
  (framework 4.0.2 / CLI 4.4.0); the canonical `App/style.css` and package scripts were added from
  that comparison, while the init `pnpm-workspace.yaml` was intentionally omitted because the
  workspace owns installs. M0 ships `SideMenu` navigation, `NAVY`/`NAVY_DAY`, `/api/features` over
  the dashboard JSON, a 500-row + 20-card fluidity benchmark, `pnpm dev:lab|build:lab|test:lab`, and
  a root manifest/consumer entry. `pnpm test:lab` 4/4, `pnpm build:lab` passes, root `pnpm doctor`
  sees the local links, and the lab `slice doctor` has only the expected SEO + library-prop
  warnings. Verified in Chromium against both `pnpm dev:lab` and the production `pnpm start:lab`
  (SideMenu routing, NAVY/NAVY_DAY switching, `/api/features`, the fluidity run, placeholders and
  the 404 route). The visual pass added the real Slice.js logo, a `Breadcrumbs` topbar, a `Card`
  spotlight with a CTA, `Icon`-led stats, and `Badge`/`Chip` for status, priority and area. A second
  pass settled the sidebar on the left, placed a small circular toggle on the sidebar's right border,
  made it collapsible to a 72px icon-only rail (persisted, labels kept in the accessibility tree,
  240ms width/opacity/left transition with reduced-motion support), added the `Modal` spec viewer
  with rendered Markdown,
  metadata and warnings, and switched `ThemeSwitcher` to the Slice brand marks (`sliceLogo` /
  `singleSlice`). `Modal` and `DragDropService` were vendored for the viewer. The repo is local-only
  for now (`sync: false`), so `pnpm sync` skips it instead of failing on a remote that has not been
  created. M1-M3 remain.
- 2026-10-28 - Spec viewer depth: vendored `Tabs`, `DescriptionList`, `Alert`, `Details`, `Avatar`,
  `AvatarGroup`, `Toast` and the `ToastProvider` service (plus their shared date/path/edit helpers).
  The modal now has Spec / Metadata / Markdown tabs, a facts list, a warning `Alert` with a Review
  action, collapsible related files, repository avatars and copy-to-clipboard toasts. The overview
  also shows a dismissible read-only `Alert`, and Refresh confirms with a toast. No
  `CodeVisualizer`: the raw Markdown is a plain `<pre>`. Components: 30 local, 40 bundled.
- 2026-10-28 - Ledger pass: vendored `Table`, `Pagination`, `DropDown`, `ToolTip`, `ToolTipProvider`
  and `DataGridEngine` (plus `collection.js` and `tooltipCore.js`). The ledger is now a real `Table`
  with sortable columns, a 4-row `Pagination` pager, `Badge`/`Chip` cell components and a per-row
  action menu (open spec, copy path, copy Markdown). A toolbar `DropDown` copies the filtered view as
  Markdown/JSON, refreshes from disk or navigates to Fluidity. `ToolTipProvider` powers hints on the
  toolbar, stats and filters; the sidebar toggle uses a standalone `ToolTip` that follows its state.
  Filtering now resets the visible controls, and stale async row renders are token-guarded. Components:
  36 local, 46 bundled.
- 2026-10-28 - Services and keyboard pass: `FetchManager` calls `/api/features` with timeout/retry,
  `QueryService` caches the ledger for 30s (navigating away and back makes no second request),
  `FileDownloadService` backs the table's CSV/JSON export menu, and `ShortcutService` adds `/`,
  `Ctrl+K`, `g o` and `g f` with a collapsible `Details` shortcut guide. The spec detail fetch also
  goes through `FetchManager`. Components: 40 local, 50 bundled.
- 2026-10-28 - Direction pivot after review: **no showcase/gallery**. The docs site owns component
  API documentation and live demos; the lab becomes a **feature workbench** (ledger, wanted
  components, needs attention, detail, board/roadmap, authoring) plus the fluidity harness. Wanted
  components are now individual features in `repos/slicejs-components/features/`, with
  `WANTED_COMPONENTS.md` as the index. The feature was renamed from "full app showcase" to "feature
  workbench". `/showcase` and `/coverage` are no longer goals; the ledger already has 11 features
  (5 wanted components) after the change.
- 2026-10-28 - Memory view: `/memory` snapshots `performance.memory` (when the browser exposes it),
  DOM nodes, Slice hosts, active controller entries and `findOrphans()` candidates, then runs
  Card/Table/Modal/theme mount-destroy scenarios. It stores a local history, exports JSON and links
  to the framework Leak Inspector. It states the limits: heap numbers are approximate, GC cannot be
  forced from page JS, and detached counts include lazy/cached panels. Components: 41 local, 51
  bundled; routes: 5 (`/`, `/fluidity`, `/memory`, `/settings`, `/404`).
- 2026-10-28 - Feature workbench P0: `/features/${repo}/${id}` with Spec / Details / Edit / Promote;
  a spec editor backed by `PUT /api/features/:repo/:id` and `POST /api/features`; hash-checked saves,
  backups under `.dashboard/backups/features/`, atomic writes and dashboard regeneration. Promotion
  gates check allowed transitions, required body sections, target, unresolved `depends_on` and the
  decision log. The parser now reads/validates `depends_on` and `blocks` (unknown refs, self-refs and
  cycles). The detail page uses `Textarea` and `UnsavedChangesGuard`. Components: 44 local, 54
  bundled; routes: 6 (`/`, `/fluidity`, `/memory`, `/features/${repo}/${id}`, `/settings`, `/404`).
- 2026-10-28 - API/storage lab: `/api-lab` with fast/slow/fail/large/empty/ETag modes through
  `FetchManager`, a real `304 Not Modified` path, a 1,000-row `Table`, SSE streaming, and
  `StorageService` for namespaced drafts, saved mode/rows, TTL and cross-tab watching. Added
  `api/labData.js` and pure tests. Components: 46 local, 56 bundled; routes: 7
  (`/`, `/fluidity`, `/memory`, `/api-lab`, `/features/${repo}/${id}`, `/settings`, `/404`).
- 2026-10-28 - Memory validation: a **Validation** tab in `/memory` saves a baseline, compares the
  current snapshot, and runs a soak test of N cycles with pass/warn/fail budgets for active
  components, DOM nodes, detached/cached entries and heap. Memory history, baselines and the last
  validation now use `StorageService` (namespace `slice-lab-memory`). Added pure validation tests
  (`memory-validation.test.js`); lab tests 17/17. Components: 46 local, 56 bundled; routes: 7.
