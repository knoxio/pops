# US-12: From Your Server

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want to see unwatched movies from my Plex server ranked by how well they match my preferences so I can decide what to watch tonight.

## Acceptance Criteria

- [ ] `media.discovery.fromYourServer` tRPC query
- [ ] Source: POPS library movies (all movies imported from Plex sync)
- [ ] Filter: unwatched only (no watch_history entry)
- [ ] Score using `scoreDiscoverResults` from us-03
- [ ] Sorted by match percentage descending, limit 20
- [ ] Return includes poster URL (local proxy), title, year, match percentage
- [ ] Frontend: `HorizontalScrollRow` with subtitle "Unwatched movies on your server, ranked for you"
- [ ] Hidden when Plex not connected or no unwatched movies
- [ ] Local-only query — no external API calls
- [ ] Tests cover: unwatched filter, scoring, empty state
