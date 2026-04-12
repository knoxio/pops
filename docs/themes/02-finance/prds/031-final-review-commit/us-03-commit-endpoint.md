# US-03: Commit endpoint

> PRD: [031 — Import Final Review & Commit Step](README.md)
> Status: Done

## Description

As a system, I want a single tRPC endpoint that accepts the full commit payload and writes entities, rules, and transactions atomically so that partial writes never corrupt the database.

## Acceptance Criteria

- [x] A new `finance.imports.commitImport` tRPC mutation exists and accepts the `CommitPayload` shape (entities, changeSets, transactions).
- [x] All writes execute inside a single SQLite transaction — if any operation fails, the entire transaction rolls back.
- [x] Entities are created first; the returned real DB IDs replace all temp ID references in subsequent changeSets and transactions.
- [x] ChangeSets are applied via the existing `applyChangeSet` service, receiving resolved entity IDs.
- [x] Transactions are written using the existing execute import logic, receiving resolved entity IDs.
- [x] The endpoint returns a `CommitResult` with `entitiesCreated`, `rulesApplied` (broken down by add/edit/disable/remove), `transactionsImported`, `transactionsFailed`, and `retroactiveReclassifications` (initially 0 until US-04).
- [x] If `CommitPayload` contains zero entities or zero changeSets, those phases are skipped without error.
- [x] Input validation rejects malformed payloads (missing required fields, unknown temp IDs) with descriptive error messages before the transaction begins.

## Notes

Temp ID resolution is the critical piece: the payload uses client-generated temp IDs for new entities, and those IDs may appear in both ChangeSet operations and transaction entity assignments. The endpoint must map every temp ID to its real DB ID after entity creation, then substitute throughout.
