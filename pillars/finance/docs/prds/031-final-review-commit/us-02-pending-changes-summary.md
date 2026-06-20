# US-02: Pending changes summary UI

> PRD: [031 — Import Final Review & Commit Step](README.md)
> Status: Done

## Description

As a user, I want the Final Review step to display a complete summary of all pending changes so that I can verify everything before committing.

## Acceptance Criteria

- [x] FinalReviewStep displays new entities to be created, listed by name and type.
- [x] FinalReviewStep displays rule changes grouped by ChangeSet, with add/edit/disable/remove badges per operation.
- [x] FinalReviewStep displays the count of transactions to import, with a breakdown by status (matched, corrected, manual).
- [x] FinalReviewStep displays the count of tag assignments to be written.
- [x] Each section (entities, rules, transactions, tags) is collapsible, defaulting to collapsed when the count exceeds a threshold (e.g. 10 items).
- [x] The summary is read-only — there are no inline edit controls. Users navigate back to the relevant step to make changes.
- [x] If no pending changes exist for a section (e.g. zero new entities), that section is hidden rather than showing an empty state.
- [x] Navigating back to an earlier step, making changes, and returning to Final Review reflects the updated pending state.

## Notes

Reads from the PRD-030 pending stores. No API calls — this is a pure client-side read of local state.
