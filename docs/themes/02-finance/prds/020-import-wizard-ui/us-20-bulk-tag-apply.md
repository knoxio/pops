# US-20: Group-level bulk tag apply

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a user, I want to apply tags to all transactions in an entity group at once so that I don't have to tag each one individually.

## Acceptance Criteria

- [x] Each entity group header has an "Apply Tags" action
- [x] Opens tag input — user enters tags to apply to all transactions in the group
- [x] Merge semantics: bulk tags are added to each transaction's existing tags, never replacing individual edits
- [x] Duplicate tags are deduplicated (if a transaction already has the tag, it's not added again)
- [x] Per-group "Apply Suggestions" button applies the system-suggested tags to all in the group
- [x] Changes reflected immediately in per-transaction tag editors below

## Notes

Merge semantics are critical — if a user manually edited one transaction's tags, a group-level apply must not overwrite that edit. It only adds new tags.
