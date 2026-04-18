# US-03: Approve/reject tag rule proposals

> PRD: [029 — Tag Rule Proposals](README.md)
> Status: Partial

## Description

As a user, I want to approve or reject tag rule proposals with feedback, so that the system improves while I remain in control.

## Acceptance Criteria

- [x] `core.tagRules` supports approve/reject with feedback and atomic apply (covered by pops-api tests).
- [x] Tag rule proposals are approved/rejected as a bundled ChangeSet **from Tag Review** — `TagRuleProposalDialog` is wired into `TagReviewStep` (knoxio/pops#1886).
- [x] Approving applies the ChangeSet atomically via `applyTagRuleChangeSet` and stores it in the import store so it is included with the final commit.
- [x] Rejecting requires a feedback message and applies no changes **in the wizard** — the dialog enforces non-empty feedback before calling `rejectTagRuleChangeSet`.
- [x] Accepting a **New** tag makes it part of the user’s tag vocabulary going forward — the dialog presents new tags as checkboxes and passes `acceptedNewTags` to `applyTagRuleChangeSet`.
- [x] Approving updates suggested tags for remaining transactions in the current import session live — `handleTagRuleApplied` applies `preview.affected` items to `localTags` and `suggestedTagMeta` for non-user-edited transactions.
- [ ] A follow-up proposal can be generated incorporating rejection feedback **in the wizard** (not yet wired).
- [ ] Tag rule application at transaction scope (single-transaction accept/reject) is not yet wired — only group scope is supported.
