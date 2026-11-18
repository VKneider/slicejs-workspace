# SaaS architecture on Slice: modules, auth, tenants

**What this is:** a proposal for the layer a login-first, multi-tenant SaaS
needs on top of Slice.js: a module contract, session/tenant/permission
patterns, and the backend middleware that actually protects data. Nothing here
is implemented.

Verified against `slicejs-web-framework@4.2.0` / `slicejs-cli@4.5.0`.

Related: [`SLICE-EVALUATION.md`](SLICE-EVALUATION.md) (maturity and what to
protect) and the CLI feature
[`0005-static-export`](../repos/slicejs-cli/features/0005-static-export.md)
(deployment).

---

## 0. Summary

- The **frontend** of a SaaS can be fully static. The host protects nothing; the
  backend authorizes every request. This is the same in React.
- Slice already ships the application layer: `QueryService`, `FetchManager`,
  `Form`, `slice.context`, route guards, `Table`/`DataList`,
  `slice.translator`, SEO.
- The missing piece is the **platform layer**:
  1. a **module manifest** + registry (today a module is declared in five
     places);
  2. a **`SessionService`** pattern (login/logout/refresh/permissions), not a
     framework feature;
  3. backend middleware per request and per object.
- No runtime change is needed for this; it is application code plus one small
  framework addition (route metadata is already there).

---

## 1. Multi-module

### 1.1 The problem today

A module is declared in five places:

1. `src/routes.js` (router),
2. `AppShell.init()` → `Navbar` items,
3. `AppShell.init()` → `MultiRoute` routes,
4. the hub/landing module list,
5. shell special cases (`_marcarRuta`, per-module CSS classes/height vars).

Adding a module means touching shared files. That is what must be inverted.

### 1.2 Contract: a data-only manifest

`src/modules/stickers/module.js`:

```js
export default {
   id: 'stickers',
   title: 'Stickers',
   description: 'Cut, adjust and lay out the sheet.',
   icon: 'sticker',
   path: '/stickers',
   section: 'StickersSection',       // name in components.js, NOT an import
   subRoutes: [],
   nav: { order: 20, label: 'Stickers' },
   plan: 'free',                      // or featureFlag
   permission: 'stickers.use',
   services: ['StickersRoute'],       // singletons mounted with the module
   i18n: ['stickers'],
   contexts: ['stickers.filters'],
   accent: 'var(--primary-color)'
};
```

Rule: **the manifest does not import components**, only names them. That lets
`routes.js` import it without pulling code.

### 1.3 `ModuleRegistry`

A singleton service next to the composition root:

```js
import modules from '../../../modules/index.js';

export default class ModuleRegistry {
   init() {
      this._modules = modules.filter((m) => m.enabled !== false);
      this._mounted = new Set();
      this._validate();               // unique ids/paths, section registered, nav has a route
      return this;
   }

   get(id) { return this._modules.find((m) => m.id === id) || null; }

   routes() {                         // for routes.js (top-level route ALWAYS)
      return this._modules.flatMap((m) => [
         { path: m.path, component: 'AppShell',
           metadata: { title: m.title, module: m.id, permission: m.permission } },
         ...(m.subRoutes || []).map((r) => ({ ...r, component: 'AppShell',
           metadata: { ...r.metadata, module: m.id, permission: r.permission || m.permission } }))
      ]);
   }

   sections() {                       // for the shell's MultiRoute
      return this._modules.flatMap((m) => [
         { path: m.path, component: m.section, metadata: { module: m.id } },
         ...(m.subRoutes || []).map((r) => ({ ...r, metadata: { module: m.id } }))
      ]);
   }

   nav() {
      return this._modules.filter((m) => m.nav)
         .sort((a, b) => a.nav.order - b.nav.order)
         .map((m) => ({ text: m.nav.label, path: m.path }));
   }

   hub() { return this._modules.filter((m) => m.hub !== false); }

   async mount(id) {                  // idempotent
      const m = this.get(id);
      if (!m || this._mounted.has(id)) return;
      for (const name of m.services || []) await slice.build(name, { singleton: true });
      for (const ns of m.i18n || []) await slice.translator?.load(ns);
      this._mounted.add(id);
   }
}
```

### 1.4 Wiring

```js
// src/routes.js
import registry from './Components/AppServices/ModuleRegistry/modules.routes.js';

export default [
   { path: '/', component: 'AppShell', metadata: { title: 'Hub' } },
   ...registry.routes(),
   { path: '/404', component: 'NotFound' }
];
```

```js
// AppShell.init()
const registry = slice.getComponent('ModuleRegistry');
const navbar = await slice.build('Navbar', { items: registry.nav(), ... });
const content = await slice.build('MultiRoute', { routes: registry.sections() });
```

```js
// HubSection.init()
for (const [i, m] of registry.hub().entries()) { /* ModuleCard with m */ }
```

