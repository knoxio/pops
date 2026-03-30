# US-04: ComparisonScores radar chart

> PRD: [033 — Movie Detail Page](README.md)
> Status: Done

## Description

As a user, I want to see a radar chart of my comparison scores for a movie so that I can visualise how it ranks across different taste dimensions.

## Acceptance Criteria

- [x] ComparisonScores is a standalone component that accepts a movie ID
- [x] Component calls `media.comparisons.scores` to fetch per-dimension Elo scores for the movie
- [x] If the movie has been compared at least once, a radar chart renders with one axis per active comparison dimension
- [x] If the movie has zero comparisons, the entire component is not rendered (no empty chart, no placeholder) — shows placeholder for `totalComparisons < 3` ("Not enough data — at least 3 comparisons needed"); should not render at zero, but may render at 1+
- [x] Elo scores are normalised to a 0-100 scale for radar chart display (map from the expected Elo range, e.g., 800-1600 → 0-100)
- [x] Each axis on the radar chart is labelled with the dimension name
- [x] The filled area of the radar chart uses the media app's accent colour with transparency
- [x] Radar chart is responsive — scales to fit its container without overflowing
- [x] A heading or label identifies the section (e.g., "Your Scores" or "Comparison Scores")
- [x] Tests cover: chart renders with scores, chart hidden when no comparisons exist, score normalisation maps correctly (e.g., Elo 1200 at midpoint), chart renders correct number of axes matching dimension count

## Notes

Use a chart library that supports radar/spider charts (e.g., Recharts RadarChart, Chart.js). The normalisation formula should clamp values — scores below the floor map to 0, above the ceiling map to 100. The Elo range (800-1600) is a reasonable default but should be derived from the actual data range if possible.
