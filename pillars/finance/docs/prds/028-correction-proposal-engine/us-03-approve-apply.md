# US-03: Approve + apply ChangeSet (atomic) and re-evaluate import

> PRD: [028 — Correction Proposal Engine](README.md)
> Status: Done

## Description

As a user, I want approving a proposal to immediately reduce my remaining manual work in the same import, so that the review experience improves in real time.

## Acceptance Criteria

- [x] The user can approve a bundled ChangeSet proposal.
- [x] Approval applies the ChangeSet atomically (all operations succeed or none).
- [x] After application, the import review immediately re-evaluates remaining transactions in the current import session using the same rules engine used during processing.
- [x] The UI reflects the new state:
  - transactions that now match are moved to Matched
  - any transactions whose classification changes are updated consistently
- [x] The system communicates what happened:
  - ChangeSet applied
  - number of transactions affected in this import
