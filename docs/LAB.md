# Slice.js lab

`repos/slicejs-lab` is a **real Slice.js app** that doubles as the workspace's UI fluidity lab. It is
a consumer of the local framework, CLI and components — not the only Slice.js app, and not a
replacement for `pnpm dashboard`, Conclave or the repositories.

Status: **M0** (shell + data route + first benchmark). The plan and remaining slices live in
[`features/0002-slice-js-lab-feature-workbench-and-ui-fluidity.md`](../features/0002-slice-js-lab-feature-workbench-and-ui-fluidity.md).

## What M0 includes

- App Shell + MultiRoute with a **left-side, collapsible `SideMenu`** and a `Breadcrumbs` topbar.
  Collapsed, the rail is 72px and shows only the menu icons; the state is remembered in
  `localStorage`.
- The real Slice.js logo in the sidebar, a `Card` spotlight with a CTA to the fluidity lab, and
  `Icon`-led stat cards.
- A **spec viewer `Modal`**: click a spec title to open its rendered Markdown, `DescriptionList`
  metadata, raw Markdown source, validation warnings in an `Alert`, related files in `Details`, and
  the repositories involved as an `AvatarGroup`. Copy actions report through `ToastProvider`.
- `NAVY` and `NAVY_DAY` app-local themes, switched with `ThemeSwitcher` using the Slice brand marks
  (`sliceLogo` / `singleSlice`) and persisted through the framework's `ThemeManager`.
- `/` - feature ledger fed by `/api/features` over the workspace dashboard JSON contract. A real
  `Table` renders the rows with sortable columns, a `Pagination` pager and a per-row action menu;
  `Badge` and `Chip` fill the cells. Clicking a title opens the spec in a `Modal` (detail endpoint +
  rendered `bodyHtml`). A `DropDown` copies the filtered view, and `ToolTipProvider` adds hints.
- The ledger is fetched through `FetchManager` and cached by `QueryService`; the table exports
  CSV/JSON through `FileDownloadService`. `ShortcutService` maps `/`, `Ctrl+K`, `g o` and `g f`,
  and a collapsible `Details` section lists them.
- `/fluidity` — a repeatable benchmark that mounts 20 real `Card` components, destroys them,
  renders/updates 500 native rows, samples one second of frames and reports long tasks/memory where
  the browser exposes them.
- `/memory` - a memory view: JS heap snapshot, DOM and Slice component counts, active component
  breakdown, mount/destroy scenarios for Cards, Tables, Modals and theme switches, a local run
  history and JSON export. Its **Validation** tab saves a baseline, compares the current UI and runs
  a soak test of N cycles with pass/warn/fail budgets. History and baselines use `StorageService`.
  It links to the framework's Leak Inspector and states what is approximate.
- `/api-lab` - fast/slow/fail/large/empty/ETag responses through `FetchManager`, a 1,000-row
  `Table`, an SSE stream, and `StorageService` for namespaced drafts, preferences and cross-tab
  watching.
- `/features/${repo}/${id}` - the feature workbench page: rendered Spec, Details with related files
  and `depends_on` / `blocks`, an editor with an unsaved-changes guard, and server-checked promotion
  gates. Saving writes the owning repo file, keeps a backup and refreshes the dashboard payload.
- `/settings` - M0 placeholder that exercises routing and the shell.
- **Translation** - the shell adopts `slice.translator` (Spanish default, English fallback) with
  `routing: "prefix-except-default"`: marked texts (`data-t`), `key()` props for the
  menu/breadcrumbs/aria labels, and an ES/EN switch that follows the URL. The debugger panel
  (`alt+shift+t`) lists missing keys and can show keys instead of texts. The functional test
  (`pnpm test:lab:e2e`) covers the switch, routing, back/forward, canonicalization and the 404;
  `slice translator check` and the doctor Translator row gate the dictionaries.
- `/api/health`, `/api/features`, `/api/features/:repo/:id`, `/api/lab/echo`, `/api/lab/slow`,
  `/api/lab/fail`.

## Run it

From the workspace root:

```bash
pnpm install             # once; never inside repos/slicejs-lab
pnpm dashboard --out     # writes .dashboard/data.json for the lab
pnpm dev:lab             # http://localhost:3002
pnpm test:lab
pnpm build:lab
pnpm start:lab           # serve the production build from dist/
```

The lab server reads `LAB_DATA_FILE` when set, then `repos/slicejs-lab/data/dashboard.json`, then
`../../.dashboard/data.json`. If the contract is missing, it still boots and the overview shows an
empty state with the command to generate it. Workspace data is read-only; mutations for future
exercises use an in-memory scratch store, never feature files or Git.

The repo is **local-only for now**: `workspace.config.json` marks it `sync: false`, so `pnpm sync`
skips it instead of failing on a remote that has not been created. Create/push
`vkneider/slicejs-lab` and remove that flag when the remote exists.

