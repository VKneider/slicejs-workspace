# Slice.js evaluation: maturity, comparison, what to protect

**What this is:** a cross-repo assessment of Slice.js as a platform for a
production SaaS. It was produced while building a real product (the external
`stickers` app: raster editor, vectorization, workers, PDF layout) and verified
against `slicejs-web-framework@4.2.0` and `slicejs-cli@4.5.0`.

**What this is not:** a benchmark. The scores are informed judgment from the
source and the build experience, not a measurement.

Related: [`SAAS-ARCHITECTURE.md`](SAAS-ARCHITECTURE.md) (multi-module,
auth/tenant) and
[`repos/slicejs-cli/features/0005-static-export.md`](../repos/slicejs-cli/features/0005-static-export.md)
(static hosting).

---

## 0. Verdict

| Dimension | Score | Reading |
|---|---|---|
| **Runtime / UI engine** | 8.5/10 | Mature. Web Components + explicit lifecycle + services; it carries a vector editor with workers, undo and PDF output. |
| **SaaS platform** | 6.5/10 | Has data, forms, state, i18n, guards and SEO. Missing the module contract and a packaged auth/tenant pattern. |
| **Ecosystem / team scale** | 3/10 | One maintainer, ~822 npm downloads/month, no external contributors, no LTS, CLI/runtime version skew. |

**In one sentence:** Slice is a real framework, not an experiment; for an
in-house SaaS with a small team it is enough, as long as you accept building
the platform layer and being the vendor.

---

## 1. What it already solves (verified)

| Need | Piece | Evidence |
|---|---|---|
| App state | `slice.context` | `create/getState/setState/patch/watch` + selector, `use()`/`bind`, `persist`, auto-cleanup by `sliceId`. |
| Server data | `QueryService` | Key + function; one request per key, SWR, `invalidate(prefix)`, `mutate({ invalidates })`, retry on 5xx/network, cancellation, refetch on focus, GC, `loader()`, optimistic `setData`, `remove()` on sign-out. |
| HTTP | `FetchManager` | `baseUrl`, `credentials`, `onRequest`, `onResponse`, `onResponseError`, timeout, retry, `HttpError` with `status`/`body`. |
| Protected routes | `slice.router.beforeEach` | Runs on every navigation, including the first load; `next()/next(false)/next(path)/next({path,replace})`; redirect-loop protection (10). |
| Route metadata | `routes.js` → `metadata` | The router applies `title`/`description`; the whole object reaches `to.metadata` and `route-rendered`. |
| Forms | `Form` | Schema, sections, progressive-validation steps, `group` repeater, `required`, `validate(value, values)`, `getValues/setValue/setError/reset`. |
| Tables/lists | `Table`/`DataList`/`DescriptionList` | `load({ page, pageSize, search, signal })`, skeleton, error, retry, optimistic `updateItem`. |
| i18n | `slice.translator` | Namespaces, plurals, `t.ref()` for props, locale in the URL, per-component dictionaries. |
| SEO | `seo.json` + `prepareSeo()` | Per-route head, real 404, sitemap, hreflang. |
| Build | `slice build` | Bundles, esbuild, minify+mangle, no source maps by default, runtime copied into `dist/`. |
| Quality | `slice doctor`, `lint`, `typecheck`, LeakInspector, debug panels | Real CI gates. |

**What it is not:** Next.js. No body SSR, no edge middleware, no RSC. For a
login-first SaaS that is not needed; for public, entity-indexable content it
changes the calculus.

---

## 2. Comparison with other frameworks

### 2.1 Capabilities

