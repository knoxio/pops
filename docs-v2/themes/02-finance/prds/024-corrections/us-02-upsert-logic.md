# US-02: Upsert logic

> PRD: [024 — Corrections](README.md)
> Status: To Review

## Description

As a developer, I want createOrUpdate to increment confidence on reuse so that frequently-confirmed rules become more reliable.

## Acceptance Criteria

- [ ] If pattern + matchType combo exists: confidence += 0.1 (capped at 1.0), times_applied += 1, last_used_at updated
- [ ] Provided fields (entityId, entityName, location, tags, transactionType) merge over existing values
- [ ] If new: create with confidence 0.5, times_applied 0
- [ ] Test: create → createOrUpdate with same pattern → verify confidence 0.6, times_applied 1

## Notes

The upsert ensures that the same correction learned multiple times becomes increasingly reliable without creating duplicate rows.
