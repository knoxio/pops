# US-11: Rewatch Suggestions

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want suggestions for movies worth rewatching from my watch history so I can revisit favourites I may have forgotten about.

## Acceptance Criteria

- [ ] `media.discovery.rewatchSuggestions` tRPC query
- [ ] Source: POPS watch_history joined with media_scores (ELO)
- [ ] Only movies watched 6+ months ago
- [ ] Only movies with above-median ELO score (or top 50% by voteAverage if no ELO)
- [ ] Sorted by ELO score descending, limit 20
- [ ] Return includes movie poster, title, year, score
- [ ] Frontend: `HorizontalScrollRow` with subtitle "Movies you loved — worth another watch"
- [ ] Cards link to movie detail page (already in library)
- [ ] Hidden when no watch history older than 6 months
- [ ] Local-only query — no external API calls
- [ ] Tests cover: 6-month threshold, score filter, sorting, empty state
