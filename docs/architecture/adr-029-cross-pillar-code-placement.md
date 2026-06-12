# ADR-029: Cross-pillar code placement

## Status

Proposed (Theme 13, Epic 08b)

## Context

After Theme 12 and Theme 13's Epic 08a (reclaim misnamed finance code), the genuinely cross-pillar code on pops-api is much smaller than originally framed. The remaining candidates:

- **Search orchestrator** — federates queries across entities, transactions, items, movies, tvShows. Today: `apps/pops-api/src/modules/search-adapters.ts` build-time registry.
- **AI Ops orchestrator** — model selection, budget enforcement, usage cache, prompt-template registry. Today: `core/ai-usage` + `ai.*` router on pops-api.
- **`pops-worker`** — BullMQ consumer. Plex sync writes media; \*arr ingest writes media; AI categorisation writes finance; image downloads write multiple.
- **URI dispatcher** — routes `pops:<pillar>/<entity>/<id>` to the right resolver. Today: partially pops-api, partially cerebrum-api.

Each has a different shape; one-size-fits-all is wrong.

## Options Considered (per concern)

| Option                                                                    | Search                                                    | AI Ops                                                                              | Worker                                                 | URI dispatcher                                                |
| ------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| **A — Stay on a renamed `pops-platform-api`**                             | viable                                                    | viable                                                                              | natural fit (worker is already its own service)        | viable but a bit odd to put dispatcher logic here             |
| **B — New per-concern container (e.g. `pops-search-api`, `pops-ai-api`)** | clean isolation; right-sized                              | clean isolation; right-sized                                                        | overkill — worker is already separate                  | tiny — probably collapses into the registry                   |
| **C — Distribute via the registry (no central orchestrator)**             | each pillar exposes its own search slice; consumer merges | each pillar exposes its own AI tools; consumer composes; harder for budget tracking | mostly N/A — worker is a producer, not an orchestrator | natural fit — registry tells consumers where to dispatch URIs |

## Decision

**Per concern:**

- **Search → B (new `pops-search-api`)**. Federation needs an orchestrator; the orchestrator wants its own container scope. Independent scaling, observability, and isolation are wins.
- **AI Ops → B (new `pops-ai-api`)**. Budget enforcement + usage cache + prompt registry are shared services that benefit from a single home. Right-sized container.
- **Worker → A (stays as `pops-worker`)**. Worker is already independent; its DB access just changes from in-process drizzle imports to `pillar()` SDK calls.
- **URI dispatcher → C (folds into the registry)**. The registry knows which pillar resolves which URI types; consumers query it and call the pillar directly. No central dispatcher service needed.

## Consequences

- ✅ Each cross-pillar concern has a clear, right-sized home
- ✅ pops-api can either be fully retired or shrink to a thin shell of legacy-compatibility shims (decided in a follow-up)
- ✅ `pops-search-api` and `pops-ai-api` become natural orchestrators that depend on every contract package, NOT on every runtime package — preserves contract discipline
- ❌ Two new containers (search-api, ai-api) to maintain
- ❌ Worker calls become HTTP instead of in-process — latency hit on per-job DB writes. Mitigation: most workers write to a single pillar per job; the SDK's connection pooling keeps overhead low.
- ❌ URI dispatcher logic distributed across pillars — slightly harder to debug "why didn't this URI resolve?" Mitigation: registry exposes `pillar_id → uri_types_handled` mapping clearly.