| Axis | Slice | React (SPA) | Vue | Angular | SvelteKit | Next |
|---|---|---|---|---|---|---|
| Model | Custom Elements + setters | VDOM + hooks | Reactivity + SFC | DI + RxJS | Compiler | RSC + server |
| Routes / guards | Own router, global `beforeEach` | External router, wrappers/loaders | Vue Router, `beforeEach` | Router + `CanActivate` | File-based + hooks | File-based + middleware |
| State | `slice.context` | Context/Zustand/Redux | Pinia | Services + RxJS | Stores | Server state |
| Data | `QueryService` | React Query | Vue Query | HttpClient/RxJS | `load` | `fetch` + cache |
| Forms | `Form` (schema) | react-hook-form | vee-validate | Reactive Forms | Superforms | Server Actions |
| Body SSR | **No** | No (SPA) | Nuxt: yes | Universal: yes | Yes | Yes |
| Edge middleware | **No** | No | Nuxt: yes | No | Hooks | Yes |
| Component testing | **No official** | RTL | VTU | TestBed | Testing Library | Testing Library |
| TypeScript | Generated from `static props` | Authored | Authored | Authored | Authored | Authored |
| Build | Own CLI (esbuild) | Vite/Webpack | Vite | ng build | Vite | Turbopack |
| Runtime dependencies | Zero | React+router+… | Vue+router+… | Angular | Svelte | Next+React |
| Ecosystem | Small | Huge | Large | Large | Medium | Huge |
| Hiring | You | Broad | Broad | Broad | Medium | Broad |
| Maturity / bus factor | 1 maintainer | Meta + community | Community | Google | Community | Vercel |

### 2.2 Honest reading

- **Against React SPA:** Slice is on par for what matters in a login-first SaaS
  (state, data, forms, guards, HTTP). It wins on dependencies and runtime size;
  it loses on ecosystem, testing and hiring.
- **Against Next/Nuxt/SvelteKit:** it loses on SSR and server middleware. That
  difference **is not React's**; it belongs to the meta-framework. If the
  product needs protected HTML or per-entity SEO, it is a different game.
- **Against Angular:** Angular has the closest model (guards, interceptors, DI,
  services). Slice is simpler and smaller; Angular brings more batteries and
  more weight.
- **Against Vue:** Vue Router has an almost identical `beforeEach`; the
  difference is ecosystem and component model, not capability.

**Conclusion:** the fair comparison is **Slice vs React SPA**, not vs Next. In a
React SPA, "protected routes" are also client-side and the real protection is
the API. Slice is not worse on security; it differs on ergonomics and
ecosystem.

---

## 3. Main risks

Ordered by real cost, not elegance:

1. **Silent failures.** A prop declared in `static props` without a setter
   leaves the backing field `null` with no warning. `slice.build()` returns
   `null` when the component is not registered. An unknown icon renders an
   empty `<svg>`. With one developer it costs debugging time; with six
   developers and six modules, it costs sprints.
2. **No module contract.** A module is declared in `routes.js`, the nav, the
   `MultiRoute`, the hub, and shell special cases. Every new module touches
   shared files.
3. **Component governance.** `slice get` copies and `slice sync` overwrites.
   There is no versioned package for a shared design system.
4. **No body SSR.** Acceptable behind login; limiting for marketing with
   indexable content.
5. **Component testing.** Vitest over services is fine; there is no mount
   harness. A manual checklist does not scale with a team.
6. **Bus factor.** One maintainer, no LTS, CLI `4.5.0` and runtime `4.2.0` in
   the same workspace. The risk is not disappearance; it is that the team
   cannot replace you and that framework bugs compete with the roadmap.

---

## 4. What to protect

### 4.1 Of the framework (invariants not to break)

1. **Web standards.** Custom Elements, templates, CSS; no proprietary VDOM. It
   is why the runtime is small and survives trends.
2. **Explicit lifecycle.** `constructor` (attachTemplate + refs +
   setComponentProps) → `init()` → `update()` → `beforeDestroy()`. Setters are
   the only place state is applied. No invented `render()`.
3. **Dev without a build, prod with a bundle.** Direct ESM in development,
   esbuild in production, with dev/prod parity.
4. **DOM-less services.** Logic lives in Services that unit-test as plain JS;
   the component only paints.
5. **Registry + gates.** `components.js` + `doctor` + `lint` + `typecheck` +
   `build` as the CI pipeline. It is what stops a team from breaking the
   project silently.
