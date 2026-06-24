# Orchestrator

`@pops/orchestrator` is the cross-pillar aggregator service. It listens on port **3009**, owns **no database**, and is fully **stateless**: every response is derived from the live registry snapshot and from fan-out calls to other pillars over the pillar SDK (`@pops/pillar-sdk` `pillar()`, REST transport).

It exists because two capabilities are inherently cross-pillar and have no single owning domain:

| Capability           | Surface         | What it does                                                                                                                                                                                                                                                   |
| -------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Federated search** | `POST /search`  | Discovers every search-capable pillar from the registry, fans one query out to each pillar's `/search` in parallel, then merges + ranks + decorates the per-pillar results into sections. Best-effort: a down pillar is dropped, never fails the whole search. |
| **AI-tool registry** | `GET /ai/tools` | Projects each registered, healthy pillar's `ai.tools` manifest dimension into a single flat tool list the AI loop can route against.                                                                                                                           |

It also serves the operational basics every pillar has — a liveness probe and a self-aware federation view of the fleet:

| Surface        | What it does                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`  | Pure liveness shape (`{ ok, status, service, version, ts }`). No DB round-trip — there is no DB.                                               |
| `GET /pillars` | Registry-first view of the fleet (live snapshot leads, `POPS_PILLARS` seed backfills), prepended with the synthetic `orchestrator` self-entry. |

## How it discovers pillars

The orchestrator never carries a static, compiled list of pillars. Membership is resolved **per request** from the registry pillar (`registry`, :3001) via the SDK discovery client (TTL-cached). A pillar appears in a given surface purely by advertising the matching capability in its manifest:

- **Federated search** includes a pillar iff it is registered, healthy, and its manifest declares a non-empty `search.adapters` slot.
- **AI-tool registry** includes a pillar iff it is registered, healthy, and its manifest declares `ai.tools` descriptors.

Adding a new search-capable or AI-callable pillar requires **no orchestrator change**: it registers, advertises the capability dimension, and is picked up on the next discovery refresh.

When the registry is unreachable, each surface degrades to its safe empty result (empty sections / empty tool list) rather than throwing. `GET /pillars` additionally falls back to the `POPS_PILLARS` boot seed so the federation view survives a cold start.

## Stateless by design

The orchestrator holds no domain state of its own. The only state it touches is the registry snapshot (read through the shared discovery cache) and the per-request fan-out results. It registers itself with the registry on boot like any pillar (opt-in via `POPS_REGISTRY_ENABLED`) so the fleet sees it, but its own manifest declares **empty** `routes`, `search`, `ai`, and `uri` dimensions — it is an aggregator, not a domain owner.

## Cross-cutting framework

The reusable cross-pillar machinery — the federated-query runner, the cross-pillar ranking strategy, partial-failure semantics, the AI-tool manifest projection, and tool-call routing — lives in `@pops/pillar-sdk` and is specified centrally under the pillar-finale federation theme. This pillar **hosts** those primitives on an HTTP surface; it does not reimplement them. See:

- [search-adapter-manifest](../../../docs/themes/federation/prds/search-adapter-manifest/README.md)
- [federated-query-orchestrator](../../../docs/themes/federation/prds/federated-query-orchestrator/README.md)
- [ranking-strategy](../../../docs/themes/federation/prds/ranking-strategy/README.md)
- [partial-failure-semantics](../../../docs/themes/federation/prds/partial-failure-semantics/README.md)
- [ai-tool-manifest](../../../docs/themes/federation/prds/ai-tool-manifest/README.md)
- [dynamic-tool-list](../../../docs/themes/federation/prds/dynamic-tool-list/README.md)
- [tool-call-routing](../../../docs/themes/federation/prds/tool-call-routing/README.md)

## PRDs

| PRD                                                 | Scope                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [service-runtime](prds/service-runtime/README.md)   | The container: ports, boot, registry self-registration, `/health`, `/pillars`, partial-failure stance. |
| [federated-search](prds/federated-search/README.md) | `POST /search` — registry-driven fan-out, merge/rank, section decoration, per-pillar best-effort.      |
| [ai-tool-registry](prds/ai-tool-registry/README.md) | `GET /ai/tools` — manifest projection onto an HTTP surface, degraded-empty stance.                     |

</content>
</invoke>
