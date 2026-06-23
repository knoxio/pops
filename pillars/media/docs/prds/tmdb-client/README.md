# TMDB Client

Status: Done — TMDB HTTP client, shared token-bucket rate limiter, movie search, add/refresh-to-library, and the local image cache + byte route all ship.

The media pillar talks to The Movie Database (TMDB v3) to power movie search and the add-to-library flow: search TMDB, pick a result, fetch full detail, persist a `movies` row, download poster/backdrop into a local cache served from disk. A shared token-bucket rate limiter keeps every TMDB call (search, detail, image download) under TMDB's 40 req / 10 s budget. Cross-pillar callers never touch TMDB directly; they hit this pillar's REST contract.

## Data Model

No tables of its own. Movie metadata lands in the `movies` table (owned by the data-model PRD). This feature writes:

- `tmdbId`, `imdbId`, `title`, `originalTitle`, `overview`, `tagline`, `releaseDate`, `runtime`, `status`, `originalLanguage`, `budget`, `revenue`, `voteAverage`, `voteCount`, `genres` (string array, mapped from TMDB's `{id,name}` objects).
- `posterPath` / `backdropPath` — stored as the pillar's own byte-route paths (`/media/images/movie/{tmdbId}/poster.jpg`, `…/backdrop.jpg`), or `null` when TMDB has no image.
- `posterOverridePath` is owned by the user-upload flow and is never clobbered by add/refresh.

## REST API surface

All routes live on the media pillar's ts-rest contract (zod, projected to OpenAPI).

| Method | Path                  | Body / Query                             | Result                                                                                                  |
| ------ | --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| GET    | `/search/movies`      | `query` (1–200 chars), `page?` (1–500)   | `{ results: MovieSearchResult[], totalResults, totalPages, page }` — live TMDB pass-through, not stored |
| POST   | `/library/movies`     | `{ tmdbId }`                             | `{ data: Movie, created, message }` — idempotent add                                                    |
| PATCH  | `/library/movies/:id` | `{ redownloadImages?: boolean = false }` | `{ data: Movie, message }` — refresh metadata                                                           |

`MovieSearchResult` (search wire shape, mirrors the TMDB client mapper): `{ tmdbId, title, originalTitle, overview, releaseDate, posterPath, backdropPath, voteAverage, voteCount, genreIds: number[], originalLanguage, popularity }`. Search returns raw TMDB `genreIds`, not resolved names; `posterPath`/`backdropPath` are TMDB CDN sub-paths (e.g. `/abc.jpg`), not local paths. A provider outage maps to **502**; a missing/invalid query maps to **400**.

### Image byte route (NOT in the contract)

`GET /media/images/:mediaType/:id/:filename` is a plain Express route mounted alongside the ts-rest endpoints — deliberately outside the contract so it adds no OpenAPI paths. It serves `MEDIA_IMAGES_DIR` directly. `mediaType` is `movie`|`tv`, `id` is the `tmdbId`/`tvdbId`, `filename` is `poster.jpg`/`backdrop.jpg`/`logo.png`. Responses carry `Cache-Control: public, max-age=604800` + an mtime/size ETag (304 on `If-None-Match`).

## Internal TMDB client

`getTmdbClient()` returns a shared `TmdbClient` (Bearer-token v3 wrapper) bound to one process-wide rate limiter. Beyond search it exposes movie detail, images, trending, recommendations, similar, credits, discover-by-crew/cast/genre/keyword, and genre-list — consumed by the discovery and rotation features. `GenreCache` lazily resolves TMDB genre IDs → names with a 24 h TTL.

## Rate limiting

- Token bucket: capacity **40**, refill **4 tokens/s** (≈ 40 req / 10 s — TMDB's documented limit; the bucket starts full).
- One shared limiter across all TMDB API calls **and** image downloads, so a burst of searches throttles subsequent detail fetches and downloads.
- `acquire()` waits when the bucket is empty and resolves when a token frees up — callers never observe a 429.
- The limiter is provider-agnostic and reusable; TheTVDB has its own instance.

## Image caching

- Movie images cached at `{MEDIA_IMAGES_DIR}/movies/{tmdbId}/`: `poster.jpg` (TMDB **w780**), `backdrop.jpg` (**w1280**), `logo.png` (original, when present). Directory auto-created.
- Downloads go through the shared rate limiter, are host-allow-listed (`image.tmdb.org`, `artworks.thetvdb.com`), skip if the file already exists, and retry transient failures (≤2 retries); 4xx is a permanent skip.
- Byte-route fallback chain: user override (`override.jpg`) → cached file → on-demand download into cache → **302 redirect** to the TMDB CDN (`private, max-age=300`) → 404. When the DB has no stored poster path for a movie, the route looks the path up live from TMDB. The override and cached files are served with the same immutable cache headers as any media image (`public, max-age=604800` + ETag); only the CDN redirect is marked `private`.
- Placeholder generator (standalone): `ImageCacheService.generatePlaceholder` writes an SVG (780×1170) coloured rectangle (hue derived from `tmdbId`) with the title as escaped text; corrupted SVG-as-`.jpg` placeholders are detected and removed by the byte route. The generator is a self-contained capability — it is **not** wired into the byte-route fallback chain, which ends at 404 when nothing else resolves.

## Business rules

- `addMovie` is idempotent: an existing `tmdbId` returns the stored row with `created: false`, skipping fetch and download.
- `addMovie` fetches full detail from `/movie/{id}` (runtime, budget, revenue, tagline, IMDb id), inserts the row, then downloads poster + backdrop.
- Image download is best-effort and decoupled from row creation: a failed/absent image leaves the path column `null`. The byte route then falls back to a live TMDB poster-path lookup → on-demand download → 302 CDN redirect, and returns 404 only when none of those resolve.
- `refreshMovie` always re-fetches from TMDB by the stored `tmdbId`, updates metadata, bumps `updatedAt`, preserves `createdAt` and `posterOverridePath`. With `redownloadImages: true` it deletes and re-downloads the cached images.
- Search is never cached locally — always fresh from TMDB.

## Edge cases

| Case                                 | Behaviour                                                |
| ------------------------------------ | -------------------------------------------------------- |
| `tmdbId` already in library (add)    | Return existing row, `created: false`, no fetch/download |
| TMDB 404 for `tmdbId`                | `404` NotFound ("Movie on TMDB")                         |
| Unique-constraint race on insert     | `409` Conflict                                           |
| Bucket empty                         | Request queues until a token refills; no 429 surfaced    |
| Image download fails (network / 4xx) | Path column `null`; fallback chain handles display       |
| TMDB has no poster/backdrop URL      | Skip that download, leave path `null`                    |
| `TMDB_API_KEY` unset                 | `getTmdbClient()` throws a clear configuration error     |
| Search returns zero results          | `{ results: [], totalResults: 0 }`                       |
| `refreshMovie` id not in DB          | `404` NotFound                                           |

## Acceptance criteria

- [x] `TmdbClient` wraps TMDB v3 with Bearer auth; HTTP 4xx/5xx and network failures become typed `TmdbApiError`, not raw fetch errors.
- [x] Token-bucket limiter (capacity 40, refill 4/s) is shared across all TMDB calls and image downloads; `acquire()` queues instead of throwing when empty.
- [x] `TMDB_API_KEY` is read from `process.env`; `getTmdbClient()` throws a clear error when it is unset.
- [x] `GET /search/movies` calls `/search/movie` and returns `{ results, totalResults, totalPages, page }` with the documented `MovieSearchResult` shape (raw `genreIds`); provider failure → 502, bad query → 400.
- [x] `POST /library/movies` fetches `/movie/{id}`, inserts the row with all detail fields and mapped genre names, downloads poster+backdrop, and is idempotent (`created` flag).
- [x] `PATCH /library/movies/:id` re-fetches and updates metadata, preserves `createdAt` + override, and re-downloads images only when `redownloadImages` is true; unknown id → 404.
- [x] Posters cached at w780, backdrops at w1280, logos at original, under `{MEDIA_IMAGES_DIR}/movies/{tmdbId}/`; downloads are host-allow-listed and skip existing files.
- [x] `GET /media/images/:mediaType/:id/:filename` serves the cache directly with `Cache-Control: public, max-age=604800` + ETag/304, outside the ts-rest contract.
- [x] Fallback chain resolves override → cache → on-demand download → 302 CDN redirect → 404, including live TMDB poster-path lookup when the DB has none.
- [x] `ImageCacheService.generatePlaceholder` produces a 780×1170 SVG placeholder (coloured rect + escaped title) as a standalone capability; the byte route does not invoke it (its chain ends at 404), but it detects and removes corrupted SVG-as-`.jpg` files.
- [x] `GenreCache` maps TMDB genre IDs to names with a 24 h TTL.

## Out of scope

- TV-show metadata (TheTVDB) — separate feature.
- Search / browse / add UI — the media app feature.
- Bulk import from external lists; person / cast / crew browsing as a first-class surface.
