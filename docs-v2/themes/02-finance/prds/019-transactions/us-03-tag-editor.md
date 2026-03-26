# US-03: Inline tag editor

> PRD: [019 — Transactions](README.md)
> Status: Done

## Description

As a user, I want to edit transaction tags inline via a popover so that I can categorise transactions without leaving the list view.

## Acceptance Criteria

- [x] Clicking the tags cell opens a popover with the TagEditor
- [x] Current tags shown as removable chips with deterministic colours (oklch hash-based)
- [x] Text input with autocomplete — suggests from all known tags (server + session)
- [x] Autocomplete: starts-with matches first, then contains matches, max 8 suggestions
- [x] Keyboard: Enter/comma adds tag, Tab adds first suggestion, Backspace removes last, Escape cancels
- [x] "Suggest" button triggers `suggestTags` API call — shows loading state while fetching
- [x] Source badges when tag metadata available: rule (pattern tooltip), AI, entity
- [x] Save/Cancel buttons — Save calls `transactions.update` mutation
- [x] Toast confirmation on save
- [x] Tag changes reflect immediately in the DataTable row

## Notes

TagEditor is a shared component used in both the transactions page and the import wizard's TagReviewStep. Tag colours are deterministic from the tag string hash so the same tag always gets the same colour.
