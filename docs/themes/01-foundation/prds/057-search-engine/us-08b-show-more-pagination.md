# US-08b: Show more pagination

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As a user, I want to load more results within a section so I can find items beyond the initial 5.

## Acceptance Criteria

- [ ] `showMore(domain, query, context, offset, limit)` returns next page of results for a single adapter
- [ ] Calls only the adapter for the specified domain — not a full fan-out
- [ ] Returns hits + updated totalCount
- [ ] Offset-based pagination (offset 0 = first 5, offset 5 = next 5, etc.)
- [ ] Tests: show more returns correct offset, respects limit, single adapter called

## Notes

Triggered by "show more" link in the search UI results panel.
