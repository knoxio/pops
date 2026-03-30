# US-05: Trending on Plex

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want to see what's trending across the Plex community so that I can discover content that other Plex users are watching.

## Acceptance Criteria

- [ ] "Trending on Plex" section renders as a `HorizontalScrollRow`
- [ ] Source: Plex Discover cloud API trending/popular endpoint
- [ ] Hidden when Plex is not connected (no auth token)
- [ ] Each card shows poster, title, year, and Plex audience rating if available
- [ ] Cards have the standard hover actions (Add, Watchlist, Watched, Request, Not Interested)
- [ ] Movies already in the library show "Owned" badge
- [ ] Results exclude dismissed movies
- [ ] Supports Load More pagination if the Plex API supports it
- [ ] New `media.discovery.trendingPlex` tRPC query that calls the Plex Discover API
- [ ] Falls back gracefully if Plex API fails (section hidden, not error state)
- [ ] Tests cover: rendering when connected, hidden when disconnected, library badges

## Notes

The Plex Discover API may have an endpoint like `https://discover.provider.plex.tv/library/sections/trending/all` or similar. The exact endpoint needs investigation — check the PlexClient for existing Discover methods or the Python PlexAPI source for trending endpoints. If no dedicated trending endpoint exists, this section can be deferred.
