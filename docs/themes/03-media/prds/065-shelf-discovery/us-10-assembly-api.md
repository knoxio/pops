# US-10: Assembly tRPC endpoint

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Done

## Description

As a developer, I want a tRPC endpoint that runs the session assembly and returns the ordered shelf list with the first page of items for each shelf.

## Acceptance Criteria

- [x] `media.discovery.assembleSession` query: no required input (profile computed server-side)
- [x] Returns `{ shelves: Array<{ shelfId, title, subtitle?, emoji?, items: DiscoverResult[], totalCount, hasMore }> }`
- [x] Runs full assembly: generate → filter → score → select → order → jitter → record impressions
- [x] First page of items (limit 10) pre-fetched for each selected shelf
- [x] Performance: < 2s total for 12 shelves (parallel TMDB fetches)
- [x] Protected procedure
- [x] Tests: returns shelves, variety constraints visible in output, impressions recorded
