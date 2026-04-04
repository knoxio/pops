# US-01: Tier-to-comparison conversion

> PRD: [064 — Batch Tier List](README.md)
> Status: Done

## Description

As the system, I convert a set of tier placements into implied pairwise comparisons with correct winners and draw tiers.

## Acceptance Criteria

- [x] `convertTierPlacements(placements: Array<{ movieId, tier }>)` returns `Array<{ mediaAId, mediaBId, winnerId, drawTier }>`
- [x] Same tier → draw. Draw tier mapped: S=high, A=high, B=mid, C=low, D=low
- [x] Different tiers → higher tier wins (winnerId = higher-tier movie)
- [x] Unranked movies produce no comparisons
- [x] For N placed movies, generates exactly C(N,2) comparisons
- [x] Tests: same tier draws correct, cross-tier wins correct, unranked excluded, count is C(N,2)
