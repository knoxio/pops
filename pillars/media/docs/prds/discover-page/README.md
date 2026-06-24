# Discover Page

> Status: Done. The page is a dynamic shelf-session engine (not a fixed list of sections); every section/endpoint and card action below is implemented. AI-generated insight shelves remain unbuilt — see [ideas/discover-ai-insight-shelves.md](../../ideas/discover-ai-insight-shelves.md).

A multi-section movie-discovery surface at `/media/discover` that serves three intents: find something new (add to watchlist), recognise something already watched (mark watched), and pick what to watch tonight (open detail / play on Plex). Personalisation draws on comparison ELO, watch history, genre preferences, and time-of-day/calendar context.

The rendered page is **assembled per visit**: a session selects an ordered set of shelf instances from a registry of shelf definitions, scored by relevance × freshness with variety and category caps. Individual section endpoints (trending, recommendations, genre spotlight, context picks, etc.) also exist and are callable directly.

## Data model (media SQLite, drizzle)

- `dismissed_discover` — `tmdb_id INTEGER PRIMARY KEY`, `dismissed_at TEXT NOT NULL DEFAULT (datetime('now'))`. The "Not Interested" pile; excluded from every discover candidate list.
- Shelf impressions (`shelf_impressions`, owned by the rotation/shelf domain) feed freshness so recently shown shelves are de-prioritised across sessions.

Discover results are computed, not stored: each item carries `tmdbId, title, overview, releaseDate, posterPath, posterUrl, backdropPath, voteAverage, voteCount, genreIds, popularity` plus three state booleans `inLibrary`, `isWatched`, `onWatchlist` (and optional `rotationExpiresAt`). Scored results add `matchPercentage` and `matchReason`.

## REST API surface (`discovery.*` sub-router, ts-rest)

Session / paging (what the page actually renders):

- `POST /discovery/session` — assemble a session: generate → score → select → record impressions; returns ordered `shelves[]` (`shelfId, title, subtitle, emoji, pinned, items[], totalCount, hasMore`).
- `GET /discovery/shelves/:shelfId?limit&offset` — page one shelf instance (Load More).

Dismiss pile:

- `GET /discovery/dismissed` → `number[]` of dismissed tmdbIds.
- `POST /discovery/dismiss` `{ tmdbId }` — idempotent insert (ON CONFLICT DO NOTHING).
- `POST /discovery/undismiss` `{ tmdbId }` — idempotent delete.

Profile & local sections:

- `GET /discovery/profile` → preference profile (genre affinities from ELO, dimension weights, genre distribution, totalMoviesWatched, totalComparisons).
- `GET /discovery/quick-pick?count` → random unwatched library movies.
- `GET /discovery/rewatch-suggestions` → library movies watched 6+ months ago with high scores.
- `GET /discovery/from-your-server` → unwatched library movies scored by the profile (top 20).

TMDB / Plex sections:

- `GET /discovery/trending?timeWindow=day|week&page` → TMDB trending (default week, page 1).
- `GET /discovery/trending-plex?limit` → Plex Discover trending, or `{ data: null }` when Plex is not connected.
- `GET /discovery/recommendations?sampleSize` → top-ELO library movies → TMDB recommendations, profile-scored.
- `GET /discovery/watchlist-recommendations` → watchlist movies → TMDB similar, profile-scored.
- `GET /discovery/context-picks?pages` → active time/date context collections (`pages` = JSON map collectionId→page for Load More).
- `GET /discovery/genre-spotlight` and `GET /discovery/genre-spotlight/page?genreId&page` → top user genres with high-rated TMDB movies, scored, paged per genre.

Image bytes are served outside this contract: `GET /media/images/:mediaType/:id/:filename` streams from `MEDIA_IMAGES_DIR` (Express byte route, not ts-rest). All `posterUrl`s point at it.

## Shelf registry & session selection

Shelves are a frozen registry of definitions (each `generate()`s zero or more instances). Categories include seed-based (because-you-watched, more-from-director/actor), genre (best-in-genre, genre-crossover), dimension (top-dimension, dimension-inspired), context, TMDB (trending, new/upcoming releases, hidden gems, critics-vs-audiences, award winners, decade picks), the personalised classics (recommendations, from-your-watchlist, worth-rewatching, from-your-server, trending-plex), and local-window shelves (comfort picks, undiscovered, recently-added, short-watch, long-epic, friend-proof, polarizing, franchise-completions, leaving-soon).

Session assembly:

