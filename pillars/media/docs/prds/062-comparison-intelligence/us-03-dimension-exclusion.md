# US-03: Dimension exclusion ("Not applicable")

> PRD: [062 — Comparison Intelligence](README.md)
> Status: Done

## Description

As a user, I want to mark a movie as "not applicable" for a specific dimension (e.g. cinematography doesn't apply to Inside Out 2) so that it's excluded from that dimension's rankings and never appears in pairs for that dimension.

## Acceptance Criteria

- [x] `media_scores` table has an `excluded` INTEGER column, default 0
- [x] `media.comparisons.excludeFromDimension` mutation accepts `{ mediaType, mediaId, dimensionId }` — sets `excluded = 1` on the media_scores row (creates it if missing)
- [x] After excluding, all comparisons involving that movie for that specific dimension are deleted
- [x] ELO scores are recalculated (reset + replay) for that dimension
- [x] Excluded movies do not appear in pair selection for that dimension
- [x] Excluded movies do not appear in rankings for that dimension
- [x] `media.comparisons.includeInDimension` mutation allows undoing the exclusion (sets `excluded = 0`)
- [x] Arena "N/A" button excludes BOTH movies in the current pair for the current dimension, loads next pair
- [x] Tests: exclude sets column, comparisons purged, recalc correct, pair selection skips excluded, rankings omit excluded, re-include works

## Notes

Exclusion is per-movie per-dimension. A movie can be excluded from Cinematography but still compared on Entertainment. The "N/A" arena button affects both movies since neither is applicable for that dimension in the current matchup. Un-excluding is available from the movie detail page or dimension management UI.
