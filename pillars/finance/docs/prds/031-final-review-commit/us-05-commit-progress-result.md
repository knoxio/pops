# US-05: Commit progress + result UI

> PRD: [031 — Import Final Review & Commit Step](README.md)
> Status: Done

## Description

As a user, I want to trigger the commit with a single button and see progress and results so that I know exactly what was written and whether anything failed.

## Acceptance Criteria

- [x] An "Approve & Commit All" button is displayed at the bottom of the FinalReviewStep, clearly labelled and visually prominent.
- [x] Clicking the button calls `finance.imports.commitImport` with the payload built from the pending stores.
- [x] While the commit is in progress, a progress indicator is shown and the button is disabled to prevent double-submission.
- [x] On failure, an error message is displayed with enough detail for the user to understand what went wrong. The "Approve & Commit All" button re-enables for retry.
- [x] On success, the wizard auto-advances to the Summary step (Step 7); the Summary step owns the result display (entities created, rules applied, transactions imported/failed, retroactive reclassifications). No inline result panel and no manual "Continue" click.
- [x] The "Back" button is disabled while the commit is in progress.

## Notes

The payload builder comes from PRD-030. Auto-advancing on success keeps the wizard moving without an extra click — the Summary step is the canonical post-commit view.
