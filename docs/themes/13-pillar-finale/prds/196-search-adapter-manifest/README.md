# PRD-196: Search adapter manifest

> Epic: [Search registry](../../epics/06-search-registry.md)

## Overview

Define how each pillar declares its search adapters in the contract manifest. Each adapter advertises an entity type + a query shape; the search orchestrator (PRD-197) reads the registry and fans out queries to matching adapters.

## Data Model

Extends the manifest schema (PRD-157) with richer search adapter shape:

```ts
search: {
  adapters: readonly {
    name: string;                  // 'transactions' | 'movies' | ...
    entityType: string;            // lowercase kebab-case, e.g. 'transaction', 'tv-show'
    queryShape: {
      supportsText: boolean;       // free-text query
      supportsTags: boolean;
      supportsDateRange: boolean;
      supportsScope: readonly string[];  // additional filterable scopes
    };
    procedurePath: string;         // e.g. 'finance.transactions.search'
    rankFieldName?: string;        // for ranking merge (PRD-198)
  }[];
}
```

## API Surface

Each pillar updates its contract package's `src/search.ts` to use the richer shape; the manifest auto-regenerates (PRD-155).

## Business Rules

- Adapters must reference an actual tRPC procedure on the pillar.
- The procedure must accept a query shape compatible with the declared `queryShape`.
- Adapters are listed in priority order (used as a tiebreaker for equal-scored results).

## Edge Cases

| Case                                                    | Behaviour                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| Adapter procedure doesn't exist                         | Contract semver CI catches (PRD-154).                              |
| Adapter declares queryShape it doesn't actually support | Runtime: query returns empty; smoke test (PRD-2920) catches in CI. |

## User Stories

| #   | Story                                               | Summary                                                                       |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| 01  | [us-01-schema-extension](us-01-schema-extension.md) | Extend manifest schema with the richer adapter shape                          |
| 02  | [us-02-finance-pilot](us-02-finance-pilot.md)       | Populate finance contract with adapters for transactions / budgets / wishlist |
| 03  | [us-03-other-pillars](us-03-other-pillars.md)       | Roll out to media / inventory / cerebrum                                      |

## Out of Scope

- Federated query orchestrator (PRD-197).
- Ranking strategy (PRD-198).
- Per-adapter result caching.
