# US-04: Retroactive reclassification

> PRD: [031 — Import Final Review & Commit Step](README.md)
> Status: Not started

## Description

As a user, I want newly committed rules to retroactively reclassify existing transactions in the database so that my historical data stays consistent with my current rule set.

## Acceptance Criteria

- [ ] After rules are committed (inside the same DB transaction), the system queries all existing transactions and runs them through `findMatchingCorrectionFromRules` with the updated full rule set.
- [ ] Any existing transaction whose matched rule changed (different entity, type, or location outcome) is updated in the database.
- [ ] Processing is batched in groups of 500 rows to bound memory usage.
- [ ] The count of reclassified transactions is returned in `CommitResult.retroactiveReclassifications`.
- [ ] If no existing transactions are affected, the commit still succeeds and returns a reclassification count of 0.
- [ ] Reclassification runs within the same DB transaction as entity/rule/transaction writes — a failure in reclassification rolls back the entire commit.
- [ ] Transactions that were imported in the current commit are excluded from reclassification (they were already classified with the new rules).
- [ ] Only transactions whose classification actually changed are updated — unchanged matches are not written.

## Notes

The reclassification scope is all existing transactions in the DB, minus those being imported in the current payload. Use the same `findMatchingCorrectionFromRules` function used during import processing to ensure consistent matching logic.
