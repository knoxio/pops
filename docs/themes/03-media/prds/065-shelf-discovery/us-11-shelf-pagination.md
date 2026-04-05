# US-11: Shelf pagination endpoint

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Done

## Description

As a user, I want to load more items within a shelf so I can explore beyond the initial 10.

## Acceptance Criteria

- [x] `media.discovery.getShelfPage` query: input `{ shelfId, offset, limit }`
- [x] Calls the specific shelf instance's query() with offset/limit
- [x] Returns `{ items: DiscoverResult[], totalCount, hasMore }`
- [x] Shelf instance reconstructed from shelfId (parse template + params from the ID string)
- [x] Tests: returns correct offset, respects limit, works for both template and static shelves