## Data contract

`/api/features` returns the dashboard payload plus the filtered feature list:

```jsonc
{
  "generatedAt": "…",
  "source": "…/.dashboard/data.json",
  "features": [/* frontmatter, body, bodyHtml, warnings, paths */],
  "repos": [/* branch, dirty, ahead/behind, last commit, issues */],
  "links": [/* consumer/package resolution + version skew */],
  "summary": { /* features, repos, links */ },
  "total": 6,
  "filtered": 6
}
```

Query params: `q`, `status`, `repo`, `priority`. `/api/features/:repo/:id` returns one feature or a
JSON 404.

## Navigation and themes

- The sidebar sits on the **left**. A small circular chevron sits on the sidebar's right border and
  collapses it to a 72px icon rail; expanding restores labels, descriptions and the theme name.
  Above 1100px it starts open; below that it starts collapsed unless a saved choice exists.
- The rail width and the labels animate over ~240ms with `cubic-bezier(0.2, 0, 0, 1)`; the labels
  fade/contract instead of popping, and `prefers-reduced-motion` disables the transition.
- `SideMenu` uses `mode: 'auto'` with a 720px breakpoint: a tree when it has room, a drill menu when
  it does not. `followRoute` is on, so the current page is driven by the Router.
- The menu is Overview, Fluidity, Memory and Settings. The workbench views (ledger, wanted
  components, needs attention) will join it as they land; the current placeholders still exercise
  the submenu/drill behavior.
- `Breadcrumbs` follows `router:change` (through the event bus) and updates the topbar trail.
- The collapsed state hides the text visually but keeps it in the accessibility tree; the toggle
  has an explicit `aria-label`.
- `ThemeSwitcher` cycles `NAVY` and `NAVY_DAY`. The themes are app-local CSS files under
  `src/public/Themes/`, built from the library's semantic tokens; they are not a library change until
  they prove reusable.
- `NAVY` uses a blue-navy surface (`#081426`), blue primary (`#3b82f6`) and sky secondary
  (`#38bdf8`); `NAVY_DAY` is the light companion (`#f3f7fd`, `#1d4ed8`, `#0369a1`).

## Fluidity methodology

The current benchmark is deliberately small and repeatable:

- Mount/destroy 20 real `Card` components, measuring each operation.
- Render 500 native rows and update every cell.
- Sample frames for one second with `requestAnimationFrame`.
- Record `PerformanceObserver` long tasks where available and `performance.memory` where
  browser-exposed.
- Export the result as JSON.

M0 run on this machine (Windows, Chromium 141, 912×670, DSF 1.25, 16 logical cores):

| Metric | Value |
|---|---|
| Mount Card p50 / p95 | 0.2 ms / 0.3 ms |
| Destroy Card p50 / p95 | 0.0 ms / 0.1 ms |
| Render 500 rows | 1.5 ms |
| Update 500 rows | 1.1 ms |
| Frame rate | 60.8 fps |
| p95 frame | 17.1 ms |
| Long tasks | 0 |
| JS heap | 3.2 MB |

These numbers are environment-dependent and are **not** a budget or a CI gate. Compare runs on the
same machine, browser and viewport; M2 adds warm-ups, repetitions, a scenario picker and a recorded
baseline.

## Scaffold provenance

The app was not generated by `slice init` in place. It was assembled from the framework's App shell
files and the local `repos/slicejs-components`, then compared against a reference `slice init` run
(framework 4.0.2 / CLI 4.4.0) in a temporary directory. The comparison added the canonical
`src/App/style.css` and package-script aliases. The init `pnpm-workspace.yaml` is intentionally
omitted: the workspace must remain the pnpm root, and a nested workspace file can break the local
links. The shape is still the init shape: `src/App`, `src/Components`, `src/public`,
`src/routes.js`, `src/sliceConfig.json`, `api/index.js`.

## Verification

```bash
pnpm test:lab                              # data-contract tests
pnpm test:lab:e2e                          # translator functional test (Playwright)
pnpm build:lab                             # production build + bundles
pnpm start:lab                             # production server boot
pnpm doctor                                # workspace links see slicejs-lab
pnpm --filter slicejs-lab doctor           # app checks (SEO + library-prop warnings only)
pnpm sync                                  # skips slicejs-lab until it has a remote
```

The lab's `slice doctor` reports SEO not configured (intentional: local, `noindex`) and the copied
library props with computed `allowedValues`/`any` types. Neither blocks the build.

## Next slices

- **M1:** feature workbench — ledger, wanted-components board, needs attention, detail view and
  saved views. No component showcase.
- **M2:** full fluidity scenarios, warm-ups, repetitions, recorded baseline.
- **M3:** slow/fail/large/cache/stream lab API and `autocannon`/`k6` baselines.

The vendored `frontend-design`, `make-interfaces-feel-better` and `tdd` skills guide the visual
review and the test seams.
