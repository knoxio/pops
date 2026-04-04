# Epic 07: Search

> Theme: [Foundation](../README.md)

## Scope

Build a platform-wide search system accessible from the TopBar. Searches across all domains, prioritises results from the current app context, and supports structured query syntax for power users. Results link via universal object URIs (ADR-012).

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 056 | [Search UI](../prds/056-search-ui/README.md) | TopBar search bar, results panel with context-aware sections (current app first), keyboard navigation, recent searches, result linking via URIs | In progress |
| 057 | [Search Engine](../prds/057-search-engine/README.md) | Cross-domain query fan-out, domain adapter interface, relevance ranking, context-based ordering. Structured query syntax (`type:movie year:>2000 fight`) as progressive enhancement | In progress |
| 058 | [Contextual Intelligence](../prds/058-contextual-intelligence/README.md) | Shell tracks active app, page, entity being viewed. Exposes via context/store for Search, AI Overlay, and future consumers | Not started |

PRD-058 first (context system). PRD-057 consumes it (engine uses context for ranking). PRD-056 consumes both (UI displays context-aware results).

## Dependencies

- **Requires:** ADR-012 (universal object URIs for result linking), multiple domains with data to search across
- **Unlocks:** "Find anything from anywhere" without navigating to the right app first

## Out of Scope

- AI-powered natural language queries ("show me expensive things I bought last month") — that's AI Overlay (05-ai, Epic 01)
- Full-text search indexing (SQLite FTS5 could be a future enhancement if LIKE queries become too slow)
