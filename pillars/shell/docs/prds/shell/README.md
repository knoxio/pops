# Shell

> Pillar: [@pops/shell](../../README.md)
> Status: Done

## Purpose

`@pops/shell` is the SPA host — the React/Vite application that mounts every
pillar's frontend and owns the global chrome, routing, providers, theming, and
scroll behaviour. App pillars supply pages and a nav config; the shell wraps
them in the shared layout and handles everything an app doesn't need to think
about. The install set — which pillars mount — is resolved from the live
registry snapshot at boot, not from a compiled list.

## Structure

```
pillars/shell/
  index.html                       (mounts #root)
  nginx.conf                        (generated; per-pillar REST proxy blocks)
  src/
    main.tsx                        (entry; boot-await then mount, ErrorBoundary)
    app/
      App.tsx                       (provider stack + router)
      boot-snapshot.ts              (resolve registry snapshot → install set)
      BootRegistryProvider.tsx      (boot-resolved nav/manifests context)
      router.tsx                    (router built from resolved manifests)
      bundle-map.tsx                (in-repo pillar enumeration)
      installed-modules.ts          (registry-walk → frontend manifests)
      external-ui.tsx               (runtime loader for external pillars)
      layout/   pages/   nav/   pillars/   overlays/   capture/
    registry-api/                   (generated Hey API client → registry pillar)
    store/ (uiStore, themeStore, searchStore)
    lib/   i18n/
  scripts/
    generate-nginx-conf.ts          (renders nginx.conf, static + dynamic modes)
    watch-registry-and-reload-*.ts  (SSE-driven nginx -s reload)
    register-with-registry.ts       (deploy-time UI-pillar self-registration)
```

## Install-set resolution (boot)

The shell does **not** build its router from a build-time module constant. It
boots behind an async boundary:

1. `main.tsx` renders a minimal boot splash and calls `fetchBootRegistry()`.
2. `fetchBootRegistry()` fetches the live registry snapshot (soft-fails to
   `[]`) and calls `resolveBootRegistry(snapshot)`.
3. `resolveBootRegistry` walks the snapshot's `registered` pillars:
   - **bundle-map hit** → emit the in-repo workspace manifest (statically
     bundled);
   - **bundle-map miss + `assetsBaseUrl`** → synthesize a manifest whose routes
     lazy-`import()` the external pillar's remote bundle;
   - **bundle-map miss + no `assetsBaseUrl`** → backend-only, dropped.
4. The resolved `{ manifests, registeredApps }` is threaded into `App.tsx`,
   which builds the router once and seeds `BootRegistryProvider`.

If the snapshot is empty, the fetch failed, or it resolves to **zero mountable
UI** (e.g. only `registry`/`orchestrator` registered mid-bring-up), the
resolver degrades to the **static bundle-map floor** — the in-repo pillars
narrowed by the operator's `POPS_APPS` selection. The shell never mounts an
app-less surface.

## App registration

Each in-repo pillar ships a frontend `ModuleManifest` re-exported by its
`@pops/app-*` package and registered as one entry in `bundle-map.tsx`:

```ts
WORKSPACE_BUNDLE_MAP = {
  finance: { manifest: financeManifest, navOrder: 10 },
  media: { manifest: mediaManifest, navOrder: 20 },
  // …
};
```

The manifest provides `frontend.routes` (lazy `RouteObject[]`),
`frontend.navConfig`, and (optionally) `frontend.captureOverlay`. Adding an
in-repo pillar = adding one bundle-map entry. External pillars never appear in
this map; they reach the shell through the registry walk and the runtime loader.

## Routing

Flat, namespaced routes, one subtree per installed app under `/<pillarId>/*`:

```
/                  → IndexRedirect (first live app, or /settings if none)
/<pillarId>/*      → that pillar's lazy-loaded routes, wrapped in PillarGuard
/settings          → SettingsPage  (registry settings surface)
/features          → FeaturesPage  (registry feature toggles)
/*                 → NotInstalledPage (buildable-but-excluded) or NotFoundPage
```

- Each app subtree mounts inside `<PillarGuard pillarId>` so the subtree
  degrades to `PillarUnavailableRoute` when the owning pillar reports
  `unavailable` — without touching the rest of the shell.
