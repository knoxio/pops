# PRD-062: Comparison Intelligence

> Epic: [04 — Ratings & Comparisons](../../epics/04-ratings-comparisons.md)
> Status: Done

## Overview

A probabilistic pair selection model for the compare arena that maximises information gain per comparison. The arena provides actions for staleness, inapplicability, and data errors that feed back into the model. Score confidence and watch recency ensure rankings reflect current taste, not stale memories.

## Data Model

### watch_history

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `blacklisted` | INTEGER | 0 | 1 = watch event was a data error (e.g. someone else's account). Sync skips blacklisted rows |

### media_scores

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `excluded` | INTEGER | 0 | 1 = movie is not applicable for this dimension. Excluded from rankings and pair selection |

### comparison_staleness

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK, auto-increment | |
| `media_type` | TEXT | NOT NULL | `'movie'` |
| `media_id` | INTEGER | NOT NULL | |
| `staleness` | REAL | NOT NULL, DEFAULT 1.0 | Multiplier: 1.0 = fresh, 0.5 = marked once, 0.25 = marked twice, etc. |
| `updated_at` | TEXT | NOT NULL | Last staleness change |

UNIQUE index on `(media_type, media_id)`. Watch event resets `staleness` to 1.0.

### comparison_skip_cooloffs

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK, auto-increment | |
| `dimension_id` | INTEGER | NOT NULL, FK | |
| `media_a_type` | TEXT | NOT NULL | |
| `media_a_id` | INTEGER | NOT NULL | |
| `media_b_type` | TEXT | NOT NULL | |
| `media_b_id` | INTEGER | NOT NULL | |
| `skip_until` | INTEGER | NOT NULL | Global comparison count at which this pair becomes eligible again |
| `created_at` | TEXT | NOT NULL | |

UNIQUE index on `(dimension_id, media_a_type, media_a_id, media_b_type, media_b_id)`.

## Pair Selection Algorithm

Each eligible pair `(movieA, movieB)` receives a priority score. A pair is chosen via weighted random sampling (not deterministic top-pick — preserves discovery).

### Priority formula

```
pairPriority(A, B, dimension) =
    informationGain(A, B, dimension)
  × recencyWeight(A) × recencyWeight(B)
  × stalenessWeight(A) × stalenessWeight(B)
  × dimensionNeed(dimension)
  × randomJitter(0.7 .. 1.3)
```

### Component definitions

| Component | Formula | Purpose |
|-----------|---------|---------|
| **informationGain** | `1 / (1 + abs(scoreA - scoreB) / 200) × (1 / (pairComparisonCount + 1))` | Close scores + few head-to-heads = high info. Blowouts and re-treads = low info |
| **recencyWeight** | `1 / (1 + daysSinceLastWatch / 180)` | Recently watched movies prioritised — opinion is freshest. 6-month half-life |
| **stalenessWeight** | `comparison_staleness.staleness` (default 1.0) | User-controlled deprioritisation. Compounds: 1.0 → 0.5 → 0.25 → 0.125. Watch resets to 1.0 |
| **dimensionNeed** | `maxCompCount / (dimensionCompCount + 1)` | Under-sampled dimensions get boosted. Balances the dataset across dimensions |
| **randomJitter** | Uniform random in `[0.7, 1.3]` | Prevents deterministic loops. Ensures variety even when priorities are similar |

### Exclusions (pair never selected)

- Either movie has `excluded = 1` for the current dimension
- Either movie has only blacklisted watch events (no valid watches)
- Pair is in `comparison_skip_cooloffs` and global comparison count < `skip_until`
- Either movie has zero watch history entries

## Arena Actions

### Button layout

**Left card** — click to pick A as winner
**Right card** — click to pick B as winner

**Center column (between cards, stacked):**
- ↑ High draw
- — Mid draw
- ↓ Low draw

**Bottom action bar:**
- **Skip** — per-pair cooloff (10 comparisons), no comparison recorded
- **Stale (A)** / **Stale (B)** — compound staleness for that movie (×0.5 each press), no comparison recorded, next pair loaded
- **N/A** — mark both movies as excluded for current dimension, no comparison recorded
- **Not watched (A)** / **Not watched (B)** — blacklist watch history, purge comparisons, recalc ELO. Destructive action with confirmation dialog

**Watchlist button** — on each card (bookmark icon). Adds to watchlist only. Does NOT submit a comparison. Does NOT change the selection algorithm. Independent of other actions.

## Score Confidence

Each score has an implicit confidence derived from `comparison_count`:

```
confidence = 1 - (1 / sqrt(comparisonCount + 1))
```

| Comparisons | Confidence |
|-------------|------------|
| 0 | 0% |
| 1 | 29% |
| 3 | 50% |
| 8 | 67% |
| 15 | 75% |
| 30 | 82% |
| 99 | 90% |

Rankings page shows confidence as a subtle bar or percentage next to the score.

## Freshness Indicator

Movies show a freshness badge based on `daysSinceLastWatch` (most recent non-blacklisted watch event):

| Days since watch | Label | Color |
|-----------------|-------|-------|
| 0–30 | Fresh | green |
| 31–90 | Recent | blue |
| 91–365 | Fading | yellow |
| 365+ | Stale | red |

If the movie has a `comparison_staleness` row with `staleness < 1.0`, the badge shows "Stale" (red) regardless of watch recency.

## Business Rules

- Pair selection samples from weighted distribution — NOT deterministic top-pick
- Skip cooloff is per-pair per-dimension: skipping "A vs B" on Cinematography doesn't affect "A vs B" on Entertainment
- Staleness compounds multiplicatively: 1.0 → 0.5 → 0.25 → 0.125 → 0.0625 (min 0.01, never zero)
- A watch event (new entry in watch_history for that movie) resets staleness to 1.0
- "Not applicable" excludes from dimension rankings — score becomes null, not average. Movie doesn't appear in that dimension's ranked list
- "Not applicable" purges comparisons for that movie+dimension and recalculates ELO
- "Not watched" blacklists specific watch_history rows (sets `blacklisted = 1`), does not delete them
- "Not watched" purges all comparisons involving that movie (all dimensions) and recalculates ELO
- Plex sync checks `blacklisted = 0` when deduplicating — blacklisted events are never re-synced
- A movie with all watch events blacklisted is treated as unwatched — excluded from comparison pool
- New watch events for the same movie at a different timestamp are NOT blacklisted (user actually watched it)
- Confidence is derived (not stored) — calculated from `comparison_count` at query time
- Dimension rotation uses weighted random by dimension need — under-sampled dimensions appear more often but not exclusively

## Edge Cases

| Case | Behaviour |
|------|-----------|
| All pairs exhausted (every combo on cooloff) | Fall back to lowest-cooloff pair. Log warning |
| Movie marked stale + not applicable for all dimensions | Movie effectively exits the arena. Still appears in library |
| "Not watched" on a movie with many comparisons | Confirmation dialog warns about comparison count. Recalc may take a moment |
| Staleness at minimum (0.01) | Movie almost never appears but isn't fully excluded. Watch resets it |
| New dimension created | All movies start at 1500, confidence 0%, dimensionNeed is highest — new dimension dominates rotation until balanced |
| Movie watched again after being stale | Staleness resets to 1.0, freshness goes green, movie re-enters normal rotation |
| "Not applicable" then user changes mind | Un-exclude via movie detail page or dimension management |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-blacklist-watch-history](us-01-blacklist-watch-history.md) | Blacklisted column on watch_history, "not watched" arena action with comparison purge + ELO recalc, sync protection | Done | Yes |
| 02 | [us-02-staleness-model](us-02-staleness-model.md) | Staleness table, compounding multiplier, watch-resets-staleness, arena stale button | Done | Yes |
| 03 | [us-03-dimension-exclusion](us-03-dimension-exclusion.md) | "Not applicable" action, excluded column on media_scores, comparison purge + ELO recalc, hide from rankings | Done | Blocked by us-01 (shares recalc logic) |
| 04 | [us-04-skip-cooloff](us-04-skip-cooloff.md) | Skip cooloff table, per-pair per-dimension cooloff of 10 comparisons | Done | Yes |
| 05 | [us-05-pair-selection-algorithm](us-05-pair-selection-algorithm.md) | Weighted probabilistic pair selection using info gain, recency, staleness, dimension need, jitter | Done | Blocked by us-02, us-04 |
| 06 | [us-06-score-confidence](us-06-score-confidence.md) | Derived confidence from comparison_count, displayed on rankings page | Done | Yes |
| 07 | [us-07-freshness-indicator](us-07-freshness-indicator.md) | Fresh/Recent/Fading/Stale badge on movies in arena and library | Done | Blocked by us-02 |
| 08 | [us-08-arena-action-bar](us-08-arena-action-bar.md) | Bottom action bar with Skip, Stale(A/B), N/A, Not Watched(A/B). Watchlist stays on cards | Done | Blocked by us-01, us-02, us-03, us-04 |

US-01, US-02, US-04, US-06 can be built in parallel. US-03 shares recalc logic with US-01. US-05 depends on staleness and cooloff tables. US-08 is the UI integration that wires everything together.

## Out of Scope

- Post-watch debrief / rapid-fire review mode (separate PRD-063)
- Batch comparison / tier list drag-and-drop UI (separate PRD-064)
- TV show comparisons
- AI-suggested pairs
- Score decay over time (soft decay in ELO math — deferred, staleness model handles the user-facing concern)
