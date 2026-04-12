# US-04: Retroactive reclassification

> PRD: [031 — Import Final Review & Commit Step](README.md)
> Status: Done

## Description

As a user, I want newly committed rules to retroactively reclassify existing transactions in the database so that my historical data stays consistent with my current rule set.

## Acceptance Criteria

- [x] After rules are committed (inside the same DB transaction), the system queries all existing transactions and runs them through `findMatchingCorrectionFromRules` with the updated full rule set.
- [x] Any existing transaction whose matched rule changed (different entity, type, or location outcome) is updated in the database.
- [x] Processing is batched in groups of 500 rows to bound memory usage.
- [x] The count of reclassified transactions is returned in `CommitResult.retroactiveReclassifications`.
- [x] If no existing transactions are affected, the commit still succeeds and returns a reclassification count of 0.
- [x] Reclassification runs within the same DB transaction as entity/rule/transaction writes — a failure in reclassification rolls back the entire commit.
- [x] Transactions that were imported in the current commit are excluded from reclassification (they were already classified with the new rules).
- [x] Only transactions whose classification actually changed are updated — unchanged matches are not written.

## Notes

The reclassification scope is all existing transactions in the DB, minus those being imported in the current payload. Use the same `findMatchingCorrectionFromRules` function used during import processing to ensure consistent matching logic.
