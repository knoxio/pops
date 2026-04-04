# US-02: Staleness model

> PRD: [062 — Comparison Intelligence](README.md)
> Status: Done

## Description

As a user, I want to mark a movie as "stale" (I don't remember it well enough to compare) so that it appears less often in the arena, with the effect compounding each time I press the button.

## Acceptance Criteria

- [x] `comparison_staleness` table with `(media_type, media_id, staleness, updated_at)` and unique index on `(media_type, media_id)`
- [x] `media.comparisons.markStale` mutation accepts `{ mediaType, mediaId }` — inserts with `staleness = 0.5` if no row exists, or multiplies existing staleness by 0.5 (floor at 0.01)
- [x] `media.comparisons.getStaleness` query returns staleness for a movie (default 1.0 if no row)
- [x] When a new watch event is inserted into `watch_history` for a movie, that movie's staleness resets to 1.0 (or row is deleted)
- [x] Arena "Stale" button for a movie does NOT submit a comparison — marks staleness and loads the next pair
- [x] Staleness value is available to the pair selection algorithm (US-05)
- [x] Tests: initial mark = 0.5, second mark = 0.25, third = 0.125, floor at 0.01, watch resets to 1.0

## Notes

Staleness is per-movie, not per-dimension. If you don't remember a movie, you don't remember it for any dimension. The pair selection algorithm uses this as a multiplier on both movies in a candidate pair.
