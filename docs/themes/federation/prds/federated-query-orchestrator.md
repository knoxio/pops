# Federated query orchestrator

> Theme: [Federation](../README.md)

## Overview

The runtime federated-search service. It reads the live registry, projects the
set of search-capable pillars, fans a query out to each pillar's `/search`
endpoint over the pillar SDK (REST), decorates every pillar's hits with section
chrome, merges and ranks them into context-ordered sections, and returns a
single `SearchAllResult`. Membership is resolved per request from the registry
snapshot — there is no compiled adapter list. A pillar that goes down simply
stops appearing in the next query; the still-live pillars answer.

The service runs inside the **orchestrator** pillar (`@pops/orchestrator`,
`:3009`) alongside the federated `/pillars` view and the AI-tool registry. It
owns no domain DB. It registers with the registry on boot like any pillar
(opt-in via `POPS_REGISTRY_ENABLED`) but declares an empty `search.adapters`
slot of its own — it aggregates, it is not searchable.

## Data model

None. Federated search is stateless: every request re-reads the registry
snapshot (TTL-cached by the SDK discovery client) and re-derives membership. No
search results, no adapter bindings, and no weights are persisted by the
orchestrator.

## REST surface

`POST /search` on the orchestrator (`:3009`).

Request envelope — wire-identical to each pillar's own `/search`, so the
frontend repoints a single URL without reshaping the request:

```jsonc
{
  "query": {
    "text": "drill",
    "filters": [{ "field": "type", "operator": "eq", "value": "tool" }], // optional
  },
  "context": {
    // optional
    "app": "inventory",
    "page": "items",
    "entity": { "uri": "pops:inventory/123", "type": "item", "title": "Drill" }, // optional
    "filters": { "room": "garage" }, // optional
  },
}
```

Response — `SearchAllResult`:

```ts
interface SearchAllResult {
  sections: SearchSection[];
}

interface SearchSection {
  domain: string; // pillar-level section domain (drives context detection)
  moduleId: string; // owning pillar id
  icon: string; // Lucide icon name for the section header
  color: string; // app color token
  isContextSection: boolean; // true when the section belongs to context.app
  hits: SearchHit[]; // ranked, capped to HITS_PER_SECTION (5)
  totalCount: number; // full pre-cap hit count for the pillar
}
```

`SearchHit` (`uri`, `score`, `matchField`, `matchType`, `data`) is re-exported
from `@pops/types`, so the shape the orchestrator merges is byte-identical to
what each pillar returns.

| Status | Condition                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------- |
| `200`  | Valid body. Blank query short-circuits to `{ sections: [] }` without touching any pillar.                                 |
| `400`  | `{ error: "invalid_request", details }` — body fails the request schema.                                                  |
| `500`  | `{ error: "search_failed" }` — the hit source throws unexpectedly (the per-pillar failures it absorbs do not reach here). |

## Pillar's `/search` contract

Each search-capable pillar serves `search.search({ query, context })` returning
`{ hits: SearchHit[] }` — a single flat, already-ranked list. The orchestrator
fans out over the SDK proxy `pillar(id).search.search(body)`. One pillar
produces one section: a pillar that aggregates several internal adapters (e.g.
finance concatenating transactions/budgets/wishlist) returns one flat `hits`
list, so the federator decorates and sections at **pillar granularity**, not
adapter granularity.

## Membership (registry-as-truth)

The search-capable set is projected from the live registry snapshot on every
request, mirroring the AI-tools `manifest.ai.tools` projection. A pillar is
federated iff:

1. `registered === true` (an unregistered pillar is dropped even if it
   advertises search — the SDK refuses to route it), **and**
2. effective status is `healthy` (`unavailable`/`unknown` dropped; a registered
   pillar with no explicit `status` is treated as healthy for legacy
   snapshots), **and**
3. its manifest declares a non-empty `search.adapters` slot.

Adding a search-capable pillar needs **no orchestrator edit**: it registers,
advertises `search.adapters`, and appears on the next discovery refresh.
Membership is re-resolved per search, so a newly registered pillar shows up
without restarting the orchestrator (the SDK cache rate-limits the actual
registry traffic).

A single malformed snapshot row is skipped and logged — never allowed to sink
the whole projection.

## Section chrome

The manifest's `search.adapters` slot describes adapter _mechanics_
(`name` / `entityType` / `queryShape` / `procedurePath` / `rankFieldName?`), not
section _chrome_. The header `icon` / `color` / `domain` live in a small static
table keyed by pillar id:

| Pillar    | domain      | icon             | color   |
| --------- | ----------- | ---------------- | ------- |
| finance   | `finance`   | `ArrowRightLeft` | `green` |
| inventory | `inventory` | `Package`        | `amber` |
| contacts  | `contacts`  | `Users`          | `blue`  |

Membership is **never** decided by this table. A search-capable pillar with no
entry (e.g. media, or any new pillar) is still federated, decorated with a
default (`icon: Circle`, `color: gray`, `domain` keyed to the pillar id so
context-section detection still works).

## Merge and ordering

Given the per-pillar decorated groups, the engine:

