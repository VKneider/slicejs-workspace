# Release

The workspace never publishes anything. Publishing happens in the repo that owns the package, in a
specific order, after the local validation described in [`TESTING.md`](./TESTING.md).

## 1. Release order

| Order | Repo | Package | Why |
|---|---|---|---|
| 1 | `slice.js` | `slicejs-web-framework` | Runtime, server and build contract consumed by everyone. |
| 2 | `slicejs-cli` | `slicejs-cli` | Dev/build tooling; depends on the framework. |
| 3 | `slicejs-components` | `slicejs-components` | Components depend on both framework and CLI. |
| 4 | `slicejs-mcp` | `slicejs-mcp` | MCP reads the framework and Components catalogs. |
| 5 | `slice.js_docs` | not published (Vercel) | Docs depend on the new versions. |
| 6 | `conclave` | not published (Vercel) | Product consumes the released packages. |

Do not publish a dependent package before its dependency is available on npm.

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
- [ ] Packed-artifact smoke test (below) for framework/CLI changes.

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

## 5. Versioning

Each repo follows its own rules:

- `slice.js`: SemVer + `CHANGELOG.md`.
- `slicejs-cli`: Keep a Changelog + SemVer; see its `AGENTS.md` for the exact release steps
  (bump, move `[Unreleased]`, compare links, commit, tag, push, GitHub release).
- `slicejs-components`: SemVer + `CHANGELOG.md`; public props keep backward-compatible
  aliases.
- `slice.js_docs`: deploy-only; no npm package.
- `conclave`: deploy-only; no npm package.

Breaking framework changes require a major bump and a coordinated release of CLI, Slice.js Components
and products.

## 6. Publishing commands

Only after the checklist:

```bash
# framework
cd repos/slice.js
pnpm publish --access public

# CLI
cd ../slicejs-cli
pnpm publish --access public

# Slice.js Components (if changed)
cd ../slicejs-components
pnpm publish --access public

# MCP (if changed)
cd ../slicejs-mcp
pnpm publish --access public
```

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
