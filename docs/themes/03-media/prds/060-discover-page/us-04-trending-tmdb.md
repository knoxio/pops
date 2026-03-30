# US-04: Trending on TMDB section

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want to browse globally trending movies from TMDB with day/week toggle and Load More pagination.

## Acceptance Criteria

- [ ] "Trending" `HorizontalScrollRow` with day/week pill toggle
- [ ] Time window persists in URL `?window=day` (week is default, omitted)
- [ ] "Load More" appends next page, deduplicated by tmdbId
- [ ] Cards show poster, title, year, TMDB rating badge
- [ ] Calls `media.discovery.trending` with `{ timeWindow, page }`
- [ ] Excluded: dismissed movies
- [ ] Error: retry button, other sections unaffected
- [ ] Loading skeleton on first page
- [ ] Tests cover: toggle, dedup, load more, error retry
