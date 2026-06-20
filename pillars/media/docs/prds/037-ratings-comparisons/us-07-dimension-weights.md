# US-07: Dimension weights for overall ranking

> PRD: [037 — Ratings & Comparisons](README.md)
> Status: Done

## Description

As a user, I want to adjust per-dimension weights so that the overall ranking reflects which taste dimensions matter most to me.

## Acceptance Criteria

- [x] Each active dimension has a weight value (default 1.0)
- [x] Weight slider or numeric input in the dimension management UI
- [x] Overall ranking calculation uses weighted average instead of simple average
- [x] Weight changes immediately recalculate overall rankings
- [x] Weights persist across sessions (stored in the dimensions table)
- [x] Setting a weight to 0 effectively excludes that dimension from overall ranking without deactivating it

## Notes

Weights allow a user to say "I care more about Rewatchability than Cinematography" without deactivating any dimension. The overall score becomes a weighted average: `sum(score * weight) / sum(weight)` across active dimensions with non-zero weight.