- The catch-all distinguishes a **buildable-but-excluded** module (first path
  segment in `KNOWN_MODULES` → `NotInstalledPage`) from a genuinely unknown
  path (`NotFoundPage`). Both render inside the shell layout — nav stays
  visible.
- The root route's `errorElement` catches React Router errors (e.g. lazy-load
  failures) and renders the shell error page, not a React crash screen.
- App routes are lazy-loaded via `React.lazy()`; each app pillar is a separate
  chunk, loaded on navigation.

## Provider stack

```tsx
<QueryClientProvider client={queryClient}>
  {' '}
  // TanStack Query
  <PillarSdkProvider>
    {' '}
    // @pops/pillar-sdk/react
    <BootRegistryProvider value={bootRegistry}>
      {' '}
      // boot-resolved install set
      <PillarStatusProvider>
        {' '}
        // post-mount pillar health
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </PillarStatusProvider>
    </BootRegistryProvider>
    <ReactQueryDevtools /> // omitted under E2E
    <Toaster />
  </PillarSdkProvider>
</QueryClientProvider>
```

There is **no tRPC provider**. App pillars never import other app pillars;
cross-pillar reads go through the REST API via `@pops/pillar-sdk`'s `pillar()`,
and shared UI state through `@pops/ui` / shared stores. A `QueryCache` /
`MutationCache` `onError` surfaces a single "couldn't reach the server" toast
only for genuine network failures — server 4xx/5xx keep their per-feature
handling.

## Backend access — REST over Hey API

The shell is a cross-pillar consumer of the **registry** pillar
(`settings.*`, `shell.manifest`, `features.*`). It uses a generated Hey API
fetch client (`@hey-api/openapi-ts` against the published `@pops/registry/openapi`
contract) at `src/registry-api/`, posting to the `/registry-api` proxy prefix.
`unwrap()` turns a Hey API `{ data, error, response }` result into its payload,
throwing `RegistryApiError` carrying the HTTP status (404 → not-found,
no-status/5xx → unavailable). The boot health/registry fetches hit
`/pillars` and `/pillars/health` on the registry pillar.

## nginx reverse proxy

`nginx.conf` is **generated** by `scripts/generate-nginx-conf.ts` (drift-tested
against the committed file) — never hand-edited. It:

- serves the static SPA, `index.html` fallback for client routes, immutable
  caching for `/assets/`;
- emits one `location /<pillar>-api/ { … }` block per pillar that strips the
  `/<pillar>-api` prefix and proxies to the pillar container
  (`http://<pillar>-api:<port>`);
- proxies `/orchestrator-api/search` to the federated-search orchestrator;
- uses **variable-form** `proxy_pass` with a docker resolver so the shell boots
  even when an optional pillar container is absent (calls 502 until present).

