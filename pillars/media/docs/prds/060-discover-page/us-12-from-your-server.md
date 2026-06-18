# US-12: From Your Server

> PRD: [060 — Discover Page](README.md)
> Status: Done

## Description

As a user, I want to see unwatched movies from my Plex server ranked by how well they match my preferences so I can decide what to watch tonight.

## Acceptance Criteria

- [x] `media.discovery.fromYourServer` tRPC query
- [x] Source: POPS library movies (all movies imported from Plex sync)
- [x] Filter: unwatched only (no watch_history entry)
- [x] Score using `scoreDiscoverResults` from us-03
- [x] Sorted by match percentage descending, limit 20
- [x] Return includes poster URL (local proxy), title, year, match percentage
- [x] Frontend: `HorizontalScrollRow` with subtitle "Unwatched movies on your server, ranked for you"
- [x] Hidden when Plex not connected or no unwatched movies
- [x] Local-only query — no external API calls
- [x] Tests cover: unwatched filter, scoring, empty state
