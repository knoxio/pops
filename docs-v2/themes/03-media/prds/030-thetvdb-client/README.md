# PRD-030: TheTVDB Client

> Epic: [01 — Metadata Integration](../../epics/01-metadata-integration.md)
> Status: To Review

## Overview

Build an HTTP client for TheTVDB that handles TV show search, metadata fetch for shows/seasons/episodes, and poster download with local caching per [ADR-011](../../../../architecture/adr-011-local-image-cache.md). JWT-based authentication with automatic token refresh handles TheTVDB's auth model. The client powers the add-to-library flow: search TheTVDB, select a show, fetch the full show with all seasons and episodes, download images, create all records.

## Data Model

No new tables — uses the `tv_shows`, `seasons`, and `episodes` tables from PRD-028. Image paths written to `posterPath` columns.

## API Surface

| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `media.search.tvShows` | query (string) | `{ results: TvdbSearchResult[] }` | Proxied TheTVDB search — not stored locally |
| `media.library.addTvShow` | tvdbId (int) | `{ data: TvShow }` | Fetch show + all seasons + all episodes from TheTVDB, create in DB, download images. Idempotent — returns existing show if tvdbId already in library |
| `media.library.refreshTvShow` | id (int), redownloadImages? (boolean, default false), refreshEpisodes? (boolean, default true) | `{ data: TvShow, diff: RefreshDiff }` | Re-fetch metadata, report episodes/seasons added/updated |

### TvdbSearchResult shape

```
{
  tvdbId: number
  name: string
  originalName: string | null
  overview: string | null
  firstAirDate: string | null
  status: string | null
  posterPath: string | null     // TheTVDB CDN URL (not local)
  networks: string[]
}
```

### RefreshDiff shape

```
{
  seasonsAdded: number
  seasonsUpdated: number
  episodesAdded: number
  episodesUpdated: number
}
```

## Authentication

- TheTVDB API v4 uses JWT tokens obtained via the `/login` endpoint with an API key
- `THETVDB_API_KEY` environment variable required
- Token is cached in memory after initial login
- On 401 response, automatically re-authenticate and retry the failed request (once)
- Token refresh is transparent to callers — no manual token management

## Image Caching

**Storage paths:**
- Show poster: `/media/images/tv/{tvdbId}/poster.jpg`
- Season poster: `/media/images/tv/{tvdbId}/season_{num}.jpg`

**Fallback chain (same as TMDB per [ADR-011](../../../../architecture/adr-011-local-image-cache.md)):**

1. User override (`posterOverridePath`) — highest priority
2. Local cache (`/media/images/tv/{tvdbId}/poster.jpg`)
3. TheTVDB CDN fallback (on-demand fetch if cache miss)
4. Generated placeholder (coloured rectangle with show name)

**Serving:** Same API endpoint as movie images — shared image serving infrastructure.

## Business Rules

- `addTvShow` is idempotent: if a show with the given tvdbId already exists, return the existing record without re-fetching or re-downloading
- `addTvShow` fetches the full show, then all seasons, then all episodes for each season — a complete snapshot of the show's hierarchy
- Seasons with `seasonNumber` 0 (specials) are included
- Episodes without an air date are still created (upcoming episodes)
- Image download is part of the add flow — if download fails, records are still created with null image paths
- `refreshTvShow` compares the fetched data against existing records: new seasons/episodes are inserted, existing ones are updated. Nothing is deleted during refresh (to preserve watch history references)
- `refreshTvShow` returns a diff summary so the caller knows what changed
- All TheTVDB API calls go through the JWT auth layer

## Edge Cases

| Case | Behaviour |
|------|-----------|
| tvdbId already in library (addTvShow) | Return existing show record, skip fetch and download |
| TheTVDB API returns 404 for tvdbId | Return error — show not found on TheTVDB |
| JWT token expired mid-request | Auto-refresh token, retry the failed request once |
| THETVDB_API_KEY missing/invalid | Startup validation fails with clear error message |
| Show has no seasons on TheTVDB | Show record created with empty seasons list |
| Season has no episodes on TheTVDB | Season record created; listEpisodes returns empty |
| Image download fails | Record created with null posterPath; fallback chain handles display |
| refreshTvShow finds new season | New season and its episodes inserted, diff reports seasonsAdded |
| refreshTvShow finds new episode in existing season | Episode inserted, diff reports episodesAdded |
| refreshTvShow on non-existent id | Returns 404 |
| TheTVDB returns show with no poster | posterPath stored as null; fallback chain renders placeholder |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-thetvdb-http-client](us-01-thetvdb-http-client.md) | HTTP client with JWT auth, auto-refresh, search endpoint | Partial | Yes |
| 02 | [us-02-image-cache](us-02-image-cache.md) | Poster download for shows/seasons, local storage, serving | Partial | Yes |
| 03 | [us-03-add-to-library](us-03-add-to-library.md) | addTvShow flow (fetch show + seasons + episodes, create all, download images), refreshTvShow with diff reporting | Partial | Blocked by us-01, us-02 |

US-01 and US-02 can run in parallel. US-03 composes them into the add-to-library and refresh flows.

## Out of Scope

- Movie metadata (PRD-029 — TMDB)
- UI for search/browse (Epic 02)
- Plex metadata matching (Epic 06)
- Episode still image caching (future enhancement — posters only for v1)
