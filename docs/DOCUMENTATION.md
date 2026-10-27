# Documentation policy

Documentation is part of the change, not a follow-up. A framework or CLI change is not complete
until its documentation has been checked and, when behavior changed, updated.

## 1. The rule

1. **Every change gets a documentation decision.** Either:
   - a docs commit in the owning docs repo, or
   - an explicit "no docs impact" note in the task/commit, with the reason (pure refactor, test-only,
     internal performance work).
2. **User-facing changes require a docs update.** That includes runtime behavior, lifecycle, public
   props, routing, events/context, config fields, CLI commands/flags, build output, the skill, and
   component APIs.
3. **Framework changes must be checked against their specific pages** (table below). Do not assume
   "the tests pass" means the docs are still true.
4. **Docs commits live in the docs repo** (`repos/slice.js_docs`) or, for component docs, in
   `repos/slicejs-components`. They are separate commits from the code change.
5. **Never edit generated output.** Edit Markdown; run the generator.
6. **The skill is documentation too.** If guidance, traps or decisions change, update
   `repos/slice.js_docs/skill/slice-js-developer`, bump its version, and run `pnpm sync:skill`.

## 2. Sources of truth

| Content | Source of truth | Generated output (never hand-edit) |
|---|---|---|
| Framework/CLI/config docs | `repos/slice.js_docs/markdown/**/*.md` | `repos/slice.js_docs/src/Components/AppComponents/**`, routes |
| LLM context dump | generated from the Markdown | `repos/slice.js_docs/llm.txt` |
| Visual/service component docs | `repos/slicejs-components/src/markdown/*.md` | generated pages under `repos/slicejs-components/src/Components/**` |
| Agent skill | `repos/slice.js_docs/skill/slice-js-developer/` | vendored copy in `.opencode/skills/slice-js-developer/` |
| Workspace orchestration | this repo (`AGENTS.md`, `CONTEXT.md`, `docs/`) | — |

The skill's canonical copy lives in the docs repo. The workspace copy exists so OpenCode can load it
offline; `pnpm sync:skill` keeps them identical. `pnpm check:skill` and `pnpm doctor` detect drift.

## 3. Where docs live for each framework area

| Change area | Framework docs (`repos/slice.js_docs/markdown/`) | Also check |
|---|---|---|
| Lifecycle (`init`, `update`, `beforeDestroy`) | `getting-started/lifecycle-overview.md`, `init-method.md`, `update-method.md`, `before-destroy.md` | visual DOM tests; skill `references/core-model.md` |
| `slice.build`, component anatomy, static props | `getting-started/build-method.md`, `component-anatomy.md`, `static-props.md` | skill `references/core-model.md` |
| Visual components / DOM / templates | `getting-started/visual-components.md`, `component-anatomy.md` | `repos/slicejs-components/src/markdown/<component>.md` |
| Services | `getting-started/services.md`, `project-architecture/service-patterns.md` | skill `references/core-model.md` |
| Routing / router | `getting-started/routing.md`, `routing-guards.md`, `project-architecture/routing-data.md` | visual `multi-route` docs |
| App Shell / MultiRoute / SPA | `project-architecture/app-shell-multiroute.md`, `single-view-spa.md`, `choosing-project-style.md`, `components/multi-route.md` | component docs |
| Events / Context / Event Registry | `event-manager.md`, `context-manager.md`, `event-registry.md`, `getting-started/context-vs-events.md` | skill `references/state-and-routing.md` |
| In-place refresh / reconcile | `project-architecture/refreshing-component-data.md` | visual specs |
| CLI commands, flags, dev loop | `cli-commands.md`, `getting-started/development-workflow.md` | `repos/slicejs-cli/AGENTS.md` |
| Config, themes, env vars | `slice-config.md`, `themes.md`, `getting-started/environment-variables.md` | `sliceConfig.schema.json` |
| External dependencies / bundling | `external-dependencies.md`, `cli-commands.md` | build tests |
| PWA / static assets | `pwa.md`, `getting-started/project-anatomy.md` | — |
| DevTools / Leak Inspector | `getting-started/devtools.md`, `leak-inspector.md` | — |
| MCP | `slicejs-mcp.md` | `slicejs-mcp` package |
| Server / security / env | `installation.md`, `cli-commands.md` | if no page fits, add one under `project-architecture/` |

