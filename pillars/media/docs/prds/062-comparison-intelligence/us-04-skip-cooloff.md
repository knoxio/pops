# US-04: Skip cooloff

> PRD: [062 — Comparison Intelligence](README.md)
> Status: Done

## Description

As a user, I want "skip" to prevent the same pair from reappearing for the next 10 comparisons in that dimension.

## Acceptance Criteria

- [x] `comparison_skip_cooloffs` table with `(dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, skip_until, created_at)` and unique index on pair+dimension
- [x] When "Skip" is pressed, a cooloff row is inserted with `skip_until = currentGlobalComparisonCount + 10`
- [x] Pair selection excludes pairs where `currentGlobalComparisonCount < skip_until`
- [x] Cooloff is per-pair per-dimension: skipping "A vs B" on Cinematography doesn't affect "A vs B" on Entertainment
- [x] Cooloff is symmetric: skipping "A vs B" also blocks "B vs A" for the same dimension
- [x] Expired cooloffs are ignored at query time (no cleanup needed)
- [x] Tests: skip inserts cooloff, pair excluded during cooloff, pair eligible after cooloff, symmetry enforced

## Notes

The cooloff count of 10 is a starting point; can be made configurable later. The global comparison count is the total number of rows in the `comparisons` table — a monotonically increasing value.