- [x] Pinned shelves are always included; the rest are weighted-sampled by `instance.score × freshness`.
- [x] Freshness decays with prior impression count (per `shelf_impressions`), so a refresh yields different shelves.
- [x] Category constraints cap seed shelves, genre shelves, and at most one local-window shelf per sliding window of 3, keeping variety.
- [x] Session size is bounded by a configurable min/max target.

## Scoring (`scoreDiscoverResults(results, profile)`)

- [x] Pure function — no DB, no HTTP. Maps each result's TMDB genre IDs to genre names via `TMDB_GENRE_MAP`.
- [x] Builds a `genre → 0..1` affinity map from comparison ELO affinities; falls back to watch-history genre distribution when no comparison data exists; empty profile yields 0%.
- [x] `matchPercentage = round(50 + avgGenreAffinity × 48)` (50–98% range); `matchReason` = top 3 matching genres.
- [x] Returns results sorted by `matchPercentage` descending. Reused by recommendations, genre spotlight, watchlist recs, and from-your-server.

## Context collections

- [x] Static `ContextCollection[]` (`id, title, emoji, genreIds, keywordIds, trigger(hour, month, dayOfWeek)`), each mapping to a TMDB `/discover/movie` query — no DB, no AI.
- [x] Definitions cover date-night (Fri/Sat 6–10pm), sunday-flicks, late-night (10pm–2am), halloween (Oct), christmas (Dec), oscar-season (Feb–Mar), morning, evening, weekend, summer/seasonal, and rainy-day (always-on fallback).
- [x] `getActiveCollections(hour, month, dayOfWeek)` returns up to a configured max; rainy-day fills any unmatched slots so the page never shows zero context rows.

## Discover card actions

Each `DiscoverCard` shows hover actions adapting to the item's `inLibrary` / `isWatched` / `onWatchlist` state:

- [x] `+` Add to Library — visible only when not in library; disappears after any add (Add/Watchlist/Watched).
- [x] Watchlist toggle — outline bookmark "Add to Watchlist" / filled bookmark "Remove from Watchlist". Add adds to library first (idempotent), then watchlist.
- [x] Watched — Eye "Mark as Watched" when unwatched (adds to library idempotently, then logs a watch); RotateCw "Mark as Rewatched" when already watched (logs an additional watch with a new timestamp).
- [x] Request — sends the movie to Radarr.
- [x] `X` Not Interested — calls `POST /discovery/dismiss` (server-side, not localStorage); optimistically removed and persisted across sessions.
- [x] "Owned" badge when in library; "Watched" badge replaces it when a completed watch_history entry exists.
- [x] Each action shows a per-item loading state and disables to prevent double-clicks; a toast confirms with the movie title; affected discover queries are invalidated so badges/buttons update.

## Business rules

- [x] Each shelf/section fetches independently — one source failing does not blank the others (session errors surface a single retry banner; shelf paging errors are local to that shelf).
- [x] Dismissed movies are excluded from all sections; library movies are excluded from external recommendation/discover lists (and watchlist items from watchlist recs).
- [x] "Mark as Watched"/"Add to Watchlist" always add to library first (idempotent), then perform the secondary action — one click does both.
- [x] Recommendations are gated below 5 comparisons: the endpoint returns empty and the page shows a "compare more to unlock" CTA linking to `/media/compare`.
- [x] Plex-dependent shelves (trending-plex, from-your-server) are hidden when Plex is not connected; rewatch is hidden with no watch history older than 6 months; empty shelves are not rendered.
- [x] Refreshing the page re-assembles a fresh shelf selection (freshness-weighted).

## Edge cases

| Case                     | Behaviour                                                                        |
| ------------------------ | -------------------------------------------------------------------------------- |
| Empty library            | Only TMDB-sourced and context shelves can appear                                 |
| < 5 comparisons          | Recommendations hidden; CTA to compare; genre signals fall back to watch history |
| No watch history         | Rewatch hidden; genre signals fall back to library/affinity data                 |
| Plex not connected       | trending-plex returns `null`; from-your-server hidden                            |
| All candidates dismissed | Shelf drops out (not rendered empty)                                             |
| TMDB/session failure     | Session shows a retry banner; individual shelf paging failures stay local        |

## Preference profile panel

- [x] Rendered at the bottom of the page from `GET /discovery/profile`: genre distribution, genre affinity scores, dimension weights, total movies watched, total comparisons.

## Out of scope

AI-generated insight shelves (e.g. "Movies with a strong female lead") — captured as a forward-looking idea. TV-show discovery, collaborative filtering, and social features (shared lists, reviews) remain movie-only / single-user by design.