The module special case becomes `metadata.module` →
`document.documentElement.dataset.module = id`, and CSS
`[data-module="stickers"]`.

**Framework constraint:** `MultiRoute` does **not** register routes in the
Router; `routes.js` is the only source of truth. That is why the manifest emits
both lists (`routes()` and `sections()`).

### 1.5 Isolation

| Concern | Convention | Control |
|---|---|---|
| id / path | unique | `registry._validate()` |
| component | unique name per module | `slice doctor` (duplicates across manifests) |
| routes | all in `routes.js` | `registry.routes()` |
| events | `module:action` | lint by regex |
| context | `module.state` | review |
| i18n | `locales/<module>.json` | `slice translator check` |
| storage | `<app>:<module>:` prefix | review/lint |
| CSS | scoped to the custom element | `slice doctor` already warns |
| imports | a module does not import another; only `shared/` | import-boundary lint |

### 1.6 Trade-offs

- **Dynamic bundling.** `slice.build(route.component)` with a name coming from
  the manifest is dynamic: `slice build` warns and the component loads
  individually. Options: (a) accept, (b) generate `modules.generated.js` with
  literal names, (c) let the CLI read `src/modules/*/module.js` while bundling.
  Start with (b).
- **Not a plugin system.** Static, imported manifests, not remote modules.
  Multi-tenant ≠ multi-repo.
- **`MultiRoute` caches by component name.** Two modules sharing a section name
  share an instance. The registry must prevent it.

---

## 2. Auth, tenant, RBAC

### 2.1 Division of responsibilities

Slice is frontend. The frontend **does not authorize**: it projects the
session, navigates, shows/hides, and clears caches. The backend is the truth.

| Frontend | Backend |
|---|---|
| Route guard (UX) | Per-request authorization |
| `session.can(perm)` for UI | Real 403 |
| `tenant` in query keys | Tenant filter in SQL |
| 401 → refresh → logout | Validate token/cookie |
| `queries.remove()` on logout | Invalidate the session |

### 2.2 `SessionService`

```js
// AppServices/SessionService/SessionService.js
export default class SessionService {
   async init() {
      this.http = await slice.build('FetchManager', {
         singleton: true, sliceId: 'http', baseUrl: '/api', credentials: 'include',
         onRequest: (request) => {
            const tenant = slice.context.getState('session')?.tenant;
            if (tenant) request.headers['X-Tenant'] = tenant;   // routing, NOT authz
         },
         onResponseError: (error) => {
            if (error.status === 401) this._onUnauthorized();
         },
      });
      slice.context.create('session',
         { status: 'anonymous', user: null, tenant: null, plan: null, permissions: [] },
         { persist: true, storageKey: 'app:session' });          // do NOT persist tokens
      return this;
   }

   async ready() {                    // once per load, shared
      if (this._me !== undefined) return this._me;
      this._me = await this.http.get('/me').catch(() => null);
      if (this._me) slice.context.setState('session', { status: 'authenticated', ...this._me });
      return this._me;
   }

   can(permission) {
      const { permissions } = slice.context.getState('session') || {};
      return permissions?.includes('*') || permissions?.includes(permission) || false;
   }

   async logout() {
      await this.http.post('/auth/logout').catch(() => {});
      slice.getComponent('queries')?.remove();                  // forget ALL cached data
      slice.context.destroy('session');
      // MultiRoute caches sections: a reload is the cheap way to avoid leaving
      // the previous user's data in a cached component.
      window.location.assign('/login');
   }

   _onUnauthorized() {
      if (this._refreshing) return;
      this._refreshing = true;
      this.http.post('/auth/refresh')
         .then(() => { this._me = undefined; })
         .catch(() => this.logout())
         .finally(() => { this._refreshing = false; });
   }
}
```

### 2.3 Route guard

```js
// src/App/index.js
slice.router.beforeEach(async (to, from, next) => {
   const session = slice.getComponent('SessionService');
   const me = await session.ready();
   if (!me) {
      return next({ path: `/login?next=${encodeURIComponent(to.path)}`, replace: true });
   }
   if (to.metadata?.permission && !session.can(to.metadata.permission)) {
      return next('/403');
   }
   await slice.getComponent('ModuleRegistry').mount(to.metadata?.module);
   next();
});
```

Rules:

- **Always** call `next()`.
- `ready()` must dedupe: the first navigation and a reload cannot fire two
  `/me` calls.
- The guard **does not** wait for screen data: it waits for `me`, not for the
  list. Components load with `QueryService` without `await` (skeleton).
- Build the redirect query into the path (`/login?next=…`).

### 2.4 Tenant

- **Path or subdomain**, not both. For a small SaaS, one domain and the tenant
  comes from `/me`; for enterprise, subdomain (`acme.app.com`) or path
  (`/t/acme`).
