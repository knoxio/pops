# US-09: From Your Watchlist

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want recommendations based on my watchlist so I can discover movies similar to what I've saved to watch.

## Acceptance Criteria

- [ ] `media.discovery.watchlistRecommendations` tRPC query
- [ ] Source: movie-type items from POPS watchlist (cap at 10 most recently added)
- [ ] For each, fetch TMDB `/movie/{id}/similar` (page 1)
- [ ] Merge, deduplicate by tmdbId
- [ ] Exclude: library movies, watchlist items, dismissed movies
- [ ] Score using `scoreDiscoverResults`
- [ ] Return `{ results: ScoredDiscoverResult[], sourceMovies: string[] }`
- [ ] Frontend: `HorizontalScrollRow` with subtitle "Similar to movies on your watchlist"
- [ ] Hidden when watchlist is empty
- [ ] Empty state: "Add more movies to your watchlist to get suggestions"
- [ ] Tests cover: source from watchlist, exclusions, attribution, empty state
