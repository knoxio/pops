# US-05: Recommendations backend endpoint

> PRD: [060 — Discover Page](README.md)
> Status: Done

## Description

As a developer, I want a recommendations endpoint that uses a larger source pool and excludes dismissed movies so the frontend gets clean, scored results.

## Acceptance Criteria

- [x] `media.discovery.recommendations` tRPC query accepts `{ sampleSize: number }` (default 20, max 100)
- [x] Source: top N library movies by overall ELO score
- [x] For each source, fetch TMDB `/movie/{id}/recommendations` (page 1)
- [x] Merge all results, deduplicate by tmdbId (keep first occurrence)
- [x] Exclude: movies already in library, dismissed movies (from `dismissed_discover` table)
- [x] Score using `scoreDiscoverResults` from us-03
- [x] Return `{ results: ScoredDiscoverResult[], sourceMovies: string[], totalComparisons: number }`
- [x] Returns empty results with `totalComparisons < 5` (cold start signal for frontend)
- [x] Tests cover: source selection, deduplication, library exclusion, dismissed exclusion, scoring, cold start
