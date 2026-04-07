# US-03: Approve/reject tag rule proposals

> PRD: [029 — Tag Rule Proposals](README.md)
> Status: Not started

## Description

As a user, I want to approve or reject tag rule proposals with feedback, so that the system improves while I remain in control.

## Acceptance Criteria

- [ ] Tag rule proposals are approved/rejected as a bundled ChangeSet.
- [ ] Approving applies the ChangeSet atomically and updates suggested tags for remaining transactions in the current import session.
- [ ] Rejecting requires a feedback message and applies no changes.
- [ ] A follow-up proposal can be generated incorporating rejection feedback.
- [ ] Tag rule application never overwrites user-entered tags in the current import.
- [ ] Accepting/rejecting suggestions must work at both scopes:
  - group scope accept/reject affects all transactions in the group (with merge semantics)
  - transaction scope accept/reject affects only that transaction
- [ ] Accepting a **New** tag makes it part of the user’s tag vocabulary going forward.

