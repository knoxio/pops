# US-19: Per-transaction tag editing

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a user, I want to edit tags on each transaction individually so that I can accept, remove, or add tags before importing.

## Acceptance Criteria

- [x] Each transaction has an inline TagEditor
- [x] Pre-populated with suggested tags from processing step
- [x] Autocomplete from: server tags (`availableTags`) + tags typed during this session
- [x] Free-form tag entry (can create new tags not in autocomplete)
- [x] Remove tags by clicking X on chip
- [x] Tags stored in Zustand per transaction (keyed by checksum)
- [x] "Accept All Suggestions" button at top resets all tags to original suggestions

## Notes

This reuses the same TagEditor component from the transactions page (PRD-019 US-03). Source badges (US-18) display within the tag chips.
