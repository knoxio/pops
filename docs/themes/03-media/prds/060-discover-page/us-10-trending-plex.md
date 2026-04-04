# US-10: Trending on Plex

> PRD: [060 — Discover Page](README.md)
> Status: Done

## Description

As a user, I want to see what's popular across the Plex community so I can discover content other Plex users are watching.

## Acceptance Criteria

- [x] `media.discovery.trendingPlex` tRPC query
- [x] Fetches from Plex Discover cloud API trending/popular endpoint
- [x] Returns results as `DiscoverResult[]` with tmdbId matching where possible
- [x] Hidden when Plex is not connected (no token)
- [x] Graceful fallback: section hidden (not error) if Plex API fails
- [x] Frontend: `HorizontalScrollRow` titled "Trending on Plex"
- [x] Exclude: dismissed movies
- [x] Tests cover: connected rendering, hidden when disconnected, API failure hides section

## Notes

The exact Plex trending endpoint needs investigation. If no dedicated trending endpoint exists in the Plex Discover API, this US can be deferred until one is found.