1. Drops empty groups.
2. Sorts each group's hits descending by `score`.
3. Caps each section to `HITS_PER_SECTION` (5); records `totalCount` pre-cap.
4. Marks a section as a context section when its `domain` belongs to
   `context.app` (via the domain→app map: pillar-level keys plus the legacy
   fine-grained adapter domains).
5. Orders sections: context sections first, then descending by each section's
   top hit score.

## Business rules

- **Parallel fan-out.** `Promise.allSettled` over the resolved pillars — partial
  failure is tolerated.
- **Best-effort isolation.** A pillar that is `unavailable`, throws, or returns
  a non-`ok` SDK result is logged via the warn sink and skipped. Federation
  never fails the whole search because one pillar is down. If every pillar
  fails, the result is an empty section list, not an error.
- **Registry-failure degradation.** When the registry read fails
  (`RegistryUnreachableError` or any error), federation degrades to an empty
  search-capable set — empty sections, never a throw.
- **Blank query short-circuit.** A query that parses to no text and no filters
  returns `{ sections: [] }` without invoking any pillar.

The query parser extracts structured tokens (`type:`, `domain:`, `year:>N`,
`value:<N`, `warranty:expiring`) from the raw input; unrecognised `key:value`
tokens fall through as plain text. Today only the text dimension reaches the
fan-out.

## Edge cases

| Case                                                           | Behaviour                                                      |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| One pillar's `/search` throws                                  | Logged; the other pillars' sections returned.                  |
| One pillar returns a non-`ok` SDK result (`unavailable`, etc.) | Logged with the pillar id and kind; skipped.                   |
| All pillars fail                                               | Empty section list returned; warn sink called once per pillar. |
| Registry unreachable                                           | Empty search-capable set; warn logged; no pillar invoked.      |
| Query targets a pillar not in the registry                     | Excluded; the registered pillars are searched.                 |
| Pillar registered but unhealthy / unregistered                 | Dropped from membership before fan-out.                        |
| Search-capable pillar with no chrome entry                     | Federated with the gray default chrome.                        |

## Acceptance criteria

Membership

- [x] Projects the search-capable set from the live registry snapshot on every request.
- [x] Selects only `registered`, healthy pillars whose manifest declares a non-empty `search.adapters`.
- [x] Drops an unregistered pillar even if it advertises search.
- [x] Drops `unavailable` / `unknown` pillars; treats a registered pillar with no explicit status as healthy.
- [x] Re-resolves membership per search so a newly registered pillar appears without a restart.
- [x] Skips and logs a single malformed snapshot row without sinking the projection.
- [x] Federates a search-capable pillar that has no static chrome entry, using the gray default.

Fan-out and merge

- [x] Fans the query out in parallel (`Promise.allSettled`) to every resolved pillar over the SDK (`pillar(id).search.search`).
- [x] Decorates each pillar's group with its `domain` / `icon` / `color`.
- [x] Sorts hits within a section by score, caps to `HITS_PER_SECTION`, records pre-cap `totalCount`.
- [x] Orders context sections first, then by top-hit score.
- [x] Honours `context.app` for context-section detection.

Failure handling

- [x] A pillar that throws is logged and skipped; surviving pillars still return.
- [x] A pillar returning a non-`ok` SDK result is logged (with pillar id + kind) and skipped.
- [x] When every pillar fails, returns an empty section list — never throws.
- [x] Degrades to an empty search-capable set when the registry read fails.

REST surface

- [x] `POST /search` accepts the per-pillar envelope (`{ query: { text, filters? }, context? }`).
- [x] Blank query short-circuits to `{ sections: [] }` without touching any pillar.
- [x] A structurally invalid body is rejected with `400 invalid_request`.
- [x] An unexpected source throw surfaces as `500 search_failed`.

Retirement

- [x] No build-time adapter registry exists — there is no `apps/` directory and no `search-adapters.ts`; membership is registry-driven end to end.

## Not built

The following were specified but are not implemented. See
[docs/ideas/federated-query-orchestrator.md](../../../ideas/federated-query-orchestrator.md):

- **Per-adapter timeout.** No `AbortSignal` / deadline bounds a slow pillar; a
  hung `/search` is bounded only by the SDK's own transport behaviour.
- **Partial-failure surfacing.** The response carries no `partial` block. A
  dropped pillar is logged server-side but invisible to the caller — the
  frontend cannot say "got 4/5 pillars; results may be incomplete".
- **Query-shape pre-filtering.** The manifest descriptor carries `queryShape`
  (`supportsText` / `supportsTags` / `supportsDateRange` / `supportsScope`), but
  the orchestrator invokes every adapter unconditionally; each must return `[]`
  for queries it cannot serve, paying the parse-and-reject cost.
- **Weighted cross-pillar ranking.** `@pops/pillar-sdk` ships a weighted-sum
  `mergeResults` keyed off per-pillar weights in settings, but the federated
  engine does not consume it — it uses a plain per-section score sort with
  context-first ordering. Cross-pillar relevance weighting is not wired in.

## Out of scope

- A separate `pops-search-api` container — federated search lives inside the orchestrator pillar.
- Search-result caching.
- Saved searches (an existing pillar surface).
- Cross-language search (only TypeScript pillars expose `/search` today).
