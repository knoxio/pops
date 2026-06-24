# Comparison Intelligence

> Status: Partial — backend, smart-pair algorithm, rankings confidence, and arena action bar are all built. Freshness badge ships on the movie detail page only (arena cards + library badge are not built → [arena-and-library-freshness-badge](../../ideas/arena-and-library-freshness-badge.md)).

A weighted-probabilistic pair-selection model for the compare arena that maximises information gain per comparison, plus the arena actions that feed it: skip cooloffs, per-movie staleness, per-dimension exclusion, and watch-history blacklisting. Score confidence and watch recency keep rankings anchored to current taste rather than stale memories.

All routes below are ts-rest (zod) on the media pillar's REST contract (`rest-comparisons*.ts`). Media-type enum is `'movie' | 'tv_show'`; the live arena is movies-only. The comparison engine reads/writes the media pillar's own SQLite DB — no cross-pillar calls.

## Data Model

`watch_history.blacklisted` (INTEGER, default 0) — 1 = the watch event was a data error (someone else's account). Blacklisted rows are kept, never deleted, so Plex re-sync can dedup against them.

`media_scores.excluded` (INTEGER, default 0) — 1 = movie is not applicable for that dimension; omitted from rankings and pair selection. Unique on `(media_type, media_id, dimension_id)`.

`comparison_staleness` — `(id, media_type, media_id, staleness REAL default 1.0, updated_at)`, unique on `(media_type, media_id)`. Per-movie (not per-dimension) deprioritisation multiplier.

`comparison_skip_cooloffs` — `(id, dimension_id FK, media_a_type, media_a_id, media_b_type, media_b_id, skip_until INTEGER, created_at)`, unique on `(dimension_id, pair)`. `skip_until` is the global comparison count at which the pair becomes eligible again. Pairs are stored in normalised order.

The byte route `/media/images/...` (e.g. `/media/images/movie/:tmdbId/poster.jpg`) is served directly from `MEDIA_IMAGES_DIR` and is NOT part of the ts-rest contract; smart-pair `posterUrl` values point at it.

## REST API Surface

- `GET /comparisons/smart-pair?dimensionId?` → `{ data: { movieA, movieB, dimensionId } | null, reason }`. Picks a dimension by need then a pair by weighted-probabilistic scoring. Falls back to a random pair, then to `{ data: null, reason: 'insufficient_watched_movies' }`.
- `POST /comparisons/skip` `{ dimensionId, mediaA*, mediaB* }` → `{ skipUntil }`. Puts the pair on cooloff for 10 global comparisons (upsert extends an existing cooloff).
- `POST /comparisons/blacklist-movie` `{ mediaType, mediaId }` → `{ blacklistedCount, comparisonsDeleted, dimensionsRecalculated }`.
- `POST /comparison-scores/exclude` `{ mediaType, mediaId, dimensionId }` → `{ comparisonsDeleted }`. Sets `excluded=1` (creating the score row at baseline if missing), purges that movie's comparisons for the dimension, replays ELO.
- `POST /comparison-scores/include` `{ mediaType, mediaId, dimensionId }` → message. Sets `excluded=0`.
- `POST /comparison-staleness/mark` `{ mediaType, mediaId }` → `{ staleness }`. Inserts at 0.5 or ×0.5 the existing value (floor 0.01).
- `GET /comparison-staleness?mediaType&mediaId` → `{ staleness }` (1.0 when no row).
- `GET /comparison-rankings?dimensionId?&mediaType?&limit?&offset?` → ranked entries, each carrying derived `confidence` (0–1).
- `GET /comparison-scores?mediaType&mediaId&dimensionId?` → score rows, each with derived `confidence` and `excluded`.
- `POST /comparisons/recalc-all` → replays every comparison and recalcs ELO for all active dimensions.

## Pair Selection Algorithm

Two-stage, HTTP-free, designed to stay O(n) not O(n²):

1. **Pick a dimension by need.** `need = maxCompCount / (thisDimCompCount + 1)` over active dimensions, then weighted-random. When `dimensionId` is supplied, this stage is skipped.
2. **Sample → score → weighted-random a pair within that dimension.** Take up to `SAMPLE_SIZE = 50` eligible movies, build all candidate pairs, score each, then weighted-random sample by priority.

Per-pair priority (the live formula — note: `dimensionNeed` is consumed only in stage 1, not here):

```
priority = informationGain(A,B,pairCount)
         × recencyWeight(A) × recencyWeight(B)
         × stalenessWeight(A) × stalenessWeight(B)
         × confNeed
         × jitter
```

| Component       | Formula                                                                              |
| --------------- | ------------------------------------------------------------------------------------ |
| informationGain | `1/(1 + abs(scoreA-scoreB)/200) × 1/(pairCount+1)`                                   |
| recencyWeight   | `1/(1 + daysSinceLastWatch/180)` (6-month half-life; unwatched defaults to 365 days) |
| stalenessWeight | `comparison_staleness.staleness` per movie (default 1.0)                             |
| confNeed        | `max(1 - confidence(A), 1 - confidence(B))` — under-established movies boosted       |
| jitter          | uniform random in `[0.7, 1.3]`                                                       |

**Exclusions applied before scoring:** movie on watchlist (skipped unless that drops eligibility below 2, then watchlist filter is relaxed); `excluded=1` for the dimension; pair on cooloff (`skip_until > globalCount`, symmetric A↔B); no completed non-blacklisted watch event. If no scored pair survives, fall back to the first two candidates.

## Business Rules & Acceptance Criteria

Backend engine:

- [x] Blacklisting sets `blacklisted=1` on all of a movie's `watch_history` rows, deletes every comparison involving it across all dimensions, and replays ELO per affected dimension — one transaction.
- [x] A movie whose every watch event is blacklisted is treated as unwatched and excluded from the pair pool (`fetchWatchedMovies` filters `blacklisted = 0`).
- [x] Plex sync dedup skips inserting a watch event when a matching `(media_type, media_id, watched_at)` row already exists with `blacklisted = 1`; a new event at a different `watched_at` flows through normally.
- [x] `markStale` compounds: 1.0 → 0.5 → 0.25 → 0.125, floored at 0.01 (never zero). `getStaleness` returns 1.0 when no row.
- [x] Completing a watch resets that movie's staleness to fresh (deletes the row) — wired in both the single-log and batch-log watch paths.
- [x] Exclusion is per-movie per-dimension; excluded movies vanish from that dimension's rankings and pairs; re-include restores them.
- [x] Skip cooloff is per-pair per-dimension and symmetric; `skip_until = globalComparisonCount + 10`; expired cooloffs are ignored at query time (no cleanup job).
- [x] Pair selection is weighted-random sampling, not a deterministic top-pick; jitter guarantees variety across repeated calls.
- [x] Smart-pair falls back to a random pair, then to `reason: 'insufficient_watched_movies'` with null data.

Confidence & rankings:

- [x] Per-dimension confidence is derived (not stored): `confidence = 1 - 1/sqrt(comparisonCount + 1)` — 0% at 0, ~29% at 1, ~50% at 3, ~82% at 30.
- [x] Overall confidence blends coverage and depth: `coverageRatio × avgDepth` over scored dimensions (0 when nothing scored).
- [x] Rankings rows show `score`, match count, and `X% conf` (only when `comparisonCount > 0`), colour-coded green/amber/red by confidence band.

Arena UI:

- [x] Cards: click a card to pick that side as winner; a centre column offers High / Mid / Low draw tiers.
- [x] Action bar (shared `ResponsiveActionBar`) exposes Skip, Mark Stale (per movie), N/A (excludes both movies in the current pair for the current dimension), and "Not watched" (blacklist). Skip / Stale / N/A record no comparison and load the next pair.
- [x] "Not watched" is destructive: it opens `BlacklistConfirmDialog` showing the exact count of comparisons that will be purged before confirming.
- [x] Action buttons disable while their mutation is pending; each completed action loads a fresh pair.
- [x] The watchlist bookmark stays on each card and neither submits a comparison nor changes the selection algorithm.

Freshness badge:

- [x] `FreshnessBadge` renders on the movie detail page: Fresh (0–30d, green), Recent (31–90d, blue), Fading (91–365d, yellow), Stale (365+d, red).
- [x] Any `staleness < 1.0` forces the "Stale" label regardless of watch recency; unwatched movies (null days) render no badge.

## Edge Cases

| Case                                         | Behaviour                                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Every candidate pair on cooloff              | Fall back to the first two candidates                                                              |
| Fewer than 2 eligible movies                 | Smart-pair returns null → random-pair fallback → `insufficient_watched_movies`                     |
| Movie excluded + stale across all dimensions | Effectively exits the arena; still in the library                                                  |
| Staleness at floor (0.01)                    | Almost never surfaces but is not fully excluded; a watch resets it to 1.0                          |
| New dimension created                        | All movies at 1500 / 0% confidence; highest `dimensionNeed` → it dominates rotation until balanced |
| "Not watched" on a heavily-compared movie    | Confirm dialog states the purge count; recalc runs in the same transaction                         |

## Out of Scope

- Post-watch debrief / rapid-fire review mode (separate idea).
- Batch comparison / tier-list drag-and-drop as a distinct flow (the tier-list contract endpoints exist; the dedicated UI is its own concern).
- TV-show comparisons and AI-suggested pairs.
- Soft ELO score decay over time (the staleness model covers the user-facing concern).
