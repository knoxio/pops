# US-01: Tier-to-comparison conversion

> PRD: [064 — Batch Tier List](README.md)
> Status: Not started

## Description

As the system, I convert a set of tier placements into implied pairwise comparisons with correct winners and draw tiers.

## Acceptance Criteria

- [ ] `convertTierPlacements(placements: Array<{ movieId, tier }>)` returns `Array<{ mediaAId, mediaBId, winnerId, drawTier }>`
- [ ] Same tier → draw. Draw tier mapped: S=high, A=high, B=mid, C=low, D=low
- [ ] Different tiers → higher tier wins (winnerId = higher-tier movie)
- [ ] Unranked movies produce no comparisons
- [ ] For N placed movies, generates exactly C(N,2) comparisons
- [ ] Tests: same tier draws correct, cross-tier wins correct, unranked excluded, count is C(N,2)
