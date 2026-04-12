# US-05: Commit progress + result UI

> PRD: [031 — Import Final Review & Commit Step](README.md)
> Status: Not started

## Description

As a user, I want to trigger the commit with a single button and see progress and results so that I know exactly what was written and whether anything failed.

## Acceptance Criteria

- [ ] An "Approve & Commit All" button is displayed at the bottom of the FinalReviewStep, clearly labelled and visually prominent.
- [ ] Clicking the button calls `finance.imports.commitImport` with the payload built from the pending stores.
- [ ] While the commit is in progress, a progress indicator is shown and the button is disabled to prevent double-submission.
- [ ] On success, the result is displayed inline: entities created, rules applied (by operation type), transactions imported, transactions failed (if any, with checksums and errors), and retroactive reclassifications.
- [ ] On failure, an error message is displayed with enough detail for the user to understand what went wrong. The "Approve & Commit All" button re-enables for retry.
- [ ] After a successful commit, a "Continue" action advances the wizard to the Summary step (Step 7).
- [ ] The "Back" button is disabled while the commit is in progress and hidden after a successful commit (no going back after commit).

## Notes

The payload builder comes from PRD-030. The result display is a precursor to the full Summary step (US-06) — it shows immediate feedback before the user moves forward.
