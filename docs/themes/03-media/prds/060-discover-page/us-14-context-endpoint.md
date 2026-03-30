# US-14: Context-aware picks endpoint

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a developer, I want an endpoint that returns movie results for the currently active context collections.

## Acceptance Criteria

- [ ] `media.discovery.contextPicks` tRPC query
- [ ] Evaluates active collections using server clock (hour, month, day of week)
- [ ] For each active collection (max 2), fetches TMDB `/discover/movie` with the collection's genre/keyword filters, `sort_by=vote_average.desc`, `vote_count.gte=100`
- [ ] Exclude: library movies, dismissed movies
- [ ] Return `{ collections: Array<{ id, title, emoji, results: DiscoverResult[] }> }`
- [ ] Supports page parameter per collection for Load More
- [ ] Tests cover: correct collection evaluation, TMDB query construction, exclusions
