# Search Engine

> Theme: [Foundation](../../README.md)
> Status: Partial

## Overview

Platform-wide federated search. A search-capable pillar exposes a `POST /search`
endpoint that ranks its own data and returns a flat hit list. The `orchestrator`
pillar fans a query out to every search-capable pillar in parallel, decorates
each pillar's hits with section chrome, merges and ranks the sections, and
returns one section per pillar ordered by the current app context. The
orchestrator never re-scores hits — each pillar owns its ranking.

## Architecture

Three layers, no shared registry and no monolith:

1. **Per-pillar adapter** — each search-capable pillar serves `POST /search`
   accepting `{ query, context? }` and returning `{ hits: SearchHit[] }`. The
   pillar runs `LIKE`-style scans against its OWN SQLite DB and ranks the hits.
   One pillar = one flat hit list (finance concatenates its
   transactions/budgets/wishlist scans into a single response).
2. **Orchestrator federation** (`pillars/orchestrator`, `:3009`) — reads the
   live registry snapshot, projects the set of search-capable pillars, fans the
   query out over the pillar SDK (REST), decorates each pillar's hits with
   `domain`/`icon`/`color`, marks context sections, merges, sorts, caps, and
   orders. Exposes `POST /search` returning `{ sections }`.
3. **Frontend** (`@pops/navigation`) — the shell search input POSTs to
   `/orchestrator-api/search`, then dispatches each hit to a domain-keyed
   `ResultComponent` registered by the owning app at load time.

Membership is **registry-driven, not compiled**: the orchestrator federates
every registered, healthy pillar whose manifest declares a non-empty
`search.adapters` slot. Adding a search-capable pillar needs no orchestrator
edit — it registers, advertises `search.adapters`, serves `POST /search`, and
appears in federated search on the next discovery refresh. This mirrors the
AI-tool registry projection (`manifest.ai.tools`).

### Cross-package contract (`@pops/types`)

```typescript
interface Query {
  text: string; // raw user input
  filters?: StructuredFilter[]; // advanced syntax (parser only — see ideas)
}

interface SearchContext {
  app: string | null; // current app: "media", "finance", "contacts", …
  page: string | null; // "library", "transactions", "item-detail", …
  entity?: { uri: string; type: string; title: string };
  filters?: Record<string, string>; // active page filters
}

type MatchType = 'exact' | 'prefix' | 'contains';

interface SearchHit<T = unknown> {
  uri: string; // "pops:contacts/contact/42", "/inventory/items/7"
  score: number; // 0.0–1.0
  matchField: string; // "name", "description", "assetId", …
  matchType: MatchType;
  data: T; // domain-specific, opaque to the engine
}
```

`SearchAdapter<T>` (frontend) carries a `ResultComponent`;
`SearchAdapterDescriptor<TData>` (backend) is the React-free variant. The
engine erases `T` to `unknown` at every boundary it crosses — type safety lives
inside each domain, type erasure at the engine and the wire.

### Manifest slot (`search.adapters`)

A pillar declares its search capability in its manifest. The slot describes
adapter mechanics, NOT section chrome:

```jsonc
"search": {
  "adapters": [
    {
      "name": "contacts",            // camelCase id
      "entityType": "contact",       // kebab-case entity
      "queryShape": { "supportsText": true, "supportsTags": false,
                      "supportsDateRange": false, "supportsScope": [] },
      "procedurePath": "contacts.search.search",
      "rankFieldName": "score"
    }
  ]
}
```

The manifest validator enforces that each adapter's `procedurePath` references a
real procedure on the pillar. A non-empty `adapters` array is the sole signal
the orchestrator uses to decide membership.

### Section chrome (orchestrator)

The manifest's `search` slot does NOT carry section presentation (icon/color).
The orchestrator keeps a small static table (`SEARCH_SECTION_META`) keyed by
pillar id for the per-section header:

| Pillar    | Domain    | Icon             | Color |
| --------- | --------- | ---------------- | ----- |
| contacts  | contacts  | `Users`          | blue  |
| finance   | finance   | `ArrowRightLeft` | green |
| inventory | inventory | `Package`        | amber |

