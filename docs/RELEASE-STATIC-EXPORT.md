# Release runbook — static export

Prepared 2026-11-16. Files are already bumped and changelogs are ready:

| Repo | Package | Version |
|---|---|---|
| `repos/slice.js` | `slicejs-web-framework` | `4.3.0` |
| `repos/slicejs-cli` | `slicejs-cli` | `4.6.0` (framework range `^4.3.0`) |

Consumer ranges are already updated for `slicejs-components`, `slice.js_docs`,
`portfolio`, `conclave` and `slicejs-lab`.

`slicejs-mcp` is **not** published for this change. `slicejs-components` is not
an npm package; its changes ship through GitHub.

Prepared checks already passed:

```text
node scripts/check-pack.mjs       (slice.js)   -> 62 files, 157 KB, nothing leaked
node scripts/release-check.mjs    (slicejs-cli) -> Ready to release
pnpm doctor                                    -> 0 errors, 4 expected warnings
```

## 0. Merge the feature branches

```powershell
cd "C:\Users\vkneider\Desktop\asdasd\slice-workspace"

cd repos\slice.js
git switch master
git pull
git merge --no-ff experiment/static-export
git push origin master

cd ..\slicejs-cli
git switch master
git pull
git merge --no-ff experiment/static-export
git push origin master

cd ..\slice.js_docs
git switch master
git pull
git merge --no-ff experiment/static-export
git push origin master
```

The workspace and the consumer repos are not published. Merge/push them when
you want; they do not block npm.

## 1. Install and validate

```powershell
cd "C:\Users\vkneider\Desktop\asdasd\slice-workspace"
pnpm install
pnpm doctor
pnpm check:skill
```

Recommended (CI or a Linux machine for the full CLI suite):

```powershell
pnpm test:framework
pnpm test:workspace
pnpm test:cli
cd repos\portfolio
pnpm test
cd ..\..
pnpm lint:conclave
pnpm build:conclave
pnpm verify:conclave
```

`pnpm test:cli` needs Linux or Windows Developer Mode; the local Windows
machine has Developer Mode off and symlink tests fail with `EPERM`.

## 2. Pack and smoke test

```powershell
cd "C:\Users\vkneider\Desktop\asdasd\slice-workspace\repos\slice.js"
node scripts\check-pack.mjs
pnpm pack

cd ..\slicejs-cli
node scripts\release-check.mjs
pnpm pack
```

Run the packed-artifact smoke test from `docs/RELEASE.md` §4 with both `.tgz`
files, then remove them (do not commit `*.tgz`).

## 3. Authenticate

Publishing requires an npm session. `npm whoami` must print your username before
continuing:

```powershell
npm login
npm whoami
```

The account uses `tfa.mode = auth-and-writes`, so npm/pnpm will ask for a
6-digit OTP from the authenticator app. If `pnpm publish` fails with `EOTP`,
repeat the command with `--otp`:

```powershell
pnpm publish --access public --otp 123456
```

If pnpm still does not pass the OTP, use npm for that publish:

```powershell
npm publish --access public --otp 123456
```

## 4. Publish

```powershell
cd "C:\Users\vkneider\Desktop\asdasd\slice-workspace\repos\slice.js"
pnpm publish --access public
npm view slicejs-web-framework@4.3.0 version

cd ..\slicejs-cli
git stash push -u -m "pre-release unrelated"
try {
  pnpm publish --access public
} finally {
  git stash pop
}
npm view slicejs-cli@4.6.0 version
```

Framework first. Do not publish the CLI before `slicejs-web-framework@4.3.0`
is live. The CLI has two unrelated files (`BACKLOG.md` and
`features/0004-...`); the stash keeps `pnpm`'s clean-tree check happy and
restores them after the publish attempt.

## 5. Tags and GitHub releases

```powershell
cd "C:\Users\vkneider\Desktop\asdasd\slice-workspace\repos\slice.js"
git tag v4.3.0
git push origin v4.3.0
gh release create v4.3.0 --title "v4.3.0" --notes-file CHANGELOG.md

cd ..\slicejs-cli
git tag v4.6.0
git push origin v4.6.0
gh release create v4.6.0 --title "v4.6.0" --notes-file CHANGELOG.md
```