If a change touches a public API that has no page yet, add the page (with frontmatter and a unique
route) instead of hiding the detail in a changelog.

## 4. Workflow

1. **Before coding**, identify the docs pages from the table above. If you cannot find a page, note
   the gap.
2. Implement the code and its tests (`docs/CHANGE-WORKFLOW.md`).
3. Edit the Markdown source:
   - Framework/CLI/config: `repos/slice.js_docs/markdown/`.
   - Visual/service component: `repos/slicejs-components/src/markdown/`.
   - Skill: `repos/slice.js_docs/skill/slice-js-developer/`.
4. Generate and validate:

   ```bash
   pnpm docs:generate          # docs site pages + routes
   pnpm docs:llm               # llm.txt (when the content belongs in the LLM dump)
   pnpm docs:lint:components       # component Markdown contract
   pnpm docs:generate:components   # component docs pages
   pnpm dev:docs               # preview
   ```

5. If the change alters guidance an agent relies on, update the skill and bump:
   - `skill/slice-js-developer/SKILL.md` and/or `references/*`.
   - `VERSION` (`version:` and `targets:`).
   - `skill/manifest.json` (`version`, file list if needed).
   - Then `pnpm sync:skill` and commit the vendored copy.
6. Commit the docs in their repo. Commit the synchronised skill in this workspace.
7. Record the docs decision in the task/commit. "No docs impact" is a valid decision only with a
   reason.

On Windows, `docs:generate` writes LF and can leave line-ending-only entries in `git status`. Check
the actual content with `git -C repos/slice.js_docs diff --numstat` (empty means no content change)
and clean the working tree with `git -C repos/slice.js_docs checkout -- src/Components/AppComponents`
if needed.

> The docs site is currently linked to framework 4.x while its own package declares 3.x. If
> `pnpm dev:docs` exposes an unrelated incompatibility, the Markdown change can still be validated
> with `docs:generate` / `docs:llm`; record the incompatibility as upgrade debt instead of blocking
> the content fix.

## 5. Validation

Documentation is static, but it has contracts:

- Every page has valid frontmatter (`title`, `route`, `navLabel`, `section`, `group`, `order`,
  `description`, `component`, `tags`).
- `component` is unique; routes are unique; cross-links use the target `route`.
- Generated pages are not edited by hand.
- `llm.txt` is regenerated when its source changes.
- Component docs keep the public prop names and backward-compatible aliases.
- The skill version and files match the docs source (`pnpm check:skill`).

## 6. Checklist

- [ ] Docs decision recorded (update or explicit no-impact reason).
- [ ] Framework pages identified from §3 and updated if behavior changed.
- [ ] Component Markdown updated for component API/behavior changes.
- [ ] `pnpm docs:generate` run; no generated file was hand-edited.
- [ ] `pnpm docs:llm` run when the page is part of the LLM corpus.
- [ ] `pnpm docs:lint:components` + `pnpm docs:generate:components` for component docs.
- [ ] Skill updated and version bumped when guidance changed; `pnpm sync:skill` run.
- [ ] `pnpm check:skill` green.
- [ ] `pnpm doctor` green.
- [ ] Docs commit exists in `repos/slice.js_docs` (or `repos/slicejs-components` for component docs).

## 7. Known docs-repo gaps

- **`staticProps` front matter:** `parser/lib/staticPropsDocs.js` is a guard stub. Pages that do not
  use `staticProps` generate normally; a page that starts using it fails with a clear error until
  the feature is implemented.
- **Docs site version:** `repos/slice.js_docs` still declares framework/CLI 3.x while the workspace
  links 4.x. Content generation works; if `pnpm dev:docs` exposes an unrelated incompatibility,
  validate with `docs:generate` / `docs:llm` and record the upgrade debt.
- **Windows line endings:** generation can leave line-ending-only status entries; use
  `git diff --numstat` to distinguish them from real content changes.