- **The backend derives the tenant from the session.** The `X-Tenant` header is
  for routing/observability, never for authorization.
- **Tenant in the query key:**

```js
const ordersKey = (tenant, params) => ['orders', { tenant, ...params }];
```

- **On tenant switch / logout:** `queries.remove()` before reloading. Without
  it the next user sees the previous user's cache. It is the most common
  multi-tenant bug and it is a security one.

### 2.5 Permissions

- Come from the backend in `/me` (`permissions: ['orders.view', 'orders.manage']`).
- Route: `metadata.permission` + guard.
- Nav: `registry.nav()` filtered by `session.can(...)`.
- UI: `session.can('orders.manage')` disables or hides.
- **Hiding is not protecting.** The endpoint returns 403 anyway.

### 2.6 Backend middleware (the layer that actually protects)

| Layer | Protects | Who |
|---|---|---|
| Router guard | Navigation (UX) | Frontend |
| API middleware | **Data** | Backend |
| HTML middleware | **View** (optional) | `slice start`, edge, or CDN auth |
| Per-object authorization | "This resource is mine" | Backend, per endpoint |

**API (mandatory).** With FastAPI, one dependency per router:

```python
async def current_user(request: Request) -> User:
    token = request.cookies.get("session") or bearer(request)
    return await sessions.verify(token)          # 401 when there is no session

async def tenant_scope(user: User = Depends(current_user)) -> Tenant:
    return await tenants.for_user(user)          # the server decides the tenant

app.include_router(orders.router, prefix="/api/orders",
                   dependencies=[Depends(current_user)])
```

And in each endpoint: `WHERE tenant_id = :tenant`, plus `404` (not `403`) when
the resource belongs to another tenant. `current_user` proves "logged in", not
"owns this order"; that is per-object authorization and it goes per endpoint.

**HTML (optional).** To stop `/dashboard` from being served without a session:

- with `slice start`, middleware **before** `await start()` (anything after it
  never runs):

```js
app.use(['/dashboard', '/orders'], requireSession);
app.use('/api', requireAuth);
await start();                    // the fallback is always last
```

- with a static export, the CDN does not run middleware: use Cloudflare Access
  (Zero Trust) or a Pages Function `functions/_middleware.js` that validates the
  cookie before serving assets.

**What backend middleware cannot do:** stop someone from reading the public
shell or bundle, or replace per-object checks. If the frontend is static, the
`/dashboard` HTML is public by design; the data is not.

### 2.7 Pitfalls

| Pitfall | Rule |
|---|---|
| Guard without `next()` | Every path calls `next()` / `next(...)`. |
| 401 loop | Refresh once; on failure, log out. Never retry the refresh. |
| Token in `localStorage` | Prefer an `httpOnly` cookie; persist only the snapshot (user, tenant, plan). |
| Cross-tenant cache | `queries.remove()` on tenant switch/logout. |
| Component cached by `MultiRoute` | On logout, reload or destroy the section; do not rely on `beforeDestroy` alone. |
| `setState` replaces | Use `patch` for one field. |
| `watch` without `sliceId` | Returns `null`: subscribe inside a component's `init()`. |

---

## 3. Static deployment

The frontend can be a static export; the backend stays a process. See the CLI
feature [`0005-static-export`](../repos/slicejs-cli/features/0005-static-export.md)
for the command design, the host rules and the pitfalls.

The only thing to decide here: **the API must be a separate origin** (CORS,
`SameSite=None; Secure` cookies or an `Authorization` header), and the static
host must not be treated as a security boundary.

---

## 4. Plan by phases

| Phase | Work | Estimate |
|---|---|---|
| 1 | `SessionService` + guard + 401 + `FetchManager` (no manifests) | 2–3 days |
| 2 | Manifests + `ModuleRegistry` + generic shell (no visual change) | 3–5 days |
| 3 | Tenant in keys + clean logout + permissions in nav/routes | 2–3 days |
| 4 | `slice export` MVP | 1–2 days |
| 5 | Per-route HTML + `404.html` + locale redirects | 2–3 days |
| 6 | Host rules + CI (headers, secrets, `.map`) | 1–2 days |
| 7 | `base` path (only if a subpath is needed) | 1–2 days |

---

## 5. Open decisions

1. **Tenancy:** single domain + tenant in session, path (`/t/acme`), or
   subdomain.
2. **Host:** Cloudflare Pages (recommended) vs Vercel (Node functions) vs
   self-hosted.
3. **Session persistence:** `httpOnly` cookie (recommended) vs token in memory
   + refresh.
4. **Paid modules:** filter at build or lazy-load; the API denies either way.
5. **Public SEO per entity:** prerender known ids vs an edge function.
6. **`base` path:** needed or not? If not, the runtime stays untouched.
