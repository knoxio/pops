# Transfer-only rules in matching + proposal flow (Issue #1650)

**Goal:** Support correction rules that classify transactions as `transfer` (or `income`) **without assigning an entity**, and treat those transactions as **matched** in the import matching pipeline and re-evaluation.

**Scope:** Backend only. Must be independent of Issue #1647.

## Context

PRD-024 requires “transfer-only support”: rules must be able to classify a transaction as transfer/income without requiring an entity assignment.

Issue #1650 scope explicitly calls out:

- matching must support type-only rules
- proposal engine supports creating/editing type-only rules

Current code path blocks this:

- `applyLearnedCorrection()` returns `null` when a matching correction has no `entityId`, causing type-only rules to fall through to entity matching / AI.

## Design

### A) Matching pipeline: type-only learned corrections are terminal matches

Update `apps/pops-api/src/modules/finance/imports/service.ts` `applyLearnedCorrection()`:

- When a correction rule matches:
  - If `entityId` exists → keep current behavior (apply entity assignment, provenance, tags, bucket per rule status).
  - Else if `transactionType` exists (`transfer`/`income`) → **return a matched result**:
    - `processed.transactionType = correction.transactionType`
    - `processed.status = "matched"`
    - `bucket = "matched"`
    - `processed.entity.matchType = "learned"`
    - leave `processed.entity.entityId/entityName` unset (no forced synthetic entity)
    - include `ruleProvenance` for transparency
  - Else → fall through (return `null`)

Rationale: the whole point of transfer-only rules is automated classification without merchant entities, and sending them to uncertain defeats the rule’s purpose.

### B) Re-evaluation: affectedCount must account for type-only changes

Update `reevaluateImportSessionResult()` change detection so `affectedCount` increments when `transactionType` changes (or is newly set), even if entity fields remain unset.

### C) Proposal/preview coverage

Ensure tests cover that type-only diffs (transactionType changes) are included in proposal preview/impact outputs, and do not require entity assignment.

## Data + types

- `ProcessedTransaction` already supports `transactionType?: "purchase" | "transfer" | "income"`.
- `entityMatchSchema` already models `entityId` and `entityName` as optional.
- This change makes it _possible_ for a `status: "matched"` item to have no entity, so consumers must not assume `entityId/entityName` exist for all matched transactions. (This PR remains backend-only; future UI hardening can follow if needed.)

## Tests (TDD)

- Unit test: `applyLearnedCorrection()` returns bucket `matched` and sets `transactionType` when correction matches and has no entityId but has `transactionType="transfer"`.
- Import matching test: `processImport` (and re-eval path) can move an item into `matched` purely via a transfer-only learned correction.
- Re-eval test: `affectedCount` increments for type-only changes.
- Corrections proposal/preview test: type-only changes are represented as affected items.
