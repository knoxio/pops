# PRD-008: TMDB Client (Movies)

**Epic:** [01 — Metadata Integration](../themes/media/epics/01-metadata-integration.md)
**Theme:** Media
**Status:** Draft
**ADRs:** [007 — Metadata Sources](../architecture/adr-007-metadata-sources.md), [009 — Local Image Caching](../architecture/adr-009-poster-local-cache.md), [011 — Drizzle ORM](../architecture/adr-011-drizzle-orm.md)

## Problem Statement

The media app requires movie metadata (titles, overviews, posters, genres, ratings) without manual data entry. TMDB is the canonical source for movie metadata and is natively used by Radarr and Plex for movie matching. A service layer is needed to search, fetch, and cache TMDB data, and to download poster/backdrop/logo images for local serving.

## Goal

A TMDB client service wraps the TMDB v3 API, providing movie search, detail fetch, and image download. An "add movie to library" flow fetches full metadata from TMDB and inserts it into the local database. Images are cached locally per ADR-009. The client is isolated behind a service interface so it can be maintained independently.

## Requirements

### R1: TMDB API Client Service

Create `apps/pops-api/src/modules/media/tmdb/`:

```
media/tmdb/
  client.ts           (HTTP client for TMDB API)
  types.ts            (TMDB API response types, mapping functions)
  rate-limiter.ts     (token bucket rate limiter)
  image-cache.ts      (download and serve images)
  service.ts          (orchestration — search, fetch, add-to-library)
  service.test.ts
  client.test.ts
  rate-limiter.test.ts
```

The client is a thin wrapper around TMDB's REST API v3. It handles:
- Authentication (API key as query parameter or Bearer token)
- Request construction (base URL, paths, query params)
- Response parsing (JSON → typed objects)
- Error handling (HTTP status codes → meaningful errors)

The client does NOT contain business logic — that lives in the service.

### R2: Authentication

TMDB API v3 supports two auth methods:
- **API key** as query parameter: `?api_key=YOUR_KEY`
- **Bearer token** via header: `Authorization: Bearer YOUR_TOKEN`

