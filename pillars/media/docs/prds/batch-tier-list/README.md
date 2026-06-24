# Batch Tier List

> Status: Done

Drag-and-drop tier list for ranking a pool of movies at once on a single comparison dimension. Instead of pairwise A-vs-B in the compare arena, the user arranges movies into tiers (S/A/B/C/D); each placement implies a set of pairwise results that batch-update ELO. Placements are persisted as tier overrides so a round rehydrates on return.

## Route

`/media/tier-list` (lazy page in the media app; nav label "Tier List").

## Data Model

`tier_overrides` table — the persisted per-(media, dimension) placement that hydrates a round and survives ELO recalculation:

- `id`, `media_type`, `media_id`, `dimension_id` (FK `comparison_dimensions`), `tier` (`S`|`A`|`B`|`C`|`D`), `created_at`.
- Unique index on `(media_type, media_id, dimension_id)` — upsert semantics (one placement per movie per dimension).

Submissions also generate standard `comparisons` rows (with `source = 'tier_list'`) via the shared batch-record path; no separate comparison table.

## REST API

Sub-router under the media `comparisons.*` contract (`rest-comparisons-scores.ts`):

- `GET /tier-list/:dimensionId` — up to N movies for a placement round. Returns `{ data: TierListMovie[] }` where `TierListMovie = { id, title, posterUrl, score, comparisonCount, tierOverride }`.
- `POST /tier-list` — body `{ dimensionId, placements: Array<{ movieId, tier: S|A|B|C|D }> }` (min 2 placements). Converts placements → comparisons and batch-records them in one transaction, then upserts a tier override per placement in a second transaction. Returns `{ data: { comparisonsRecorded, skipped, scoreChanges: Array<{ movieId, oldScore, newScore }> }, message }`.

Poster URLs resolve to the media byte route `/media/images/movie/:tmdbId/poster.jpg` (or a stored override path). That image route serves `MEDIA_IMAGES_DIR` directly and is NOT part of the ts-rest contract — see the media data-model PRD / pillar README.

## Tier → Comparison Conversion

`convertTierPlacements(placements)` is pure (no DB), producing exactly C(N,2) pairwise comparisons for N placements:

- **Same tier → draw.** Draw tier mapped: S=high, A=high, B=mid, C=low, D=low. `winnerId = 0`, `drawTier` set.
- **Different tiers → higher tier wins** (lower rank index wins; rank order S<A<B<C<D). `drawTier = null`.

Acceptance criteria:

- [x] `convertTierPlacements` returns `Array<{ mediaAId, mediaBId, winnerId, drawTier }>`.
- [x] Same-tier draws use the S/A=high, B=mid, C/D=low mapping.
- [x] Cross-tier sets `winnerId` to the higher-tier movie, `drawTier = null`.
- [x] N placements → exactly C(N,2) comparisons.

## Movie Selection

`getTierListMovies(db, dimensionId)` returns up to N movies (N from the `media.comparisons.maxTierListMovies` setting, default 8) via **greedy maximum coverage of NEW comparison pairs**:

- Eligible rows: scored movies on the dimension, `excluded = 0`, not blacklisted (no blacklisted watch-history row), and `staleness >= stalenessThreshold` (`media.comparisons.stalenessThreshold`, default 0.3). Movies default to the baseline score (`media.comparisons.defaultScore`, default 1500) when unscored.
- If eligible count ≤ N, return them all. Otherwise greedily pick movies that maximise the count of NOT-yet-compared pairs against the already-selected set, tie-breaking on lowest comparison count.
- Each returned movie carries its persisted `tierOverride` (or null) so the board rehydrates prior placements.

Acceptance criteria:

- [x] Returns up to N movies (N is the runtime `maxTierListMovies` setting, not a hard 8).
- [x] Excludes blacklisted, dimension-excluded, and too-stale movies.
- [x] Greedy selection maximises new pairwise coverage; tie-break = fewest comparisons.
- [x] Returns fewer than N when eligible pool is smaller; each movie includes `posterUrl`, `title`, `score`, `comparisonCount`, `tierOverride`.

