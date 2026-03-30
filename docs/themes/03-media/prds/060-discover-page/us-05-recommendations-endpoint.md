# US-05: Recommendations backend endpoint

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a developer, I want a recommendations endpoint that uses a larger source pool and excludes dismissed movies so the frontend gets clean, scored results.

## Acceptance Criteria

- [ ] `media.discovery.recommendations` tRPC query accepts `{ sampleSize: number }` (default 20, max 100)
- [ ] Source: top N library movies by overall ELO score
- [ ] For each source, fetch TMDB `/movie/{id}/recommendations` (page 1)
- [ ] Merge all results, deduplicate by tmdbId (keep first occurrence)
- [ ] Exclude: movies already in library, dismissed movies (from `dismissed_discover` table)
- [ ] Score using `scoreDiscoverResults` from us-03
- [ ] Return `{ results: ScoredDiscoverResult[], sourceMovies: string[], totalComparisons: number }`
- [ ] Returns empty results with `totalComparisons < 5` (cold start signal for frontend)
- [ ] Tests cover: source selection, deduplication, library exclusion, dismissed exclusion, scoring, cold start
