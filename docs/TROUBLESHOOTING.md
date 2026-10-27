# Troubleshooting

Start every investigation with:

```bash
pnpm doctor
```

If the links are wrong, nothing else matters. `pnpm verify:conclave` is the second check: it proves
the product boots and serves the local runtime.

## 1. "My framework change does not appear"

In order:

1. `pnpm doctor` — does `slicejs-web-framework` resolve under `repos/slice.js`?
2. `pnpm verify:conclave` — is `/Slice/Slice.js` byte-identical to the local source?
3. Are you in production mode, serving an old `dist/`? Run the repo build again.
4. Hard-reload the browser / disable cache.
5. Is the code path actually imported by the app? Check the component registry and the entry file.
6. Only now debug the code.

Common root causes:

| Cause | Fix |
|---|---|
| `node_modules/slicejs-web-framework` points into `.pnpm` | `pnpm install --force` at the workspace root, then `pnpm doctor`. |
| Someone ran `pnpm install` inside the subrepo | Same as above. |
| Old `dist/Slice/Slice.js` | `pnpm build:conclave` / `pnpm build:components`. |
| Browser cached the runtime | Hard reload. |
| Dev server was not restarted after a CLI/framework server change | Restart `pnpm dev:conclave`. |
| A component was not registered | Run the CLI's `component list`/`doctor` inside the app, or check `components.js`. |

**Never** "fix" this by editing the copy in `node_modules/.pnpm`. That was a workaround in the
pre-workspace Slice.js Components; here it is the bug.

## 2. `pnpm install` inside a subrepo broke the links

Conclave (and others) contain a `pnpm-workspace.yaml` for pnpm settings. Running install there can
re-resolve packages from the registry.

```bash
cd <workspace-root>
pnpm install
pnpm doctor
```

If it persists, remove the root `node_modules` and reinstall:

```bash
rm -rf node_modules          # PowerShell: Remove-Item node_modules -Recurse -Force
pnpm install
```

## 3. "Project structure not found" / wrong project root

The Slice CLI resolves the project through `INIT_CWD` first. Running
`pnpm --filter ./repos/conclave run dev` from the workspace root makes `INIT_CWD` point at
`slice-workspace/`, which has no `src/` or `api/`.

Use the workspace scripts (`pnpm dev:conclave`) — they pin `INIT_CWD` to the app. If you invoke the
CLI manually, run it from inside the app directory:

```bash
cd repos/conclave
INIT_CWD="$PWD" node ./node_modules/slicejs-cli/client.js dev
```

(PowerShell: `$env:INIT_CWD = (Get-Location).Path` before `node ...`.)

## 4. Framework demo fails or serves a 404 for `/Slice/Slice.js`

`repos/slice.js` does not contain `node_modules/slicejs-web-framework` (it is the package) nor
`node_modules/slicejs-cli` (not declared). Use:

```bash
pnpm dev:framework
pnpm build:framework
```

The script creates the two self-links under `repos/slice.js/node_modules`. If a real directory
exists at one of those paths, the script refuses to replace it; move it aside manually.

## 5. Port already in use

All apps default to 3001. Run one at a time, or change the app's `src/sliceConfig.json` port.
`verify:conclave` allocates a free port. Conclave Playwright uses `SLICE_TEST_PORT` (default 3006).

Find the process on Windows:

```powershell
Get-NetTCPConnection -LocalPort 3001 | Select-Object OwningProcess
Get-Process -Id <pid>
```

## 6. Playwright browser missing

```bash
pnpm setup:browsers
```

That installs Chromium for both `repos/slicejs-components` (project-local browsers) and Conclave (machine
cache). Installing Playwright browsers from an arbitrary directory can put them where the
`slicejs-components` config does not look.

The visual and component projects use Chromium only. Touch specs that construct `TouchEvent` are
Chromium-specific.

## 7. `ERR_PNPM_IGNORED_BUILDS`

pnpm 10+ blocks dependency build scripts by default. The workspace allows `esbuild`. If another
package needs a postinstall, add it to `allowBuilds` in the root `pnpm-workspace.yaml`, then run
`pnpm install` from the root.

Do not run `pnpm approve-builds` inside a subrepo; that writes subrepo-local state and can break the
workspace setup.

## 8. `EPERM` / symlink errors on Windows

- pnpm uses junctions, which do not require Developer Mode.
- The **CLI test suite** creates directory symlinks for its temp projects and needs Developer Mode
  or an elevated shell. Without it you will see `EPERM ... symlink` and ~36 failures. `pnpm doctor`
  reports whether Developer Mode is enabled.
- Antivirus or a running Playwright/Chrome process can hold directory handles. Stop test runs before
  moving/deleting `repos/<name>` or `node_modules`.
- If a link is broken because a directory was moved, run `pnpm install --force` at the root.

## 9. Doctor reports version drift

Example:

```text
[warn] conclave: override out of declared range — declared 4.2.0 -> local 4.3.0.
```

That is the link model working as designed. Confirm compatibility with
[`RELEASE.md`](./RELEASE.md). Do not "fix" it by editing the subrepo spec to `link:`.

## 10. Docs site breaks after linking 4.x

The docs repo still declares framework/CLI 3.x. If `pnpm dev:docs` or its build fails, determine
whether the failure is:

- content/parser (docs-side), or
- a real 3.x → 4.x incompatibility (valuable finding).

Do not force the docs repo into the workspace's 4.x versions in a commit unless the upgrade is the
task. Record the incompatibility and keep docs work separate.

## 11. Vercel deploy fails even though local works

Vercel installs from the registry using the product's `package.json`/lockfile; it does not see this
workspace's overrides. The package you tested locally must be published first, or the product must
point at a published canary/tarball. See [`RELEASE.md`](./RELEASE.md).

Also remember Conclave's custom `api/index.js` and `scripts/copy-slice.js` exist to work around
serverless runtime bundling; a local dev pass does not exercise that path.

## 12. Bootstrap clone fails

- Check network/VPN and that the remote URLs in `workspace.config.json` are current.
- If a repo moved, update the manifest.
- `pnpm bootstrap` never deletes a half-cloned directory. Remove the partial directory manually
  (after confirming it has no work) and rerun.

## 13. Full reset (keeps the repos)

```bash
# stop all dev servers and Playwright runs first
rm -rf node_modules
pnpm install
pnpm doctor
```

If the subrepos' own `node_modules` look inconsistent:

```bash
rm -rf repos/*/node_modules
pnpm install
pnpm doctor
```

This deletes caches only; Git work and commits are untouched.
