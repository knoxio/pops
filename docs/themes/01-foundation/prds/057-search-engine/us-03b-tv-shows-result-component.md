# US-03b: TV shows result component (frontend)

> PRD: [057 — Search Engine](README.md)
> Status: Done

## Description

As a user, I want TV show search results to show poster, name, year, status, and season count so I can identify the right show quickly.

## Acceptance Criteria

- [x] `TvShowsResultComponent` registered in frontend registry for domain `"tv-shows"`
- [x] Renders: poster thumbnail (small, left-aligned) + name + year + status badge + season count
- [x] Highlights matched portion of name using `query` prop + `matchField`/`matchType`
- [x] Poster loads from local cache URL; falls back to Tv icon when posterUrl is null
- [x] Status badge styled by status value (Continuing = blue, Ended = muted, etc.)
- [x] Tests: renders correctly with all fields, poster fallback, status badge, highlighting

## Notes

Component lives in `packages/app-media/`. Depends on US-03 for hit data shape.
