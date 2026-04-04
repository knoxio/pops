# US-08: Media domain verbs

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As the AI, I have media verbs so I can search the library, manage watchlists, log watches, and request downloads.

## Acceptance Criteria

- [ ] `media:search-library { query }` — search movies and TV shows
- [ ] `media:get-movie { id }` — movie details with scores, watch history
- [ ] `media:get-tv-show { id }` — TV show details with seasons, progress
- [ ] `media:get-watch-history { mediaType?, limit? }` — recent watch events
- [ ] `media:get-rankings { dimensionId?, limit? }` — ELO rankings
- [ ] `media:add-to-library { tmdbId }` — add movie from TMDB
- [ ] `media:add-to-watchlist { tmdbId }` — add to watchlist
- [ ] `media:mark-watched { tmdbId, watchedAt? }` — log watch event (defaults to now)
- [ ] `media:request-download { tmdbId }` — request via Radarr
- [ ] All verbs registered with Zod param schemas
- [ ] Tests: each verb executes correctly
