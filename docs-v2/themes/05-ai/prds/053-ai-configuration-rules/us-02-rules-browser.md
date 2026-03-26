# US-02: Categorisation rules browser

> PRD: [053 — AI Configuration & Rules](README.md)
> Status: To Review

## Description

As a user, I want to browse and manage learned categorisation rules so that I can see what the system has learned and clean up bad rules.

## Acceptance Criteria

- [ ] DataTable showing all corrections: pattern, match type, entity, confidence, times applied, last used
- [ ] Filter by: confidence range, match type, minimum times applied
- [ ] Sort by: confidence, times applied, last used
- [ ] Inline confidence adjustment (slider or +/- buttons)
- [ ] Delete action with confirmation
- [ ] Auto-delete below 0.3 reflected immediately (rule disappears from table)
- [ ] Pagination

## Notes

This is a management view of the corrections table (PRD-024). The data already exists — this PRD adds the UI for browsing and cleanup.
