# US-14: Save & Learn correction

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a user, I want to save my manual entity assignment as a learned correction rule so that future imports automatically match the same pattern.

## Acceptance Criteria

- [x] "Save & Learn" option available after assigning an entity to an uncertain/failed transaction
- [x] Creates correction via `core.corrections.createOrUpdate` with:
  - `descriptionPattern`: normalized transaction description
  - `matchType`: "exact" (default)
  - `entityId` and `entityName`: from the assigned entity
  - `confidence`: 0.5 (initial)
- [x] Toast confirmation: "Rule saved — future imports will match this pattern"
- [x] If pattern already exists, confidence incremented by 0.1 (upsert behaviour)
- [x] Optional: user can choose "contains" match type for broader matching

## Notes

This is how the system learns. Each manual correction during import can become a rule that prevents the same manual work next time. The correction is created immediately in the database (not deferred to executeImport).
