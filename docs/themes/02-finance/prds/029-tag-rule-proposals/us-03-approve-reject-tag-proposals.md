# US-03: Approve/reject tag rule proposals

> PRD: [029 — Tag Rule Proposals](README.md)
> Status: Partial

## Description

As a user, I want to approve or reject tag rule proposals with feedback, so that the system improves while I remain in control.

## Acceptance Criteria

- [x] `core.tagRules` supports approve/reject with feedback and atomic apply (covered by pops-api tests).
- [ ] Tag rule proposals are approved/rejected as a bundled ChangeSet **from Tag Review** (knoxio/pops#1741).
- [ ] Approving applies the ChangeSet atomically and updates suggested tags for remaining transactions in the current import session **in the wizard**.
- [ ] Rejecting requires a feedback message and applies no changes **in the wizard**.
- [ ] A follow-up proposal can be generated incorporating rejection feedback **in the wizard**.
- [ ] Tag rule application never overwrites user-entered tags in the current import **(verified end-to-end in wizard)**.
- [ ] Accepting/rejecting suggestions must work at both scopes **in the wizard**:
  - group scope accept/reject affects all transactions in the group (with merge semantics)
  - transaction scope accept/reject affects only that transaction
- [ ] Accepting a **New** tag makes it part of the user’s tag vocabulary going forward **through the wizard**.
