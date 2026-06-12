# Epic 02: Central registry on `pops-core-api`

> Theme: [Pillar finale](../README.md)

## Scope

core-api becomes the runtime directory (not the gateway). Endpoints:

- `core.registry.register(manifest)` — pillars POST their manifest on boot
- `core.registry.heartbeat(pillarId)` — every 10s; missing 3 in a row marks the pillar `unavailable`
- `core.registry.snapshot()` — consumers GET the union of registered manifests + live health
- `core.registry.subscribe()` — SSE/long-poll for cache invalidation on consumer side

Persistence: registry state in `core.db.pillar_registry`. Reconciliation: on core-api restart, all entries start `unknown` until they re-register or a deadline passes.

The registry is the source of truth for _what's running and what it can do_. Consumers — search, AI, FE, nginx dispatcher generator, sibling pillars — all read from here.

## PRDs

| #   | PRD                                | Summary                                                                         | Status      |
| --- | ---------------------------------- | ------------------------------------------------------------------------------- | ----------- |
| 161 | Registry schema + endpoints        | `pillar_registry` table, register/heartbeat/snapshot/subscribe routes           | Not started |
| 162 | Heartbeat lifecycle                | TTL semantics, missed-heartbeat → unavailable transition, recovery on reconnect | Not started |
| 163 | Subscription model                 | SSE channel for change notifications; consumers invalidate caches on receive    | Not started |
| 164 | Reconciliation on core-api restart | Initial `unknown` state, grace window, eventually-consistent recovery           | Not started |

## Dependencies

- **Requires:** Epic 00 (contract packages — the registry serves contract versions per pillar), Epic 01 (SDK provides the `register` + `heartbeat` client side), ADR-027 (registry shape)
- **Unlocks:** Epic 05 (consumption SDK can route via registry), Epic 06 + 07 (search + AI read registry to discover capabilities), Epic 10 (nginx dispatcher generated from registry)

## Out of Scope

- Routing requests through core-api — the registry is a directory, not a proxy. Callers look up the baseUrl and call the pillar directly.
- Service mesh features: retries, circuit breaking, load balancing. Keep this simple.
- Multi-instance pillars (more than one container per pillar id) — single-instance is the operating assumption.
