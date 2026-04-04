# US-10: Assembly tRPC endpoint

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Not started

## Description

As a developer, I want a tRPC endpoint that runs the session assembly and returns the ordered shelf list with the first page of items for each shelf.

## Acceptance Criteria

- [ ] `media.discovery.assembleSession` query: no required input (profile computed server-side)
- [ ] Returns `{ shelves: Array<{ shelfId, title, subtitle?, emoji?, items: DiscoverResult[], totalCount, hasMore }> }`
- [ ] Runs full assembly: generate → filter → score → select → order → jitter → record impressions
- [ ] First page of items (limit 10) pre-fetched for each selected shelf
- [ ] Performance: < 2s total for 12 shelves (parallel TMDB fetches)
- [ ] Protected procedure
- [ ] Tests: returns shelves, variety constraints visible in output, impressions recorded
