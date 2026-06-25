# TheTVDB image placeholder fallback + hard startup key check

Two forward-looking gaps split out of the [TheTVDB Client PRD](../prds/thetvdb-client.md). Both are real today: the code is present but unwired (placeholder) or deliberately deferred (startup gate).

## Generated-placeholder fallback tier

The `/media/images/:mediaType/:id/:filename` byte route falls back `override → cached file → on-demand CDN download → 302 CDN redirect → 404`. The chain stops at the redirect/404; it never generates a placeholder.

`ImageCacheService` already ships the generators — `generateTvPlaceholder(tvdbId, title, seasonNumber?)` and `generatePlaceholder(tmdbId, title)` (SVG: coloured rectangle with the show/season name as text in `image-placeholders.ts`) — but nothing calls them from the route. They are exercised only by unit tests.

**Build later**

- Wire a final placeholder tier into `attemptFallbacks` so a missing image returns a generated SVG (coloured rectangle + media/season title) instead of a `404`, for movies and TV alike.
- The route needs the title to render text — either read it from the looked-up `tv_shows` / `movies` record already fetched in `lookupImagePath`, or pass it through.
- Decide caching policy: generate-on-demand and serve, vs. generate-and-persist to the cache dir on first miss so subsequent hits serve the cached file.
- Keep `removeCorruptedPlaceholder` semantics in mind — a persisted placeholder must be distinguishable from a corrupted real download so the next refresh can replace it.

## Hard startup key check for `THETVDB_API_KEY`

`validateTvdbConfig()` exists in the TheTVDB client `index.ts` and calls `requireEnv('THETVDB_API_KEY')`, but it is referenced only from tests — the server boot sequence never calls it. Today a missing key fails lazily on the first client use (`getTvdbClient()` throws), so the pillar boots fine and only TV search / add / refresh routes error at call time.

**Build later**

- Call `validateTvdbConfig()` during media-pillar startup so a missing/blank key fails fast with a clear message instead of surfacing as a runtime route error.
- Reconcile with graceful degradation: if TheTVDB is meant to be optional (movies-only deployments), gate the check behind a "TV enabled" flag rather than hard-failing every boot.
