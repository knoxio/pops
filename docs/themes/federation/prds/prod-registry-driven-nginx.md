# Production registry-driven nginx

> Theme: [Federation](../README.md) · Area: Shell + dispatch
>
> Status: Done — boot-render + watcher run in the production `pops-shell` image; a self-registered pillar is routable on the next boot and every subsequent registry event reloads routes with no rebuild. Deployed-topology container e2e is deferred ([idea](../../../ideas/prod-registry-driven-nginx.md)).

## Overview

The registry pillar is the source of truth for which pillars exist. The `pops-shell` nginx image turns
that truth into live reverse-proxy routes: it renders one `/<pillar>-api/` block per registered pillar
**from the registry at container start**, then keeps the rendered config in sync as pillars register and
deregister — without a rebuild, redeploy, or hand-edit.

A pillar that self-registers with the registry (`POST /registry/register`) becomes routable on the next
shell boot, and any later registration/deregistration reloads routes in-place through the watcher. A
registry outage never prevents the shell from starting: boot-render falls back to a committed static
config that always carries the in-tree pillars.

Scope is **docker-network-only**. The in-tree pillars keep their compose `host:port` upstreams from a
baked `PILLAR_UPSTREAMS` map; only externally/registry-discovered pillars route from their advertised
`baseUrl`. Opening upstream resolution for the in-tree set and remote frontend-bundle loading are out of
scope — see [ADR-038](../../../architecture/adr-038-pillar-discovery-protocol.md).

## Data Model

No new tables. The shell consumes the registry's existing `pillar_registry` snapshot. The render path
maps each registry entry to an upstream:

| Field      | Source                                  | Used for                                          |
| ---------- | --------------------------------------- | ------------------------------------------------- |
| `pillarId` | registry snapshot entry                 | the `/<pillarId>-api/` location + nginx var name  |
| `baseUrl`  | registry snapshot entry                 | upstream `host:port` for **unknown** pillars only |
| upstream   | baked `PILLAR_UPSTREAMS` (in-tree only) | `host:port` for the curated pillar set            |

The curated in-tree upstream map (`PILLAR_UPSTREAMS`) is the only static list and exists purely so a
known pillar that registers with a `localhost`-shaped `baseUrl` during development cannot break
docker-network routing:

| pillarId  | upstream host | port |
| --------- | ------------- | ---- |
| registry  | registry-api  | 3001 |
| inventory | inventory-api | 3002 |
| media     | media-api     | 3003 |
| finance   | finance-api   | 3004 |
| food      | food-api      | 3005 |
| lists     | lists-api     | 3006 |
| cerebrum  | cerebrum-api  | 3007 |
| ai        | ai-api        | 3008 |
| contacts  | contacts-api  | 3010 |

## API Surface

No new endpoints. The shell **consumes** existing registry surfaces:

| Surface                                                       | Used for                       |
| ------------------------------------------------------------- | ------------------------------ |
| `GET /registry/pillars` (canonical snapshot)                  | boot-render + each re-render   |
| `GET /core.registry.list` (legacy dotted alias, same handler) | rolling-deploy compatibility   |
| `GET /registry/subscribe` (SSE)                               | the watcher's change feed      |
| `POST /registry/register` / `/deregister`                     | a pillar driving its own route |

The render path reads the snapshot through `@pops/pillar-sdk`'s `HttpDiscoveryTransport` (the single
discovery client; it returns the `DiscoveredPillar[]` shape). There is no second hand-rolled registry
client in the shell.

The watcher subscribes to the SSE feed and acts on `pillar.registered`, `pillar.deregistered`, and
`pillar.health-changed` frames; it ignores the initial `pillar.snapshot` frame.

## How it works

**Boot-render** (`docker-entrypoint.sh`, runs before nginx):

1. Stage the committed static fallback at the served path (`/etc/nginx/conf.d/default.conf`).
2. Render from the live registry (`render-nginx-conf.mjs --dynamic --registry-url $POPS_REGISTRY_URL`)
   into a temp file, install it, validate with `nginx -t`.