A search-capable pillar absent from the table is still federated, decorated
with a default (`Circle`, gray, domain = pillar id) so an unmapped pillar's
context-section detection still works. Membership is the registry's job; this
table only supplies chrome.

### Section ordering

Sections are ordered by:

1. Context sections first — a section whose domain maps to the current
   `context.app` (via the domain→app map) is marked `isContextSection: true`.
2. Then by highest hit score in the section, descending.

The domain→app map (`domain-app-mapping.ts`) carries both pillar-level keys
(`finance`, `inventory`, `contacts`) and the fine-grained adapter domains
(`transactions`, `budgets`, `wishlist`, `movies`, `tv-shows`,
`inventory-items`) so it stays correct if a pillar is ever decorated at adapter
granularity again.

## REST Surface

### Orchestrator — `POST /search`

Request:

```jsonc
{ "query": { "text": "fight club", "filters": [] }, "context": { "app": "media", "page": null } }
```

Response:

```jsonc
{ "sections": [
  { "domain": "contacts", "moduleId": "contacts", "icon": "Users",
    "color": "blue", "isContextSection": false,
    "hits": [ { "uri": "pops:contacts/contact/3", "score": 1.0,
                "matchField": "name", "matchType": "exact", "data": { … } } ],
    "totalCount": 1 } ] }
```

- Blank query → `{ sections: [] }`, no pillar touched.
- Malformed body → `400 invalid_request`.
- Federation throw → `500 search_failed` (a single down pillar never reaches
  this — it is logged and skipped).

### Per-pillar — `POST /search`

Request envelope `{ query: { text, filters? }, context? }`, response
`{ hits: SearchHit[] }`. The pillar owns ranking; the wire shape is
byte-identical across pillars so the orchestrator merges without reshaping.

- **contacts** (Rust, axum) — searches contacts by `name`; hit data
  `{ name, type, aliases }`; uri `pops:contacts/contact/<id>`. The sole
  entities-search source.
- **finance** — aggregates three scans into one response:
  - transactions by `description`; data
    `{ description, amount, date, entityName, type }` (type normalised to
    `income`/`expense`/`transfer`); uri `pops:finance/transaction/<id>`.
  - budgets by `category`; data `{ category, period, amount }`; uri
    `/budgets/<id>`.
  - wishlist by `item` (excludes already-purchased rows where
    `saved >= target_amount`); data `{ item, priority, targetAmount }`; uri
    `/finance/wishlist`.
- **inventory** — tiered ranking against home-inventory items:
  - asset-id exact → 1.0, asset-id prefix → 0.9 (both `matchField: assetId`),
  - item-name exact → 0.85, prefix → 0.7, contains → 0.5
    (`matchField: itemName`).
  - Asset-id matches always outrank name matches; later tiers stop at the
    limit budget and skip uris already seen. uri `/inventory/items/<id>`.

## Rules

- Each pillar owns its scoring and `matchField`/`matchType`. The orchestrator
  re-sorts within a section by score but never re-scores or re-derives matches.
- Default score bands: exact = 1.0, prefix = 0.8, contains = 0.5 (inventory
  uses its own tiered bands; see above).
- Best-effort federation: a pillar that is unavailable, errors, or returns a
  non-ok SDK result is logged and skipped — one down pillar never fails the
  whole search (`Promise.allSettled`).
- Each section is capped at 5 hits; `totalCount` carries the pre-cap count.
- A search-capable pillar must serve `POST /search` AND advertise a non-empty
  `manifest.search.adapters` — both are required to be federated. (Serving the
  endpoint without advertising the slot makes the pillar invisible to search.)
- The registry is the sole source of truth for membership; membership is
  resolved per-search, so a newly registered pillar appears without restarting
  the orchestrator (the SDK discovery cache rate-limits actual registry
  traffic).
- The frontend dispatches each hit to the `ResultComponent` registered for its
  `domain`; an unregistered domain falls back to a generic renderer. Components
  own layout and match highlighting (passed `data`, `query`, `matchField`,
  `matchType`). Sections for modules not installed in the current frontend are
  filtered out.

