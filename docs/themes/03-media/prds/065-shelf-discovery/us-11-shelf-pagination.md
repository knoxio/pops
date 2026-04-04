# US-11: Shelf pagination endpoint

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Not started

## Description

As a user, I want to load more items within a shelf so I can explore beyond the initial 10.

## Acceptance Criteria

- [ ] `media.discovery.getShelfPage` query: input `{ shelfId, offset, limit }`
- [ ] Calls the specific shelf instance's query() with offset/limit
- [ ] Returns `{ items: DiscoverResult[], totalCount, hasMore }`
- [ ] Shelf instance reconstructed from shelfId (parse template + params from the ID string)
- [ ] Tests: returns correct offset, respects limit, works for both template and static shelves
