# PRD-056: Search UI

> Epic: [07 — Search](../../epics/07-search.md)
> Status: Not started

## Overview

Build the search UI — a TopBar search bar with a results panel that shows context-aware sections. Current app results appear first, then results from other domains. Each result links to its page via universal object URIs (ADR-012).

## UX Flow

1. User focuses the search bar (or presses keyboard shortcut)
2. Types a query (e.g., "banana")
3. Results appear in sections, ordered by relevance to current context:
   - If on `/media`: Movies section first, then TV Shows, then Inventory, Finance, Entities
   - If on `/inventory`: Items section first, then Finance, Media, Entities
4. Each result shows: title, type badge, brief metadata
5. Clicking a result navigates to that item's page
6. Recent searches shown when input is empty

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-search-bar](us-01-search-bar.md) | TopBar search input with keyboard shortcut, focus management | Not started | Yes |
| 02 | [us-02-results-panel](us-02-results-panel.md) | Dropdown results panel with context-aware domain sections | Not started | Yes |
| 03 | [us-03-result-navigation](us-03-result-navigation.md) | Click/keyboard-navigate results, link via URIs | Not started | Yes |
| 04 | [us-04-recent-searches](us-04-recent-searches.md) | Recent search history shown when input is empty | Not started | Blocked by us-01 |
| 05 | [us-05-keyboard-nav](us-05-keyboard-nav.md) | Arrow keys navigate results, Enter selects, Escape closes | Not started | Blocked by us-02 |

## Out of Scope

- Search engine and domain adapters (PRD-057)
- Contextual intelligence system (PRD-058)
- Structured query syntax UI hints (part of PRD-057)
