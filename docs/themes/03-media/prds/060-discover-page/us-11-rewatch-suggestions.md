# US-11: Rewatch Suggestions

> PRD: [060 — Discover Page](README.md)
> Status: Done

## Description

As a user, I want suggestions for movies worth rewatching from my watch history so I can revisit favourites I may have forgotten about.

## Acceptance Criteria

- [x] `media.discovery.rewatchSuggestions` tRPC query
- [x] Source: POPS watch_history joined with media_scores (ELO)
- [x] Only movies watched 6+ months ago
- [x] Only movies with above-median ELO score (or top 50% by voteAverage if no ELO)
- [x] Sorted by ELO score descending, limit 20
- [x] Return includes movie poster, title, year, score
- [x] Frontend: `HorizontalScrollRow` with subtitle "Movies you loved — worth another watch"
- [x] Cards link to movie detail page (already in library)
- [x] Hidden when no watch history older than 6 months
- [x] Local-only query — no external API calls
- [x] Tests cover: 6-month threshold, score filter, sorting, empty state
