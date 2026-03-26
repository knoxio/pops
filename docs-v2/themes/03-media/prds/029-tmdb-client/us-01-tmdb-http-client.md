# US-01: TMDB HTTP client and rate limiter

> PRD: [029 — TMDB Client](README.md)
> Status: To Review

## Description

As a developer, I want an HTTP client for the TMDB API with a token bucket rate limiter so that movie searches and metadata fetches stay within TMDB's rate limits.

## Acceptance Criteria

- [ ] TMDB HTTP client module that wraps TMDB REST API calls
- [ ] Token bucket rate limiter: 50 tokens capacity, refills 50 tokens every 10 seconds
- [ ] All TMDB API calls pass through the rate limiter before executing
- [ ] When the bucket is empty, requests queue and wait for available tokens — no immediate errors
- [ ] `TMDB_API_TOKEN` read from environment; startup validation fails with a clear error if missing
- [ ] `media.search.movies(query, page?)` tRPC procedure calls TMDB's `/search/movie` endpoint
- [ ] Search returns `{ results: TmdbSearchResult[], totalResults, totalPages }` with fields mapped from TMDB response
- [ ] Internal `fetchMovieDetails(tmdbId)` method calls TMDB's `/movie/{id}` endpoint with `append_to_response=images`
- [ ] Movie details response includes: tmdbId, imdbId, title, originalTitle, overview, tagline, releaseDate, runtime, status, originalLanguage, budget, revenue, voteAverage, voteCount, genres, posterPath (TMDB URL), backdropPath (TMDB URL)
- [ ] Genres mapped from TMDB's `{ id, name }` objects to plain string array
- [ ] HTTP errors (4xx, 5xx) from TMDB are caught and returned as typed errors — not raw fetch failures
- [ ] Tests cover: successful search, empty search results, metadata fetch, rate limiter queuing behaviour, missing API token validation

## Notes

TMDB API v3 uses Bearer token auth via the `Authorization` header. The rate limiter is shared across all endpoints — a burst of search calls should delay subsequent metadata fetches if the bucket is depleted. The rate limiter should be a reusable utility, not TMDB-specific, since TheTVDB (PRD-030) needs its own instance.
