# PRD-031: Import Final Review & Commit Step

> Epic: [01 — Import Pipeline](../../epics/01-import-pipeline.md)
> Status: Partial

## Overview

Add a new Step 6 ("Final Review & Commit") between the current Tag Review (Step 5) and Summary (now Step 7). This step presents a complete summary of all pending changes — new entities, new/edited/disabled/removed rules, tag assignments, transaction counts — and commits everything atomically to the database in a single request. On commit, retroactive reclassification applies the new rules to existing DB transactions that now match (or no longer match).

**Open gap:** Tag Review still invokes `executeImport` before this step, so the atomic commit path is not the sole writer yet. Depends on PRD-030 [US-10](../030-local-first-import/us-10-single-commit-write-path.md) (GitHub knoxio/pops#1740).

## Dependencies

- **PRD-030** (Local-First Import State Layer) provides the pending stores and commit payload builder that feed this step.
- Existing `applyChangeSet` in `service.ts` handles atomic rule application.
- Existing execute import logic in `finance/imports/router.ts` handles transaction writing.

## API Surface

### `finance.imports.commitImport`

New tRPC mutation. Accepts a full commit payload, executes all operations in a single DB transaction, returns results including retroactive reclassification counts.

**Request:**

```
CommitPayload {
  entities: Array<{ tempId, name, type }>
  changeSets: Array<ChangeSet>
  transactions: Array<ConfirmedTransaction>
}
```

**Response:**

```
CommitResult {
  entitiesCreated: number
  rulesApplied: { added, edited, disabled, removed }
  transactionsImported: number
  transactionsFailed: Array<{ checksum, error }>
  retroactiveReclassifications: number
}
```

## Business Rules

- The commit is atomic — if any part fails, nothing is written.
- Entity temp IDs must be resolved to real DB IDs before rules and transactions referencing them are written.
- Order of operations in commit: entities first, then rules, then transactions, then retroactive reclassification.
- Retroactive reclassification runs after rules are committed, within the same DB transaction.
- Reclassification is bounded — processes existing transactions in batches of 500.
- The user must explicitly click "Approve & Commit All" — no auto-commit.
- The "Back" button returns to Tag Review; user can go further back to make changes.

## Edge Cases

| Case                                                          | Behaviour                                                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| No pending entities or rules (just transactions)              | Commit proceeds with transaction write only.                                            |
| Pending entity referenced by both a rule and a transaction    | Temp ID resolved once during entity creation, used by both rule and transaction writes. |
| Retroactive reclassification finds zero affected transactions | Commit succeeds, shows "0 existing transactions affected".                              |
| Commit fails partway                                          | Entire DB transaction rolls back, user sees error with detail, can retry.               |
| User navigates back from Final Review, makes changes, returns | Summary updates to reflect the new pending state from the stores.                       |
| Very large reclassification (10k+ transactions)               | Batched processing (500 rows per batch) with progress indication.                       |

## User Stories

| #   | Story                                                                       | Summary                                                                                | Status  | Parallelisable                   |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------- | -------------------------------- |
| 01  | [us-01-step-scaffold](us-01-step-scaffold.md)                               | Add Step 6 to the wizard, shift Summary to Step 7, create FinalReviewStep shell        | Done    | Yes                              |
| 02  | [us-02-pending-changes-summary](us-02-pending-changes-summary.md)           | Display all pending changes in FinalReviewStep with collapsible detail views           | Done    | Blocked by us-01 + PRD-030       |
| 03  | [us-03-commit-endpoint](us-03-commit-endpoint.md)                           | `commitImport` tRPC endpoint with single-transaction atomic writes                     | Done    | Blocked by PRD-030 US-09         |
| 04  | [us-04-retroactive-reclassification](us-04-retroactive-reclassification.md) | Reclassify existing DB transactions against new rule set within the commit transaction | Done    | Blocked by us-03                 |
| 05  | [us-05-commit-progress-result](us-05-commit-progress-result.md)             | "Approve & Commit All" button, progress indicator, and result display                  | Done    | Blocked by us-03, us-04          |
| 06  | [us-06-summary-step-update](us-06-summary-step-update.md)                   | Update Summary step (now Step 7) with retroactive reclassification results             | Partial | Blocked by us-05 + PRD-030 US-10 |

## Out of Scope

- The local-first stores and merge layer (PRD-030)
- The global rule manager UI (PRD-032)
- Undo/rollback after commit is completed
