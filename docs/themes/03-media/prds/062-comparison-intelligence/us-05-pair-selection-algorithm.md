# US-05: Pair selection algorithm

> PRD: [062 — Comparison Intelligence](README.md)
> Status: Done

## Description

As the system, I select comparison pairs using a weighted probabilistic model so that each comparison maximises information gain about the user's taste.

## Acceptance Criteria

- [x] Pair selection uses the priority formula from the PRD — not random
- [x] **Information gain**: pairs with close scores and few head-to-head comparisons are prioritised. Formula: `1 / (1 + abs(scoreA - scoreB) / 200) × (1 / (pairCount + 1))`
- [x] **Recency weight**: recently watched movies appear more often. Formula: `1 / (1 + daysSinceLastWatch / 180)` (6-month half-life)
- [x] **Staleness weight**: reads from `comparison_staleness` table. Default 1.0 if no row. Multiplied for both movies in the pair
- [x] **Dimension need**: under-sampled dimensions get boosted. Formula: `maxCompCount / (thisDimensionCompCount + 1)`
- [x] **Random jitter**: final priority multiplied by uniform random in [0.7, 1.3]
- [x] Selection is weighted random sampling from all eligible pairs — NOT deterministic top-pick
- [x] Exclusion rules applied before scoring: blacklisted, excluded for dimension, on cooloff, no valid watch events
- [x] Dimension selection uses weighted random (by dimension need) instead of round-robin rotation
- [x] Falls back to any eligible pair if weighted selection produces no candidates
- [x] Performance: pair selection completes in < 200ms for libraries up to 500 movies
- [x] Tests: information gain favours close-score pairs, recency favours recent watches, staleness reduces frequency, dimension need favours under-sampled, jitter produces variety across repeated calls

## Notes

The algorithm doesn't need to evaluate every possible pair. Sample a pool of ~50 eligible movies, generate candidate pairs from them, score each pair, then sample proportionally. This keeps it O(n) not O(n²).

Dimension selection happens first (weighted random by need), then pair selection within that dimension. Two-stage process, not a single formula across all dimensions simultaneously.
