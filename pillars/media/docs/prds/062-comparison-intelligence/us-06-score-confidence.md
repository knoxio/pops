# US-06: Score confidence

> PRD: [062 — Comparison Intelligence](README.md)
> Status: Done

## Description

As a user, I want to see how confident the ranking score is so I know which movies are well-established vs barely compared.

## Acceptance Criteria

- [x] Confidence formula: `confidence = 1 - (1 / sqrt(comparisonCount + 1))` — derived at query time, not stored
- [x] Rankings API includes `confidence` (0–1 float) in each ranked entry
- [x] Rankings page shows confidence as a subtle visual (e.g. thin bar under the score, or percentage text like "82%")
- [x] Low-confidence scores (< 50%, i.e. fewer than 3 comparisons) are visually muted or annotated
- [x] Overall rankings confidence is the minimum confidence across active dimensions for that movie
- [x] Tests: confidence is 0 at count=0, ~0.29 at count=1, ~0.5 at count=3, ~0.82 at count=30

## Notes

Confidence is purely cosmetic in this US — it tells the user how much to trust a score. The pair selection algorithm (US-05) uses `comparisonCount` directly in its information gain formula, achieving the same prioritisation effect without depending on this number.
