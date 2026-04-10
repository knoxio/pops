# US-04: Reject proposal with feedback

> PRD: [028 — Correction Proposal Engine](README.md)
> Status: Done

## Description

As a user, I want to reject a proposal that is going in the wrong direction and tell the system why, so that rejected proposals are captured for training and audit without leaving me stuck in a dead-end dialog.

Rejection is the "start over" escape hatch. Day-to-day refinement (narrowing a pattern, swapping an entity, splitting a rule) happens via the editable proposal dialog in [US-06](us-06-editable-proposal.md), not via reject-and-retry.

## Acceptance Criteria

- [ ] The user can reject a bundled ChangeSet proposal from the proposal dialog.
- [ ] Rejection requires a short free-text feedback message.
- [ ] Rejection applies no rule changes.
- [ ] Rejection closes the proposal dialog; the triggering transaction(s) remain in whatever local state they were in before the proposal was generated.
- [ ] The rejection, including the feedback and the rejected ChangeSet, is persisted for audit and future training.
- [ ] The rejection UX must make clear that rejection is the escape hatch — for day-to-day refinement the user should edit the proposal in place.
