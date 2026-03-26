# US-19: Per-transaction tag editing

> PRD: [020 — Import Wizard UI](README.md)
> Status: To Review

## Description

As a user, I want to edit tags on each transaction individually so that I can accept, remove, or add tags before importing.

## Acceptance Criteria

- [ ] Each transaction has an inline TagEditor
- [ ] Pre-populated with suggested tags from processing step
- [ ] Autocomplete from: server tags (`availableTags`) + tags typed during this session
- [ ] Free-form tag entry (can create new tags not in autocomplete)
- [ ] Remove tags by clicking X on chip
- [ ] Tags stored in Zustand per transaction (keyed by checksum)
- [ ] "Accept All Suggestions" button at top resets all tags to original suggestions

## Notes

This reuses the same TagEditor component from the transactions page (PRD-019 US-03). Source badges (US-18) display within the tag chips.
