# Epic 08b: Cross-pillar code placement

> Theme: [Pillar finale](../README.md)

## Scope

The hard architectural call: decide per-concern where the genuinely cross-pillar code lives. ADR-029 captures the decision matrix; each PRD here implements the relocation.

**The candidates (verified cross-pillar by data flow + caller graph):**

- **Search orchestrator** — federated query across entities, transactions, items, movies, tvShows. Currently `apps/pops-api/src/modules/search-adapters.ts`.
- **AI Ops orchestrator** — model selection, budget enforcement, usage cache, prompt-template registry. Currently `core/ai-usage` + `ai.*` router on pops-api.
- **`pops-worker`** — BullMQ consumer. Plex sync (media), \*arr ingest (media), AI categorisation (finance), image downloads (multiple).
- **URI dispatcher** — routes `pops:<pillar>/<entity>/<id>` to the right resolver. Currently partially pops-api, partially cerebrum-api.

**Options per concern (each may pick a different one):**

- **A — Stay on a renamed `pops-platform-api`**: residual monolith becomes the platform-services plane. Honest about what it does. Limits the "stop a container, capability disappears" goal because the platform plane stays load-bearing.
- **B — New per-concern container**: `pops-search-api`, `pops-ai-api`, etc. Each is small and well-scoped.
- **C — Distribute via the registry**: search becomes pure fan-out, no central orchestrator. Highest isolation, most coordination cost.

Recommendation per the theme README: separate concerns (B). `pops-search-api`, `pops-ai-api` stand up as orchestrators; URI dispatcher folds into the registry; `pops-worker` stays but its in-process DB writes change to SDK calls.

## PRDs

| #   | PRD                            | Summary                                                                                 | Status                                                                                                     |
| --- | ------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 207 | ADR-029 decision matrix        | The per-concern decision; this PRD captures the rationale and writes the ADR            | Not started                                                                                                |
| 208 | Search orchestrator relocation | Implement whichever option ADR-029 picked for search                                    | Not started                                                                                                |
| 209 | AI Ops orchestrator relocation | Same for AI                                                                             | Not started                                                                                                |
| 210 | Worker partitioning audit      | Worker calls become SDK calls; remove in-process DB access; or split worker per concern | Partial (audit done — only `pops-worker-food` exists and is already SDK-partitioned; no migration backlog) |
| 211 | URI dispatcher relocation      | Fold dispatcher into registry; pillar-specific resolvers stay co-located                | Not started                                                                                                |

## Dependencies

- **Requires:** Epic 05 (SDK), Epic 06 (search registry), Epic 07 (AI registry), ADR-029
- **Unlocks:** Epic 09 (drop pops.db genuinely possible once no cross-pillar code reaches into pops.db)

## Out of Scope

- Renaming the pops-api repo/image/service if "Option A" wins — leave that as a separate cleanup
- Reorganising `pops-worker`'s job system itself (BullMQ stays); only its DB access changes
- Multi-stage AI workflows (chained tool calls) — those are an existing concern
