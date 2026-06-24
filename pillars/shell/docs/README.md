# @pops/shell — UI pillar

The shell is the SPA host for POPS. It owns no data, exposes no resource
routes, and ships an empty contract manifest. It is the one **UI pillar** in
the federation: a single static React/Vite SPA, served behind nginx, that
mounts every app pillar's frontend, draws the global chrome (top bar, app
rail, page nav, search, overlays), and reverse-proxies browser traffic to the
data pillars.

## What it is

- **React SPA host.** One static Vite bundle. Every in-repo app pillar's
  frontend (`@pops/app-finance`, `@pops/app-media`, …) compiles into this
  bundle via the workspace bundle map and is mounted lazily under
  `/<pillarId>/*` through `React.lazy()` + `<Suspense>`.
- **nginx reverse proxy.** The production image is `nginx:alpine`. It serves
  the SPA, falls back to `index.html` for client routes, and proxies
  `/<pillar>-api/...` to each pillar container (stripping the prefix so the
  pillar's own REST router sees its natural paths). `/orchestrator-api/search`
  reaches the federated-search orchestrator.
- **registry-driven.** The shell holds no static, compiled list of which
  pillars exist. At boot it fetches the live registry snapshot and resolves it
  into the install set that drives the router, app rail, page nav, and index
  redirect. The registry is the source of truth for which surfaces mount.
- **REST clients, not tRPC.** The shell consumes the registry pillar's surface
  (`settings.*`, `shell.manifest`, `features.*`) through a generated Hey API
  fetch client (`@hey-api/openapi-ts` against `@pops/registry/openapi`),
  posting to the `/registry-api` proxy prefix. Cross-pillar reads done in app
  code use `@pops/pillar-sdk`'s `pillar()`. There is no tRPC anywhere.

## How a pillar's UI reaches the shell

| Pillar kind      | Discovery                                                                         | UI source                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **In-repo**      | registry snapshot id resolves against the workspace bundle map (`bundle-map.tsx`) | statically bundled — `manifest.frontend.{routes,navConfig,captureOverlay}`                                          |
| **External**     | registry advertises `assetsBaseUrl` + wire `nav`/`pages` descriptors              | runtime `import()` of the remote ESM bundle, resolved per `PageDescriptor.bundleSlot`, wrapped in an error boundary |
| **Backend-only** | registry entry with no bundle-map hit and no `assetsBaseUrl`                      | dropped — contributes no UI                                                                                         |

Adding an in-repo pillar is one entry in `bundle-map.tsx`. External pillars
need no shell rebuild: their nav renders synchronously off the wire and their
pages lazy-load on first navigation.

## Resilience — never brick the shell

Two independent soft-fallbacks keep the shell usable when the federation is
degraded:

- **Boot fallback (registry unreachable).** `fetchBootRegistry()` never throws.
  An unreachable, slow, empty, or all-backend-only registry snapshot resolves
  to the **static bundle-map floor** — the in-repo app set narrowed by the
  operator's `POPS_APPS` selection — so the shell always mounts a working app
  surface. A boot splash shows only while the (LAN-local, sub-100ms) snapshot
  resolves.
- **Per-pillar fallback (`PillarGuard`).** Post-mount, the shell aggregates
  pillar health from the registry. When one pillar reports `unavailable`, only
  **that pillar's** route subtree degrades to a retry placeholder
  (`PillarUnavailableRoute`). `healthy` and `unknown` (still booting) both
  render normally — a slow probe never flashes placeholders over working
  routes, and one sick pillar never takes down the shell.

## Docs

| PRD                                                                         | Scope                                                                            |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [shell](prds/shell/README.md)                                               | SPA host, provider stack, registry-driven routing, layout/scroll, error handling |
| [app-switcher](prds/app-switcher/README.md)                                 | Two-level navigation: app rail + page nav, registry-driven                       |
| [app-theme-colour-propagation](prds/app-theme-colour-propagation/README.md) | Active-app accent colour propagation via CSS cascade                             |
| [search-ui](prds/search-ui/README.md)                                       | Top-bar search, federated results panel, result-component registry               |
| [contextual-intelligence](prds/contextual-intelligence/README.md)           | Shell-tracked `AppContext` consumed by search and overlays                       |

The package technical readme (`../README.md`) documents UI-pillar
registration and the event-driven nginx reload watcher.
