# US-01: TMDB HTTP client and rate limiter

> PRD: [029 — TMDB Client](README.md)
> Status: Partial

## Description

As a developer, I want an HTTP client for the TMDB API with a token bucket rate limiter so that movie searches and metadata fetches stay within TMDB's rate limits.

## Acceptance Criteria

- [x] TMDB HTTP client module that wraps TMDB REST API calls
- [ ] Token bucket rate limiter: 50 tokens capacity, refills 50 tokens every 10 seconds — **implementation uses 40 tokens/10s (matches TMDB's real limit); spec number is wrong**
- [x] All TMDB API calls pass through the rate limiter before executing
- [x] When the bucket is empty, requests queue and wait for available tokens — no immediate errors
- [ ] `TMDB_API_TOKEN` read from environment; startup validation fails with a clear error if missing — **env var is `TMDB_API_KEY`; validation is lazy (returns null), not startup**
- [x] `media.search.movies(query, page?)` tRPC procedure calls TMDB's `/search/movie` endpoint
- [x] Search returns `{ results: TmdbSearchResult[], totalResults, totalPages }` with fields mapped from TMDB response
- [x] Internal `fetchMovieDetails(tmdbId)` method calls TMDB's `/movie/{id}` endpoint with `append_to_response=images`
- [x] Movie details response includes: tmdbId, imdbId, title, originalTitle, overview, tagline, releaseDate, runtime, status, originalLanguage, budget, revenue, voteAverage, voteCount, genres, posterPath (TMDB URL), backdropPath (TMDB URL)
- [x] Genres mapped from TMDB's `{ id, name }` objects to plain string array
- [x] HTTP errors (4xx, 5xx) from TMDB are caught and returned as typed errors — not raw fetch failures
- [x] Tests cover: successful search, empty search results, metadata fetch, rate limiter queuing behaviour, missing API token validation

## Notes

TMDB API v3 uses Bearer token auth via the `Authorization` header. The rate limiter is shared across all endpoints — a burst of search calls should delay subsequent metadata fetches if the bucket is depleted. The rate limiter should be a reusable utility, not TMDB-specific, since TheTVDB (PRD-030) needs its own instance.
