# US-04: Reject proposal with feedback

> PRD: [028 — Correction Proposal Engine](README.md)
> Status: Done

## Description

As a user, I want to reject a proposal that is going in the wrong direction and tell the system why, so that rejected proposals are captured for training and audit without leaving me stuck in a dead-end dialog.

Rejection is the "start over" escape hatch. Day-to-day refinement (narrowing a pattern, swapping an entity, splitting a rule) happens via the editable proposal dialog in [US-06](us-06-editable-proposal.md), not via reject-and-retry.

## Acceptance Criteria

- [x] The user can reject a bundled ChangeSet proposal from the proposal dialog.
- [x] Rejection requires a short free-text feedback message.
- [x] Rejection applies no rule changes.
- [x] Rejection closes the proposal dialog; the triggering transaction(s) remain in whatever local state they were in before the proposal was generated.
- [x] The rejection, including the feedback and the rejected ChangeSet, is persisted for audit and future training.
- [x] The rejection UX must make clear that rejection is the escape hatch — for day-to-day refinement the user should edit the proposal in place.
