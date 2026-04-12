# US-06: Summary step update

> PRD: [031 — Import Final Review & Commit Step](README.md)
> Status: Not started

## Description

As a user, I want the Summary step to include retroactive reclassification results alongside import results so that I have a complete picture of what the import changed.

## Acceptance Criteria

- [ ] The Summary step (now Step 7) receives and displays the `CommitResult` from the commit endpoint.
- [ ] A "Retroactive Changes" section is added, showing the count of existing transactions that were reclassified.
- [ ] If the reclassification count is 0, the section reads "No existing transactions were affected" rather than being hidden.
- [ ] The existing Summary sections (transactions imported, entities created, rules applied) continue to display correctly with data sourced from `CommitResult`.
- [ ] If any transactions failed to import, the Summary surfaces the failure count and details (checksum + error) in a dedicated "Failures" section.
- [ ] The Summary step is reachable only after a successful commit — navigating directly to Step 7 without committing is prevented.

## Notes

The Summary step already exists; this US extends it. The `CommitResult` should be passed via the import store or a shared state mechanism rather than re-fetching.
