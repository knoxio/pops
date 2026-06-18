# US-08: Preview with merged rules

> PRD: [030 — Local-First Import State Layer](README.md)
> Status: Done

## Description

As a user, I want ChangeSet impact previews to use the merged rule set as the baseline instead of DB-only rules so that the preview accurately reflects the cumulative effect of all pending rule changes, not just the isolated effect against the original DB state.

Currently, `previewChangeSetImpact` computes before/after diffs using the DB rules as the baseline. With pending ChangeSets in play, the "before" state should be the merged rule set (DB + all prior pending ChangeSets), and the "after" state should be the merged rules with the proposed ChangeSet applied on top.

## Acceptance Criteria

- [x] The ChangeSet preview flow passes the merged rule set (from `computeMergedRules`) as the `rules` argument to `previewChangeSetImpact` instead of the raw DB rules.
- [x] The "before" column in the preview shows matches against the merged rules (reflecting all prior pending ChangeSets), not the DB-only rules.
- [x] The "after" column shows matches against the merged rules with the proposed ChangeSet applied on top.
- [x] If there are no pending ChangeSets, the preview behaves identically to the current implementation (merged rules = DB rules).
- [x] A preview of a ChangeSet that edits a rule added by a prior pending ChangeSet shows the correct before/after diff.
- [x] Unit tests cover: preview with no pending (baseline), preview with one prior pending ChangeSet, preview of a ChangeSet editing a pending-added rule.

## Notes

- `previewChangeSetImpact` is a pure function in `corrections/service.ts`. Its signature is `(args: { rules, changeSet, transactions, minConfidence }) => { diffs, summary }`. The `rules` argument is the baseline; internally it calls `applyChangeSetToRules(rules, changeSet)` to compute the "after" set.
- The call site for preview is in the CorrectionProposalDialog (or a hook it uses). Locate the exact call site at implementation time and swap the `rules` argument.
- This change is purely about input wiring — `previewChangeSetImpact` itself does not need modification.
