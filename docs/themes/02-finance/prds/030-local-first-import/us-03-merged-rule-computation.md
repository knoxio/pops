# US-03: Merged rule set computation

> PRD: [030 — Local-First Import State Layer](README.md)
> Status: Done

## Description

As a system, I want a pure function that computes the merged rule set by applying all pending ChangeSets in order to the DB-fetched rules so that all matching, preview, and re-evaluation during import operate against a single coherent rule set.

The function folds `applyChangeSetToRules` (from `corrections/service.ts`) over each pending ChangeSet in insertion order, starting from the DB rules as the base. The result is memoized to avoid redundant recomputation on every render.

## Acceptance Criteria

- [x] A pure function `computeMergedRules(dbRules: CorrectionRow[], pendingChangeSets: PendingChangeSet[]) => CorrectionRow[]` exists and is exported.
- [x] The function applies each pending ChangeSet's `.changeSet` to the accumulator in insertion order using `applyChangeSetToRules`.
- [x] With zero pending ChangeSets, the function returns the DB rules array unchanged (referential equality).
- [x] With one pending ChangeSet containing an `add` operation, the result includes the new rule with a temp ID.
- [x] With multiple pending ChangeSets, later ChangeSets see the cumulative effect of earlier ones (e.g. a ChangeSet that edits a rule added by a prior ChangeSet works correctly).
- [x] The function is memoized so that identical inputs (by reference) return the same output reference.
- [x] Unit tests cover: zero pending, single add, single edit, multiple sequential (add then edit same rule), remove then reference (error case), mixed operations.

## Notes

- `applyChangeSetToRules` already exists in `apps/pops-api/src/modules/core/corrections/service.ts`. It is a pure function that takes `(rules: CorrectionRow[], changeSet: ChangeSet) => CorrectionRow[]`. This function needs to be importable from the frontend — either re-export it from a shared package or duplicate the pure logic. Decide at implementation time.
- For memoization, consider a simple reference-equality check on the two input arrays, or use a library like `reselect`. The key invariant is: same `dbRules` ref + same `pendingChangeSets` ref = same output ref.
- If a ChangeSet references a rule ID that does not exist in the accumulated state (e.g. because a prior ChangeSet removed it), `applyChangeSetToRules` throws `NotFoundError`. The caller (US-06/US-07) should prevent this via UI constraints, but the function should not swallow the error.
