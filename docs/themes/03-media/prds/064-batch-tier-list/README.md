# PRD-064: Batch Tier List

> Epic: [04 — Ratings & Comparisons](../../epics/04-ratings-comparisons.md)
> Status: Done

## Overview

A drag-and-drop tier list UI for ranking 8 movies at once on a single dimension. Instead of pairwise A-vs-B comparisons, the user arranges movies into tiers (S/A/B/C/D). Each placement implies a set of pairwise results that batch-update ELO scores. Complements the compare arena — faster way to process many movies at once.

## Route

`/media/tier-list`

## UX Flow

1. User selects a dimension (or one is suggested by dimension need)
2. System presents 8 movies as draggable cards in an unranked pool
3. User drags movies into tier rows: S (top) / A / B / C / D (bottom)
4. Movies can remain in the unranked pool (skipped)
5. User clicks "Submit" to process all implied comparisons
6. Summary shows: how many comparisons implied, ELO changes

## Tier Layout

```
┌─────────────────────────────────────┐
│ S │ [movie] [movie]                 │
├─────────────────────────────────────┤
│ A │ [movie] [movie] [movie]         │
├─────────────────────────────────────┤
│ B │ [movie]                         │
├─────────────────────────────────────┤
│ C │                                 │
├─────────────────────────────────────┤
│ D │ [movie] [movie]                 │
├─────────────────────────────────────┤
│ Unranked │ [movie]                  │
└─────────────────────────────────────┘
```

Each tier row is a horizontal drop zone. Movie cards show poster thumbnail + title. Drag between tiers to reposition.

## Implied Comparisons

Tier placements convert to pairwise results:

| Relationship | Implied result |
|-------------|---------------|
| Same tier | Draw — High if S-tier, Mid if B-tier, Low if D-tier |
| 1 tier apart (e.g. S vs A) | Higher tier wins |
| 2+ tiers apart (e.g. S vs C) | Higher tier wins |
| Unranked vs any | No comparison implied (skipped) |

### Draw tier mapping

| Tier | Draw tier when same-tier |
|------|------------------------|
| S | High (0.7) — both great |
| A | High (0.7) — both good |
| B | Mid (0.5) — both average |
| C | Low (0.3) — both below average |
| D | Low (0.3) — both poor |

### Comparison count

For 8 movies all placed in tiers: C(8,2) = 28 implied comparisons. If some remain unranked, fewer comparisons are generated. Each implied comparison goes through the standard `comparisons.record` path with appropriate `winnerId` and `drawTier`.

## Movie Selection

The 8 movies are selected to maximise information gain:
- Prefer movies with few comparisons in this dimension (high uncertainty)
- Mix of score ranges (don't show 8 top-ranked movies)
- Exclude blacklisted, excluded-for-dimension, and stale movies (staleness < 0.3)
- User can refresh the set ("Show different movies")

## Data Model

No new tables. Tier list submissions generate standard `comparisons` rows via the existing `record` path. The tier-to-comparison conversion is computed client-side and submitted as a batch.

## Business Rules

- Each tier placement generates pairwise comparisons against all other placed movies
- Unranked movies produce no comparisons
- All implied comparisons are for the selected dimension only
- Comparisons are recorded in a single transaction (all or nothing)
- The tier list is stateless — there's no saved draft. Navigating away loses the arrangement
- A movie can appear in multiple tier list sessions (different dimensions, or same dimension with different opponents)
- Existing comparisons between the same pair on the same dimension are NOT overwritten — the new comparison is added alongside (ELO accumulates)
- Maximum 8 movies per session. Minimum 2 placed in tiers to submit

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Fewer than 8 eligible movies | Show as many as available (minimum 2) |
| All movies placed in same tier | Only same-tier draws generated |
| Only 2 movies placed | 1 comparison (or 1 draw) |
| User places none and submits | Submit disabled when fewer than 2 placed |
| Dimension has no scored movies | All 8 start at 1500, selection is random from watched pool |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-tier-conversion](us-01-tier-conversion.md) | Convert tier placements to implied pairwise comparisons with correct winners and draw tiers | Done | Yes |
| 02 | [us-02-batch-record](us-02-batch-record.md) | Batch record implied comparisons in a single transaction | Done | Yes |
| 03 | [us-03-movie-selection](us-03-movie-selection.md) | Select 8 movies to maximise information gain for the chosen dimension | Done | Yes |
| 04 | [us-04-tier-list-api](us-04-tier-list-api.md) | tRPC endpoints: getTierListMovies, submitTierList | Done | Blocked by us-01, us-02, us-03 |
| 05 | [us-05-drag-drop-ui](us-05-drag-drop-ui.md) | Drag-and-drop tier list page with S/A/B/C/D rows, movie cards, unranked pool | Done | Blocked by us-04 |
| 06 | [us-06-submission-summary](us-06-submission-summary.md) | Post-submit summary showing implied comparison count and ELO changes | Done | Blocked by us-05 |

US-01, US-02, US-03 can parallelise. US-05 and US-06 can parallelise once US-04 is done.

## Out of Scope

- Saved/draft tier lists
- TV show tier lists
- Cross-dimension tier lists (one dimension per session)
- Undo individual implied comparisons after submission (delete the batch via history if needed)
