# US-09: From Your Watchlist

> PRD: [060 — Discover Page](README.md)
> Status: Done

## Description

As a user, I want recommendations based on my watchlist so I can discover movies similar to what I've saved to watch.

## Acceptance Criteria

- [x] `media.discovery.watchlistRecommendations` tRPC query
- [x] Source: movie-type items from POPS watchlist (cap at 10 most recently added)
- [x] For each, fetch TMDB `/movie/{id}/similar` (page 1)
- [x] Merge, deduplicate by tmdbId
- [x] Exclude: library movies, watchlist items, dismissed movies
- [x] Score using `scoreDiscoverResults`
- [x] Return `{ results: ScoredDiscoverResult[], sourceMovies: string[] }`
- [x] Frontend: `HorizontalScrollRow` with subtitle "Similar to movies on your watchlist"
- [x] Hidden when watchlist is empty
- [x] Empty state: "Add more movies to your watchlist to get suggestions"
- [x] Tests cover: source from watchlist, exclusions, attribution, empty state
