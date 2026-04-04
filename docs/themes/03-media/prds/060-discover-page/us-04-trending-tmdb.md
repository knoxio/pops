# US-04: Trending on TMDB section

> PRD: [060 — Discover Page](README.md)
> Status: Done

## Description

As a user, I want to browse globally trending movies from TMDB with day/week toggle and Load More pagination.

## Acceptance Criteria

- [x] "Trending" `HorizontalScrollRow` with day/week pill toggle
- [x] Time window persists in URL `?window=day` (week is default, omitted)
- [x] "Load More" appends next page, deduplicated by tmdbId
- [x] Cards show poster, title, year, TMDB rating badge
- [x] Calls `media.discovery.trending` with `{ timeWindow, page }`
- [x] Excluded: dismissed movies
- [x] Error: retry button, other sections unaffected
- [x] Loading skeleton on first page
- [x] Tests cover: toggle, dedup, load more, error retry
