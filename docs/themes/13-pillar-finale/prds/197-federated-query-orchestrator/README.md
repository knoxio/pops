# PRD-197: Federated query orchestrator

> Epic: [Search registry](../../epics/06-search-registry.md)

## Overview

The runtime search orchestrator: reads the registry, fans out queries to each matching pillar's search adapter via the `pillar()` SDK, merges results, returns a unified `SearchResult[]`. Replaces the hand-rolled `apps/pops-api/src/modules/search-adapters.ts` build-time registry.

## Data Model

No persistent data.

## API Surface

```ts
// pops-search-api (new container per ADR-029) or pops-api (interim)

export async function search(query: {
  text?: string;
  tags?: string[];
  dateRange?: { from: Date; to: Date };
  scope?: Record<string, string>;
  pillars?: string[]; // optional — defaults to all
  limit?: number;
}): Promise<SearchResult[]>;
```

Internally:

1. Snapshot the registry; collect every pillar whose manifest advertises
   at least one entry under `manifest.search.adapters`.
2. Fan out to each `(pillarId, adapterName)` pair via the injected
   `SearchAdapterInvoker` (in production resolved to
   `pillar('<id>').<router>.<proc>({...})`).
3. Each adapter returns scored results, or `[]` if the query is
   unsupported by that adapter.
4. Merge via ranking strategy (PRD-198).
5. Return top-N.

**Interim limitation — query-shape pre-filtering (PRD-196).** The shipped
orchestrator does **not** filter adapters by query shape. The current
manifest's `search.adapters` field is `readonly string[]` — adapter
names only — so the orchestrator cannot know which dimensions
(`text` / `tags` / `dateRange` / `scope`) an adapter advertises. Every
adapter on every selected pillar is invoked unconditionally; each
adapter must return `[]` for queries it does not support. Once PRD-196
lands the richer adapter descriptor (`procedurePath`, `queryShape`,
`entityType`, `rankFieldName`), the pre-filter belongs in
`runFederatedSearch` so adapters do not pay the parse-and-reject cost.

## Business Rules

- **Adapters are queried in parallel.** `Promise.allSettled` for partial-failure tolerance.
- **Per-adapter timeout 3s.** Slow adapters drop out; partial result returned with a warning.
- **Empty queries (no text/tags/dateRange) are rejected with 400.** No "list everything" via search.
- **Result deduplication is per-pillar.** Adapters control their own dedupe; cross-pillar dupes are rare (different entity types).

## Edge Cases

| Case                                   | Behaviour                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------- |
| One pillar adapter throws              | Logged; other results returned; PRD-199 partial-failure surfacing applies. |
| All pillars timeout                    | Return empty with partial-failure marker.                                  |
| Query targets a pillar not in registry | Excluded; other pillars searched.                                          |

## User Stories

| #   | Story                                                                   | Summary                                                     |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| 01  | [us-01-orchestrator-impl](us-01-orchestrator-impl.md)                   | Core orchestrator: registry read + fan-out + merge          |
| 02  | [us-02-timeouts-partial-failure](us-02-timeouts-partial-failure.md)     | Per-adapter timeout + Promise.allSettled                    |
| 03  | [us-03-deprecate-adapter-bindings](us-03-deprecate-adapter-bindings.md) | Delete `apps/pops-api/src/modules/search-adapters.ts`       |
| 04  | [us-04-tests](us-04-tests.md)                                           | Federated search tests against multiple registered fixtures |

## Out of Scope

- Ranking algorithm (PRD-198).
- Caching of search results (separate concern).
- Saved searches (existing surface).
