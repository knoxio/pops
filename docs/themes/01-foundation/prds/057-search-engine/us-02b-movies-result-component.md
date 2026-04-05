# US-02b: Movies result component (frontend)

> PRD: [057 — Search Engine](README.md)
> Status: Done

## Description

As a user, I want movie search results to show poster, title, year, rating, and runtime so I can identify the right movie quickly.

## Acceptance Criteria

- [x] `MoviesResultComponent` registered in frontend registry for domain `"movies"`
- [x] Renders: poster thumbnail (small, left-aligned) + title + year + rating
- [x] Highlights matched portion of title using `query` prop + `matchField`/`matchType`
- [x] Poster loads from local cache URL; falls back to Film icon when posterUrl is null
- [x] Tests: renders correctly with all fields, poster fallback, highlighting

## Notes

Component lives in `packages/app-media/`. Depends on US-02 for hit data shape.