3. On **any** failure (registry unreachable, render error, `nginx -t` rejects the output) restore the
   static fallback and log at warn level. A hard guard re-validates the served conf; if even the static
   fallback fails to validate the container exits loudly rather than serve nothing.

**Watcher** (`watch-registry-and-reload`, runs alongside nginx, supervised):

1. Opens the registry SSE stream; on each watched event, triggers a trailing-debounced (250 ms)
   re-render.
2. Re-render writes to the served conf, runs `nginx -t`; on pass promotes the served conf to
   last-known-good and runs `nginx -s reload` against the running master; on fail restores
   last-known-good and skips the reload, flipping the watcher health surface to degraded.

**Supervision**: the entrypoint runs nginx and the watcher as children and polls both (strict POSIX —
no `wait -n`). A signal-driven shutdown (`docker stop`, Watchtower update) is a clean exit (0). If
either child dies on its own, the other is torn down and the container exits non-zero so the
orchestrator restarts it — no silent half-dead state.

**Image / compose wiring**: the Dockerfile bundles the render + watcher CLIs to standalone ESM
(`esbuild`, `@pops/pillar-sdk` inlined) so a bare `node` runs them with no `node_modules`; it stages the
static conf under `/etc/nginx/fallback/` and at the served path, installs the shared
`_pillar-proxy.conf` snippet under `/etc/nginx/snippets/`, and sets the supervising entrypoint. Compose
sets `POPS_REGISTRY_URL` (default `http://registry-api:3001`) and `POPS_NGINX_HEALTH_PORT: 9090`
(internal-only).

## Business Rules

- **nginx must always boot.** A registry outage at start falls back to the committed static conf; the
  shell starts regardless. The static fallback always carries the in-tree pillars.
- **The static conf is a fallback artifact, not the source of truth.** It stays committed and is
  drift-checked in CI via `gen:nginx:check` (`fe-quality.yml`), so the fallback is never stale.
- **One discovery client.** The render path reuses `HttpDiscoveryTransport`; no second registry client
  in the shell.
- **Registry-URL precedence.** `POPS_REGISTRY_URL` wins (repo-wide convention), then the deprecated
  `CORE_REGISTRY_URL`, then the `http://registry-api:3001` default.
- **In-tree pillars keep docker upstreams.** Curated pillars resolve to `PILLAR_UPSTREAMS` `host:port`
  even when the registry advertises a different `baseUrl`; only unknown/registry pillars route from
  their `baseUrl`.
- **Reload is safe.** The `nginx -t` gate + 250 ms debounce + last-known-good restore mean a bad render
  can never crash the live nginx; the previous conf stays live and health flips to degraded.
- **Empty snapshot is valid.** Zero registered pillars renders a config with no per-pillar blocks; the
  in-tree set is still representable via boot-render's static fallback when the registry is unreachable.

## Edge Cases

| Case                                             | Behaviour                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registry unreachable at container start          | Boot-render fails → committed static conf is served → nginx boots. Watcher starts and retries the SSE connection (exponential backoff, 30 s cap); first successful event re-renders. |
| Static fallback itself fails `nginx -t`          | Hard guard surfaces the `nginx -t` error and exits non-zero — the image is broken, fail loudly.                                                                                      |
| Registry reachable but returns an empty snapshot | Renders zero per-pillar blocks; pillars appear once they register. (Static fallback still carries the in-tree set when registry is down.)                                            |
| Render produces an invalid conf mid-run          | `nginx -t` rejects it → last-known-good restored, reload skipped, watcher health flips to degraded. No bad reload.                                                                   |
| SSE connection drops                             | Watcher reconnects with backoff; reconnection re-renders from a fresh snapshot to catch missed events.                                                                               |
| Pillar registers then dies without deregistering | Registry eviction flips it unavailable then removes it; the resulting event re-renders and the route drops on reload.                                                                |
| Two events in the same debounce window           | Collapse to one render + one reload (250 ms trailing debounce).                                                                                                                      |
| Known pillar registers with a `localhost` URL    | The curated `PILLAR_UPSTREAMS` `host:port` wins; the advertised `baseUrl` is ignored for in-tree pillars.                                                                            |

