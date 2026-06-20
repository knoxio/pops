# PRD-255: Production registry-driven nginx (deploy boot-render + watcher)

> Epic: [Central registry](../../epics/02-central-registry.md)
>
> Status: Not started

## Overview

[PRD-228](../228-dynamic-pillar-registration/README.md) made the registry the source of truth for
which pillars exist and **built** the dynamic nginx machinery: a registry-fed renderer
(`renderNginxConfDynamic`, PRD-232) and an out-of-process watcher
(`apps/pops-shell/scripts/watch-registry-and-reload.ts`) that re-renders + `nginx -t` + reloads on
registry events — all PRD-228/US-03 acceptance criteria are checked off and e2e-tested. **None of it
runs in production.** The shipped `pops-shell` image (`nginx:alpine`, `Dockerfile:131`) just serves the
committed static `default.conf` (`Dockerfile:122`); the generator and watcher are invoked nowhere
(`infra/docker-compose.yml` `pops-shell` pulls the prebuilt image with no entrypoint, sidecar, or
command). So a pillar that self-registers still gets **no route** until someone hand-edits
`PILLAR_UPSTREAMS` and rebuilds the image — the exact gap PRD-228 was meant to close.

PRD-255 closes the deployment gap and fixes the regression that silently broke the render path: the
render-time registry fetch still targets the **dead** tRPC URL `${base}/trpc/core.registry.list`
(`apps/pops-shell/scripts/nginx-registry-client.ts:58`), but core dropped tRPC during the lake
migration and now serves the snapshot as plain REST `GET /core.registry.list`
(`pillars/core/src/api/app.ts:114`). The dynamic render is therefore broken against current core. This
PRD repoints it (reusing the SDK's `HttpDiscoveryTransport` rather than a second hand-rolled client),
then wires boot-render + the watcher into the prod image so routes update with **no rebuild and no
redeploy**.

Scope is **docker-network-only**: the seven in-tree pillars keep their compose `host:port` upstreams;
only externally/registry-discovered pillars route from their advertised `baseUrl`
(`resolveUpstreamForEntry` already does this). Opening upstream resolution for all pillars and remote
FE bundle loading are out of scope — see [ADR-038](../../../../architecture/adr-038-pillar-discovery-protocol.md)
and runbook `06-static-pillar-lists.md`.

## Data Model

No changes. The `pillar_registry` table (PRD-161) and its REST/SSE surface already exist.

## API Surface

No new endpoints. PRD-255 **consumes** existing core surfaces:

| Surface                                                 | Used for                     |
| ------------------------------------------------------- | ---------------------------- |
| `GET /core.registry.list` (REST snapshot, `app.ts:114`) | boot-render + each re-render |
| SSE `GET /registry/subscribe` (`app.ts:108`)            | the watcher's change feed    |

The only client change: the nginx render path reads the snapshot through `@pops/pillar-sdk`'s
`HttpDiscoveryTransport` (`packages/pillar-sdk/src/client/discovery.ts:51`), which already targets
`GET /core.registry.list` and returns the `DiscoveredPillar` shape. The bespoke tRPC client
(`nginx-registry-client.ts`) is deleted.

## Business Rules

- **nginx must always boot.** Boot-render attempts a render from the live registry; on _any_ failure
  (registry unreachable, validation fail, timeout) it falls back to the committed static
  `default.conf`. A registry outage must never prevent the shell from starting.
- **The static conf is a fallback artifact, not the source of truth.** It stays committed and
  drift-checked (so the fallback is honest) — promote the existing `--check` mode (`gen:nginx:check`,
  `nginx-cli-main.ts:24`) into the CI gate rather than relying solely on the Vitest snapshot test.
- **One discovery client.** The render path reuses `HttpDiscoveryTransport`. No second registry client
  in the repo (DRY); `nginx-registry-client.ts` is removed.
- **Known-7 keep docker upstreams (scope concession).** `resolveUpstreamForEntry` resolves in-tree
  pillars to compose `host:port` from `PILLAR_UPSTREAMS`; unknown/registry pillars route from their
  advertised `baseUrl`. Unchanged behaviour for the running system.
- **Reload is already safe.** The watcher's `nginx -t` gate + 250ms debounce + degraded-mode health
  surface (PRD-228/US-03) are reused as-is; PRD-255 only ensures the watcher process is _running_.
- **Reserved-id rule stands.** External pillars cannot register as one of the seven core ids
  (PRD-228); routing inherits that — a `core`/`finance`/… upstream is never sourced from an external
  registration.

## Edge Cases

| Case                                                             | Behaviour                                                                                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry unreachable at container start                          | Boot-render fails → committed static `default.conf` is used → nginx boots normally. Watcher starts and retries the SSE connection; first successful event triggers a re-render. |
| Registry reachable at boot but returns an empty/partial snapshot | Render the known-7 from `PILLAR_UPSTREAMS` regardless (render order covers them); unknown pillars simply absent until they register.                                            |
| Render produces an invalid conf mid-run                          | `nginx -t` rejects it → current conf stays, `nginx_generator_last_error_at` set (existing behaviour). No bad reload.                                                            |
| SSE connection drops                                             | Watcher reconnects; on reconnect it re-renders from a fresh snapshot to catch missed events (reconciliation).                                                                   |
| Pillar registers then dies without deregistering                 | PRD-162/228 eviction flips it `unavailable` then removes it; the resulting registry event re-renders and the route drops on reload.                                             |
| Two render triggers in the same debounce window                  | Collapse to one render + one reload (existing 250ms debounce).                                                                                                                  |

## User Stories

| #   | Story                                                                           | Summary                                                                                                                                                | Parallelisable           |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| 01  | [us-01-repoint-registry-fetch-to-rest](us-01-repoint-registry-fetch-to-rest.md) | Delete the hand-rolled tRPC client; render path reads `GET /core.registry.list` via the SDK `HttpDiscoveryTransport`. Fixes the broken dynamic render. | Yes — foundational       |
| 02  | [us-02-boot-render-entrypoint](us-02-boot-render-entrypoint.md)                 | Image entrypoint renders the conf from the registry at start; falls back to the committed static conf on any failure so nginx always boots.            | Blocked by us-01         |
| 03  | [us-03-watcher-process-and-compose](us-03-watcher-process-and-compose.md)       | Run `watch-registry-and-reload` as a managed process alongside nginx in the prod image; wire `POPS_REGISTRY_URL` / health port in compose.             | Blocked by us-01         |
| 04  | [us-04-e2e-self-register-routes](us-04-e2e-self-register-routes.md)             | E2E: boot the shell against a registry, self-register a synthetic pillar, assert it routes with no rebuild; registry-down → static fallback boots.     | Blocked by us-02 + us-03 |

## Out of Scope

- **Upstream-from-`baseUrl` for the known 7.** Docker-network `host:port` stays for in-tree pillars; opening all upstreams to the registry's advertised address is a later phase ([ADR-038](../../../../architecture/adr-038-pillar-discovery-protocol.md)).
- **Remote FE bundle loading.** A discovered pillar gets a backend route; surfacing its UI is [PRD-243](../243-registry-driven-shell-ui/README.md) (in-repo) + its US-05 successor (external).
- **The LAN discovery transport / toggle.** MQTT/mDNS transport and the "turn discovery on" switch are [ADR-038](../../../../architecture/adr-038-pillar-discovery-protocol.md) + a successor PRD.
- **Opening the pillar-id type.** The `KnownPillarId` → open `PillarId` change routing needs to accept unknown ids cleanly is [PRD-256](../256-two-tier-pillar-id/README.md). PRD-255 routes unknown ids through the existing `resolveUpstreamForEntry` string path; PRD-256 makes the types honest.
