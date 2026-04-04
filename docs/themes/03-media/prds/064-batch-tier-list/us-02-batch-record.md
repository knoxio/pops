# US-02: Batch record comparisons

> PRD: [064 — Batch Tier List](README.md)
> Status: Done

## Description

As the system, I record a batch of implied comparisons from a tier list submission in a single transaction.

## Acceptance Criteria

- [x] `batchRecordComparisons(dimensionId, comparisons: Array<{ mediaAId, mediaBId, winnerId, drawTier }>)` records all in one transaction
- [x] Each comparison goes through standard ELO update logic (same as `recordComparison`)
- [x] All or nothing — if any insert fails, entire batch rolls back
- [x] Returns count of comparisons recorded
- [x] Tests: batch inserts all, ELO updated for each, rollback on failure
