# Epic: Metadata Integration

**Theme:** Media
**Priority:** 1 (required before UI — provides all metadata)
**Status:** Done

## Goal

Build service layers that wrap TMDB (movies) and TheTVDB (TV shows), providing search, metadata fetch, and poster caching. These are the data sources that eliminate manual metadata entry.

## Why second?

The UI needs metadata to display. The watchlist needs metadata to populate. Every media record starts as a search result from TMDB or TheTVDB. Without these services, the app has nothing to show.

## Scope

### In scope

- **TMDB API client service (movies):**
  - Authentication (API key via environment variable / Docker secret)
  - Movie search — query TMDB, return ranked results with poster thumbnails
  - Movie detail fetch — full metadata for a single movie by TMDB ID
  - Rate limiting — respect TMDB's 40 req/10s limit, queue or throttle requests
- **TheTVDB API client service (TV shows):**
  - Authentication (API key via environment variable / Docker secret)
  - TV show search — query TheTVDB, return ranked results with poster thumbnails
  - TV show detail fetch — full metadata including seasons and episode lists
  - Season detail fetch — episode list for a specific season
  - Rate limiting — respect TheTVDB rate limits
- **Poster download and local caching:**
  - Download poster/backdrop images from TMDB (movies) and TheTVDB (TV) on first access
  - Store in a configurable local directory (e.g., `/data/media/posters/`)
  - Serve via an API endpoint (e.g., `/media/images/:type/:filename`)
  - Cache headers for browser-side caching
- **Metadata refresh** — re-fetch data from the appropriate source for an existing record on demand
- **tRPC procedures:**
  - `media.search.movies` — search query → TMDB results
  - `media.search.tvShows` — search query → TheTVDB results
  - `media.metadata.getMovie` — TMDB ID → full movie details
  - `media.metadata.getTvShow` — TheTVDB ID → full show details (with seasons)
  - `media.metadata.getSeason` — TheTVDB ID + season number → episodes
- **"Add to library" flows:**
  - Movies: search TMDB → select result → fetch full metadata → insert into `movies` table
  - TV shows: search TheTVDB → select result → fetch full metadata → insert into `tv_shows` + `seasons` + `episodes` tables in one operation

### Out of scope

- Person/cast/crew storage (metadata stays as external references, not local records)
- Trending/popular/upcoming feeds (Epic 5 — Discovery)
- Image optimisation or resizing (serve originals, browser handles display sizing)
- Episode still images (only movie/show posters and backdrops cached to limit disk usage)

## Deliverables

1. TMDB client service with movie search, detail fetch, and image download
2. TheTVDB client service with TV show search, detail fetch, season/episode fetch, and image download
3. Rate limiter for each API
4. Local poster cache with configurable storage directory
5. Image serving endpoint with cache headers
6. tRPC procedures for search and detail fetch (movies via TMDB, TV via TheTVDB)
7. "Add to library" procedure for movies (TMDB → local DB)
8. "Add to library" procedure for TV shows (TheTVDB → local DB, populates all seasons/episodes)
9. Unit tests for both API clients (mocked responses)
10. Integration test for both add-to-library flows
11. Environment variables for TMDB and TheTVDB API keys documented in `.env.example`

## Dependencies

- Epic 0 (Data Model & API Module) — tables must exist to insert metadata into
- TMDB API key (free, requires account registration at themoviedb.org)
- TheTVDB API key (free, requires account registration at thetvdb.com)

## Risks

- **Two external API dependencies** — Two services to maintain clients for, two sets of rate limits, two potential points of failure. Mitigation: each client is isolated behind its own service interface. If one breaks, the other type of media still works.
- **TMDB rate limits** — 40 requests per 10 seconds. A bulk movie import could hit this. Mitigation: queue requests with a token bucket rate limiter.
- **TheTVDB API stability** — TheTVDB has migrated API versions in the past (v3 → v4). Mitigation: isolate behind a service interface so the implementation can be swapped without touching consumers.
- **Poster disk usage** — ~200 KB per poster × 2,500 movies = ~500 MB for movie posters. TV show posters add ~100 MB. Total budget ~1 GB as agreed.
- **Network dependency** — Both APIs require internet access. The N95 is always online, but search won't work during outages. Mitigation: all cached metadata and posters serve from local storage. Only search and metadata refresh need external APIs.
