# Discovery & Recommendations

Status: Partial — the discover surface (shelves, preference profile, trending, recommendations) is built and wired. The PRD's hand-specified composite-score formula, per-card "Because you liked X" attribution, and the fixed three-section trending/recommendations UI were never built that way — see [ideas/discovery-composite-scoring.md](../ideas/discovery-composite-scoring.md).

## Purpose

Surface movies worth watching: trending from TMDB, personalised recommendations seeded from the user's comparison data, and a preference profile that reflects genre affinity and dimension activity. The page at `/media/discover` assembles a dynamic, ordered set of shelves rather than a fixed section list, and renders the preference profile beneath them.

## Data model

One pillar-owned table backs the dismiss pile; everything else is computed on demand from existing media tables (`movies`, `media_scores`, `comparisons`, `comparison_dimensions`, `watch_history`, `media_watchlist`).

- `dismissed_discover` — `tmdb_id` (PK), `dismissed_at` (default `now`). A movie dismissed here is excluded from every discover list.

The preference profile is a derived value (no table):

- `genreAffinities[]` — `{ genre, avgScore, movieCount, totalComparisons }`, per-genre average ELO across library movies that have scores, ordered by affinity.
- `dimensionWeights[]` — `{ dimensionId, name, comparisonCount, avgScore }` for each active comparison dimension, ordered by comparison volume.
- `genreDistribution[]` — `{ genre, watchCount, percentage }` over _watched_ movies (from `watch_history`).
- `totalMoviesWatched`, `totalComparisons`.

Discover result rows share one shape: `tmdbId, title, overview, releaseDate, posterPath, posterUrl, backdropPath, voteAverage, voteCount, genreIds, popularity, inLibrary, isWatched, onWatchlist`, plus optional `rotationExpiresAt`. Scored variants add `matchPercentage` (0–100) and `matchReason` (top matched genre names).

## REST API surface

ts-rest contract under `discovery.*` (all paths relative to the media pillar base):

