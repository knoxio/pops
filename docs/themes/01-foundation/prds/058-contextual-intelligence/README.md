# PRD-058: Contextual Intelligence

> Epic: [07 — Search](../../epics/07-search.md)
> Status: Not started

## Overview

Build the contextual intelligence system — the shell tracks what the user is doing (active app, current page, entity being viewed, active filters) and exposes this as a consumable context. Search uses it for result prioritisation. AI overlay uses it for prompt scoping. Future features consume it for contextual suggestions.

## Context Shape

```typescript
interface AppContext {
  app: string;                    // "finance", "media", "inventory", "ai"
  page: string;                   // "library", "transactions", "item-detail"
  pageType: "top-level" | "drill-down";
  entity?: {                      // Set when viewing a specific item
    uri: string;                  // "pops:media/movie/42"
    type: string;                 // "movie"
    title: string;                // "Fight Club"
  };
  filters?: Record<string, string>; // Active filter state on list pages
}
```

## How It's Set

- Shell reads the active app from the URL path (`/media/*` → app: "media")
- Page-level context set by each page component on mount (page, pageType, entity, filters)
- Updates on navigation — context always reflects the current view
- Exposed via React context or Zustand store (accessible from any component)

## Consumers

| Consumer | How it uses context |
|----------|-------------------|
| Search (PRD-056/057) | Orders result sections — current app's results first |
| AI Overlay (PRD-054) | Scopes prompts — "help me with this" knows what "this" is |
| Breadcrumbs (PRD-005) | Enriches breadcrumb labels with entity titles |
| Future: contextual suggestions | "You might want to..." based on what the user is viewing |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-context-provider](us-01-context-provider.md) | React context/store for app context, URL-based app detection | Not started | No (first) |
| 02 | [us-02-page-context-hooks](us-02-page-context-hooks.md) | Hooks for pages to set their page-level context (entity, filters) | Not started | Blocked by us-01 |
| 03 | [us-03-context-consumer-api](us-03-context-consumer-api.md) | Consumer API for Search and AI to read current context | Not started | Blocked by us-01 |

## Out of Scope

- What consumers do with the context (each PRD owns its own logic)
- Persisting context across sessions
- Analytics or tracking of user navigation patterns
