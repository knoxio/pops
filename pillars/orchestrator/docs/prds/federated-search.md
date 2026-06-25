# Federated search

> Domain: [Orchestrator](../README.md)
>
> Status: **Done**

## Purpose

Expose one cross-pillar search endpoint that fans a single query out to every search-capable pillar, then merges, ranks, and decorates the per-pillar results into sections for the frontend search panel. The orchestrator is the only place this fan-out lives — each pillar owns only its own `/search`; the orchestrator owns the federation across them.

The reusable fan-out/merge primitives live in the SDK and are specified centrally (see [search-adapter-manifest](../../../../docs/themes/federation/prds/search-adapter-manifest.md), [federated-query-orchestrator](../../../../docs/themes/federation/prds/federated-query-orchestrator.md), [ranking-strategy](../../../../docs/themes/federation/prds/ranking-strategy.md), [partial-failure-semantics](../../../../docs/themes/federation/prds/partial-failure-semantics.md)). This PRD covers the orchestrator's HTTP endpoint, its registry-driven membership, and its section-decoration rules.

## API surface

`POST /search`

Request body — wire-compatible with each pillar's own `/search` envelope so the frontend can repoint at the orchestrator without reshaping the request:

```jsonc
{
  "query": {
    "text": "drill",
    "filters": [{ "field": "domain", "operator": "eq", "value": "inventory" }], // optional
  },
  "context": {
    // optional; where the search was invoked from
    "app": "inventory", // null at the root context
    "page": "items", // null at the root context
    "entity": { "uri": "…", "type": "…", "title": "…" }, // optional
    "filters": { "k": "v" }, // optional
  },
}
```

Response — merged, ranked, decorated sections (one section per contributing pillar):

```jsonc
{
  "sections": [
    {
      "domain": "inventory", // pillar-level section domain
      "moduleId": "inventory", // owning pillar id
      "icon": "Package", // section chrome
      "color": "amber",
      "isContextSection": true, // domain belongs to the current app context
      "hits": [
        /* SearchHit, capped to 5 */
      ],
      "totalCount": 12, // full pre-cap hit count for the pillar
    },
  ],
}
```

A `SearchHit` is `{ uri, score, matchField, matchType: "exact"|"prefix"|"contains", data }`.

## Membership: registry-driven, per request

The search-capable pillar set is resolved from the **live registry snapshot on every search**, not from a compiled list. A pillar is federated iff it is:

1. registered (`registered = true` is authoritative — an unregistered pillar is never routed regardless of `status`),
2. healthy (a missing `status` on a registered pillar is treated as healthy for legacy snapshots), and
3. advertising a non-empty `search.adapters` slot in its manifest.

Adding a search-capable pillar needs no orchestrator edit — it registers, advertises `search.adapters`, and appears on the next discovery refresh. A single malformed snapshot row is skipped (logged), never allowed to sink the whole projection.

## Section decoration

Each pillar's `/search` returns a single flat ranked hit list, so the orchestrator decorates at **pillar granularity** — one section per pillar (e.g. finance concatenates its transactions/budgets/wishlist adapters into one). Section chrome (`icon`/`color`/`domain`) is not carried by the manifest's `search` slot, so it comes from a small static table keyed by pillar id:

| Pillar      | domain      | icon             | color |
| ----------- | ----------- | ---------------- | ----- |
| `finance`   | `finance`   | `ArrowRightLeft` | green |
| `inventory` | `inventory` | `Package`        | amber |
| `contacts`  | `contacts`  | `Users`          | blue  |

A search-capable pillar **absent** from this table is still federated — it is decorated with a default (`Circle` / gray) whose `domain` is set to the pillar id so context-section detection still works. Membership is registry-driven; only the chrome falls back.

## Merge, rank, and ordering

1. The query is parsed for structured filter tokens (`type:`, `domain:`, `year:>N`, `value:<N`, `warranty:expiring`); unrecognised `key:value` tokens are treated as plain text. A blank query (no text and no filters) short-circuits to empty sections without touching any pillar.
2. Each pillar's hits are sorted by descending score and capped to **5 per section** (`totalCount` carries the full count).
3. Empty groups are dropped.
4. A section is a **context section** when its domain maps to the current app context (`context.app`). Context sections are ordered first; remaining sections are ordered by top hit score.

## Partial failure (best-effort)

Federation never fails the whole search because one pillar is down. A pillar that is unavailable, throws, or returns a non-ok SDK result is **logged and skipped**; the surviving pillars still answer. The route returns `500 { error: "search_failed" }` only for an _unexpected_ throw in the pipeline, never for a pillar being down. The detailed partial-failure summary shape is the SDK framework's contract — see [partial-failure-semantics](../../../../docs/themes/federation/prds/partial-failure-semantics.md).

## Edge cases

| Case                                                 | Behaviour                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| Blank / whitespace-only query                        | `200 { sections: [] }`, no pillar touched.                     |
| Structurally invalid body (e.g. `text` not a string) | `400 { error: "invalid_request", details }`, no fan-out.       |
| One pillar down / erroring / non-ok                  | Dropped from the result; survivors returned.                   |
| Registry unreachable                                 | Empty search-capable set → empty sections (logged), not a 500. |
| Malformed registry row                               | That row skipped; other pillars still projected.               |
| Unexpected pipeline throw                            | `500 { error: "search_failed" }`.                              |

## Acceptance criteria

- [x] `POST /search` fans the query out over the discovered pillars and returns merged, ranked, decorated sections.
- [x] Sections are ordered context-first, then by top hit score; `context.app` drives `isContextSection`.
- [x] Each section is capped to 5 hits with `totalCount` carrying the full pre-cap count.
- [x] A blank/whitespace query short-circuits to `{ sections: [] }` without invoking the source.
- [x] A structurally invalid body returns `400 invalid_request` without fan-out.
- [x] A down/erroring pillar is dropped and the surviving pillars are still returned.
- [x] An unexpected source throw returns `500 search_failed`.
- [x] Membership is the set of registered, healthy pillars advertising `search.adapters`; an unmapped-but-search-capable pillar is still federated with default chrome.
      </content>