Use the Bearer token approach (cleaner, doesn't leak key in URLs/logs).

**Configuration:**
- Environment variable: `TMDB_API_KEY`
- Docker secret path: `/run/secrets/tmdb_api_key` (production)
- Document in `.env.example`: `TMDB_API_KEY=your_tmdb_v3_api_key`
- Client throws a clear error on startup if the key is missing

### R3: Movie Search

```typescript
interface TmdbSearchResult {
  tmdbId: number;
  title: string;
  originalTitle: string;
  overview: string;
  releaseDate: string;
  posterPath: string | null;   // TMDB relative path, e.g. /kqjL17yufvn9OVLyXYpvtyrFfak.jpg
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  genreIds: number[];          // TMDB genre ID integers
  originalLanguage: string;
  popularity: number;
}

interface SearchResponse {
  results: TmdbSearchResult[];
  totalResults: number;
  totalPages: number;
  page: number;
}
```

**TMDB endpoint:** `GET /3/search/movie?query={query}&page={page}&language=en-US`

**tRPC procedure:** `media.search.movies`

| Input | Type | Description |
|-------|------|-------------|
| `query` | `string` (min 1 char) | Search text |
| `page` | `number` (default 1) | Pagination |

Returns search results with poster thumbnail URLs resolved to local cache paths (if the movie is already in the library) or TMDB CDN URLs (for search results not yet added).

### R4: Movie Detail Fetch

```typescript
interface TmdbMovieDetail {
  tmdbId: number;
  imdbId: string | null;
  title: string;
  originalTitle: string;
  overview: string;
  tagline: string;
  releaseDate: string;
  runtime: number;
  status: string;              // "Released", "Post Production", etc.
  originalLanguage: string;
  budget: number;
  revenue: number;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  genres: { id: number; name: string }[];
  productionCompanies: { id: number; name: string }[];
  spokenLanguages: { iso_639_1: string; name: string }[];
}
```

**TMDB endpoint:** `GET /3/movie/{movie_id}?language=en-US`

**For logos:** `GET /3/movie/{movie_id}/images` — filter for English logos, pick highest vote_average

The detail fetch retrieves all metadata fields needed for the `movies` table. Genre names are extracted from the `genres` array and stored as a JSON string array (not TMDB's integer IDs).

### R5: Rate Limiter

TMDB allows 40 requests per 10 seconds per API key.

Implement a **token bucket** rate limiter:
- Bucket capacity: 40 tokens
- Refill rate: 4 tokens per second
- Before each request, consume one token
- If no tokens available, wait (async) until a token is available
- The limiter is shared across all TMDB requests (search, detail, image)

```typescript
class TokenBucketRateLimiter {
  constructor(capacity: number, refillRate: number);
  async acquire(): Promise<void>;  // resolves when a token is available
}
```

This is simpler and more predictable than retry-on-429 strategies. The caller never sees a rate limit error.

### R6: Image Download and Local Cache

Per ADR-009, download and cache images locally on "add to library."

**TMDB image URLs:** `https://image.tmdb.org/t/p/{size}/{path}`
- Poster: size `w780` (780px wide, good quality for all UI uses)
- Backdrop: size `w1280` (1280px wide)
- Logo: size `w500` (transparent PNG)

**Local storage layout:**
```
{MEDIA_IMAGES_DIR}/
  movies/{tmdb_id}/
    poster.jpg
    backdrop.jpg
    logo.png
    override.jpg          (user-uploaded, optional)
```

**Configuration:**
- Environment variable: `MEDIA_IMAGES_DIR` (default: `/data/media/images`)
- Document in `.env.example`

**Image cache service:**
```typescript
interface ImageCacheService {
  downloadMovieImages(tmdbId: number, posterPath: string | null, backdropPath: string | null, logoPath: string | null): Promise<void>;
  getImagePath(mediaType: 'movie', id: number, imageType: 'poster' | 'backdrop' | 'logo' | 'override'): string | null;
  deleteMovieImages(tmdbId: number): Promise<void>;
}
```

**Download behaviour:**
- Skip if `posterPath` / `backdropPath` is null (TMDB has no image)
- Skip if local file already exists (don't re-download on metadata refresh unless forced)
- Create directory `movies/{tmdb_id}/` if it doesn't exist
- Download concurrently (poster + backdrop + logo in parallel)
- Log failures but don't block the add-to-library flow — a missing poster is not fatal

### R7: Image Serving Endpoint

An Express route (not tRPC — binary response) that serves cached images:

**Route:** `GET /media/images/:mediaType/:id/:filename`

Examples:
- `GET /media/images/movie/550/poster.jpg`
- `GET /media/images/movie/550/backdrop.jpg`
- `GET /media/images/movie/550/override.jpg`

**Resolution chain (per ADR-009):**
1. Check for `override.jpg` if requesting `poster` and `poster_override_path` is set on the record
2. Serve cached file from `{MEDIA_IMAGES_DIR}/movies/{id}/{filename}`
3. If cache miss, attempt on-demand download from TMDB and cache
4. If download fails or source has no image, serve generated placeholder

**Generated placeholder:**
- Solid background colour derived from genre (e.g., action = red-tinted, comedy = warm yellow, sci-fi = blue-tinted)
- Title and year rendered as white text, centred
- Correct aspect ratio (2:3 for poster, 16:9 for backdrop)
- Generated on first request, cached to disk

**Response headers:**
- `Content-Type: image/jpeg` (or `image/png` for logos/placeholders)
- `Cache-Control: public, max-age=31536000, immutable` (images don't change once cached)
- `ETag` based on file hash for conditional requests

### R8: Add Movie to Library Flow

The core user flow: search → select → add. Orchestrated in the service layer.

**tRPC procedure:** `media.library.addMovie`

| Input | Type | Description |
|-------|------|-------------|
| `tmdbId` | `number` | TMDB movie ID (from search results) |

**Steps:**
1. Check if a movie with this `tmdb_id` already exists locally → if yes, return existing record
2. Fetch full movie detail from TMDB (`GET /3/movie/{id}`)
3. Fetch movie images metadata (`GET /3/movie/{id}/images`) for logo
4. Map TMDB response to `MovieCreateInput` (genre names as JSON array, etc.)
5. Insert into `movies` table via Drizzle (`db.insert(movies).values(...)`) through `media.movies.create`
6. Download images in background (poster, backdrop, logo)
7. Return the created movie record

Total TMDB API calls per add: 2-3 (detail + images + logo download). Well within rate limits for individual adds.

### R9: Metadata Refresh

**tRPC procedure:** `media.library.refreshMovie`

| Input | Type | Description |
|-------|------|-------------|
| `id` | `number` | Local movie ID |
| `redownloadImages` | `boolean` (default false) | Force re-download images |

**Steps:**
1. Get existing movie record (need `tmdb_id`)
2. Fetch fresh detail from TMDB
3. Update local record with new metadata (preserves `poster_override_path`)
4. If `redownloadImages`, delete cached images and re-download
5. Set `updated_at`

### R10: Genre ID to Name Mapping

TMDB search results return genre IDs (integers), not names. The detail endpoint returns full genre objects with names. For search results to display genre labels without a detail fetch per result:

- Fetch the TMDB genre list on startup: `GET /3/genre/movie/list`
- Cache in memory (it rarely changes — ~20 genres total)
- Map genre IDs to names in search result responses
- Refresh the cache daily or on API restart

```typescript
// In-memory cache, populated on first request or startup
const genreMap: Map<number, string>; // e.g., 28 → "Action", 35 → "Comedy"
```

## Out of Scope

- TheTVDB client (PRD-009 — separate PRD)
- Person/cast/crew storage
- Trending/popular/upcoming feeds (PRD-014 — Discovery)
- Image resizing or thumbnails (serve originals per ADR-009)
- Episode still image caching

## Acceptance Criteria

1. TMDB client authenticates with Bearer token from environment variable
2. Movie search returns paginated results matching the TMDB response format
3. Movie detail fetch returns all fields needed for the `movies` table
4. Rate limiter prevents exceeding 40 req/10s (verified via unit test with timing)
5. Images download to the correct local directory structure
6. Image serving endpoint returns cached images with correct content type and cache headers
7. Image serving endpoint returns a generated placeholder when no image exists
8. Poster override is served when `poster_override_path` is set
9. "Add movie to library" creates the database record and downloads images
10. Adding a movie that already exists returns the existing record (no duplicate)
11. Metadata refresh updates the record without losing `poster_override_path`
12. Genre ID-to-name mapping works for search results
13. `.env.example` updated with `TMDB_API_KEY` and `MEDIA_IMAGES_DIR`
14. Unit tests for: TMDB client (mocked HTTP), rate limiter, image cache, add-to-library flow
15. `pnpm typecheck` passes
16. `pnpm test` passes

## Edge Cases & Decisions

**Q: What if TMDB returns a movie with no poster?**
A: The image cache skips the download. The image serving endpoint returns a generated placeholder. The `poster_path` column is NULL in the database. The UI handles NULL poster paths by requesting the placeholder endpoint.

**Q: What if the TMDB API key is invalid or expired?**
A: The client throws a clear error with the HTTP status. The tRPC procedure catches it and returns a `TRPCError` with code `INTERNAL_SERVER_ERROR` and a user-facing message like "TMDB API key is invalid or expired." No silent failures.

**Q: What about TMDB API v4?**
A: We target v3. It's stable and well-documented. The client is behind a service interface — swapping to v4 later doesn't touch consumers.

**Q: Should we use an existing TMDB npm package?**
A: Prefer a thin custom client. The API surface we need is small (search, detail, images, genres). A custom client avoids dependency risk and is easier to type correctly. If a well-maintained package exists and saves significant work, it's acceptable — but evaluate the dependency carefully.

**Q: What about non-English metadata?**
A: Default to `language=en-US` for all requests. The user can't change this in v1. If multilingual support is needed later, the language parameter is already part of the TMDB API — just thread it through.

## User Stories

> **Standard verification — applies to every US below:**
> Each story is only done when `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` all pass.
>
> **Sizing:** Each story is scoped for one agent, ~15-20 minutes.

### Batch A — Infrastructure (parallelisable)

#### US-1: TMDB HTTP client
**Scope:** Create `modules/media/tmdb/client.ts` and `types.ts`. Implement: `searchMovies(query, page)`, `getMovie(tmdbId)`, `getMovieImages(tmdbId)`, `getGenreList()`. Bearer token auth from `TMDB_API_KEY`. Typed responses, typed errors. Unit tests with mocked HTTP (success, 404, 401, 429, network error).
**Files:** `client.ts`, `types.ts`, `client.test.ts`

#### US-2: Token bucket rate limiter
**Scope:** Create `modules/media/tmdb/rate-limiter.ts`. Configurable capacity and refill rate. `acquire()` resolves immediately or waits. Unit test verifies throttling. This is a shared class — TheTVDB will reuse it with a separate instance.
**Files:** `rate-limiter.ts`, `rate-limiter.test.ts`

#### US-7: Genre ID-to-name mapping cache
**Scope:** Add genre cache logic to the TMDB client. Fetch genre list on first use, cache in memory, refresh if >24h old. Search results include genre names not just IDs.
**Files:** `client.ts` (extend with genre cache)

### Batch B — Image system (parallelisable, depends on Batch A)

#### US-3: Image cache service
**Scope:** Create `modules/media/tmdb/image-cache.ts`. Download poster/backdrop/logo concurrently. Store in `{MEDIA_IMAGES_DIR}/movies/{tmdb_id}/`. Skip nulls, log failures without throwing. `deleteMovieImages` removes directory. Unit tests with mocked downloads.
**Files:** `image-cache.ts`, test

#### US-4: Image serving Express endpoint
**Scope:** Create Express route `GET /media/images/:mediaType/:id/:filename`. Resolution chain: override → cached file → on-demand download → generated placeholder. Placeholder: genre-coloured background + title text, correct aspect ratio, cached to disk. Headers: `Content-Type`, `Cache-Control: immutable`, `ETag`.
**Files:** `src/routes/media-images.ts` or `app.ts`

### Batch C — Orchestration (depends on A + B)

#### US-5: Add movie to library flow
**Scope:** Create `modules/media/tmdb/service.ts`. `addMovie({ tmdbId })`: check exists → fetch detail → fetch images metadata → map to MovieCreateInput (genre IDs → names) → insert via movies router → download images in background. Returns existing record if duplicate. Integration test with mocked TMDB responses.
**Files:** `service.ts`, `service.test.ts`

#### US-6: Metadata refresh flow
**Scope:** Add `refreshMovie({ id, redownloadImages })` to service. Fetch fresh TMDB data → update record (preserve `poster_override_path`) → optionally re-download images. Set `updated_at`.
**Files:** `service.ts`