| Method & path                              | Purpose                                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET /discovery/trending`                  | TMDB trending movies; query `timeWindow=day\|week` (default `week`), `page` (default 1). Flag-annotated, dismissed-filtered.     |
| `GET /discovery/trending-plex`             | Plex Discover trending; query `limit`. Returns `{ data: null }` when Plex has no token.                                          |
| `GET /discovery/recommendations`           | Profile-scored recommendations seeded from top-rated library movies; query `sampleSize` (default 3, max 10).                     |
| `GET /discovery/watchlist-recommendations` | Similar-to recommendations seeded from recent watchlist movies, profile-scored.                                                  |
| `GET /discovery/from-your-server`          | Unwatched library movies scored by the profile (no upstream call), top 20.                                                       |
| `GET /discovery/profile`                   | The computed preference profile (affinities, dimension weights, distribution, totals).                                           |
| `GET /discovery/quick-pick`                | Random unwatched library movies; query `count` (default 3, max 10).                                                              |
| `GET /discovery/rewatch-suggestions`       | Library movies watched 6+ months ago with high scores.                                                                           |
| `GET /discovery/context-picks`             | Time-of-day context collections; query `pages` (JSON map of collectionId→page).                                                  |
| `GET /discovery/genre-spotlight`           | Top user genres with high-rated TMDB movies.                                                                                     |
| `GET /discovery/genre-spotlight/page`      | Load more for one genre row; query `genreId`, `page` (≥2).                                                                       |
| `GET /discovery/dismissed`                 | List dismissed TMDB ids.                                                                                                         |
| `POST /discovery/dismiss`                  | Dismiss a movie (idempotent); body `{ tmdbId }`.                                                                                 |
| `POST /discovery/undismiss`                | Remove a movie from the dismiss pile; body `{ tmdbId }`.                                                                         |
| `POST /discovery/session`                  | Assemble a discover session: generate → score → select shelves → fetch first page each → drop thin shelves → record impressions. |
| `GET /discovery/shelves/:shelfId`          | Page one shelf instance; query `limit` (max 50), `offset`.                                                                       |

In-library poster URLs resolve to `/media/images/movie/{tmdbId}/poster.jpg`. That byte route serves `MEDIA_IMAGES_DIR` directly (Express static/proxy) and is **not** part of the ts-rest contract — see the media data-model PRD.

## Business rules

- **Session assembly is dynamic.** `POST /discovery/session` selects an ordered set of shelf instances by relevance × freshness, with variety bonuses and per-category caps (seed / genre / local-window). Pinned shelves keep a slot if they have ≥1 item; normal shelves are dropped below 3 items. Surfaced shelf ids are recorded as impressions (7-day freshness window) so the next session rotates them down.
- The shelf registry is a frozen, explicit array (no module-load side-effects): trending (TMDB + Plex), recommendations, from-your-watchlist, worth-rewatching, from-your-server, because-you-watched, more-from-director/actor, top-dimension + dimension-inspired, best-in-genre + genre-crossover, context, new/upcoming releases, hidden gems, critics-vs-audiences, award winners, decade picks, and local-library shelves (comfort picks, undiscovered, recently added, short/long watch, friend-proof, polarizing, franchise completions, leaving soon).
- **Recommendations** seed from the top-`sampleSize` library movies by TMDB **vote average**, query TMDB's recommendations endpoint per seed, merge while excluding library / dismissed ids, dedupe by tmdbId, sort by TMDB **popularity**, then re-score by the preference profile (sorted by `matchPercentage`). `sourceMovies` returns the seed titles.
- **Cold start:** recommendations require ≥5 total comparisons. Below the threshold `GET /discovery/recommendations` returns `{ results: [], sourceMovies: [], totalComparisons }` without calling TMDB, and the page shows a "Compare more movies to unlock recommendations" CTA linking to `/media/compare`.
- **Match scoring** is genre-affinity only: each result's TMDB genre ids map to the user's normalised affinity map, averaged, then `matchPercentage = round(50 + avg * 48)`; `matchReason` lists the top matched genre names. When no affinities exist, distribution percentages are used as the fallback affinity signal.
- Genre distribution is computed from _watched_ movies; genre affinity from _scored_ movies. The profile updates automatically as movies are added and comparisons recorded — nothing is pre-calculated.
- Trending is fetched live from TMDB per request (no local cache). Dismissed movies are filtered out of trending and every other list.

## Edge cases

- TMDB unavailable: a shelf whose first-page fetch throws is returned empty and then dropped by the thin-shelf filter; the rest of the session is unaffected. The page shows a single "Failed to load discover shelves" banner only when `POST /discovery/session` itself fails.
- Plex not connected: `GET /discovery/trending-plex` returns `{ data: null }` (its shelf simply produces nothing).
- Empty library / no watches: preference profile renders nothing (`totalMoviesWatched === 0`).
- No comparisons: genre-distribution chart still renders; genre-affinity and dimension-weights sections each show a "Compare movies to see your preferences" CTA to the arena.
- All similar movies already in library: that shelf falls below the min-item floor and is dropped.

## Acceptance criteria

- [x] `/media/discover` renders a header, a compare-unlock CTA below threshold, the assembled shelves, and the preference profile.
- [x] `POST /discovery/session` returns ordered shelves with first-page items; thin shelves (<3, or <1 for pinned) are dropped; impressions are recorded.
- [x] `GET /discovery/shelves/:shelfId` pages a single shelf by id and 404s an unknown id.
- [x] `GET /discovery/trending` honours `timeWindow` (default week) and `page`, annotates `inLibrary`/`isWatched`/`onWatchlist`, and excludes dismissed ids.
- [x] `GET /discovery/recommendations` returns empty (no TMDB call) below 5 comparisons; above it, seeds from top-rated library movies, excludes library + dismissed, dedupes, and profile-scores results.
- [x] `GET /discovery/profile` returns genre affinities, dimension weights, genre distribution, and totals.
- [x] Dismiss is idempotent and removes the movie from all discover lists; undismiss reverses it; `GET /discovery/dismissed` lists current ids.
- [x] Preference profile hides entirely when no movies are watched; genre-affinity and dimension-weights sections show the arena CTA when there are no comparisons while distribution still renders.
- [x] Preference profile uses charts (recharts) for distribution and dimension weights and a ranked bar list for affinity — not plain tables.
- [x] In-library discover cards link posters to `/media/images/movie/{tmdbId}/poster.jpg`.
- [x] Compare-unlock CTA shows the exact comparison count and links to `/media/compare`; hidden at ≥5 and while the profile is loading.
- [x] DiscoverPage and PreferenceProfile have component tests; the discovery api modules have unit tests.

## Out of scope

- Collaborative filtering, mood-based suggestions, temporal pattern analysis.
- TV-show recommendations (movie-only).
- Caching TMDB trending locally.
