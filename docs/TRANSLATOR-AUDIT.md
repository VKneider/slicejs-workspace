# Translator audit — findings and status

Audit of `slice.translator` (framework 0003) across the framework, Router, server/SEO, CLI, components
and docs. Status: `open` → `fixed` as each item lands. Severity: `P0` blocks a release, `P1` is a
user-visible bug, `P2` is robustness/ergonomics.

Legend: **file:line** points at the audit snapshot; line numbers move as fixes land.

## Naming decision

`translator.routing` is renamed to **`translator.localePrefix`** with explicit values:

| Value | URL |
| --- | --- |
| `false` (default) | the locale is never in the URL |
| `"always"` | `/es/pricing`, `/en/pricing`; `/` redirects to the default locale |
| `"except-default"` | `/pricing` for the default locale, `/en/pricing` for the rest |

The old `"prefix"` / `"prefix-except-default"` values and the `routing` key disappear (nothing is
published yet).

## P0 — release blockers

| ID | Finding | Location | Status |
| --- | --- | --- | --- |
| P0-1 | `next(false)` does not cancel a navigation: an auth guard lets the page through | `Router.js:343` | fixed |
| P0-2 | An unknown URL with no `/404` route throws during `slice.init()` (app does not boot) | `Router.js:620-623` | fixed |
| P0-3 | `{t}` fields with the translator off ship `[object Object]` as `<title>`/description | `seo.js:243` | fixed |
| P0-4 | `slice doctor` / `slice translator check` pass with 0 locales while the runtime is disabled | `scan.js:219-225` | fixed |
| P0-5 | `slice seo images` captures one card per locale when the URL has no prefix (last wins, orphan file) | `images.js:98` | fixed |

## P1 — user-visible bugs

| ID | Finding | Location | Status |
| --- | --- | --- | --- |
| P1-1 | `titleKey`/`descriptionKey` inside `seo.json` are validated but ignored: page ships without `<title>` | `seo.js:230-237` | fixed |
| P1-2 | A route without a title/description inherits the previous route's (never restored) | `applyRouteMetadata.js:48,57` | fixed |
| P1-3 | Nested `children` title is the parent's on first load and the leaf's afterwards | `Router.js:615` vs `:595` | fixed |
| P1-4 | `slice.router.activeRoute` is MultiRoute props after an App-Shell navigation (no `path`/`params`) | `Router.js:835` | fixed |
| P1-5 | `localePrefix: "always"` 404s every unprefixed deep path that the client renders | `server.js:431-439` | fixed |
| P1-6 | `children` routes are never prerendered (server 404) | `server.js:239-254` | fixed |
| P1-7 | Unlisted `fallbackLocale`: the client accepts it, the server treats `/en/...` as unknown | `seo.js:68-71` vs `Translator.js:67` | fixed |
| P1-8 | Namespace dictionaries (`load('orders')`) are invisible to SEO and to `slice translator check` | `seo.js:124-144`, `scan.js:169-187` | fixed |
| P1-9 | Relative `translator.path` (`"locales"`) breaks every fetch under a locale URL | `Translator.js:72,627` | fixed |
| P1-10 | A 404 namespace permanently blocks every `setLocale` | `Translator.js:604-605` | fixed |
| P1-11 | Translator off: a later `el.prop = slice.t.ref(...)` stores the marker object | `Translator.js:406` | fixed |
| P1-12 | `enabled: true` without `defaultLocale` silently disables the feature (and the CLI gate is green) | `Translator.js:55` | fixed |
| P1-13 | Locale names differing only in case create a phantom locale that 404s at boot | `Translator.js:59-70` | fixed |
| P1-14 | `syncUrl()` prefixes unknown prefixes (`/fr/x` → `/es/fr/x`) with `localePrefix: "always"` | `Translator.js:792-798` | open |
| P1-15 | Empty/`false` title removes `<title>` on the server while the client keeps the old one | `seo.js:271-273` | open |
| P1-16 | No manifest validation at startup; a missing/empty `routes.js` silently 404s the whole site | `server.js:264-444` | fixed |
| P1-17 | Server `has()` accepts a group key the client rejects | `seo.js:106` | fixed |
| P1-18 | `fallbackLocale` is appended to the client locales but not to the server context | `Translator.js:67-70`, `seo.js:68-71` | fixed |
| P1-19 | `prefix-except-default` + `saveLocally`/`useBrowserLocale`: the saved/browser choice is never consulted | `Translator.js:183-199` | fixed |

