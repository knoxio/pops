# US-14: Save & Learn correction

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a user, I want the system to learn from my corrections during import review by proposing rule changes that I can approve, so that future imports require less manual work without sacrificing correctness.

## Acceptance Criteria

- [x] A **Save & Learn** action is available when the user has made a change to a transaction during review that the system can learn from (entity assignment, transaction type, location override).
- [x] Clicking **Save & Learn** opens a **Correction Proposal** showing a bundled ChangeSet of rule operations.
- [x] The proposal includes:
  - Proposed rule pattern(s) (as they would be stored)
  - Proposed match type(s) (exact / contains / regex)
  - Proposed confidence / activation semantics
  - Brief rationale per operation
  - An **impact preview** for the current import: how many remaining transactions would change, and a way to inspect the affected transactions
- [x] The user can **Approve** the ChangeSet. On approval:
  - The system applies the ChangeSet atomically
  - The import review re-evaluates remaining transactions using the same rules engine as processing
  - Any newly matched transactions are moved accordingly (even if they belong to different visual groups)
- [x] The user can **Reject** the ChangeSet and must provide a short feedback message describing what is wrong.
- [x] After rejection, the system can generate a follow-up proposal that incorporates the feedback.
- [x] Save & Learn never changes rules without explicit approval.

## Notes

The Correction Proposal workflow is specified in PRD-028.

This story covers the end-user guarantees: explicit approval, transparency, impact preview, and immediate within-import re-evaluation.
