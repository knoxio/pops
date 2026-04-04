# US-04: Tier list tRPC endpoints

> PRD: [064 — Batch Tier List](README.md)
> Status: Not started

## Description

As a developer, I want tRPC endpoints for fetching tier list movies and submitting a completed tier list.

## Acceptance Criteria

- [ ] `media.comparisons.getTierListMovies({ dimensionId })` returns up to 8 movies with poster + title + current score
- [ ] `media.comparisons.submitTierList({ dimensionId, placements: Array<{ movieId, tier }> })` converts to implied comparisons and batch-records them
- [ ] Submit returns: { comparisonsRecorded, scoreChanges: Array<{ movieId, oldScore, newScore }> }
- [ ] Validates: minimum 2 placed movies, valid tier values (S/A/B/C/D), valid dimension
- [ ] Both protected procedures
- [ ] Tests: get returns movies, submit records correct count, validation rejects bad input
