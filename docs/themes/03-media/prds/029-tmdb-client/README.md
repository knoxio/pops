# PRD-029: TMDB Client

> Epic: [01 — Metadata Integration](../../epics/01-metadata-integration.md)
> Status: Done

## Overview

Build an HTTP client for The Movie Database (TMDB) that handles movie search, metadata fetch, and poster/backdrop download with local caching per [ADR-011](../../../../architecture/adr-011-local-image-cache.md). A token bucket rate limiter respects TMDB's 50 requests per 10 seconds limit. The client powers the add-to-library flow: search TMDB, select a result, fetch full metadata, download images, create the movie record.

## Data Model

No new tables — uses the `movies` table from PRD-028. Image paths written to `posterPath`, `backdropPath`, `logoPath` columns.

## API Surface

| Procedure                    | Input                                                | Output                                                      | Notes                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `media.search.movies`        | query (string), page? (int, default 1)               | `{ results: TmdbSearchResult[], totalResults, totalPages }` | Proxied TMDB search — not stored locally                                                                                                             |
| `media.library.addMovie`     | tmdbId (int)                                         | `{ data: Movie }`                                           | Fetch metadata from TMDB, create movie in DB, download and cache poster + backdrop. Idempotent — returns existing movie if tmdbId already in library |
| `media.library.refreshMovie` | id (int), redownloadImages? (boolean, default false) | `{ data: Movie }`                                           | Re-fetch metadata from TMDB, update DB record. Optionally re-download images                                                                         |

### TmdbSearchResult shape

```
{
  tmdbId: number
  title: string
  originalTitle: string
  overview: string
  releaseDate: string
  posterPath: string | null    // TMDB CDN URL (not local)
  backdropPath: string | null  // TMDB CDN URL (not local)
  voteAverage: number
  voteCount: number
  genres: string[]
}
```

## Image Caching

**Storage path:** `/media/images/movies/{tmdbId}/{image}.jpg`

- `poster.jpg` — w500 size for list/grid views, original size for detail
- `backdrop.jpg` — w1280 size for detail hero
- `logo.png` — original size (where available from TMDB)

**Fallback chain (per [ADR-011](../../../../architecture/adr-011-local-image-cache.md)):**

1. User override (`posterOverridePath`) — highest priority
2. Local cache (`/media/images/movies/{tmdbId}/poster.jpg`)
3. TMDB CDN fallback (on-demand fetch if cache miss)
4. Generated placeholder (coloured rectangle with title text)

**Serving:** API endpoint serves cached images with appropriate cache headers. Frontend references the API endpoint, not file paths directly.

## Rate Limiting

- Token bucket algorithm: 50 tokens capacity, refills at 50 tokens per 10 seconds
- Shared across all TMDB API calls (search, metadata fetch, image download)
- When bucket is empty, requests queue until tokens are available — no errors thrown for rate limiting
- TMDB_API_KEY environment variable required

## Business Rules

- `addMovie` is idempotent: if a movie with the given tmdbId already exists in the database, return the existing record without re-fetching or re-downloading
- `addMovie` fetches full movie details (not just search results) from TMDB's `/movie/{id}` endpoint, which includes runtime, budget, revenue, tagline, and IMDb ID
- Image download is part of the add-to-library transaction — if image download fails, the movie record is still created (posterPath set to null)
- `refreshMovie` always re-fetches metadata from TMDB, even if the local record appears up-to-date
- Search results are not cached locally — they are always fresh from TMDB
- All TMDB API calls go through the rate limiter

## Edge Cases

| Case                                                            | Behaviour                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| tmdbId already in library (addMovie)                            | Return existing movie record, skip fetch and download                                   |
| TMDB API returns 404 for tmdbId                                 | Return error — movie not found on TMDB                                                  |
| TMDB API rate limit hit (429)                                   | Token bucket prevents this; if it somehow occurs, retry after TMDB's Retry-After header |
| Image download fails (network error, 404)                       | Movie record created with null image path; fallback chain handles display               |
| TMDB API key missing/invalid                                    | Startup validation fails with clear error message                                       |
| Search returns zero results                                     | Return empty results array with totalResults: 0                                         |
| TMDB returns movie with no poster                               | posterPath stored as null; fallback chain renders placeholder                           |
| refreshMovie with redownloadImages=true but image URL unchanged | Re-download anyway — URL may point to updated content                                   |

## User Stories

| #   | Story                                               | Summary                                                                     | Status | Parallelisable          |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------- | ------ | ----------------------- |
| 01  | [us-01-tmdb-http-client](us-01-tmdb-http-client.md) | HTTP client with token bucket rate limiter, search endpoint, metadata fetch | Done   | Yes                     |
| 02  | [us-02-image-cache](us-02-image-cache.md)           | Poster/backdrop download, local storage, serving endpoint, fallback chain   | Done   | Yes                     |
| 03  | [us-03-add-to-library](us-03-add-to-library.md)     | addMovie flow (fetch + create + download), refreshMovie, idempotency        | Done   | Blocked by us-01, us-02 |

US-01 and US-02 can run in parallel. US-03 composes them into the add-to-library flow.

## Out of Scope

- TV show metadata (PRD-030 — TheTVDB)
- UI for search/browse (Epic 02)
- Bulk import from external lists
- Person/cast/crew data

## Drift Check

last checked: 2026-04-17
