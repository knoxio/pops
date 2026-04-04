# PRD-057: Search Engine

> Epic: [07 — Search](../../epics/07-search.md)
> Status: Not started

## Overview

Build the search engine that powers platform-wide search. Cross-domain query fan-out, domain adapter interface, relevance ranking, and structured query syntax for power users.

## Architecture

Each domain registers a search adapter. The engine fans a query out to all adapters, collects results, ranks them, and returns context-ordered sections.

### Domain Adapter Interface

```typescript
interface SearchAdapter {
  domain: string;               // "finance", "media", "inventory"
  types: string[];              // ["transaction", "entity", "budget"]
  search(query: string, options?: { limit?: number }): SearchResult[];
}

interface SearchResult {
  uri: string;                  // "pops:media/movie/42"
  title: string;                // "Fight Club"
  type: string;                 // "movie"
  domain: string;               // "media"
  metadata?: Record<string, string>; // { year: "1999", rating: "8.8" }
  thumbnailUrl?: string;        // poster/icon URL if available
  score: number;                // 0.0–1.0 relevance: exact=1.0, starts-with=0.8, contains=0.5
}
```

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
| 01 | [us-01-adapter-interface](us-01-adapter-interface.md) | Define SearchAdapter interface and registration pattern | Not started | No (first) |
| 02 | [us-02-finance-adapter](us-02-finance-adapter.md) | Finance search adapter: transactions, entities, budgets | Not started | Blocked by us-01 |
| 03 | [us-03-media-adapter](us-03-media-adapter.md) | Media search adapter: movies, TV shows | Not started | Blocked by us-01 |
| 04 | [us-04-inventory-adapter](us-04-inventory-adapter.md) | Inventory search adapter: items by name, asset ID, type | Not started | Blocked by us-01 |
| 05 | [us-05-fan-out-ranking](us-05-fan-out-ranking.md) | Query fan-out to all adapters, result collection, relevance ranking, context ordering | Not started | Blocked by us-02, us-03, us-04 |
| 06 | [us-06-structured-syntax](us-06-structured-syntax.md) | Parse structured query syntax (type:, domain:, year:, value:) and apply filters | Not started | Blocked by us-05 |

US-02, US-03, US-04 can parallelise (independent adapters).

## Business Rules

- Each adapter owns its scoring — the engine does not re-score. Score range is 0.0–1.0
- Adapter failures are isolated — if one adapter throws, others still return results. Failed section is omitted with a console warning
- Default result limit: 5 per section. "Show more" returns additional results for a single domain
- Cross-section ordering: current app's domain first (from PRD-058 context), others alphabetical
- Adapter registry location: `apps/pops-api/src/modules/core/search/`. Each domain adapter calls `registerSearchAdapter()` at startup

## Out of Scope

- Search UI (PRD-056)
- Contextual intelligence (PRD-058)
- Full-text search indexing (SQLite FTS5 — future if LIKE queries are too slow)
