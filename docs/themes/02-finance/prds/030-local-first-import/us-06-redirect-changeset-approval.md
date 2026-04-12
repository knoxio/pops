# US-06: Redirect ChangeSet approval to local store

> PRD: [030 — Local-First Import State Layer](README.md)
> Status: Not started

## Description

As a user, I want the CorrectionProposalDialog "Apply" action to store the approved ChangeSet in the local pending store instead of calling `applyChangeSetAndReevaluate` on the server so that rule changes are deferred until commit while still triggering local re-evaluation of transactions.

## Acceptance Criteria

- [ ] The CorrectionProposalDialog "Apply" action calls `addPendingChangeSet` (from US-02) instead of the tRPC `applyChangeSetAndReevaluate` mutation.
- [ ] The stored `PendingChangeSet` includes the full `ChangeSet` object, a `source` string identifying the origin (e.g. `"correction-proposal"`), and an ISO `appliedAt` timestamp.
- [ ] After storing the ChangeSet locally, the dialog triggers local re-evaluation of uncertain and failed transactions against the updated merged rule set (delegates to US-07).
- [ ] The re-evaluation results update the `processedTransactions` in the import store, moving newly matched transactions from `uncertain`/`failed` to `matched`.
- [ ] The dialog closes after successful local storage and re-evaluation, matching the current UX flow.
- [ ] No server-side mutation is called during the "Apply" action (no `applyChangeSetAndReevaluate`, no rule writes).
- [ ] If the ChangeSet references a pending entity (temp ID), the temp ID is stored as-is in the ChangeSet operations. No resolution happens at this stage.

## Notes

- `CorrectionProposalDialog` currently lives at `packages/app-finance/src/components/imports/CorrectionProposalDialog.tsx`. It calls `applyChangeSetAndReevaluate` which writes rules to the DB and returns re-evaluated transactions.
- The local re-evaluation (US-07) replaces the server-side re-evaluation that `applyChangeSetAndReevaluate` currently performs.
- The merged rule set for re-evaluation must include the newly added ChangeSet (it was just appended to the pending list, so `computeMergedRules` will include it).
- The "Reject with feedback" flow (PRD-028 US-04) is unaffected by this change — rejection still does not store anything.