## Edge Cases

- Registry unreachable → orchestrator serves an empty federated set (no
  sections), never a 500.
- A single malformed registry snapshot row is skipped (logged) during the
  search projection — one bad manifest never breaks search for the others.
- Context-section detection for an unmapped-but-search-capable pillar uses the
  pillar id as its domain, so it still resolves against the domain→app map.
- Empty / whitespace-only `query.text` short-circuits to no hits at both the
  orchestrator and each pillar.

## Acceptance Criteria

### Contract & registry

- [x] `Query`, `SearchContext`, `SearchHit<T>`, `MatchType`,
      `SearchAdapter<T>`, `SearchAdapterDescriptor<TData>` defined in
      `@pops/types`; `T` erased to `unknown` at the wire and registry
      boundaries.
- [x] Manifest `search.adapters[]` slot
      (`name`/`entityType`/`queryShape`/`procedurePath`/`rankFieldName?`) with a
      validator enforcing `procedurePath` references a real procedure.
- [x] Orchestrator projects the live registry snapshot to the search-capable
      set (registered + healthy + non-empty `search.adapters`); membership
      resolved per-search; no compiled pillar list.

### Orchestrator engine

- [x] `POST /search` validates `{ query, context? }`, returns `{ sections }`;
      blank query returns `{ sections: [] }` without touching a pillar;
      malformed body → 400.
- [x] Parallel fan-out (`Promise.allSettled`); a pillar that errors / is
      unavailable / returns non-ok is logged and skipped.
- [x] Sections sorted within by score, capped at 5, with `totalCount`;
      empty sections dropped.
- [x] Context sections (domain maps to `context.app`) ordered first, then by
      top score descending.
- [x] Registry-unreachable and malformed-snapshot-row degrade to empty/skip,
      never throw.

### Per-pillar adapters

- [x] contacts `POST /search` — name search, `{ name, type, aliases }` hit
      data, `pops:contacts/contact/<id>` uri, advertised in manifest, federated
      live.
- [x] finance `POST /search` — transactions + budgets + wishlist aggregated
      into one ranked response with the documented data shapes.
- [x] inventory `POST /search` — tiered asset-id-then-name ranking; asset-id
      matches outrank name matches.
- [ ] finance and inventory advertise `search.adapters` in their served
      manifest (today `adapters: []`, so they are NOT federated — see
      [ideas/search-engine.md](../../../../ideas/search-engine.md)).
- [ ] media unified-search adapter (library movies/tv-shows `POST /search`) —
      not built; media only serves live TMDB/TVDB provider search.

### Frontend

- [x] Domain-keyed `ResultComponent` registry in `@pops/navigation` with a
      generic fallback for unregistered domains.
- [x] Shell search input POSTs to `/orchestrator-api/search`, dispatches hits by
      domain, filters sections for absent modules.
- [x] Result components registered: `transactions`, `entities`, `budgets`,
      `wishlist` (finance app); `inventory-items` (inventory app); `movies`,
      `tv-shows` (media app). Each highlights the matched portion using
      `query` + `matchField` + `matchType`, with poster/icon fallbacks.

### Deferred (see ideas)

- [ ] Show-more pagination — no orchestrator cursor and no per-pillar offset
      endpoint; `handleShowMore` is a no-op and `totalCount` is clamped to
      returned hits so the control never shows.
- [ ] Structured-syntax filter application — the parser extracts
      `type:`/`domain:`/`year:`/`value:`/`warranty:` tokens, but the
      orchestrator drops the filters before fan-out (text-only narrowing).

## Out of Scope

- Search UI chrome and keyboard navigation
  ([search-ui](../../../../../pillars/shell/docs/prds/search-ui/README.md)).
- Contextual intelligence / `SearchContext` enrichment
  ([contextual-intelligence](../../../../../pillars/shell/docs/prds/contextual-intelligence/README.md)).
- Full-text indexing (SQLite FTS5) — current adapters use `LIKE` scans.
