# TheTVDB Client

> Status: Done — two deferred items live in [ideas/thetvdb-image-placeholder-fallback.md](../ideas/thetvdb-image-placeholder-fallback.md): the byte-route fallback chain stops at a CDN redirect / 404 and never reaches the generated-placeholder tier (the SVG generators exist but are unwired), and `THETVDB_API_KEY` is validated lazily on first client use, not by a hard startup gate.

TheTVDB v4 integration for the media pillar: a typed HTTP client with JWT auth and rate limiting, the live series-search route, and the add/refresh ingestion flows that pull a show's full hierarchy (show + seasons + episodes) into the library and cache its artwork locally.

## Data Model

No tables of its own — writes the `tv_shows`, `seasons`, and `episodes` rows owned by the [data-model-api PRD](data-model-api.md). Columns this flow populates:

- `tv_shows`: `tvdbId` (unique), `name`, `originalName`, `overview`, `firstAirDate`, `lastAirDate`, `status`, `originalLanguage`, `numberOfSeasons` (non-specials only), `numberOfEpisodes`, `episodeRunTime`, `posterPath`, `backdropPath`, `logoPath`, `posterOverridePath`, `voteAverage`, `voteCount`, `genres`/`networks` (JSON arrays).
- `seasons`: `tvShowId` FK, `tvdbId`, `seasonNumber`, `name`, `overview`, `posterPath`, `episodeCount`.
- `episodes`: `seasonId` FK, `tvdbId`, `episodeNumber`, `name`, `overview`, `airDate`, `runtime`, `stillPath`.

## REST API Surface

Mounted under the pillar's ts-rest contract (zod, OpenAPI-projected). TheTVDB-backed routes:

- `GET /search/tv-shows?query=` → `{ results: TvShowSearchResult[] }`. Live pass-through to TheTVDB `/search?type=series`; not persisted. Each result: `tvdbId`, `name`, `originalName`, `overview`, `firstAirDate`, `status`, `posterPath` (TheTVDB CDN URL or thumbnail), `genres[]`, `originalLanguage`, `year`.
- `POST /library/tv-shows` body `{ tvdbId }` → `{ data: { show, seasons[] }, created, message }`. Add a show by TheTVDB id; idempotent.
- `PATCH /library/tv-shows/:id` body `{ redownloadImages?=false, refreshEpisodes?=true }` → `{ data: { show, seasons[] }, episodesAdded, episodesUpdated, seasonsAdded, seasonsUpdated, message }`. Re-fetch and reconcile.

The byte route `GET /media/images/:mediaType/:id/:filename` serves cached artwork directly from `MEDIA_IMAGES_DIR`. It is a plain Express route mounted alongside the contract and is deliberately **not** part of ts-rest (adds no OpenAPI paths) — see the [data-model-api PRD](data-model-api.md).

## TheTVDB Client

`api4.thetvdb.com/v4`, shared singleton resolved from `THETVDB_API_KEY`.

- JWT auth: `POST /login` with `{ apikey }`, token cached in memory (28-day assumed lifetime, re-auth when within a 24h expiry buffer).
- Reads: `searchSeries(query)` (`/search?q=&type=series`), `getSeriesExtended(tvdbId)` (`/series/:id/extended`), `getSeriesEpisodes(tvdbId, seasonNumber)` (`/series/:id/episodes/default?season=`).
- On `401`, invalidate the cached token, re-login, and retry the request **once**; a second failure surfaces as an error (no retry loop).
- Every request passes through a token-bucket rate limiter (default 20 capacity, 2 tokens/sec, env-tunable) with `429` exponential backoff (1s/2s/4s, up to 3 retries).
- Network failures and 4xx/5xx map to a typed `TvdbApiError(status, message)`. At the route boundary, search maps any `TvdbApiError` to `502`.

**Auth & transport criteria**

- [x] `POST /login` with the API key yields a token reused across requests
- [x] `401` triggers invalidate → re-login → single retry; a second `401` throws
- [x] Requests acquire a rate-limiter token; a `429` backs off exponentially up to 3 times before surfacing
- [x] Network and HTTP errors become typed `TvdbApiError`s; search surfaces them as `502`

## Image Caching

Per [ADR-011](../architecture/adr-011-local-image-cache.md), artwork downloads once at add-time into `MEDIA_IMAGES_DIR`:

- Show poster `tv/{tvdbId}/poster.jpg`, backdrop `backdrop.jpg`, logo `logo.png`.
- Season poster `tv/{tvdbId}/season_{n}.jpg` (specials use `season_0.jpg`).
- Best poster (artwork type 2) / backdrop (type 3) chosen by English-language preference then score.
- Directories are created on demand; downloads run under `Promise.allSettled`, so a failed image never blocks the DB write — the path column stays null and the byte route falls back.

Byte-route fallback chain (movie + TV share the route): `override.jpg` → cached file → on-demand download from the stored CDN URL → `302` redirect to the CDN URL → `404`. (There is no placeholder tier — see the linked idea.)

**Image criteria**

- [x] Show/season/backdrop/logo posters land at the documented `tv/{tvdbId}/...` paths, dirs auto-created
- [x] A failed or absent image leaves the path null and is never thrown out of the add flow
- [x] The shared byte route resolves override → cache → on-demand download → CDN redirect → 404

## Business Rules & Criteria

**addTvShow**

- [x] Idempotent: an existing `tvdbId` returns the stored show (`created: false`) without re-fetching or re-downloading; a race re-check inside the transaction repeats the guard
- [x] Fetches `/series/:id/extended` then every season's episodes, and inserts show → seasons → episodes in **one transaction** (no orphaned parent on crash)
- [x] Specials (`seasonNumber 0`) are ingested; episodes with no air date are still created
- [x] `numberOfSeasons` counts non-special seasons; `numberOfEpisodes` is the real episode count fetched
- [x] Image download fires best-effort **after** commit; failure is logged, records persist

**refreshTvShow**

- [x] Looks up the show's `tvdbId`, re-fetches detail, updates show metadata (db layer preserves `posterOverridePath`)
- [x] Upserts every season by `tvdbId` (insert if new, update if existing) and reports `seasonsAdded`/`seasonsUpdated`
- [x] When `refreshEpisodes` (default true), upserts each season's episodes and reports `episodesAdded`/`episodesUpdated`; updates each season's `episodeCount` and the show's `numberOfEpisodes`
- [x] Nothing is deleted on refresh — seasons/episodes are preserved to keep watch-history references valid
- [x] When `redownloadImages` (default false), deletes then re-downloads cached artwork
- [x] Unknown `:id` → `404`

## Edge Cases

| Case                             | Behaviour                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `tvdbId` already in library      | Return existing show, skip fetch + download                                  |
| TheTVDB `404` for a series       | `TvdbApiError`; search surfaces `502`, add propagates the error              |
| JWT expired mid-request          | Invalidate, re-login, retry once                                             |
| TheTVDB `429`                    | Token-bucket backoff (1s/2s/4s) up to 3 retries                              |
| `THETVDB_API_KEY` missing        | Lazy failure on first client use (`requireEnv` throws); no hard startup gate |
| Show has no seasons              | Show row created, seasons list empty                                         |
| Season has no episodes           | Season row created; episode list empty                                       |
| Image download fails             | Path column null; byte route falls back                                      |
| Refresh finds new season/episode | Inserted; reflected in the diff counts                                       |
| Refresh on unknown id            | `404`                                                                        |

## Out of Scope

- Movie metadata ([TMDB client PRD](tmdb-client.md))
- Search / browse / detail UI (later media UI PRDs)
- Plex metadata matching (Plex sync PRD)
