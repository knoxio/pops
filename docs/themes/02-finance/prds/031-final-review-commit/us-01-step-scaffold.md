# US-01: Step scaffold + wizard update

> PRD: [031 — Import Final Review & Commit Step](README.md)
> Status: Not started

## Description

As a user, I want the import wizard to include a "Final Review & Commit" step before the Summary so that I can review all pending changes before they are written to the database.

## Acceptance Criteria

- [ ] A new Step 6 "Final Review & Commit" is added to the import wizard between Tag Review (Step 5) and Summary.
- [ ] Summary moves from Step 6 to Step 7; the total step count updates from 6 to 7.
- [ ] The progress indicator reflects 7 steps with correct labels.
- [ ] `importStore` `nextStep` max is updated to accommodate the new step count.
- [ ] A new `FinalReviewStep` component is created as a shell (renders heading and placeholder content).
- [ ] Navigation works: "Next" from Tag Review goes to Final Review, "Back" from Final Review returns to Tag Review, "Next" from Final Review goes to Summary.
- [ ] Existing step navigation and routing is not broken — all prior steps behave identically.

## Notes

This is a structural change only. The FinalReviewStep component is a shell — content comes in US-02 and US-05.