## P2 — robustness, ergonomics, docs

| ID | Finding | Location | Status |
| --- | --- | --- | --- |
| P2-1 | Debugger never subscribes to `translator:change` (created before `slice.events`) | `Slice.js:629-635` | open |
| P2-2 | Shortcut handler has no input guard, no dead-panel check, no duplicate detection, no `event.repeat` guard | `Slice.js:730-768` | open |
| P2-3 | Observer matches every `data-t*` attribute (`data-theme`, `data-tab`, …) | `Translator.js:773` | fixed |
| P2-4 | `<textarea data-t>` can never be filled (treated as void) | `dom.js:33-36` | fixed |
| P2-5 | Slot cache is never invalidated: a removed slot is re-inserted on the next switch | `dom.js:231-243` | open |
| P2-6 | `format.date/number/currency/relative` throw on invalid input | `Translator.js:560-581` | open |
| P2-7 | A malformed active entry blocks the fallback lookup | `Translator.js:234-238` | open |
| P2-8 | `load()` during an in-flight switch loses the namespace for the new locale | `Translator.js:302-311` | open |
| P2-9 | `texts()` drops params on the English fallback | `texts.js:82-92` | fixed |
| P2-10 | `setShowKeys(true)` cannot show library keys: `texts()` turns the key into English | `texts.js:88` | fixed |
| P2-11 | `slice get` reports success when a helper (`shared/**`) failed to download | `getComponent.js:502-509,400` | open |
| P2-12 | `slice get Icon` requests five font files that no longer exist | `getComponent.js:189-191` | open |
| P2-13 | `scanJs` matches `obj.translate(...)`/`obj.tr(...)`, misses `$t()`/`t()` | `scan.js:84` | open |
| P2-14 | Scan scope does not match the docs; JS-injected `data-t` is never scanned | `scan.js:119-126`, `translator.md:197` | open |
| P2-15 | `slice translator init` re-enables a deliberately disabled translator | `init.js:41` | open |
| P2-16 | Invalid `sliceConfig.json` is reported as “translator not configured” | `scan.js:156-167` | open |
| P2-17 | Schema validator ignores `if/then`, `minLength`, `uniqueItems`, `additionalProperties` | `sliceConfigSchema.js:34-65` | open |
| P2-18 | Docs/skill stale: “do not enable routing before the migration”, `key()`, “eleven components”, “built-ins are `data-t`” | skill + `translator.md` | open |
| P2-19 | Lab e2e comments still say `key()` | `translator.e2e.mjs:4,164` | open |
| P2-20 | `fallbackLocale: ""` yields `""` instead of `null` | `Translator.js:63-66` | fixed |
| P2-21 | `stripLocalePrefix` omits the fallback locale → wrong route bundle preload | `Slice.js:428-436` | open |
| P2-22 | 404 `<title>` is English in every locale | `server.js:376` | open |
| P2-23 | Redirects drop `?query`; a 301 is cached for an hour | `server.js:198-202` | open |
| P2-24 | Single locale + `"always"` emits duplicate `hreflang`/`x-default` | `seo.js:429-439` | open |
| P2-25 | No EN/ES key-parity test for the component tables | `slicejs-components` | open |
| P2-26 | `texts()` keeps the first registration for a namespace, silently | `texts.js:41-58` | open |
| P2-27 | Table's `textLayer` materializes `operators` eagerly; a future direct read regresses | `Table.js:184-192` | open |
| P2-28 | Manifest-level `titlePrefix`/`titleSuffix` are ignored (no warning) | `seo.js:269-270` | open |
| P2-29 | `slice seo check` emits a false “title differs” for `{t}` manifests (no translate) | `seo.js:617-618` | open |
| P2-30 | Server 404 title/description do not follow `titleKey`/affixes | `server.js:374-380` | open |
