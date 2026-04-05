# US-03: Result navigation via URIs

> PRD: [056 — Search UI](README.md)
> Status: Done

## Description

As a user, I want to click a search result and navigate directly to that item so that search is actionable.

## Acceptance Criteria

- [x] Each result links to its page via universal object URI (ADR-012)
- [x] URI resolved to a frontend route: `pops:media/movie/42` → `/media/movies/42`
- [x] Clicking navigates and closes the search panel
- [x] Result shows: title, type badge (Movie, TV Show, Transaction, Item, Entity), brief metadata (date, amount, etc.)

## Notes

The URI resolver maps `pops:{domain}/{type}/{id}` to frontend routes. The mapping should be a simple lookup — each domain registers its route pattern.