## 6. Redirect consumers to the published pair

The `package.json` ranges are already updated. After publish, refresh the
lockfile and verify:

```powershell
cd "C:\Users\vkneider\Desktop\asdasd\slice-workspace"
pnpm install
pnpm doctor
```

Expected: the version-skew warnings disappear. Remaining warnings should only
be the three `experiment/static-export` branch notices and Windows Developer
Mode.

Commit and push the consumer `package.json` changes in each repo:

```powershell
git -C repos/slicejs-components add package.json
git -C repos/slicejs-components commit -m "chore: adopt framework 4.3.0 and CLI 4.6.0"

git -C repos/slice.js_docs add package.json
git -C repos/slice.js_docs commit -m "chore: adopt framework 4.3.0 and CLI 4.6.0"

git -C repos/portfolio add package.json
git -C repos/portfolio commit -m "chore: adopt framework 4.3.0 and CLI 4.6.0"

git -C repos/conclave add package.json
git -C repos/conclave commit -m "chore: adopt framework 4.3.0 and CLI 4.6.0"

git -C repos/slicejs-lab add package.json
git -C repos/slicejs-lab commit -m "chore: adopt framework 4.3.0"
```

Then push each repo's `master` branch.

## 7. Deploy

Only after both npm packages are live:

1. Deploy `slice.js_docs` on Vercel.
2. Deploy Conclave on Vercel.
3. Push the local Portfolio/Conclave `master` commits.
4. If you publish a static Portfolio site, rerun `slice export` with the new
   CLI/framework.

## Publish order

```text
merge -> install/doctor/tests -> check-pack + release-check + pack smoke
-> publish slicejs-web-framework@4.3.0
-> publish slicejs-cli@4.6.0
-> tags + GitHub releases
-> refresh consumers -> install/doctor
-> deploy docs + Conclave
```

## Post-release status — 2026-11-16

Published and verified from the registry with a clean install:

| Package | Version | `latest` |
|---|---|---|
| `slicejs-web-framework` | `4.3.0` | `4.3.0` |
| `slicejs-cli` | `4.6.0` | `4.6.0` |

Tags `v4.3.0` and `v4.6.0` exist locally and on GitHub. GitHub Releases were
intentionally skipped.

Consumer lockfiles were refreshed and pushed:

| Repo | Commit |
|---|---|
| `slicejs-components` | `9831b34` |
| `slice.js_docs` | `c2ce5b3` |
| `portfolio` | `9aeb5c3` |
| `conclave` | `15807c2` |

### Two gotchas found during deployment

1. **Conclave's `minimumReleaseAgeExclude` is version-pinned.** It lists
   `slicejs-cli@4.1.0 || ... || 4.4.0` instead of the package name, so a new
   release fails Vercel's frozen install with
   `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`. Fix: append the new versions
   (`4.6.0`, `4.3.0`) in `repos/conclave/pnpm-workspace.yaml` and commit. Other
   consumers exclude by package name and do not need this.
2. **A generated docs page needs three registrations.** `docs:generate` builds
   the component and `docsIndex.js`, but the site also needs the page in
   `src/routes.js`, `src/Components/AppComponents/DocumentationPage/documentationRoutes.js`
   and `src/Components/components.js`. Missing any of them gives a 404 or
   "Component ... not found" with no build error. `Deployment`, `SEO` and
   `Server-Entrypoint` were missing and are now registered.

Live verification after the fixes:

```text
https://slicejs.com/Documentation/Deployment                    -> 200, full guide renders
https://slicejs.com/Documentation/Architecture/SEO              -> 200
https://slicejs.com/Documentation/Architecture/Server-Entrypoint -> 200
https://conclave.vkneider.dev/                                  -> 200
https://conclave.vkneider.dev/api/status                        -> 200
https://vkneider.dev/                                           -> 200
https://components.slicejs.com/                                 -> 200
```

Conclave production deployment `813cd5c` is READY and aliased to
`conclave.vkneider.dev`. One push (`15807c2`) did not trigger a Vercel build;
re-pushing the follow-up commit (`813cd5c`) triggered it normally.