The generator runs **static** at image-build time (reproducible, from
`@pops/pillar-sdk`'s `PILLARS`) and **dynamic** (`--dynamic`) at boot inside the
cluster (from the live registry), so newly-registered external pillars pick up
routing without a fresh image. A long-lived watcher subscribes to the
registry's SSE stream and re-renders + validates (`nginx -t`) + reloads on each
registration event.

## Layout & scroll

- **Fixed chrome.** The top bar and app rail / page nav stay fixed; only the
  `<main>` content scrolls. No ancestor of the fixed chrome may apply overflow
  containment.
- **Responsive.** Desktop (≥1024px): app rail + page nav push content. Tablet
  (768–1023px): rail visible, page nav as overlay. Mobile (<768px): hamburger
  opens an overlay sidebar with all pages.
- **Content error boundary.** `<main>` wraps the active route in an
  `ErrorBoundary` so a crash in one page degrades to a fallback, not a blank
  shell.

### Page-level navigation

Pages fall into two categories that drive a standard header pattern (the
`PageHeader` / breadcrumb components live in `@pops/ui`, consumed by app pages):

| Category       | Accessed via           | Back button          | Breadcrumb |
| -------------- | ---------------------- | -------------------- | ---------- |
| **Top-level**  | rail / page-nav link   | No                   | No         |
| **Drill-down** | link from another page | Yes (logical parent) | Yes        |

Drill-down headers render `ArrowLeft` (navigates to the **logical parent**, not
`history.back()`) → breadcrumb trail → title. Breadcrumb segments are clickable
links except the current page; a consistent separator; middle segments collapse
to `…` on mobile with first and last always shown. Back navigation never sits at
the bottom of a page.

## Business rules

- App pillars never know the shell's layout internals — they provide pages, the
  shell wraps them.
- All app routes are namespaced under `/<pillarId>`.
- The registry snapshot (or the static floor) is the **single source** of which
  pillars mount and what the rail shows — no hardcoded module/nav lists.
- App pillars depend on `@pops/ui` and shared libs, **never** on other app
  pillars; cross-pillar communication goes through the REST API.
- Shell chrome never scrolls with content.
- The shell never bricks on a registry outage or one pillar going down.

## Edge cases

| Case                                                        | Behaviour                                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Registry unreachable / empty / all-backend-only at boot     | Mount the static bundle-map floor (`POPS_APPS`-narrowed)                          |
| Boot resolution throws despite its no-throw contract        | `main.tsx` `.catch` mounts the static floor anyway                                |
| One pillar reports `unavailable` post-mount                 | Only that pillar's routes show `PillarUnavailableRoute`; rest of shell unaffected |
| Pillar status `unknown` (still booting)                     | Treated as healthy — no placeholder flash                                         |
| External pillar's remote bundle fails to load on navigation | Per-route `ErrorBoundary` shows "interface could not be loaded"; shell intact     |
| External pillar advertises a bad descriptor at walk time    | Logged once, pillar's UI skipped; shell boots                                     |
| First path segment is a buildable-but-excluded module       | `NotInstalledPage` within shell layout                                            |
| Genuinely unknown path                                      | `NotFoundPage` within shell layout — nav visible                                  |
| Lazy-load failure (network error) on an in-repo route       | Root `errorElement` renders the shell error page                                  |
| App has no `color` declared                                 | Accent falls back to `--primary`                                                  |

## Acceptance criteria

Scaffold + providers (folded from us-01):

- [x] `pillars/shell` builds and serves app pages via Vite; `dist/` is one
      bundle with per-app code-split chunks.
- [x] Entry point (`main.tsx`) mounts the app inside an `ErrorBoundary` so a
      render-time crash degrades to a fallback frame, never a blank page.
- [x] Provider stack is TanStack Query + `PillarSdkProvider` +
      `BootRegistryProvider` + `PillarStatusProvider` + router — **no tRPC
      provider**.

Layout (folded from us-02):

- [x] `RootLayout` renders top bar + two-level nav + content `<main>` with an
      error boundary around the `<Outlet />`.
- [x] Top bar and rail/page-nav stay fixed; only `<main>` scrolls.
- [x] Layout adapts across desktop / tablet / mobile breakpoints.

Page-level navigation (folded from us-04):

- [x] Drill-down pages render `ArrowLeft` (logical parent) → breadcrumb trail →
      title via the shared `@pops/ui` `PageHeader` / breadcrumb components.
- [x] Breadcrumb segments are links except the current page; consistent
      separator; middle segments collapse to `…` on mobile, first and last always
      visible.
- [x] Top-level pages show neither back button nor breadcrumbs; back navigation
      is never at the bottom of a page.

Routing (folded from us-03):

- [x] The router is built from the boot-resolved manifest set, not a build-time
      module constant.
- [x] Each app subtree mounts under `/<pillarId>/*` and is lazy-loaded.
- [x] Each app subtree is wrapped in `PillarGuard` keyed to its owning pillar.
- [x] Catch-all renders `NotInstalledPage` for a buildable-but-excluded module
      and `NotFoundPage` for an unknown path, both inside the shell layout.
- [x] Root `errorElement` catches router/lazy-load errors and renders the shell
      error page, not a React crash screen.
- [x] `/` redirects to the first live app (lowest `nav.order`), or `/settings`
      when no app is installed.

Backend access (folded from us-05 — REST cutover):

- [x] The shell reaches the registry pillar through a generated Hey API fetch
      client posting to the `/registry-api` proxy prefix — no tRPC client.
- [x] `unwrap()` surfaces HTTP status so callers reproduce not-found (404) vs.
      unavailable (no-status/5xx) UX.
- [x] App pillars access shared state through `@pops/ui` / shared libs and
      cross-pillar data through `@pops/pillar-sdk`'s `pillar()`; an app pillar never
      imports another app pillar.
