# Epic 06: Discovery-based search registry

> Theme: [Pillar finale](../README.md)

## Scope

Replace `apps/pops-api/src/modules/search-adapters.ts` (a build-time `ADAPTER_BINDINGS` array) with a runtime registry-driven federated search.

Each pillar's manifest declares its search adapters: `{ entity, queryShape, scope }`. The search orchestrator reads the live registry at request time and fans out to whichever adapters are currently registered. A pillar going down → its adapters vanish from the next query; results come back from the still-live pillars only.

Open design question: cross-pillar relevance scoring. Each pillar returns its own scored results; the orchestrator merges. Initial strategy: weighted-sum with per-pillar weights configurable in core.db.settings. Refine if it turns out to matter.

## PRDs

| #   | PRD                          | Summary                                                                  | Status      |
| --- | ---------------------------- | ------------------------------------------------------------------------ | ----------- |
| 196 | Search adapter manifest      | What a pillar declares in its manifest; types + Zod schema               | Not started |
| 197 | Federated query orchestrator | Fan-out, timeout, partial-failure handling                               | Not started |
| 198 | Ranking strategy             | Per-pillar weights, merge algorithm, fallback when one pillar times out  | Not started |
| 199 | Partial-failure semantics    | Surface to caller: "got 4/5 pillar responses; results may be incomplete" | Not started |

## Dependencies

- **Requires:** Epic 02 (registry), Epic 05 (SDK for fan-out)
- **Unlocks:** Deletion of `apps/pops-api/src/modules/search-adapters.ts` and its build-time `ADAPTER_BINDINGS`

## Out of Scope

- Search relevance ML / learned ranking — initial weighted-sum is enough; revisit if needed
- A separate `pops-search-api` container — defer that to ADR-029 / Epic 08b
- Cross-language search (only TypeScript pillars exist today)
