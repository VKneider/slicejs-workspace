# Local development

This document explains the link model and the day-to-day recipes. Read `CONTEXT.md` first if you
need the ecosystem overview.

## 1. The link model

`pnpm-workspace.yaml` has two jobs:

```yaml
packages:
  - 'repos/*'

overrides:
  slicejs-web-framework: link:./repos/slice.js
  slicejs-cli: link:./repos/slicejs-cli
```

- `packages` makes pnpm install every repo and treat them as workspace projects.
- `overrides` rewrites **every** edge in the dependency graph that mentions those package names.
  That includes transitive edges such as `slicejs-cli -> slicejs-web-framework` and
  `visual-library -> slicejs-cli`.

`link:` is intentional:

- It creates a symlink/junction to the checkout, not a copy in `.pnpm`.
- It ignores the declared semver range, so a local 4.x framework can be tested against a package
  that still declares `^3.x`.
- It does not modify subrepo `package.json` files, so they remain publishable.

Expected result for any consumer:

```text
repos/conclave/node_modules/slicejs-web-framework -> repos/slice.js
repos/conclave/node_modules/slicejs-cli           -> repos/slicejs-cli
```

## 2. First setup

```bash
pnpm bootstrap       # clone missing repos + pnpm install at the root
pnpm doctor          # verify links, remotes, branches and version skew
pnpm verify:conclave # boot the product and compare the served runtime
```

`pnpm bootstrap` never deletes or resets a checkout. It only clones missing directories. If a
directory exists but is not a Git repo, it stops and asks you to move it.

## 3. Install rules

**Always install from the workspace root.**

```bash
pnpm install             # correct
pnpm install --force     # correct, when links look stale
```

Do **not** run `pnpm install` inside `repos/conclave`, `repos/slice.js_visual_library`, etc.
Conclave has its own `pnpm-workspace.yaml` (pnpm settings, no packages). When pnpm finds that file,
it can treat the subrepo as its own workspace root and resolve `slicejs-web-framework` from the
registry again, replacing the direct links.

If that happens:

```bash
cd <workspace-root>
pnpm install
pnpm doctor
```

## 4. Why the root scripts do not use `pnpm --filter`

The Slice CLI resolves the project root through `PathHelper`, which prioritises `INIT_CWD` over
`process.cwd()`. pnpm resets `INIT_CWD` to the directory where pnpm was invoked, not the package
directory. Running `pnpm --filter ./repos/conclave run dev` from the workspace root therefore makes
the CLI think the project root is `slice-workspace/` (no `src/` or `api/`) and it fails with
"Project structure not found".

For that reason the root scripts invoke the package script directly with:

- `cwd = repos/<app>`
- `INIT_CWD = repos/<app>`
- `node_modules/.bin` prepended to `PATH`

That is what `scripts/run-app-script.mjs` does. If you run a command manually inside an app, use a
normal shell in that directory; `INIT_CWD` will not be set (or will be set correctly by the shell
you use), and the CLI falls back to `cwd`.

## 5. Running the apps

```bash
pnpm dev:conclave   # http://localhost:3001
pnpm dev:visual     # http://localhost:3001
pnpm dev:docs       # http://localhost:3001
pnpm dev:framework  # http://localhost:3001
```

All four use port 3001 by default, so run one at a time. `verify:conclave` picks a free port
automatically.

### Framework demo

`repos/slice.js` is itself a Slice app (`src/` + `api/`), but a plain package checkout does not
contain `node_modules/slicejs-web-framework` (the package is the repo) or `node_modules/slicejs-cli`
(the CLI is not declared as a dependency). Its dev server also reads `/Slice/Slice.js` from
`node_modules/slicejs-web-framework`.

`pnpm dev:framework` (and `pnpm build:framework`) creates two workspace-managed self-links inside
`repos/slice.js/node_modules`:

```text
slicejs-web-framework -> repos/slice.js
slicejs-cli           -> repos/slicejs-cli
```

Those links live under the subrepo's gitignored `node_modules`; they are not committed and not part
of the published package. The script refuses to replace a real directory.

## 6. Changing dependencies

If you need a new dependency while developing a subrepo:

1. Add it to the owning repo's `package.json` as usual (`pnpm add <pkg>` **from the workspace
   root**, or edit the file and run `pnpm install` at the root).
2. Run `pnpm install` from the workspace root.
3. Commit the subrepo change in the subrepo.

Never change `slicejs-web-framework` / `slicejs-cli` specs to `link:` or `file:` in a subrepo. The
root override is the only local wiring.

## 7. Version bumps and skew

You do **not** need to bump versions to test a change. `pnpm doctor` shows declared ranges next to
the local version:

```text
[warn] conclave: override out of declared range — declared 4.2.0 -> local 4.3.0.
```

This is expected. Treat it as a compatibility signal, not an install error. See
[`RELEASE.md`](./RELEASE.md) for the compatibility matrix and release order.

## 8. Adding another repo

1. Clone it under `repos/<dir>` (or let bootstrap do it).
2. Add an entry to `workspace.config.json` (`dir`, `name`, `package`, `role`, `remote`, `branch`,
   `required`).
3. If it participates in local linking, add it to `consumers`.
4. `pnpm install` from the root, then `pnpm doctor`.
5. Update `CONTEXT.md` if the dependency graph changed.

## 9. Manual verification

From any consumer:

```bash
cd repos/conclave
node -e "console.log(require.resolve('slicejs-web-framework'))"
# C:\...\slice-workspace\repos\slice.js\Slice\Slice.js
node -e "console.log(require.resolve('slicejs-cli'))"
# C:\...\slice-workspace\repos\slicejs-cli\client.js
```

On Windows, inspect the junction:

```powershell
Get-Item repos\conclave\node_modules\slicejs-web-framework | Select-Object LinkType,Target
```

`pnpm doctor` performs all of these checks and also verifies the CLI's own framework resolution.

## 10. Testing against the real npm packages (escape hatch)

The workspace is deliberately not the same as a registry install. To validate the exact published
artifact (before a release, or to reproduce a Vercel-only bug):

```bash
cd repos/slice.js
pnpm pack                     # produces slicejs-web-framework-X.Y.Z.tgz
```

Install that tarball into a throwaway app (or temporarily point a copy of the product at it) and
run the same flow. Do not leave `link:`/tarball specs in the product repo.

## 11. Windows notes

- pnpm creates NTFS junctions for workspace links. `fs.lstat` reports them as symbolic links;
  `realpath` resolves them to `repos/<name>`.
- Developer Mode is not required for junctions, but some antivirus tools hold directory handles and
  can block a running Playwright session from being moved/deleted. Stop test runs before moving
  `repos/` directories.
- Paths with spaces are supported by the scripts; the root scripts quote arguments on Windows.
