# US-03: Tier list movie selection

> PRD: [064 — Batch Tier List](README.md)
> Status: Not started

## Description

As the system, I select 8 movies for a tier list session that maximise information gain for the chosen dimension.

## Acceptance Criteria

- [ ] `getTierListMovies(dimensionId)` returns up to 8 movies
- [ ] Prefers movies with few comparisons in this dimension (high uncertainty)
- [ ] Mix of score ranges — not all top-ranked or all bottom-ranked
- [ ] Excludes: blacklisted, excluded-for-dimension, staleness < 0.3
- [ ] Returns fewer than 8 if not enough eligible (minimum 2)
- [ ] Includes poster URL and title for each movie
- [ ] Tests: returns 8 when available, respects exclusions, mixed score ranges
