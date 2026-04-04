# PRD-057: Search Engine

> Epic: [07 — Search](../../epics/07-search.md)
> Status: Not started

## Overview

Build the search engine that powers platform-wide search. Cross-domain query fan-out, domain adapter interface with typed result components, relevance ranking, and structured query syntax for power users.

## Architecture

Each domain registers a search adapter with a typed data shape and a React component for rendering its results. The engine fans a query out to all adapters, collects hits, ranks them, and returns context-ordered sections. The engine never touches result data — it only reads `uri` and `score` for routing and ranking.

### Interfaces

```typescript
interface Query {
  text: string;                          // raw user input
  filters?: StructuredFilter[];          // v2: parsed type:, year:, etc.
}

interface SearchContext {
  app: string | null;                    // current app: "media", "finance", etc.
  page: string | null;                   // "library", "item-detail", etc.
  entity?: {                             // entity being viewed, if any
    uri: string;
    type: string;
    title: string;
  };
  filters?: Record<string, string>;      // active page filters
}

interface SearchAdapter<T = unknown> {
  domain: string;                        // "finance", "media", "inventory"
  icon: string;                          // lucide icon name for section header
  color: string;                         // app color token for section theming
  search(query: Query, context: SearchContext, options?: { limit?: number }): SearchHit<T>[];
  ResultComponent: React.ComponentType<{ hit: SearchHit<T>; query: string }>;
}

interface SearchHit<T = unknown> {
  uri: string;                           // "pops:media/movie/42"
  score: number;                         // 0.0–1.0: exact=1.0, prefix=0.8, contains=0.5
  matchField: string;                    // which field matched: "title", "description", "assetId"
  matchType: "exact" | "prefix" | "contains";
  data: T;                               // domain-specific, opaque to engine
}
```

The engine erases `T` to `unknown` in its internal registry. Each `ResultComponent` knows its own `T` and renders accordingly. Type safety within each domain, type erasure at the engine boundary.

### Structured Query Syntax (v2)

Power-user queries with typed filters:

| Syntax | Meaning | Example |
|--------|---------|---------|
| Plain text | Full-text search across all fields | `fight club` |
| `type:X` | Filter by entity type | `type:movie fight` |
| `domain:X` | Filter to one domain | `domain:inventory cable` |
| `year:>N` | Numeric comparison | `type:movie year:>2000 fight` |
| `value:>N` | Inventory value filter | `domain:inventory value:>500` |
| `warranty:expiring` | Special filter | `warranty:expiring` |

v1 is plain text only. Structured syntax added as v2 USs.

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-adapter-interface](us-01-adapter-interface.md) | SearchAdapter, SearchHit, Query, SearchContext interfaces and adapter registry | Not started | No (first) |
| 02 | [us-02-finance-adapter](us-02-finance-adapter.md) | Finance adapter: transactions, entities, budgets with typed hits and ResultComponent | Not started | Blocked by us-01 |
| 03 | [us-03-media-adapter](us-03-media-adapter.md) | Media adapter: movies, TV shows with poster thumbnails and ResultComponent | Not started | Blocked by us-01 |
| 04 | [us-04-inventory-adapter](us-04-inventory-adapter.md) | Inventory adapter: items by name, asset ID with location badge and ResultComponent | Not started | Blocked by us-01 |
| 05 | [us-05-fan-out-ranking](us-05-fan-out-ranking.md) | Query fan-out, context-aware section ordering, result collection | Not started | Blocked by us-02, us-03, us-04 |
| 06 | [us-06-structured-syntax](us-06-structured-syntax.md) | Parse structured query syntax (type:, domain:, year:, value:) and apply filters | Not started | Blocked by us-05 |

US-02, US-03, US-04 can parallelise (independent adapters).

## Business Rules

- Each adapter owns its scoring and match information — the engine does not re-score or re-derive matches
- Score range is 0.0–1.0 (exact=1.0, prefix=0.8, contains=0.5)
- Adapter failures are isolated (`Promise.allSettled`) — if one adapter throws, others still return results. Failed section is omitted with a console warning
- Default result limit: 5 per section. "Show more" returns additional results for a single domain
- Cross-section ordering: current app's domain first (from SearchContext), others by highest-score-in-section descending
- Each adapter receives `SearchContext` and may use it to boost results (e.g. inventory adapter boosts items in the current location). Adapters may also ignore context entirely
- Adapter registry location: `apps/pops-api/src/modules/core/search/`. Each domain adapter calls `registerSearchAdapter()` at startup
- `ResultComponent` is registered alongside the search function — the engine passes `hit` and `query` string, the component owns layout and match highlighting

## Out of Scope

- Search UI (PRD-056)
- Contextual intelligence (PRD-058)
- Full-text search indexing (SQLite FTS5 — future if LIKE queries are too slow)
- Context enrichment / semantic tagging (v2 idea — see ideas/app-ideas.md)
