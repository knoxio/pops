# US-07: From Your Server

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want to see unwatched movies from my Plex server scored by how well they match my preferences, so that I can decide what to watch tonight from content I already own.

## Acceptance Criteria

- [ ] "Ready on Your Server" section renders as a `HorizontalScrollRow`
- [ ] Source: movies in the POPS library that were imported from Plex (have a Plex library match)
- [ ] Filtered to unwatched movies only (no entry in watch_history)
- [ ] Scored against the user's preference profile (genre affinity matching)
- [ ] Each card shows match percentage badge, poster, title, year
- [ ] Sorted by match percentage descending
- [ ] Subtitle: "Unwatched movies on your server, ranked for you"
- [ ] Hidden when Plex is not connected or no unwatched movies exist
- [ ] Limited to 20 results
- [ ] New `media.discovery.fromYourServer` tRPC query
- [ ] Tests cover: unwatched filter, preference scoring, sorting, Plex-only items, empty state

## Notes

This query is local-only — no external API calls. The "available on Plex" filter can use the fact that movies imported via Plex sync have a matching TMDB ID in the library. For a more accurate check, cross-reference with the Plex library items, but the simpler approach (all library movies minus watched) works for v1. The match percentage uses the same `scoreRecommendations` logic from the discovery service.
