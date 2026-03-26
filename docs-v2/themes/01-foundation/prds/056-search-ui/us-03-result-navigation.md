# US-03: Result navigation via URIs

> PRD: [056 — Search UI](README.md)
> Status: Not started

## Description

As a user, I want to click a search result and navigate directly to that item so that search is actionable.

## Acceptance Criteria

- [ ] Each result links to its page via universal object URI (ADR-012)
- [ ] URI resolved to a frontend route: `pops:media/movie/42` → `/media/movies/42`
- [ ] Clicking navigates and closes the search panel
- [ ] Result shows: title, type badge (Movie, TV Show, Transaction, Item, Entity), brief metadata (date, amount, etc.)

## Notes

The URI resolver maps `pops:{domain}/{type}/{id}` to frontend routes. The mapping should be a simple lookup — each domain registers its route pattern.
