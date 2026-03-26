# US-01: TheTVDB HTTP client with JWT auth

> PRD: [030 — TheTVDB Client](README.md)
> Status: Done

## Description

As a developer, I want an HTTP client for the TheTVDB API with JWT authentication and automatic token refresh so that TV show searches and metadata fetches are authenticated and resilient to token expiry.

## Acceptance Criteria

- [x] TheTVDB HTTP client module that wraps TheTVDB REST API v4 calls
- [x] JWT authentication: calls `/login` with API key to obtain a token
- [x] Token cached in memory after initial login — subsequent requests reuse it
- [x] On 401 response, automatically re-authenticates (calls `/login` again) and retries the failed request once
- [x] If retry after re-auth also fails, returns an error — no infinite retry loop
- [x] `THETVDB_API_KEY` read from environment; startup validation fails with a clear error if missing
- [x] `media.search.tvShows(query)` tRPC procedure calls TheTVDB's `/search` endpoint filtered to series type
- [x] Search returns `{ results: TvdbSearchResult[] }` with fields mapped from TheTVDB response
- [x] Internal `fetchShowDetails(tvdbId)` method calls TheTVDB's `/series/{id}/extended` endpoint
- [x] Show details response includes: tvdbId, name, originalName, overview, firstAirDate, lastAirDate, status, originalLanguage, numberOfSeasons, numberOfEpisodes, episodeRunTime, voteAverage, voteCount, genres, networks, poster URL
- [x] Internal `fetchSeasons(tvdbId)` method returns all seasons for a show (including specials at seasonNumber 0)
- [x] Internal `fetchEpisodes(seasonId)` method returns all episodes for a season with: tvdbId, episodeNumber, name, overview, airDate, runtime, voteAverage
- [x] Genres and networks mapped to plain string arrays
- [x] HTTP errors (4xx, 5xx) from TheTVDB are caught and returned as typed errors
- [x] Tests cover: successful auth, token refresh on 401, search, show details fetch, season/episode fetch, missing API key validation

## Notes

TheTVDB API v4 uses Bearer token auth. The login endpoint accepts `{ apikey: string }` and returns `{ data: { token: string } }`. Token lifetime is not documented reliably — the safest approach is to cache it and handle 401s reactively. The rate limiter utility from PRD-029 can be reused here if TheTVDB imposes rate limits in the future, but for now TheTVDB does not have a published rate limit.
