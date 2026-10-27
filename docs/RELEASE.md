# Release

The workspace never publishes anything. Publishing happens in the repo that owns the package, in a
specific order, after the local validation described in [`TESTING.md`](./TESTING.md).

## 1. Release order

Only three packages are published to npm. Everything else is deployed or consumed from source.

| Order | Repo | Package | Why |
|---|---|---|---|
| 1 | `slice.js` | `slicejs-web-framework` → npm | Runtime, server and build contract consumed by everyone. |
| 2 | `slicejs-cli` | `slicejs-cli` → npm | Dev/build tooling; depends on the framework. |
| 3 | `slicejs-mcp` | `slicejs-mcp` → npm | MCP reads the framework and Components catalogs. |
| — | `slicejs-components` | **not published** | The component library is consumed from this GitHub repository (`slice get`, `slice sync` download `src/Components/**` from the default branch). It has a version and a CHANGELOG for its own history, but it is not an npm dependency and `pnpm publish` must not be run there. |
| — | `slice.js_docs` | not published (Vercel) | Docs depend on the new versions. |
| — | `conclave` | not published (Vercel) | Product consumes the released packages. |

Do not publish a dependent package before its dependency is available on npm.

Because `slicejs-components` is not on npm, a component change ships when it is merged to the
repository's default branch — there is no publish step, and no way to pin a component version from
a project. `slice sync` follows the default branch.

## 2. Compatibility matrix

| Consumer | Framework | CLI | Notes |
|---|---|---|---|
| `slicejs-cli` | `^3.5.0` declared (stale; effectively 4.x) | — | The declared range is a known inconsistency; fix it when releasing a 4.x CLI. |
| Slice.js Components | `^4.0.2` | `^4.3.0` | Already on 4.x. |
| docs | `^3.5.1` | `^3.7.2` | Not yet upgraded; the workspace links it to 4.x to surface breakage. |
| conclave | `^4.0.2` | `4.2.0` pinned | Bump the CLI when validating a new one. |

The workspace overrides intentionally ignore these ranges. Before releasing, make sure the ranges
in each `package.json` describe the combination you actually tested.

## 3. Pre-release checklist

Run from the workspace root:

- [ ] `pnpm bootstrap --pull` (or `pnpm sync` + review) — repos on `master`, no unexpected dirt.
- [ ] `pnpm doctor` — links point at local source; warnings understood.
- [ ] `pnpm check:skill` — vendored skill matches the docs source.
- [ ] `pnpm test` — framework + CLI + components unit suites.
- [ ] `pnpm build:mcp` — MCP TypeScript build.
- [ ] `pnpm verify:conclave` — the product serves the local runtime.
- [ ] `pnpm test:components:gate` if framework lifecycle/render behavior changed.
- [ ] `pnpm test:conclave` for product-affecting changes.
- [ ] `pnpm lint:conclave && pnpm build:conclave`.
- [ ] Docs updated for every user-facing change; `pnpm docs:generate` and `pnpm docs:llm` ran;
      docs commit exists in `repos/slice.js_docs` (or `repos/slicejs-components` for component docs).
- [ ] If agent guidance changed: skill version bumped in the docs repo and `pnpm sync:skill` run;
      the synced skill is committed here.
- [ ] Every changed repo has a clean, focused commit and an updated `CHANGELOG.md` per its own
      rules.
- [ ] Package versions bumped in the repos that will be published.
- [ ] `node scripts/release-check.mjs` in `repos/slicejs-cli` — packaging, version not already on npm,
      changelog section, and the framework range accepts the paired version. `--allow-published`
      skips the version check when running in CI.
- [ ] `node scripts/check-pack.mjs` in `repos/slice.js` — the tarball contains the runtime, server and
      SEO module and no tests/proposals/local tooling.
- [ ] Packed-artifact smoke test (below) for framework/CLI changes.

The CI workflows in `slice.js` and `slicejs-cli` already run the two scripts plus the Conclave
boot check; the manual smoke test below covers the registry install that CI cannot reproduce.

## 4. Packed-artifact smoke test

The workspace links source; npm will install tarballs. Validate the artifact, not only the link:

1. In `repos/slice.js`, run `pnpm pack` (creates `slicejs-web-framework-X.Y.Z.tgz`).
2. In `repos/slicejs-cli`, run `pnpm pack`.
3. In a throwaway directory, install both tarballs into a minimal Slice project (or a copy of
   Conclave) and run `init`/`build`/`start`.
4. Confirm the runtime at `/Slice/Slice.js` comes from `dist/Slice/Slice.js` and that the build
   includes it.
5. Discard the throwaway project. Never commit tarball specs.

This catches the class of failures that only appear when `node_modules` is a real registry install
(serverless/Vercel, symlink tracing, missing files in the package `files` array).

**Automated for the framework:** the `template` job in `slice.js` packs the candidate, scaffolds a
project with the CLI, installs the tarball over the published framework, re-applies its template and
then builds, boots and renders it in Chromium (starter navbar, home section, `NotFound` on an unknown
URL, no `not found in components.js`). It runs on every PR, so a template that compiles but renders
nothing no longer reaches a release. The manual steps above stay for the CLI tarball and for validating
a package already on the registry.

## 5. Versioning

Each repo follows its own rules:

- `slice.js`: SemVer + `CHANGELOG.md`; published to npm.
- `slicejs-cli`: Keep a Changelog + SemVer; see its `AGENTS.md` for the exact release steps
  (bump, move `[Unreleased]`, compare links, commit, tag, push, GitHub release); published to npm.
- `slicejs-cli`: its declared `slicejs-web-framework` range must accept the version being paired
  with it (`scripts/release-check.mjs` fails otherwise). A published CLI that resolves an old
  runtime installs the wrong framework for every new user.
- `slicejs-mcp`: SemVer + `CHANGELOG.md`; published to npm.
- `slicejs-components`: SemVer + `CHANGELOG.md` for its own history; public props keep
  backward-compatible aliases. **Not published to npm** — see §1.
- `slice.js_docs`: deploy-only; no npm package.
- `conclave`: deploy-only; no npm package.

Breaking framework changes require a major bump and a coordinated release of the CLI and of the
products; the component library travels with its repository, not with a version number.

## 6. Publishing commands

Only after the checklist:

```bash
# framework
cd repos/slice.js
pnpm publish --access public

# CLI
cd ../slicejs-cli
pnpm publish --access public

# MCP (if changed)
cd ../slicejs-mcp
pnpm publish --access public
```

`repos/slicejs-components` is **not** in this list: it is not an npm package. Its changes reach users
through the repository (the CLI downloads component files from GitHub), so it only needs a commit and
a push.

Then tag/push each repo according to its own changelog instructions. Do **not** tag from
`slice-workspace`; this repo has no release.

## 7. After publishing

1. Update consumer ranges/lockfiles in the consuming repos (`slicejs-cli`, Slice.js Components, docs,
   conclave).
2. Run `pnpm install` from the workspace root.
3. Run `pnpm doctor`. Drift warnings for those packages should disappear once the declared ranges
   match the local versions.
4. Deploy docs and Conclave. Vercel installs from the registry, so the published packages must be
   live first.
5. If the workspace linked a package that was never published, the deploy will fail; the local
   workspace is not a substitute for publishing.

## 8. Rollback

If a release is bad:

- Publish a patch from the owning repo (do not move tags).
- Revert the consumer range/lockfile and redeploy.
- Keep the workspace on the last good commit per repo; it does not pin commits, so use
  `git -C repos/<name> log` / `git checkout` deliberately.