## Batch Record & Score Precedence

`batchRecordComparisons(db, dimensionId, items, source)` records all items in one transaction (all-or-nothing). It does NOT blindly accumulate — it applies **source precedence** (`arena` > `tier_list` > historical/null):

- For each item, if a comparison already exists for that pair on that dimension: replace it only when the new source rank ≥ the existing source rank; otherwise skip it (counted in `skipped`).
- While no override has occurred, each insert applies an incremental ELO update. Once any existing comparison is overridden, subsequent inserts defer ELO and a single dimension-wide ELO replay reconciles all scores at the end of the transaction.
- Rejects inactive dimensions. Returns `{ count, skipped }`.

Acceptance criteria:

- [x] Whole batch is one transaction; any failure rolls back everything.
- [x] Each recorded comparison runs the same ELO update logic as a single `record`.
- [x] A `tier_list` comparison overrides a historical/null one but is skipped against an existing `arena` one; equal-or-higher source replaces and triggers a dimension recalc.
- [x] `submitTierList` returns `comparisonsRecorded`, `skipped`, and per-movie `{ oldScore, newScore }` deltas captured before/after the batch.
- [x] Inactive dimension is rejected.

## Drag-and-Drop UI

`/media/tier-list` page: dimension chip selector + create-dimension dialog, five tier rows (S/A/B/C/D) as horizontal drop zones with a labelled left rail, and a pool of the selected movies. Cards show poster thumbnail + title and are draggable between tiers and back to the pool. A "Submit" action is disabled below 2 placed movies; a refetch action pulls a fresh set.

The board also exposes per-movie dismiss zones that drive existing comparison endpoints: **Not Watched** (blacklist movie), **Mark Stale** (`markStale`), and **N/A** (exclude from dimension). These remove a movie from the round and refetch.

Acceptance criteria:

- [x] Route `/media/tier-list` with dimension chips + "New dimension" dialog.
- [x] 5 tier rows (S/A/B/C/D) plus a movie pool; cards show poster + title and drag between zones.
- [x] Placements rehydrate from persisted `tierOverride` on load.
- [x] Submit disabled below 2 placements; refetch swaps the movie set.
- [x] Dismiss zones (Not Watched / Mark Stale / N/A) call blacklist / markStale / exclude-from-dimension and refetch.

## Submission Summary

After submit, the board is replaced by a summary: total comparisons recorded ("N comparisons from M movies"), a per-movie row with title + old → new score + a coloured delta badge (green up / red down / neutral), a "Do Another" action (resets to a new round) and a "Done" action (navigates to `/media/rankings`).

Acceptance criteria:

- [x] Summary shows the comparison count and per-movie score deltas with up/down/neutral styling.
- [x] "Do Another" resets the round; "Done" navigates to rankings.

## Business Rules

- One dimension per session; all implied comparisons target the selected dimension.
- Unranked (pool) movies produce no comparisons.
- Minimum 2 placed movies to submit; maximum surfaced = `maxTierListMovies`.
- Placements persist as tier overrides (upsert) and survive ELO recalculation; the same movie may appear across dimensions or future rounds.
- New comparisons do NOT always accumulate — source precedence may override or skip an existing comparison for the same pair (see Batch Record).

## Edge Cases

| Case                           | Behaviour                                                   |
| ------------------------------ | ----------------------------------------------------------- |
| Fewer than N eligible movies   | Surface as many as available; submit still needs ≥ 2 placed |
| All placed in one tier         | Only same-tier draws generated                              |
| Exactly 2 placed               | 1 comparison (or 1 draw)                                    |
| Fewer than 2 placed            | Submit disabled                                             |
| Existing arena comparison      | Tier-list comparison for that pair is skipped (counted)     |
| Dimension has no scored movies | Movies default to baseline score; pool may be empty         |

</content>
</invoke>