## Acceptance Criteria

**Repoint the render to REST**

- [x] The render path no longer references `/trpc/core.registry.list`; `rg trpc pillars/shell/scripts`
      returns only test assertions.
- [x] The hand-rolled tRPC registry client is deleted; the dynamic render reads the snapshot through
      `@pops/pillar-sdk`'s `HttpDiscoveryTransport`.
- [x] `renderNginxConfDynamic` consumes the `DiscoveredPillar[]` shape; `resolveUpstreamForEntry` keeps
      in-tree ids on `PILLAR_UPSTREAMS` `host:port` and routes unknown ids from `baseUrl`.
- [x] `gen:nginx:dynamic` against a running registry renders a valid conf including every registered
      pillar (covered by the dynamic-mode generator tests with an injected transport).

**Boot-render with static fallback**

- [x] An entrypoint script runs the dynamic render before nginx starts, writing to the served conf path.
- [x] On any render failure the entrypoint falls back to the committed static conf and nginx boots; the
      fallback is logged at warn level.
- [x] The Dockerfile replaces the bare `CMD` with the entrypoint; the static conf is staged as the
      fallback artifact and the `_pillar-proxy.conf` snippet is installed.
- [x] The static conf is drift-checked in CI via `gen:nginx:check` (`fe-quality.yml`), not only the
      Vitest snapshot.
- [x] Booting with the registry unreachable yields a running nginx serving the in-tree pillars from the
      static fallback (guarded by `docker-entrypoint.test.ts` invariants).
- [x] Booting with the registry reachable yields a conf rendered from the live snapshot.

**Watcher in prod**

- [x] The watcher runs as a managed long-lived process alongside nginx; if either exits, the container
      exits (no silent half-dead state).
- [x] The watcher is configured from env: `POPS_REGISTRY_URL` and `POPS_NGINX_HEALTH_PORT` are set in
      `infra/docker-compose.yml` for `pops-shell`.
- [x] On a registered/deregistered/eviction event the watcher re-renders, runs `nginx -t`, and on pass
      runs `nginx -s reload` against the running master.
- [x] A failed render/validation leaves the live conf in place and flips the watcher health surface to
      degraded.
- [x] Boot-render still produces the initial conf; the watcher takes over for subsequent changes.

**Deployed-topology end-to-end** — deferred, see [idea](../../../ideas/prod-registry-driven-nginx.md)

- [ ] Container e2e: boot the real `pops-shell` image against a registry, `POST /registry/register` a
      synthetic pillar, assert `/<synthetic>-api/...` proxies to its `baseUrl` after the debounce — no
      rebuild, no conf hand-edit.
- [ ] Container e2e: `POST /registry/deregister` the synthetic pillar; subsequent requests to its route
      stop being proxied after the reload settles.
- [ ] Container e2e: registry-down boot serves the static fallback and the in-tree pillars still route.
- [ ] Container e2e: a known pillar routes to its compose `host:port`, not a registry-advertised
      `baseUrl`.

> The shipped tests cover this in-process: a fake SSE registry drives the watcher through
> register/deregister/health-changed cycles asserting render+validate+reload counts and the degraded
> health flip, and static-source guards pin the entrypoint's always-boots/supervision invariants. The
> remaining gap is a real container + real `nginx -s reload` drill.

## Out of Scope

- **Upstream-from-`baseUrl` for in-tree pillars.** Docker-network `host:port` stays for the curated set;
  opening all upstreams to the registry's advertised address is a later phase
  ([ADR-038](../../../architecture/adr-038-pillar-discovery-protocol.md)).
- **Remote frontend-bundle loading.** A discovered pillar gets a backend route; surfacing its UI is a
  separate concern (registry-driven shell UI).
- **The LAN discovery transport / toggle.** MQTT/mDNS transport and the discovery on/off switch are
  [ADR-038](../../../architecture/adr-038-pillar-discovery-protocol.md) and a successor PRD.
