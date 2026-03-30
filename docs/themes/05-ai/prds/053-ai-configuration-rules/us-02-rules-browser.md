# US-02: Categorisation rules browser

> PRD: [053 — AI Configuration & Rules](README.md)
> Status: Partial

## Description

As a user, I want to browse and manage learned categorisation rules so that I can see what the system has learned and clean up bad rules.

## Acceptance Criteria

- [ ] DataTable showing all corrections: pattern, match type, entity, confidence, times applied, last used — no UI page exists
- [ ] Filter by: confidence range, match type, minimum times applied — API has minConfidence filter; no UI
- [ ] Sort by: confidence, times applied, last used — no UI
- [ ] Inline confidence adjustment (slider or +/- buttons) — adjustConfidence API procedure exists; no UI
- [ ] Delete action with confirmation — delete API procedure exists; no UI
- [ ] Auto-delete below 0.3 reflected immediately (rule disappears from table)
- [ ] Pagination — API supports pagination; no UI

## Notes

This is a management view of the corrections table (PRD-024). The data already exists — this PRD adds the UI for browsing and cleanup.
