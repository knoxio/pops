# PRD-056: Search UI

> Epic: [07 — Search](../../epics/07-search.md)
> Status: Not started

## Overview

Build the search UI — a TopBar search bar with a results panel that shows context-aware sections. The current app's results appear first and are visually distinct. Each domain renders its own results using a registered `ResultComponent` — the search UI has no knowledge of domain-specific layouts.

## UX Flow

1. User focuses the search bar (or presses `Cmd+K` / `Ctrl+K`)
2. Types a query (e.g., "lamp")
3. After 300ms debounce, the engine runs
4. Results appear in sections:
   - **Context section** (current app): visually highlighted, first 5 results
   - **Other sections**: grouped by domain, ordered by relevance, 5 results each
5. Each section has a header: app icon + domain label + result count
6. Each result is rendered by the domain's `ResultComponent` — poster thumbnails for media, amount+date for finance, asset badge for inventory
7. Matched text is highlighted within each result by the `ResultComponent`
8. Clicking a result navigates to that item's page via URI resolution
9. Recent searches shown when input is empty

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-search-bar](us-01-search-bar.md) | TopBar search input with keyboard shortcut, focus management, debounce | Partial | Yes |
| 02 | [us-02-results-panel](us-02-results-panel.md) | Dropdown panel layout with domain sections, context ordering, close behavior | Not started | Yes |
| 02b | [us-02b-result-component-registry](us-02b-result-component-registry.md) | Frontend ResultComponent registry, domain lookup, generic fallback, show more | Not started | Blocked by us-02 |
| 03 | [us-03-result-navigation](us-03-result-navigation.md) | Click/keyboard-navigate results, resolve URIs to routes | Not started | Yes |
| 04 | [us-04-recent-searches](us-04-recent-searches.md) | Recent search history in localStorage, shown when input is empty | Not started | Blocked by us-01 |
| 05 | [us-05-keyboard-nav](us-05-keyboard-nav.md) | Arrow keys navigate results across sections, Enter selects, Escape closes | Not started | Blocked by us-02 |

## Out of Scope

- Search engine and domain adapters (PRD-057)
- Contextual intelligence system (PRD-058)
- Structured query syntax UI hints (part of PRD-057 v2)
- Context enrichment / semantic tagging (v2 idea — see ideas/app-ideas.md)