6. **Zero runtime dependencies.** Express/esbuild stay in the server and CLI,
   not in the browser.
7. **Docs with `file:line` and a pitfall table.** That is the project's memory;
   without it, the bus factor becomes the main problem.

### 4.2 Of the product (security and business)

1. **Secrets outside `src/`.** `SLICE_PUBLIC_*` is public; the rest lives on the
   server. `routes.js` and `sliceConfig.json` are public too.
2. **Authorization in the backend, per request and per object.** The route
   guard is UX; `current_user` proves "logged in", not "owns this row". Tenant
   in SQL + `404` for another tenant's resources.
3. **Tenant in the query key.** `['orders', { tenant, …params }]` and
   `queries.remove()` on switch/sign-out. It is the most common multi-tenant
   bug and it is a security bug.
4. **API surface.** Opaque IDs, generic errors, rate limiting. The bundle gives
   away the endpoint map; the backend must not give away more.
5. **Algorithm moat.** If the differentiator is an algorithm, it belongs on the
   server. In the Stickers app the nesting is already in Python; vectorization
   runs in the browser and is copyable.
6. **Disciplined build.** Minify + mangle by default, no `--sourcemap` in
   production, `--hash-filenames`, and a CI check that fails on `.map`, `src/`
   paths or secret patterns.
7. **Paid modules.** Do not ship their code to free users; filter by plan in
   the registry/build and deny in the API anyway.

### 4.3 What is not worth protecting

- **The bundle.** All browser JS is downloadable. Obfuscation raises the cost of
  copying; it does not prevent it.
- **The UI and the flows.** They are always copyable. The defense is brand,
  data, integrations and execution speed.
- **A local tool's code.** If it ships as an `.exe`, it is on the user's machine.
  The business model cannot be code secrecy.

---

## 5. When to use Slice

**Yes:**

- A product with one shell and heavy interactive screens (editors, canvas,
  tools), not a 20-CRUD portal.
- Behind login, not dependent on content SEO.
- A small, stable team where you can be the framework vendor.
- You want a small runtime, no VNode, and control of the build.

**No (or careful):**

- A public SaaS with per-entity SEO and indexable marketing.
- A large team with high turnover, or hiring as the bottleneck.
- Enterprise buyers who require a stack their team already knows.
- A product where the frontend is 100% of the value and the code is the moat.

---

## 6. Hardening plan (prioritized)

| # | Work | Why | Effort |
|---|---|---|---|
| 1 | Dev error for a declared prop without a setter; `doctor` rule | Kills half of the silent traps | 1–2 days |
| 2 | `slice.build()` of an unknown component → throw in dev | Fails early, not in production | 0.5 day |
| 3 | Unknown icon → warning | Prevents empty `<svg>` | 0.5 day |
| 4 | Module manifest + `ModuleRegistry` | Stop touching five files per module | 3–5 days |
| 5 | `SessionService` + guard + 401 + tenant keys | The missing SaaS layer | 2–3 days |
| 6 | Component test harness (mount + queries + events) | Make the manual checklist not the gate | 2–4 days |
| 7 | Lockstep CLI/runtime + changelog + deprecation | Production confidence | 1–2 days |
| 8 | `slice export` | Deploy without Express | 1–2 days (MVP) |
| 9 | `base` path | Subpath / GitHub Pages project site | 1–2 days |

Details for 4–5 are in [`SAAS-ARCHITECTURE.md`](SAAS-ARCHITECTURE.md); 8–9 are in
the CLI feature `0005-static-export`.

---

## 7. Open questions

1. **Is Slice a product or an internal tool?** If it is sold as a framework,
   bus factor and LTS are part of the product.
2. **Does the SaaS need SSR at any point?** If yes, decide before investing in
   the module contract.
3. **Is the moat the algorithm or the flow?** It defines what moves to the
   server.
4. **How many modules in 12 months?** At five, the registry is enough; at
   twenty, invest in component governance.
5. **Will you hire?** If yes, Slice's onboarding cost enters the math.
