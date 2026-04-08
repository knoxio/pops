# US-03: Approve/reject tag rule proposals

> PRD: [029 — Tag Rule Proposals](README.md)
> Status: Done

## Description

As a user, I want to approve or reject tag rule proposals with feedback, so that the system improves while I remain in control.

## Acceptance Criteria

- [x] Tag rule proposals are approved/rejected as a bundled ChangeSet.
- [x] Approving applies the ChangeSet atomically and updates suggested tags for remaining transactions in the current import session.
- [x] Rejecting requires a feedback message and applies no changes.
- [x] A follow-up proposal can be generated incorporating rejection feedback.
- [x] Tag rule application never overwrites user-entered tags in the current import.
- [x] Accepting/rejecting suggestions must work at both scopes:
  - group scope accept/reject affects all transactions in the group (with merge semantics)
  - transaction scope accept/reject affects only that transaction
- [x] Accepting a **New** tag makes it part of the user’s tag vocabulary going forward.

