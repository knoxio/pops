# Epic: Search

> Theme: [Foundation](../README.md)

## Scope

Build platform-wide federated search accessible from the TopBar. The orchestrator pillar fans a query out to every search-capable pillar, prioritises results from the current app context, and supports structured query syntax for power users. Results link via universal object URIs ([ADR-012](../../../architecture/adr-012-universal-object-uri.md)).

## PRDs

| PRD                                                                                              | Summary                                                                                                                                                                             | Status |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [Search UI](../../../../pillars/shell/docs/prds/search-ui/README.md)                             | TopBar search bar, results panel with context-aware sections (current app first), keyboard navigation, recent searches, result linking via URIs                                     | Done   |
| [Search Engine](../prds/search-engine/README.md)                                                 | Cross-pillar query fan-out, pillar adapter interface, relevance ranking, context-based ordering. Structured query syntax (`type:movie year:>2000 fight`) as progressive enhancement | Done   |
| [Contextual Intelligence](../../../../pillars/shell/docs/prds/contextual-intelligence/README.md) | Shell tracks active app, page, entity being viewed. Exposes via context/store for Search, AI Overlay, and future consumers                                                          | Done   |

Contextual Intelligence first (context system). Search Engine consumes it (engine uses context for ranking). Search UI consumes both (UI displays context-aware results).

## Dependencies

- **Requires:** ADR-012 (universal object URIs for result linking), multiple domains with data to search across
- **Unlocks:** "Find anything from anywhere" without navigating to the right app first

## Out of Scope

- AI-powered natural language queries ("show me expensive things I bought last month") — that's the Ego AI overlay, not this epic
- Full-text search indexing (SQLite FTS5 could be a future enhancement if LIKE queries become too slow)
